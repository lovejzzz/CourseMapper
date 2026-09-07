import { describe, expect, it } from 'vitest';
import { createNewTeachingTaskReviewDraft } from '../teachingTaskReview.js';
import {
  editableTeachingReviewDraft,
  emptyTeachingReviewDrafts,
  restoreTeachingReviewDrafts,
  saveTeachingReviewDraft,
  removeTeachingReviewDraft,
} from '../teachingReviewDrafts.js';
import { prepareProjectSnapshotForRestore } from '../projectSnapshotSanitizer.js';
import { buildCourseMapRecoveryAutosavePayload, buildLocalAutosavePayload } from '../projectAutosave.js';

const map = {
  courseName: 'Draft recovery',
  lessons: [{ title: 'Counts', sections: [{ learningObjectives: 'Explain the observed proportion.' }] }],
};
const draft = () => createNewTeachingTaskReviewDraft(map, { lessonNumber: 1, operation: 'observed-proportion' });

describe('unconfirmed teaching work in project snapshots', () => {
  it('preserves incomplete edits and separate tasks without granting approval', () => {
    const first = draft(),
      second = draft();
    first.inputs[0].text = 'An incomplete source the teacher is still writing';
    first.requirements[0].weight = 0;
    expect(editableTeachingReviewDraft(first)).toBe(true);
    const book = saveTeachingReviewDraft(saveTeachingReviewDraft(emptyTeachingReviewDrafts(), first), second);
    const raw = JSON.parse(JSON.stringify(book));
    raw.entries[0].preview = { status: 'preview' };
    raw.entries[0].confirmed = true;
    raw.entries[0].proposing = true;
    const restored = restoreTeachingReviewDrafts(raw);
    expect(restored).toEqual(book);
    expect(restored.entries[0].draft.inputs[0].text).toBe(first.inputs[0].text);
    const removed = removeTeachingReviewDraft(restored, second.taskId);
    expect(removed.entries.map((entry) => entry.draft.taskId)).toEqual([first.taskId]);
    expect(removed.activeTaskId).toBeNull();
    expect(map.teachingProgram).toBeUndefined();
  });

  it('keeps unsupported, malformed and duplicate drafts recoverable without breaking the editor', () => {
    const book = saveTeachingReviewDraft(emptyTeachingReviewDrafts(), draft());
    const broken = structuredClone(book.entries[0]);
    broken.draft.inputs[0].text = { malformed: 'source' };
    book.entries.push(broken, structuredClone(book.entries[0]));
    const restored = restoreTeachingReviewDrafts(book);
    expect(restored.entries).toHaveLength(1);
    expect(restored.unreadable).toEqual(book.entries.slice(1));
    expect(restoreTeachingReviewDrafts(restored)).toEqual(restored);
    expect(restoreTeachingReviewDrafts({ version: 99, entries: [] }).unreadable).toEqual([
      { version: 99, entries: [] },
    ]);
    expect(restoreTeachingReviewDrafts(undefined)).toEqual(emptyTeachingReviewDrafts());
    expect(() => saveTeachingReviewDraft(emptyTeachingReviewDrafts(), broken.draft)).toThrow();
  });

  it('keeps an unfinished performance requirement editable but quarantines an unsafe response shape', () => {
    const performance = { ...draft(), version: 2, practiceInputs: [] };
    performance.requirements = [
      {
        id: 'teacher-requirement',
        label: 'Explain the denominator',
        weight: 0,
        action: '',
        answer: '',
        reasoning: ['A step still being edited'],
        feedback: '',
        levels: {},
        transfer: { action: '', answer: '', reasoning: [], feedback: '', levels: {} },
      },
    ];
    const book = saveTeachingReviewDraft(emptyTeachingReviewDrafts(), performance);
    expect(restoreTeachingReviewDrafts(JSON.parse(JSON.stringify(book)))).toEqual(book);
    const malformed = structuredClone(book);
    malformed.entries[0].draft.requirements[0].reasoning = 'not an editable list';
    expect(restoreTeachingReviewDrafts(malformed).entries).toEqual([]);
    expect(restoreTeachingReviewDrafts(malformed).unreadable).toEqual(malformed.entries);
  });

  it('round-trips drafts through full, history-pruned, compact and last-resort saves', () => {
    const book = saveTeachingReviewDraft(emptyTeachingReviewDrafts(), draft(), {
      title: 'Counts',
      featureId: 'rubrics',
    });
    const full = { courseMap: map, teachingReviewDrafts: book };
    const compact = {
      courseMap: map,
      teachingReviewDraftsJson: JSON.stringify(book),
      deliverableSaveMode: 'recompile-on-open',
    };
    const payloads = [
      buildLocalAutosavePayload({ fullSnapshot: full, compactSnapshot: compact }).payload,
      buildLocalAutosavePayload({
        fullSnapshot: { ...full, chatHistory: ['x'.repeat(10000)] },
        compactSnapshot: compact,
        maxFullChars: 9000,
      }).payload,
      buildLocalAutosavePayload({ fullSnapshot: full, compactSnapshot: compact, maxFullChars: 1 }).payload,
      buildCourseMapRecoveryAutosavePayload(compact),
    ];
    for (const payload of payloads) {
      const saved = prepareProjectSnapshotForRestore(JSON.parse(payload));
      expect(restoreTeachingReviewDrafts(saved.teachingReviewDrafts)).toEqual(book);
      expect(saved.teachingReviewDraftsJson).toBeUndefined();
      expect(saved.courseMap.teachingProgram).toBeUndefined();
    }
    const invalid = prepareProjectSnapshotForRestore({ courseMap: map, teachingReviewDraftsJson: '{unfinished' });
    expect(invalid.courseMap).toEqual(map);
    expect(restoreTeachingReviewDrafts(invalid.teachingReviewDrafts).unreadable).toEqual(['{unfinished']);
  });
});
