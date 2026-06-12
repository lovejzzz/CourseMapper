/**
 * v0.14.7 WS-G — sync as a star feature (the deterministic chain).
 *
 * The audit (BEFORE_V0.14.6 §2.9) found four holes in the V1.8-era engine;
 * this file pins their fixes end-to-end with real compiles, no mocks of the
 * compiler:
 *
 *  G1 — a compiler-synced lesson KEEPS its enrichment (the original path
 *       compiled the bare blueprint and silently regressed to mail-merge).
 *  G2 — the blast radius is recompile-and-diff: the syllabus rejoins the
 *       radius (it was excluded from every per-lesson plan), no-op edits
 *       ask for no approval, and undiffable state never reads "unaffected".
 *  G4 — the pending sync plan classes into the review queue with the diff
 *       preview as the item detail.
 *  G5 — patch items match lessons by registry/numeric identity first; the
 *       title-regex tier is last-resort and LOUD.
 */
import { describe, expect, it, vi } from 'vitest';

import { buildCompiledLessonPatchData, compileBlueprintLessonPatch } from '../src/lib/compiledLessonSync.js';
import { computeSyncBlastRadius, diffCompiledFeature } from '../src/lib/syncBlastRadius.js';
import { buildReviewQueue } from '../src/lib/reviewQueueModel.js';
import {
  compileBlueprintDeliverables,
  buildCourseBlueprint,
  compactBlueprintForStorage,
} from '../src/lib/courseBlueprintCompiler.js';

const FIXTURE_TERM = 'Isostasy fixture term';

function geologyMap() {
  const topics = ['Minerals', 'Igneous Rocks', 'Sedimentary Rocks', 'Metamorphic Rocks'];
  return {
    courseName: 'Physical Geology',
    semester: 'Fall 2026',
    lessons: topics.map((title, index) => ({
      title: `Lesson ${index + 1}: ${title}`,
      sections: [
        {
          topicSection: `${index + 1}.1: ${title}`,
          learningGoals: `1. Build field-ready understanding of ${title.toLowerCase()}.`,
          learningObjectives: `Analyze ${title.toLowerCase()} using specimen evidence.\nEvaluate identification keys for ${title.toLowerCase()}.`,
          weeklyAssessments: `Quiz: ${title.toLowerCase()} identification`,
          asyncActivities: `Read the assigned chapter on ${title.toLowerCase()}.`,
          syncActivities: `Workshop: ${title.toLowerCase()} case analysis.`,
          supportingResources: `OpenStax geology chapter on ${title.toLowerCase()}`,
        },
      ],
    })),
  };
}

const overlayFor = (lessonNumber) => ({
  lessonContent: {
    [`lesson-${lessonNumber}`]: {
      enrichmentSource: 'lesson-content-enrichment',
      keyTerms: [{ term: FIXTURE_TERM, definition: 'a cited fixture definition', source: 'OpenStax fixture §2.1' }],
      quizItems: [],
    },
  },
});

describe('G1 — the sync compile keeps its subject matter', () => {
  it('with the stored overlay, the synced lesson compiles enriched and carries the kernel term', () => {
    const result = compileBlueprintLessonPatch({
      featureId: 'studyGuides',
      courseMap: geologyMap(),
      lessonIndex: 1,
      config: {},
      enrichmentOverlay: overlayFor(2),
    });
    expect(result).toBeTruthy();
    expect(result.lessonEnriched).toBe(true);
    expect(result.enrichedLessonCount).toBe(1);
    expect(JSON.stringify(result.data)).toContain(FIXTURE_TERM);
  });

  it('the fingerprint-keyed cache is the second tier (reload survival)', () => {
    const lessons = geologyMap().lessons;
    const cache = {
      get: (lesson) =>
        lesson === undefined ? null : lesson.title.includes('Igneous') ? overlayFor(2).lessonContent['lesson-2'] : null,
    };
    const result = compileBlueprintLessonPatch({
      featureId: 'studyGuides',
      courseMap: { ...geologyMap(), lessons },
      lessonIndex: 1,
      config: {},
      enrichmentOverlay: null,
      kernelCache: cache,
    });
    expect(result.lessonEnriched).toBe(true);
    expect(JSON.stringify(result.data)).toContain(FIXTURE_TERM);
  });

  it('no overlay, no cache → lessonEnriched false (the loud-gate signal, never silent)', () => {
    const result = compileBlueprintLessonPatch({
      featureId: 'studyGuides',
      courseMap: geologyMap(),
      lessonIndex: 1,
      config: {},
    });
    expect(result).toBeTruthy();
    expect(result.lessonEnriched).toBe(false);
    expect(JSON.stringify(result.data)).not.toContain(FIXTURE_TERM);
  });
});

