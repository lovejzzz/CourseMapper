/** @vitest-environment happy-dom */
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Storage } from 'happy-dom';
import { saveProjectIndexedDbAutosave } from '../../lib/projectIndexedDbAutosave';
import useProjectPersistence, { STORAGE_KEY } from '../useProjectPersistence.js';
import { createNewTeachingTaskReviewDraft } from '../../lib/teachingTaskReview.js';
import { loadProject, loadProjectDeliverables, saveProject, newProjectId } from '../../lib/cloudStorage';
import { loadDeveloperTemplates } from '../../lib/cloudStorage';
import * as authorWorkspace from '../../lib/authoring/localWorkspace.js';
import { emptyTeachingReviewDrafts } from '../../lib/teachingReviewDrafts.js';

vi.mock('../../lib/cloudStorage', () => ({
  saveProject: vi.fn(),
  loadProject: vi.fn(),
  loadProjectDeliverables: vi.fn(),
  newProjectId: vi.fn(),
  loadDeveloperTemplates: vi.fn(async () => ({})),
  saveDeveloperTemplate: vi.fn(async () => {}),
}));
vi.mock('../../lib/projectIndexedDbAutosave', () => ({
  loadProjectIndexedDbAutosave: vi.fn(async () => null),
  removeProjectIndexedDbAutosave: vi.fn(),
  saveProjectIndexedDbAutosave: vi.fn(),
}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const initialMap = {
  courseName: 'Draft persistence',
  lessons: [{ title: 'Observed groups', sections: [{ learningObjectives: 'Explain a proportion.' }] }],
};
let api, root, context;
beforeEach(() => {
  saveProject.mockReset();
  loadDeveloperTemplates.mockReset().mockResolvedValue({});
  loadProject.mockReset();
  loadProjectDeliverables.mockReset();
  newProjectId.mockReset().mockReturnValue('cloud-project-test');
  vi.useFakeTimers();
  vi.stubGlobal('localStorage', new Storage());
  localStorage.clear();
  const setters = [
    'setScreen',
    'onReturnToLanding',
    'adoptCourseGraph',
    'setOldCourseMap',
    'setColumns',
    'setUserEdits',
    'setFiles',
    'setChatHistory',
    'setSelectedFeatures',
    'setDeliverableConfig',
    'setLessonScope',
    'setPromptText',
    'setPackageQualityPass',
    'setLastRunDigest',
    'setActiveTab',
    'setSlideTheme',
    'setShowDiff',
    'setUnseenChanges',
    'setLessonCount',
    'setNewProjectConfirm',
    'restoreProjectAIConfig',
    'resetExport',
    'setCourseGraph',
  ];
  context = {
    ...Object.fromEntries(setters.map((key) => [key, vi.fn()])),
    user: null,
    screen: 'workspace',
    columns: [],
    userEdits: [],
    files: [],
    chatHistory: [],
    selectedFeatures: ['courseMap'],
    deliverableConfig: {},
    lessonScope: { type: 'all' },
    promptText: '',
    expectedSessionMinutes: 50,
    activeTab: 'courseMap',
    provider: 'scion',
    gen: {
      restoreStoppedState: () => false,
      setProgressStep: vi.fn(),
      setStatus: vi.fn(),
      setError: vi.fn(),
      handleStop: vi.fn(),
      resetGeneration: vi.fn(),
    },
    deliv: { deliverables: {}, restoreDeliverables: vi.fn(), stopGenerating: vi.fn(), resetDeliverables: vi.fn() },
    delivUndo: { history: { entries: [], cursor: 0 }, restore: vi.fn(), reset: vi.fn() },
    rev: { resetRevision: vi.fn() },
    version: { versionHistory: [], initHistory: vi.fn(), pushVersion: vi.fn(), resetHistory: vi.fn() },
  };
  root = createRoot(document.createElement('div'));
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  vi.clearAllTimers();
  vi.useRealTimers();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Harness() {
  const [courseMap, setCourseMap] = useState(initialMap);
  const [hasGenerated, setHasGenerated] = useState(true);
  api = useProjectPersistence({ ...context, courseMap, setCourseMap, hasGenerated, setHasGenerated });
  return null;
}
async function mount() {
  await act(async () => root.render(<Harness />));
}

it('keeps automatic cloud saves with the original account until an explicit Save as New', async () => {
  context.user = { uid: 'owner-a' };
  await mount();
  await act(async () => vi.advanceTimersByTimeAsync(5000));
  expect(saveProject).toHaveBeenCalledWith('owner-a', 'cloud-project-test', expect.any(Object));
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).localCloudOwnerUid).toBe('owner-a');
  expect(api.buildProjectSnapshot()).not.toHaveProperty('localCloudOwnerUid');
  saveProject.mockClear();
  context.user = null;
  await mount();
  context.user = { uid: 'owner-b' };
  await mount();
  await act(async () => vi.advanceTimersByTimeAsync(6000));
  expect(saveProject).not.toHaveBeenCalled();
  expect(api.cloudSaveStatus).toBe('account-paused');
  expect(context.gen.setError).not.toHaveBeenCalled();
  newProjectId.mockReturnValueOnce('explicit-copy');
  await act(async () => api.handleSaveCurrentAsNew());
  expect(saveProject).toHaveBeenCalledWith('owner-b', 'explicit-copy', expect.any(Object));
  await act(async () => api.saveLocalProjectSnapshot());
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).localCloudOwnerUid).toBe('owner-b');
});

