import { describe, expect, it } from 'vitest';

import { repairDeliverableContentQuality } from '../contentQualityRepair.js';
import { buildDeliverableDocxBlob } from '../exporters/bulkDocxExporter.js';
import { buildSlideDeckPptxBlob } from '../exporters/pptxExporter.js';
import { extractPackage } from '../quality/deepQualityGrader.js';
import { createMemoryFileProvider } from '../quality/fileProviders.js';
import { findRepeatedInstructionalPhrase } from '../quality/repeatedInstructionalPhrase.js';

const FACT =
  'Conditional branching logic allows programs to execute different blocks of code based on specified conditions.';
const FACT_SHINGLE = 'conditional branching logic allows programs to execute different blocks of';

function lessonPlanData(lessonNumber, claims = [FACT]) {
  return {
    lessonPlans: [
      {
        lessonTitle: `Lesson ${lessonNumber}: Branching in policy analysis`,
        duration: '75 minutes',
        sourceEvidenceBrief: { claims },
        outline: [
          {
            time: '20 minutes',
            activity: `Policy scenario ${lessonNumber}`,
            description: `Students model a distinct policy decision after reviewing this source statement: ${FACT}`,
            catchUpPlan: `A learner who missed the reading begins with this source statement: ${FACT}`,
            instructorNotes: `Use the lesson ${lessonNumber} scenario to test this source statement: ${FACT}`,
          },
        ],
        formativeCheck: {
          type: 'Exit ticket',
          prompt: `Apply this source statement to the lesson ${lessonNumber} scenario: ${FACT}`,
          instructorAction: `Compare responses against this source statement: ${FACT}`,
        },
      },
    ],
  };
}

async function renderedLessonPlanPackage(dataByLesson) {
  const files = {};
  for (const [index, data] of dataByLesson.entries()) {
    files[`Lesson Plans/Lesson ${index + 1} - Branching.docx`] = await buildDeliverableDocxBlob(
      'lessonPlans',
      data,
      'Python for Public Policy Analysis',
    );
  }
  return extractPackage(createMemoryFileProvider(files));
}

async function renderedStudyGuidePackage(dataByLesson) {
  const files = {};
  for (const [index, data] of dataByLesson.entries()) {
    files[`Study Guides/Lesson ${index + 1} - Branching.docx`] = await buildDeliverableDocxBlob(
      'studyGuides',
      data,
      'Python for Public Policy Analysis',
    );
  }
  return extractPackage(createMemoryFileProvider(files));
}

async function renderedSlideDeckPackage(dataByLesson) {
  const files = {};
  for (const [index, data] of dataByLesson.entries()) {
    files[`Slide Decks/Lesson ${index + 1} - Branching.pptx`] = await buildSlideDeckPptxBlob(
      data,
      'Python for Public Policy Analysis',
      0,
    );
  }
  return extractPackage(createMemoryFileProvider(files));
}

function legacyBoundaryCorrection(term) {
  return `Correction: Cite the specific definition or fact that supports the ${term} claim, then state what that evidence does not establish.`;
}

async function renderedBoundaryCorrectionPackage(lessonPlans, studyGuides, slideDecks) {
  const files = {};
  for (let index = 0; index < 4; index += 1) {
    files[`Lesson Plans/Lesson ${index + 1} - Evidence boundary.docx`] = await buildDeliverableDocxBlob(
      'lessonPlans',
      lessonPlans[index],
      'Python for Public Policy Analysis',
    );
    files[`Study Guides/Lesson ${index + 1} - Evidence boundary.docx`] = await buildDeliverableDocxBlob(
      'studyGuides',
      studyGuides[index],
      'Python for Public Policy Analysis',
    );
    files[`Slide Decks/Lesson ${index + 1} - Evidence boundary.pptx`] = await buildSlideDeckPptxBlob(
      slideDecks[index],
      'Python for Public Policy Analysis',
      0,
    );
  }
  return extractPackage(createMemoryFileProvider(files));
}