describe('G2 — recompile-and-diff blast radius', () => {
  const FEATURES = ['syllabus', 'assignments', 'rubrics', 'quizBank', 'studyGuides'];
  function compiledStateFor(courseMap) {
    const blueprint = compactBlueprintForStorage(buildCourseBlueprint(courseMap, {}));
    const compiled = compileBlueprintDeliverables(blueprint, FEATURES, { configMap: {} });
    return Object.fromEntries(FEATURES.map((featureId) => [featureId, { status: 'done', data: compiled[featureId] }]));
  }

  it('an assessment retitle reaches the SYLLABUS grading table — the hole syncDependencies.js:226 left open', () => {
    const deliverables = compiledStateFor(geologyMap());
    const edited = geologyMap();
    edited.lessons[1].sections[0].weeklyAssessments = 'Quiz: igneous rocks identification mastery';
    const radius = computeSyncBlastRadius({
      courseMap: edited,
      deliverables,
      selectedFeatures: ['courseMap', ...FEATURES],
    });
    const planFeatures = radius.plan.map((entry) => entry.featureId);
    expect(planFeatures).toContain('syllabus');
    const syllabusEntry = radius.plan.find((entry) => entry.featureId === 'syllabus');
    expect(JSON.stringify(syllabusEntry.changes)).toMatch(/grading table|Syllabus/i);
    // The quiz itself changed too — and the radius names the lesson.
    expect(planFeatures).toContain('quizBank');
  });

  it('a no-op "edit" asks for NO approval (zero diffs, empty plan)', () => {
    const deliverables = compiledStateFor(geologyMap());
    const radius = computeSyncBlastRadius({
      courseMap: geologyMap(),
      deliverables,
      selectedFeatures: ['courseMap', ...FEATURES],
    });
    expect(radius.totalChanges).toBe(0);
    expect(radius.plan).toEqual([]);
    expect(radius.undiffableFeatures).toEqual([]);
  });

  it('done features WITHOUT data are undiffable — unprovable, never "unaffected"', () => {
    const radius = computeSyncBlastRadius({
      courseMap: geologyMap(),
      deliverables: { syllabus: { status: 'done' } },
      selectedFeatures: ['courseMap', 'syllabus'],
    });
    expect(radius.plan).toEqual([]);
    expect(radius.undiffableFeatures).toEqual(['syllabus']);
  });

  it('diffCompiledFeature names registry entities in summaries (the approval preview)', () => {
    const prev = {
      assignments: [{ assessmentId: 'A2.1', title: 'Quiz: igneous rocks identification', lessonNumber: 2, body: 'a' }],
    };
    const next = {
      assignments: [{ assessmentId: 'A2.1', title: 'Quiz: igneous rocks identification', lessonNumber: 2, body: 'b' }],
    };
    const changes = diffCompiledFeature('assignments', prev, next);
    expect(changes).toHaveLength(1);
    expect(changes[0].summary).toContain('A2.1');
    expect(changes[0].lessonNumber).toBe(2);
  });
});

describe('G4 — the sync plan classes into the review queue with its diff preview', () => {
  it('one queue item per affected deliverable, preview summaries as detail, sync class leads', () => {
    const queue = buildReviewQueue({
      syncSuggestion: {
        id: 'sync_test_1',
        plan: [
          {
            featureId: 'syllabus',
            lessonIndices: null,
            changes: [{ change: 'updated', lessonNumber: null, summary: 'Syllabus grading table: Midterm updated' }],
          },
          {
            featureId: 'rubrics',
            lessonIndices: [1],
            changes: [{ change: 'updated', lessonNumber: 2, summary: 'Rubric: A2.1 updated' }],
          },
        ],
        changedFieldsSummary: 'weekly assessments',
      },
    });
    expect(queue.counts.sync).toBe(2);
    expect(queue.total).toBe(2);
    const [syllabusItem, rubricItem] = queue.classes.sync;
    expect(syllabusItem.title).toContain('full document');
    expect(syllabusItem.detail).toContain('grading table');
    expect(rubricItem.title).toContain('lesson 2');
    expect(rubricItem.detail).toContain('A2.1');
    expect(rubricItem.target).toEqual({ featureId: 'rubrics' });
  });
});

describe('G5 — identity-tier matching in the lesson patch builder', () => {
  it('registry ids decide membership regardless of title text', () => {
    const compiledData = {
      assignments: [
        { assessmentId: 'A2.1', title: 'Totally unrelated words here' },
        { assessmentId: 'A3.1', title: 'Lesson 2 lookalike title' }, // id says lesson 3 — id WINS
      ],
    };
    const patch = buildCompiledLessonPatchData('assignments', compiledData, geologyMap(), 1);
    expect(patch.assignments).toHaveLength(1);
    expect(patch.assignments[0].assessmentId).toBe('A2.1');
  });

  it('the text tier still works for legacy items — and is LOUD', () => {
    const onTextTierMatch = vi.fn();
    const compiledData = { assignments: [{ title: 'Lesson 2: Igneous Rocks worksheet' }] };
    const patch = buildCompiledLessonPatchData('assignments', compiledData, geologyMap(), 1, { onTextTierMatch });
    expect(patch.assignments).toHaveLength(1);
    expect(onTextTierMatch).toHaveBeenCalledTimes(1);
  });
});