it('does not publish a late autosave result into the replacement account session', async () => {
  let resolveSave;
  saveProject.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
  );
  context.user = { uid: 'owner-a' };
  await mount();
  await act(async () => vi.advanceTimersByTimeAsync(5000));
  context.user = { uid: 'owner-b' };
  await mount();
  await act(async () => {
    resolveSave();
  });
  expect(api.cloudSaveStatus).toBe('account-paused');
  await act(async () => vi.advanceTimersByTimeAsync(6000));
  expect(saveProject.mock.calls.map(([uid]) => uid)).toEqual(['owner-a']);
  // Returning to the original account resumes saves without touching generation errors.
  context.user = { uid: 'owner-a' };
  await mount();
  expect(context.gen.setError).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(5000));
  expect(saveProject.mock.calls.map(([uid]) => uid)).toEqual(['owner-a', 'owner-a']);
});

it('preserves the account boundary across local recovery but permits an explicitly imported file', async () => {
  context.user = { uid: 'owner-b' };
  await mount();
  const saved = { courseMap: initialMap, projectId: 'owner-a-project', localCloudOwnerUid: 'owner-a' };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  await act(async () => api.doRestoreSession());
  await act(async () => vi.advanceTimersByTimeAsync(6000));
  expect(saveProject).not.toHaveBeenCalled();
  expect(api.buildProjectSnapshot().courseMap).toEqual(initialMap);
  await act(async () =>
    api.handleOpenProject({ name: 'chosen.coursemapper', text: async () => JSON.stringify(saved) }),
  );
  await act(async () => vi.advanceTimersByTimeAsync(6000));
  expect(saveProject).toHaveBeenCalledWith('owner-b', 'cloud-project-test', expect.any(Object));
  expect(saveProject.mock.calls.every(([, pid]) => pid !== 'owner-a-project')).toBe(true);
});

it('keeps a legacy cloud snapshot local until the teacher explicitly saves a copy', async () => {
  context.user = { uid: 'owner-b' };
  await mount();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ courseMap: initialMap, projectId: 'legacy-owner-unknown' }));
  await act(async () => api.doRestoreSession());
  await act(async () => vi.advanceTimersByTimeAsync(6000));
  expect(saveProject).not.toHaveBeenCalled();
  expect(api.cloudSaveStatus).toBe('owner-unverified');
  await act(async () => api.saveLocalProjectSnapshot());
  const local = JSON.parse(localStorage.getItem(STORAGE_KEY));
  expect(local.localCloudOwnerUnverified).toBe(true);
  expect(local.localCloudOwnerUid).toBeNull();
  expect(api.buildProjectSnapshot()).not.toHaveProperty('localCloudOwnerUnverified');
  await act(async () => api.doRestoreSession());
  await act(async () => vi.advanceTimersByTimeAsync(6000));
  expect(saveProject).not.toHaveBeenCalled();
  newProjectId.mockReturnValueOnce('chosen-copy');
  await act(async () => api.handleSaveCurrentAsNew());
  expect(saveProject).toHaveBeenCalledWith('owner-b', 'chosen-copy', expect.any(Object));
  await act(async () => api.saveLocalProjectSnapshot());
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).localCloudOwnerUnverified).toBe(false);
});

