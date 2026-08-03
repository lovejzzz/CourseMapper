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

async function renderedCourseFaqPackage(dataByLesson) {
  const files = {};
  for (const [index, data] of dataByLesson.entries()) {
    files[`Course FAQ/Lesson ${index + 1} - Evidence - Course FAQ.docx`] = await buildDeliverableDocxBlob(
      'courseFaq',
      data,
      'Python for Public Policy Analysis',
    );
  }
  return extractPackage(createMemoryFileProvider(files));
}

async function renderedQuizPackage(dataByLesson) {
  const files = {};
  for (const [index, data] of dataByLesson.entries()) {
    files[`Quiz & Exam Bank/Lesson ${index + 1} - Evidence - Quiz & Exam Bank.docx`] = await buildDeliverableDocxBlob(
      'quizBank',
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
  for (let index = 0; index < lessonPlans.length; index += 1) {
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

function factProjectionCorrection(term, index) {
  return [
    `Correction for ${term}: stay inside the admitted fact and flag any broader inference as unsupported.`,
    `Repair the ${term} claim by treating its admitted fact as the ceiling and labeling wider conclusions unsupported.`,
    `${term} correction: preserve only the admitted statement and identify every unsupported extension explicitly.`,
  ][index % 3];
}

async function renderedLegacySourceReviewPackage(deliverables) {
  const files = {
    'Lesson Plans/Lesson 1 - Evidence.docx': await buildDeliverableDocxBlob(
      'lessonPlans',
      deliverables.lessonPlans,
      'Python for Public Policy Analysis',
    ),
    'Rubrics/Lesson 1 - Evidence.docx': await buildDeliverableDocxBlob(
      'rubrics',
      deliverables.rubrics,
      'Python for Public Policy Analysis',
    ),
    'Study Guides/Lesson 1 - Evidence.docx': await buildDeliverableDocxBlob(
      'studyGuides',
      deliverables.studyGuides,
      'Python for Public Policy Analysis',
    ),
    'Syllabus/Python for Public Policy Analysis - Syllabus.docx': await buildDeliverableDocxBlob(
      'syllabus',
      deliverables.syllabus,
      'Python for Public Policy Analysis',
    ),
    'Slide Decks/Lesson 1 - Evidence.pptx': await buildSlideDeckPptxBlob(
      deliverables.slideDecks,
      'Python for Public Policy Analysis',
      0,
    ),
  };
  return extractPackage(createMemoryFileProvider(files));
}

describe('contentQualityRepair rendered package integration', () => {
  it('replaces a quarantined FAQ pair before its physical DOCX is emitted', async () => {
    const quarantine = {
      rejectedLessonScopes: new Set(['lesson-1']),
      phrases: new Set(),
      markers: new Set(['pygmt']),
      overlayTermsByLesson: new Map(),
      overlayExactValuesByLesson: new Map(),
      sourceAssertionExactValuesByLesson: new Map(),
    };
    const original = {
      faqs: [
        {
          lessonId: 'lesson-1',
          lessonTitle: 'Lesson 1: Python Data Types and Expressions',
          questions: [
            {
              question: 'I thought naming Python was sufficient. How does Python actually work?',
              answer:
                "Python: show the source basis and mark the inference's reach. PyGMT turns policy data into a map.",
              relatedConcepts: ['Python', 'PyGMT'],
            },
          ],
        },
      ],
    };
    const context = {
      rejectedLearnerSourceEvidence: quarantine,
      compilerLessonScopeByTitle: new Map([['lesson 1: python data types and expressions', 'lesson-1']]),
    };
    const before = await renderedCourseFaqPackage([original]);
    const repaired = repairDeliverableContentQuality('courseFaq', original, context).data;
    const after = await renderedCourseFaqPackage([repaired]);
    const afterText = after.files.map((file) => file.text).join('\n');

    expect(before.files.map((file) => file.text).join('\n')).toMatch(/source basis|PyGMT/i);
    expect(afterText).toMatch(/input|type|expression|output/i);
    expect(afterText).not.toMatch(/source basis|bounded conclusion|PyGMT/i);
    expect(afterText).not.toMatch(/See also:/i);
    expect(repairDeliverableContentQuality('courseFaq', repaired, context).changed).toBe(false);
  });

  it('emits four substantive quiz options after an unsafe option record is quarantined', async () => {
    const quarantine = {
      rejectedLessonScopes: new Set(['lesson-1']),
      phrases: new Set(),
      markers: new Set(['pygmt', 'xso']),
      overlayTermsByLesson: new Map(),
      overlayExactValuesByLesson: new Map(),
      sourceAssertionExactValuesByLesson: new Map(),
    };
    const original = {
      quizzes: [
        {
          lessonNumber: 1,
          lessonTitle: 'Lesson 1: Python Data Types and Expressions',
          questions: [
            {
              type: 'multiple_choice',
              question: 'Which statement defines Python?',
              options: [
                'A. PyGMT maps data.',
                'B. XSO is embedded in Python.',
                'C. A broad claim.',
                'D. Another claim.',
              ],
              answer: 'B',
              explanation: 'B is correct because XSO is embedded in Python.',
            },
          ],
        },
      ],
    };
    const context = {
      rejectedLearnerSourceEvidence: quarantine,
      compilerLessonScopeByTitle: new Map([['lesson 1: python data types and expressions', 'lesson-1']]),
    };
    const repaired = repairDeliverableContentQuality('quizBank', original, context).data;
    const after = await renderedQuizPackage([repaired]);
    const afterText = after.files.map((file) => file.text).join('\n');

    expect(afterText).toMatch(/strongest evidence|expression|input types|observed output/i);
    expect(afterText).not.toMatch(/PyGMT|XSO|\b([A-D])\.\s+\1\.(?:\s|$)|bounded conclusion/i);
    expect(repairDeliverableContentQuality('quizBank', repaired, context).changed).toBe(false);
  });

  it('removes legacy source-review production instructions from final DOCX and PPTX XML', async () => {
    const legacySource = {
      title: 'Course-aligned source review',
      url: 'https://example.test/internal-review',
      license: 'Instructor review required',
    };
    const legacyClaim = 'Check 3: verify this claim from sources.';
    const original = {
      lessonPlans: {
        lessonPlans: [
          {
            lessonTitle: 'Lesson 1: Evidence decisions',
            sourceEvidenceBrief: { claims: [legacyClaim], sources: [legacySource] },
          },
        ],
      },
      rubrics: {
        rubrics: [
          {
            lessonTitle: 'Lesson 1: Evidence decisions',
            sourceEvidenceBrief: { claims: [legacyClaim], sources: [legacySource] },
            criteria: [{ criterion: 'Evidence use', weight: 100, proficient: 'Uses assigned evidence.' }],
          },
        ],
      },
      studyGuides: {
        guides: [
          {
            lessonTitle: 'Lesson 1: Evidence decisions',
            sourceEvidenceBrief: { claims: [legacyClaim], sources: [legacySource] },
          },
        ],
      },
      syllabus: {
        syllabus: {
          courseTitle: 'Python for Public Policy Analysis',
          requiredTexts: [legacySource],
        },
      },
      slideDecks: {
        decks: [
          {
            lessonTitle: 'Lesson 1: Evidence decisions',
            slides: [{ title: 'Course-aligned evidence review', bullets: [legacyClaim] }],
          },
        ],
      },
    };

    const before = await renderedLegacySourceReviewPackage(original);
    const beforeText = before.files.map((file) => file.text).join('\n');
    expect(before.files).toHaveLength(5);
    expect(beforeText).toMatch(/Course-aligned (?:source|evidence) review/i);
    expect(beforeText).toContain(legacyClaim);

    const repaired = Object.fromEntries(
      Object.entries(original).map(([featureId, data]) => [
        featureId,
        repairDeliverableContentQuality(featureId, data).data,
      ]),
    );
    const after = await renderedLegacySourceReviewPackage(repaired);
    const afterText = after.files.map((file) => file.text).join('\n');

    expect(afterText).not.toMatch(/Course-aligned (?:source|evidence) review/i);
    expect(afterText).not.toMatch(/Check \d+: verify this claim from sources/i);
    expect(afterText).not.toContain('https://example.test/internal-review');
    expect(afterText).toContain('Evidence task 3: compare the lesson claim with assigned evidence.');
    expect(afterText).toContain('Source evidence activity');
  });

  it('clears the production-shaped 38-copy correction P1 across 12 rendered artifacts', async () => {
    const terms = ['Policy functions', 'Data cleaning', 'Model uncertainty', 'Reproducible reporting'];
    const lessonPlans = terms.map((term, index) => {
      const correction = legacyBoundaryCorrection(term);
      return {
        lessonPlans: [
          {
            lessonNumber: index + 1,
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
            lessonNumber: index + 1,
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
            lessonNumber: index + 1,
            lessonTitle: `Lesson ${index + 1}: ${term}`,
            slides: Array.from({ length: count }, (_, slideIndex) => ({
              title: `${term} check ${slideIndex + 1}`,
              bullets: [correction],
            })),
          },
        ],
      };
    });
    const compilerSourceBoundaryCorrectionsByLesson = new Map(
      terms.map((term, index) => [
        `lesson-${index + 1}`,
        new Map([[legacyBoundaryCorrection(term).replace(/^Correction: /, ''), term]]),
      ]),
    );
    const repairContext = { compilerSourceBoundaryCorrectionsByLesson };

    const beforePackage = await renderedBoundaryCorrectionPackage(lessonPlans, studyGuides, slideDecks);
    expect(beforePackage.files).toHaveLength(12);
    expect(findRepeatedInstructionalPhrase(beforePackage.files)).toMatchObject({
      phrase: 'correction cite the specific definition or fact that supports the',
      count: 38,
      file: 'package (12 files)',
    });

    const repairedLessonPlans = lessonPlans.map(
      (data) => repairDeliverableContentQuality('lessonPlans', data, repairContext).data,
    );
    const repairedStudyGuides = studyGuides.map(
      (data) => repairDeliverableContentQuality('studyGuides', data, repairContext).data,
    );
    const repairedSlideDecks = slideDecks.map(
      (data) => repairDeliverableContentQuality('slideDecks', data, repairContext).data,
    );
    const afterPackage = await renderedBoundaryCorrectionPackage(
      repairedLessonPlans,
      repairedStudyGuides,
      repairedSlideDecks,
    );

    expect(findRepeatedInstructionalPhrase(afterPackage.files)).toBeNull();
    const afterText = afterPackage.files.map((file) => file.text).join('\n');
    expect(afterText).not.toContain('Cite the specific definition or fact');
    expect(
      afterText.match(
        /(?:cite its supporting source|connect evidence to the claim|identify the supporting fact|show the source basis|justify the claim from evidence|point to a supporting definition)/gi,
      ),
    ).toHaveLength(12);
    expect(afterText.match(/evidence-boundary check/gi)).toHaveLength(26);
  });

  it('keeps the new fact-projection correction below the rendered package repetition threshold', async () => {
    const terms = [
      'Policy functions',
      'Conditional branches',
      'Data cleaning',
      'Model uncertainty',
      'Reproducible reporting',
      'Policy synthesis',
    ];
    const lessonPlans = terms.map((term, index) => {
      const correction = factProjectionCorrection(term, index);
      return {
        lessonPlans: [
          {
            lessonNumber: index + 1,
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
      const correction = factProjectionCorrection(term, index);
      return {
        guides: [
          {
            lessonNumber: index + 1,
            lessonTitle: `Lesson ${index + 1}: ${term}`,
            summary: correction,
            practiceActivities: [correction, correction],
          },
        ],
      };
    });
    const slideDecks = terms.map((term, index) => {
      const correction = factProjectionCorrection(term, index);
      return {
        decks: [
          {
            lessonNumber: index + 1,
            lessonTitle: `Lesson ${index + 1}: ${term}`,
            slides: Array.from({ length: 3 }, (_, slideIndex) => ({
              title: `${term} boundary ${slideIndex + 1}`,
              bullets: [correction],
            })),
          },
        ],
      };
    });

    const pkg = await renderedBoundaryCorrectionPackage(lessonPlans, studyGuides, slideDecks);
    expect(pkg.files).toHaveLength(18);
    expect(findRepeatedInstructionalPhrase(pkg.files)).toBeNull();
    expect(pkg.files.map((file) => file.text).join('\n')).toContain(factProjectionCorrection(terms[0], 0));
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
