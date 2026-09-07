/** @vitest-environment happy-dom */
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Storage } from 'happy-dom';
import useProjectPersistence, { STORAGE_KEY } from '../useProjectPersistence.js';
import { createNewTeachingTaskReviewDraft } from '../../lib/teachingTaskReview.js';
import { emptyTeachingReviewDrafts } from '../../lib/teachingReviewDrafts.js';

vi.mock('../../lib/cloudStorage', () => ({
  saveProject: vi.fn(),
  loadProject: vi.fn(),
  loadProjectDeliverables: vi.fn(),
  newProjectId: vi.fn(),
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
  vi.useFakeTimers();
  vi.stubGlobal('localStorage', new Storage());
  localStorage.clear();
  const setters = [
    'setScreen',
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
  vi.unstubAllGlobals();
});
async function mount() {
  function Harness() {
    const [courseMap, setCourseMap] = useState(initialMap);
    const [hasGenerated, setHasGenerated] = useState(true);
    api = useProjectPersistence({ ...context, courseMap, setCourseMap, hasGenerated, setHasGenerated });
    return null;
  }
  await act(async () => root.render(<Harness />));
}

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