it('does not adopt a legacy cloud project on first sign-in, but opening the owned cloud copy unlocks saves', async () => {
  await mount();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ courseMap: initialMap, projectId: 'legacy-cloud' }));
  await act(async () => api.doRestoreSession());
  context.user = { uid: 'owner-b' };
  await mount();
  await act(async () => vi.advanceTimersByTimeAsync(6000));
  expect(saveProject).not.toHaveBeenCalled();
  expect(api.cloudSaveStatus).toBe('owner-unverified');
  loadProject.mockResolvedValue({ courseMap: { ...initialMap, courseName: 'Verified cloud copy' } });
  loadProjectDeliverables.mockResolvedValue({});
  await act(async () => api.handleOpenCloudProject('owned-cloud'));
  expect(loadProject).toHaveBeenCalledWith('owner-b', 'owned-cloud');
  await act(async () => vi.advanceTimersByTimeAsync(6000));
  expect(saveProject).toHaveBeenCalledWith('owner-b', 'owned-cloud', expect.any(Object));
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).localCloudOwnerUnverified).toBe(false);
});

it('ignores an old account cloud-load response after switching accounts', async () => {
  let resolveLoad;
  loadProject.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveLoad = resolve;
      }),
  );
  loadProjectDeliverables.mockClear();
  context.user = { uid: 'owner-a' };
  await mount();
  let opening;
  await act(async () => {
    opening = api.handleOpenCloudProject('owner-a-private');
  });
  context.user = { uid: 'owner-b' };
  await mount();
  await act(async () => {
    resolveLoad({ courseMap: { ...initialMap, courseName: 'Old account late response' } });
    await opening;
  });
  expect(loadProjectDeliverables).not.toHaveBeenCalled();
  expect(api.buildProjectSnapshot().courseMap.courseName).toBe(initialMap.courseName);
  await act(async () => vi.advanceTimersByTimeAsync(6000));
  expect(saveProject).not.toHaveBeenCalled();
});

it('saves the latest draft immediately into the project file and at the pending autosave deadline', async () => {
  await mount();
  const first = createNewTeachingTaskReviewDraft(initialMap, { lessonNumber: 1, operation: 'observed-proportion' });
  first.inputs[0].text = 'Teacher source, still incomplete';
  let immediate;
  await act(async () => {
    api.saveTeachingReviewDraft(first, { title: 'Observed groups', featureId: 'rubrics' });
    immediate = api.buildProjectSnapshot();
  });
  expect(immediate.teachingReviewDrafts.entries[0].draft).toEqual(first);
  expect(immediate.courseMap).toEqual(initialMap);
  expect(immediate.editHistory).toEqual(context.delivUndo.history);
  const cloud = api.buildCloudProjectSnapshot();
  expect(cloud.teachingReviewDrafts).toBeUndefined();
  expect(JSON.parse(cloud.teachingReviewDraftsJson)).toEqual(immediate.teachingReviewDrafts);
  await act(async () => vi.advanceTimersByTime(1000));
  const second = { ...first, objective: 'A revised teaching objective' };
  await act(async () => api.saveTeachingReviewDraft(second, { title: 'Observed groups', featureId: 'rubrics' }));
  await act(async () => window.dispatchEvent(new Event('pagehide')));
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).teachingReviewDrafts.entries[0].draft).toEqual(second);
  expect(api.localSaveStatus).toBe('saved');
  expect(context.delivUndo.restore).not.toHaveBeenCalled();
});