describe('contentQualityRepair rendered package integration', () => {
  it('clears the production-shaped 38-copy correction P1 across 12 rendered artifacts', async () => {
    const terms = ['Policy functions', 'Data cleaning', 'Model uncertainty', 'Reproducible reporting'];
    const lessonPlans = terms.map((term, index) => {
      const correction = legacyBoundaryCorrection(term);
      return {
        lessonPlans: [
          {
            lessonTitle: `Lesson ${index + 1}: ${term}`,
            duration: '75 minutes',
            outline: [
              {
                time: '25 minutes',
                activity: `${term} evidence clinic`,
                description: correction,
                instructorNotes: correction,
              },
            ],
          },
        ],
      };
    });
    const studyGuides = terms.map((term, index) => {
      const correction = legacyBoundaryCorrection(term);
      return {
        guides: [
          {
            lessonTitle: `Lesson ${index + 1}: ${term}`,
            summary: correction,
            practiceActivities: [correction, correction],
          },
        ],
      };
    });
    const slideDecks = terms.map((term, index) => {
      const correction = legacyBoundaryCorrection(term);
      const count = index < 2 ? 5 : 4;
      return {
        decks: [
          {
            lessonTitle: `Lesson ${index + 1}: ${term}`,
            slides: Array.from({ length: count }, (_, slideIndex) => ({
              title: `${term} check ${slideIndex + 1}`,
              bullets: [correction],
            })),
          },
        ],
      };
    });

    const beforePackage = await renderedBoundaryCorrectionPackage(lessonPlans, studyGuides, slideDecks);
    expect(beforePackage.files).toHaveLength(12);
    expect(findRepeatedInstructionalPhrase(beforePackage.files)).toMatchObject({
      phrase: 'correction cite the specific definition or fact that supports the',
      count: 38,
      file: 'package (12 files)',
    });

    const repairedLessonPlans = lessonPlans.map((data) => repairDeliverableContentQuality('lessonPlans', data).data);
    const repairedStudyGuides = studyGuides.map((data) => repairDeliverableContentQuality('studyGuides', data).data);
    const repairedSlideDecks = slideDecks.map((data) => repairDeliverableContentQuality('slideDecks', data).data);
    const afterPackage = await renderedBoundaryCorrectionPackage(
      repairedLessonPlans,
      repairedStudyGuides,
      repairedSlideDecks,
    );

    expect(findRepeatedInstructionalPhrase(afterPackage.files)).toBeNull();
    expect(afterPackage.files.map((file) => file.text).join('\n')).not.toContain(
      'Cite the specific definition or fact',
    );
  });

  it('removes a real cross-DOCX source-fact P1 without hiding the source evidence', async () => {
    const original = Array.from({ length: 7 }, (_, index) => ({
      plans: [{ lessonTitle: `Stale legacy plan ${index + 1}` }],
      ...lessonPlanData(index + 1),
    }));
    const beforePackage = await renderedLessonPlanPackage(original);
    const before = findRepeatedInstructionalPhrase(beforePackage.files);

    expect(before).toMatchObject({ phrase: FACT_SHINGLE, count: 42, file: 'package (7 files)' });

    const repaired = original.map(
      (data) => repairDeliverableContentQuality('lessonPlans', data, { sourceFacts: [FACT] }).data,
    );
    const afterPackage = await renderedLessonPlanPackage(repaired);
    const after = findRepeatedInstructionalPhrase(afterPackage.files);

    expect(after).toBeNull();
    let renderedFactCount = 0;
    for (const file of afterPackage.files) {
      expect(file.text).toContain(FACT);
      renderedFactCount += file.text.split(FACT).length - 1;
    }
    expect(renderedFactCount).toBe(7);
  });

  it('repairs the alias-rooted collection that the DOCX renderer actually emits', async () => {
    const original = Array.from({ length: 7 }, (_, index) => ({
      plans: lessonPlanData(index + 1).lessonPlans,
    }));
    const beforePackage = await renderedLessonPlanPackage(original);

    expect(findRepeatedInstructionalPhrase(beforePackage.files)).toMatchObject({
      phrase: FACT_SHINGLE,
      count: 42,
      file: 'package (7 files)',
    });

    const repaired = original.map(
      (data) => repairDeliverableContentQuality('lessonPlans', data, { sourceFacts: [FACT] }).data,
    );
    const afterPackage = await renderedLessonPlanPackage(repaired);

    expect(findRepeatedInstructionalPhrase(afterPackage.files)).toBeNull();
    expect(afterPackage.files.reduce((sum, file) => sum + file.text.split(FACT).length - 1, 0)).toBe(7);
  });

  it('renders and repairs the canonical collection when a truthy alias is malformed', async () => {
    const original = { plans: { malformed: true }, ...lessonPlanData(1) };
    const beforePackage = await renderedLessonPlanPackage([original]);

    expect(beforePackage.files[0].text.split(FACT).length - 1).toBe(6);

    const repaired = repairDeliverableContentQuality('lessonPlans', original, { sourceFacts: [FACT] }).data;
    const afterPackage = await renderedLessonPlanPackage([repaired]);

    expect(afterPackage.files[0].text.split(FACT).length - 1).toBe(1);
  });

  it('clears the rendered P1 through the legacy guides DOCX root', async () => {
    const original = Array.from({ length: 7 }, (_, index) => ({
      guides: [
        {
          lessonTitle: `Lesson ${index + 1}: Branching study guide`,
          sourceEvidenceBrief: { claims: [FACT] },
          summary: `Review this source statement: ${FACT}`,
          practiceActivities: Array.from(
            { length: 4 },
            (_, activityIndex) => `Practice ${activityIndex + 1} applies this source statement: ${FACT}`,
          ),
        },
      ],
    }));
    const beforePackage = await renderedStudyGuidePackage(original);

    expect(findRepeatedInstructionalPhrase(beforePackage.files)).toMatchObject({
      phrase: FACT_SHINGLE,
      count: 42,
      file: 'package (7 files)',
    });

    const repaired = original.map(
      (data) => repairDeliverableContentQuality('studyGuides', data, { sourceFacts: [FACT] }).data,
    );
    const afterPackage = await renderedStudyGuidePackage(repaired);

    expect(findRepeatedInstructionalPhrase(afterPackage.files)).toBeNull();
    expect(afterPackage.files.reduce((sum, file) => sum + file.text.split(FACT).length - 1, 0)).toBe(7);
  });

  it('clears the rendered P1 through the legacy decks PPTX root', async () => {
    const original = Array.from({ length: 7 }, (_, index) => ({
      decks: [
        {
          lessonTitle: `Lesson ${index + 1}: Branching deck`,
          slides: Array.from({ length: 3 }, (_, slideIndex) => ({
            title: `Scenario ${index + 1}.${slideIndex + 1}`,
            bullets: [
              `Apply this source statement: ${FACT}`,
              `Contrast a second use of this source statement: ${FACT}`,
            ],
            speakerNotes: 'Explain how the two applications differ.',
          })),
        },
      ],
    }));
    const beforePackage = await renderedSlideDeckPackage(original);

    expect(findRepeatedInstructionalPhrase(beforePackage.files)).toMatchObject({
      count: 42,
      file: 'package (7 files)',
    });

    const repaired = original.map(
      (data) => repairDeliverableContentQuality('slideDecks', data, { sourceFacts: [FACT] }).data,
    );
    const afterPackage = await renderedSlideDeckPackage(repaired);

    expect(findRepeatedInstructionalPhrase(afterPackage.files)).toBeNull();
    expect(afterPackage.files.reduce((sum, file) => sum + file.text.split(FACT).length - 1, 0)).toBe(21);
  });

  it('keeps an honest P1 when standalone source statements alone exceed the package limit', async () => {
    const data = {
      lessonPlans: [
        {
          lessonTitle: 'Lesson 1: Branching in policy analysis',
          sourceEvidenceBrief: { claims: Array.from({ length: 24 }, () => FACT) },
        },
      ],
    };
    const repaired = repairDeliverableContentQuality('lessonPlans', data, { sourceFacts: [FACT] });
    const pkg = await renderedLessonPlanPackage([repaired.data]);
    const finding = findRepeatedInstructionalPhrase(pkg.files);

    expect(repaired.changed).toBe(false);
    expect(finding).toMatchObject({ phrase: FACT_SHINGLE, count: 24 });
  });
});