it('restores drafts through file, local and developer project paths; old files and a new project clear the previous drafts', async () => {
  await mount();
  const draft = createNewTeachingTaskReviewDraft(initialMap, { lessonNumber: 1, operation: 'observed-proportion' });
  await act(async () => api.saveTeachingReviewDraft(draft, { title: 'Observed groups', featureId: 'rubrics' }));
  const saved = api.buildProjectSnapshot();
  saved.userEdits = {}; // Actual older project shape: editing after reopen must remain safe.
  const open = (snapshot) =>
    api.handleOpenProject({ name: 'test.coursemapper', text: async () => JSON.stringify(snapshot) });
  let session = api.teachingReviewSession;
  await act(async () => open({ courseMap: { courseName: 'Another project', lessons: [] } }));
  expect(api.teachingReviewDrafts).toEqual(emptyTeachingReviewDrafts());
  expect(api.teachingReviewSession).toBeGreaterThan(session);
  await act(async () => open(saved));
  expect(api.teachingReviewDrafts).toEqual(saved.teachingReviewDrafts);
  await act(async () => api.removeTeachingReviewDraft(draft.taskId));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  await act(async () => api.doRestoreSession());
  expect(api.teachingReviewDrafts).toEqual(saved.teachingReviewDrafts);
  await act(async () => api.applyDeveloperSnapshot({ ...saved, teachingReviewDrafts: undefined }));
  expect(api.teachingReviewDrafts).toEqual(emptyTeachingReviewDrafts());
  await act(async () => api.applyDeveloperSnapshot(saved));
  expect(api.teachingReviewDrafts).toEqual(saved.teachingReviewDrafts);
  expect(context.setUserEdits.mock.calls.every(([edits]) => Array.isArray(edits))).toBe(true);
  await act(async () => api.handleNewProject());
  expect(api.teachingReviewDrafts).toEqual(emptyTeachingReviewDrafts());
  await act(async () => window.dispatchEvent(new Event('pagehide')));
  await act(async () => vi.advanceTimersByTime(5000));
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  expect(context.gen.setError).not.toHaveBeenCalled();
});

for (const restorePath of ['file', 'local', 'cloud']) {
  it(`clears the previous course's optional state when opening an older ${restorePath} snapshot`, async () => {
    if (restorePath === 'cloud') context.user = { uid: 'teacher' };
    await mount();
    const saved = { courseMap: { courseName: 'Fresh course', lessons: [] } };
    api.projectIdRef.current = 'previous-cloud-course';
    await act(async () => {
      if (restorePath === 'file') {
        await api.handleOpenProject({ name: 'OLD.COURSEMAPPER', text: async () => JSON.stringify(saved) });
      } else if (restorePath === 'local') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
        await api.doRestoreSession();
      } else {
        vi.mocked(loadProject).mockResolvedValue(saved);
        vi.mocked(loadProjectDeliverables).mockResolvedValue({});
        await api.handleOpenCloudProject('new-cloud-course');
      }
    });
    expect(context.gen.setError).not.toHaveBeenCalled();
    expect(context.setFiles).toHaveBeenLastCalledWith([]);
    expect(context.setChatHistory).toHaveBeenLastCalledWith([]);
    expect(context.setSelectedFeatures).toHaveBeenLastCalledWith(['courseMap']);
    expect(context.setLessonScope).toHaveBeenLastCalledWith({ type: 'all' });
    expect(context.setPromptText).toHaveBeenLastCalledWith('');
    expect(context.setActiveTab).toHaveBeenLastCalledWith('courseMap');
    expect(context.setSlideTheme).toHaveBeenLastCalledWith(null);
    expect(context.setDeliverableConfig).toHaveBeenLastCalledWith({});
    expect(context.deliv.restoreDeliverables).toHaveBeenLastCalledWith({});
    expect(context.version.resetHistory).toHaveBeenCalled();
    expect(api.projectIdRef.current).toBe(restorePath === 'cloud' ? 'new-cloud-course' : null);
  });
}

it('saves the exact current project before returning home without resetting its materials or history', async () => {
  await mount();
  const draft = createNewTeachingTaskReviewDraft(initialMap, { lessonNumber: 1, operation: 'observed-proportion' });
  await act(async () => api.saveTeachingReviewDraft(draft, { title: 'Current draft' }));
  let returned;
  await act(async () => {
    returned = await api.handleReturnHome();
  });
  expect(returned).toBe(true);
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  expect(saved.courseMap).toEqual(initialMap);
  expect(saved.teachingReviewDrafts.entries[0].draft).toEqual(draft);
  expect(context.onReturnToLanding).toHaveBeenCalledOnce();
  expect(context.setScreen).toHaveBeenLastCalledWith('landing');
  expect(context.deliv.resetDeliverables).not.toHaveBeenCalled();
  expect(context.version.resetHistory).not.toHaveBeenCalled();
});

it('stays in the workspace when full local persistence and the recovery fallback both fail', async () => {
  await mount();
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new Error('Storage unavailable');
  });
  vi.mocked(saveProjectIndexedDbAutosave).mockRejectedValue(new Error('IndexedDB unavailable'));
  let returned;
  await act(async () => {
    returned = await api.handleReturnHome();
  });
  expect(returned).toBe(false);
  expect(context.onReturnToLanding).not.toHaveBeenCalled();
  expect(context.setScreen).not.toHaveBeenCalledWith('landing');
  expect(context.gen.setError).toHaveBeenCalledWith(expect.stringContaining('full project could not be saved'));
  vi.mocked(saveProjectIndexedDbAutosave).mockReset();
});

it('does not restore A templates into B when A cloud sync finishes late', async () => {
  let resolveA;
  loadDeveloperTemplates.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveA = resolve;
      }),
  );
  context.user = { uid: 'a' };
  await mount();
  context.user = { uid: 'b' };
  await mount();
  expect(api.developerTemplates).toEqual([]);
  await act(async () => resolveA({ a: { id: 'a', name: 'A private template' } }));
  expect(api.developerTemplates).toEqual([]);
  context.user = { uid: 'a' };
  await mount();
  expect(api.developerTemplates.map((t) => t.name)).toContain('A private template');
});

it('prepares authored cloud and file restores before saving their local editing baseline', async () => {
  const prepare = vi.spyOn(authorWorkspace, 'prepareAuthorWorkspaceRestore').mockResolvedValue();
  context.user = { uid: 'owner' };
  await mount();
  const snapshot = {
    courseMap: { ...initialMap, authoringV2: { applicationId: 'authored-app' } },
    deliverables: { lessonPlans: { authoredContent: { text: 'Exact authored lesson' }, data: { lessons: [] } } },
  };
  loadProject.mockResolvedValue(snapshot);
  loadProjectDeliverables.mockResolvedValue(snapshot.deliverables);
  await act(async () => api.handleOpenCloudProject('cloud-authored'));
  expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ courseMap: snapshot.courseMap }));
  prepare.mockClear();
  await act(async () =>
    api.handleOpenProject({ name: 'authored.coursemapper', text: async () => JSON.stringify(snapshot) }),
  );
  expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ courseMap: snapshot.courseMap }));
});

it('ignores a cloud restore when accounts change while preparing local storage', async () => {
  let finish;
  vi.spyOn(authorWorkspace, 'prepareAuthorWorkspaceRestore').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  context.user = { uid: 'owner-a' };
  await mount();
  loadProject.mockResolvedValue({ courseMap: { courseName: 'A private cloud', lessons: [] } });
  loadProjectDeliverables.mockResolvedValue({});
  let pending;
  await act(async () => {
    pending = api.handleOpenCloudProject('a-cloud');
  });
  expect(finish).toBeTypeOf('function');
  context.user = { uid: 'owner-b' };
  await mount();
  await act(async () => {
    finish();
    await pending;
  });
  expect(api.buildProjectSnapshot().courseMap.courseName).toBe(initialMap.courseName);
});
