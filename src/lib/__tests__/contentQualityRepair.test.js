import { describe, expect, it } from 'vitest';
import { collectDeliverableSourceFacts, repairDeliverableContentQuality } from '../contentQualityRepair';
import { auditDeliverableContentQuality } from '../contentQualityChecks';
import { semanticIdentityTokens } from '../lessonSemanticRelevance';
import { knownOffenderFitsScope } from '../quality/knownOffenderScope';
import { normalizeQuarantinedEvidenceText } from '../sourceEvidenceAdmission';

describe('contentQualityRepair (v0.12.1 P2)', () => {
  it('repairs and flags over-exact confidence-interval coverage language', () => {
    const source = {
      decks: [
        {
          slides: [
            {
              bullets: [
                'At 90% confidence, in 90 out of 100 samples the interval encloses the population parameter.',
                'The confidence level describes the procedure across repeated samples — at CL = 90%, in 90 out of 100 samples the interval estimate encloses the parameter.',
              ],
            },
          ],
        },
      ],
    };

    expect(auditDeliverableContentQuality('slideDecks', source).findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'overexact-confidence-coverage' })]),
    );

    const result = repairDeliverableContentQuality('slideDecks', source);
    const repaired = result.data.decks[0].slides[0].bullets[0];
    const repairedAbbreviation = result.data.decks[0].slides[0].bullets[1];
    expect(repaired).toContain('Across many repetitions of the same sampling procedure');
    expect(repaired).toContain('does not assign a 90% probability');
    expect(repairedAbbreviation).toContain('Across many repetitions of the same sampling procedure');
    expect(repairedAbbreviation).not.toContain('90 out of 100 samples');
    expect(auditDeliverableContentQuality('slideDecks', result.data).findings).toHaveLength(0);
  });

  it('removes encyclopedia navigation residue without deleting the sourced claim', () => {
    const result = repairDeliverableContentQuality('lessonPlans', {
      lessonPlans: [
        {
          notes: '(See also Accuracy and precision.) Accuracy is hard to establish in the general case.',
        },
      ],
    });
    expect(result.changed).toBe(true);
    expect(result.data.lessonPlans[0].notes).toBe('Accuracy is hard to establish in the general case.');
  });

  it('removes an orphan closing quote from a learner prompt', () => {
    const result = repairDeliverableContentQuality('studyGuides', {
      studyGuides: [{ reviewQuestions: [{ question: '” What decision follows from the evidence?' }] }],
    });
    expect(result.data.studyGuides[0].reviewQuestions[0].question).toBe('What decision follows from the evidence?');
  });

  it('requires exact calibrated scope signals, including every token in phrase hints', () => {
    const scope = (value) => new Set(semanticIdentityTokens(value));

    expect(knownOffenderFitsScope('PRISMA', scope('Systematic Review Methods'))).toBe(true);
    expect(knownOffenderFitsScope('PRISMA', scope('Meta-Analysis Methods'))).toBe(true);
    expect(knownOffenderFitsScope('PRISMA', scope('Meta-Analyses Methods'))).toBe(true);
    expect(knownOffenderFitsScope('PRISMA', scope('Evidence Syntheses in Public Health'))).toBe(true);
    expect(knownOffenderFitsScope('PRISMA', scope('Python for Public Policy Analysis'))).toBe(false);
    expect(knownOffenderFitsScope('R: A Language', scope('R Programming'))).toBe(true);
    expect(knownOffenderFitsScope('R: A Language', scope('Computing Ethics'))).toBe(false);
    expect(knownOffenderFitsScope('MNIST', scope('Machine Learning Policy'))).toBe(false);
    expect(knownOffenderFitsScope('XGBoost', scope('Machine Learning Foundations'))).toBe(true);
    expect(knownOffenderFitsScope('ImageJ', scope('Biomedical Image Analysis'))).toBe(true);
    expect(knownOffenderFitsScope('ImageJ', scope('Image Policy'))).toBe(false);
    expect(knownOffenderFitsScope('CES-D', scope('Mental Health Screening'))).toBe(true);
    expect(knownOffenderFitsScope('CES-D', scope('Psychology Policy'))).toBe(false);
  });

  it('fixes every mechanical finding class so the detector passes afterwards', () => {
    const data = {
      faq: [
        {
          question: 'What should I focus on?',
          answer: 'Connect ideas to the weekly memo.. Strong work explains a decision.',
        },
        { question: ': Leading label', answer: 'Pick a Evidence example aligned to .' },
      ],
    };
    const before = auditDeliverableContentQuality('courseFaq', data);
    expect(before.findings.length).toBeGreaterThan(0);

    const { data: repaired, changed, repairedStrings } = repairDeliverableContentQuality('courseFaq', data);
    expect(changed).toBe(true);
    expect(repairedStrings).toBeGreaterThan(0);
    expect(repaired.faq[0].answer).toBe('Connect ideas to the weekly memo. Strong work explains a decision.');
    expect(repaired.faq[1].question).toBe('Leading label');
    expect(repaired.faq[1].answer).toBe('Pick an Evidence example.');

    const after = auditDeliverableContentQuality('courseFaq', repaired);
    expect(after.findings).toHaveLength(0);
  });

  it('repairs duplicated learner subjects and malformed plural concept-detail frames', () => {
    const data = {
      decks: [
        {
          slides: [
            {
              bullets: [
                'Students may assume students often treat conformance as a checklist.',
                'Use feedback to separate a solid WCAG principles and conformance detail from the next gap.',
              ],
            },
          ],
        },
      ],
    };

    expect(auditDeliverableContentQuality('slideDecks', data).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'duplicated-student-subject' }),
        expect.objectContaining({ code: 'malformed-concept-detail' }),
      ]),
    );

    const result = repairDeliverableContentQuality('slideDecks', data);
    expect(result.changed).toBe(true);
    expect(result.data.decks[0].slides[0].bullets).toEqual([
      'A common assumption is that people treat conformance as a checklist.',
      'Use feedback to separate a strong detail about WCAG principles and conformance from the next gap.',
    ]);
    expect(auditDeliverableContentQuality('slideDecks', result.data).findings).toHaveLength(0);
  });

  it('repairs legacy framing collisions and sentence-shaped assessment identities before export', () => {
    const data = {
      lessonPlans: [
        {
          objective: 'Audit a practical the Pandas Tabular Data focus example and explain one risk.',
          title: 'Apply Conditional Branching Logic to one example and name one limitation.',
          overview:
            'Use Apply Conditional Branching Logic to one example and name one limitation as the weekly checkpoint.',
        },
      ],
    };

    expect(auditDeliverableContentQuality('lessonPlans', data).findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'article-collision' })]),
    );

    const result = repairDeliverableContentQuality('lessonPlans', data);

    expect(result.changed).toBe(true);
    expect(result.data.lessonPlans[0]).toEqual({
      objective: 'Audit a practical Pandas Tabular Data focus example and explain one risk.',
      title: 'Conditional Branching Logic application check',
      overview: 'Use Conditional Branching Logic application check as the weekly checkpoint.',
    });
    expect(auditDeliverableContentQuality('lessonPlans', result.data).findings).toHaveLength(0);
  });

  it('keeps prefixed assessment titles and body references synchronized', () => {
    const data = {
      assignments: [
        {
          assessmentTitle: 'Unit 3: Apply Conditional Branching Logic to one example and name one limitation.',
          instructions:
            'Use Unit 3: Apply Conditional Branching Logic to one example and name one limitation before submission.',
        },
      ],
    };

    const result = repairDeliverableContentQuality('assignments', data);

    expect(result.data.assignments[0]).toEqual({
      assessmentTitle: 'Unit 3: Conditional Branching Logic application check',
      instructions: 'Use Unit 3: Conditional Branching Logic application check before submission.',
    });
  });

  it('removes a known off-topic source sentence from saved teaching copy without erasing surrounding guidance', () => {
    const studyGuideWithReviewNote = (note) => ({ studyGuides: [{ reviewNotes: [note] }] });
    const data = {
      decks: [
        {
          lessonTitle: 'Lesson 6: Capstone Policy Memo',
          slides: [
            {
              bullets: [
                'Use policy evidence to bound the recommendation.',
                'The interoperability of ImageJ2 ensures Molecule Archives can easily be opened in multiple environments.',
              ],
              notes:
                'Compare the policy evidence first. The interoperability of ImageJ2 ensures Molecule Archives can easily be opened in multiple environments. Name one limitation before revising.',
            },
          ],
        },
      ],
    };

    const result = repairDeliverableContentQuality('slideDecks', data, {
      courseName: 'Python for Public Policy Analysis',
    });

    expect(result.changed).toBe(true);
    expect(JSON.stringify(result.data)).not.toMatch(/ImageJ|Molecule Archives/i);
    expect(result.data.decks[0].slides[0].bullets).toEqual(['Use policy evidence to bound the recommendation.']);
    expect(result.data.decks[0].slides[0].notes).toBe(
      'Compare the policy evidence first. Name one limitation before revising.',
    );

    const imageCourse = repairDeliverableContentQuality('slideDecks', data, {
      courseName: 'Biomedical Image Analysis with ImageJ2',
    });
    expect(imageCourse.changed).toBe(false);

    const biomedicalImageCourse = repairDeliverableContentQuality('slideDecks', data, {
      courseName: 'Biomedical Image Analysis',
    });
    expect(biomedicalImageCourse.changed).toBe(false);

    const explicitlyRequested = repairDeliverableContentQuality('slideDecks', data, {
      courseName: 'Biomedical Imaging Studio',
      sourceBrief: 'Teach ImageJ2 workflows and require students to compare Molecule Archives.',
    });
    expect(explicitlyRequested.changed).toBe(false);

    const systematicReviewCourse = repairDeliverableContentQuality(
      'studyGuides',
      studyGuideWithReviewNote('Use PRISMA to report the evidence synthesis.'),
      { courseName: 'Systematic Review Methods' },
    );
    expect(systematicReviewCourse.changed).toBe(false);

    const metaAnalysisCourse = repairDeliverableContentQuality(
      'studyGuides',
      studyGuideWithReviewNote('Use PRISMA to report the evidence synthesis.'),
      { courseName: 'Meta-Analysis Methods' },
    );
    expect(metaAnalysisCourse.changed).toBe(false);

    const metaAnalysesCourse = repairDeliverableContentQuality(
      'studyGuides',
      studyGuideWithReviewNote('Use PRISMA to report the evidence synthesis.'),
      { courseName: 'Meta-Analyses Methods' },
    );
    expect(metaAnalysesCourse.changed).toBe(false);

    const evidenceSynthesesCourse = repairDeliverableContentQuality(
      'studyGuides',
      studyGuideWithReviewNote('Use PRISMA to report the evidence synthesis.'),
      { courseName: 'Evidence Syntheses in Public Health' },
    );
    expect(evidenceSynthesesCourse.changed).toBe(false);

    const policyAnalysisCourse = repairDeliverableContentQuality(
      'studyGuides',
      studyGuideWithReviewNote('Use PRISMA to report the evidence synthesis.'),
      { courseName: 'Python for Public Policy Analysis' },
    );
    expect(policyAnalysisCourse.changed).toBe(true);
    expect(JSON.stringify(policyAnalysisCourse.data)).not.toMatch(/PRISMA/i);

    const computingEthicsCourse = repairDeliverableContentQuality(
      'studyGuides',
      studyGuideWithReviewNote('R: A Language and Environment for Statistical Computing is the reference manual.'),
      { courseName: 'Computing Ethics' },
    );
    expect(computingEthicsCourse.changed).toBe(true);
    expect(JSON.stringify(computingEthicsCourse.data)).not.toMatch(/R: A Language/i);

    const machineLearningPolicyCourse = repairDeliverableContentQuality(
      'studyGuides',
      studyGuideWithReviewNote('MNIST supports handwritten digit recognition benchmarks.'),
      { courseName: 'Machine Learning Policy' },
    );
    expect(machineLearningPolicyCourse.changed).toBe(true);
    expect(JSON.stringify(machineLearningPolicyCourse.data)).not.toMatch(/MNIST/i);

    const machineLearningFoundationsCourse = repairDeliverableContentQuality(
      'studyGuides',
      studyGuideWithReviewNote('Use XGBoost to compare boosted classification models.'),
      { courseName: 'Machine Learning Foundations' },
    );
    expect(machineLearningFoundationsCourse.changed).toBe(false);

    const mentalHealthCourse = repairDeliverableContentQuality(
      'studyGuides',
      studyGuideWithReviewNote('Use CES-D as a depression screening measure.'),
      { courseName: 'Mental Health Screening' },
    );
    expect(mentalHealthCourse.changed).toBe(false);

    const artHistoryCourse = repairDeliverableContentQuality(
      'studyGuides',
      studyGuideWithReviewNote('Compare L. S. Lowry with other painters of industrial life.'),
      { courseName: 'Modern British Art History' },
    );
    expect(artHistoryCourse.changed).toBe(false);

    const prismaticLanguage = repairDeliverableContentQuality(
      'studyGuides',
      studyGuideWithReviewNote('Describe the prismatic color structure in the painting.'),
      { courseName: 'Color and Composition Studio' },
    );
    expect(prismaticLanguage.changed).toBe(false);

    const wholeFieldLeak = repairDeliverableContentQuality(
      'lessonPlans',
      {
        lessonPlans: [
          {
            lessonTitle: 'The interoperability of ImageJ2 with SciJava.',
            objectives: ['The interoperability of ImageJ2 supports Molecule Archives.'],
          },
        ],
      },
      { courseName: 'Python for Public Policy Analysis' },
    );
    expect(wholeFieldLeak.changed).toBe(true);
    expect(wholeFieldLeak.data.lessonPlans[0].lessonTitle).toBe('Source evidence activity');
    expect(wholeFieldLeak.data.lessonPlans[0].objectives).toEqual([
      'Evidence task 1: compare the lesson claim with assigned evidence.',
    ]);

    const repeatedLeaks = repairDeliverableContentQuality(
      'lessonPlans',
      {
        lessonPlans: [
          {
            objectives: Array.from(
              { length: 12 },
              (_, index) => `ImageJ2 and Molecule Archive claim ${index + 1} needs review.`,
            ),
          },
        ],
      },
      { courseName: 'Python for Public Policy Analysis' },
    );
    expect(repeatedLeaks.data.lessonPlans[0].objectives).toHaveLength(12);
    expect(new Set(repeatedLeaks.data.lessonPlans[0].objectives).size).toBe(12);
    expect(repeatedLeaks.repeatedPhraseCount).toBe(0);
  });

  it('migrates saved slide directives that no longer retain their original off-topic fact', () => {
    const result = repairDeliverableContentQuality('slideDecks', {
      decks: [
        {
          slides: [
            {
              subtitle: 'Use a course-aligned example and verify its source before publishing.',
              bullets: [
                'Supported lesson evidence remains visible.',
                'Item 2: add course-aligned, instructor-approved evidence.',
                'Key Takeaway: Item 4: add course-aligned, instructor-approved evidence.',
              ],
              visual: {
                rows: [
                  ['Fact 1', 'Item 1: add course-aligned, instructor-approved evidence.'],
                  ['Fact 2', 'Supported source statement.'],
                ],
              },
            },
          ],
        },
      ],
    });

    expect(result.changed).toBe(true);
    expect(result.data.decks[0].slides[0]).toEqual({
      subtitle: 'Use the source-supported lesson evidence to test the claim before extending it.',
      bullets: ['Supported lesson evidence remains visible.'],
      visual: { rows: [['Fact 2', 'Supported source statement.']] },
    });
    expect(JSON.stringify(result.data)).not.toMatch(/add course-aligned|before publishing/i);
  });

  it.each(['syllabus', 'lessonPlans', 'rubrics', 'studyGuides'])(
    'removes legacy source-review records from rendered %s collections',
    (featureId) => {
      const collectionKey = featureId === 'syllabus' ? 'syllabus' : featureId;
      const rendered =
        featureId === 'syllabus'
          ? {
              syllabus: {
                requiredTexts: [
                  { title: 'Assigned policy handbook', note: 'Core reading.' },
                  { title: 'Course-aligned source review', note: 'https://example.test/unsafe' },
                ],
              },
            }
          : {
              [collectionKey]: [
                {
                  lessonTitle: 'Lesson 1: Evidence',
                  sourceEvidenceBrief: {
                    sources: [
                      { title: 'Assigned policy handbook', url: 'https://example.test/handbook' },
                      { title: 'Course-aligned source review', url: 'https://example.test/unsafe' },
                    ],
                  },
                },
              ],
            };

      const result = repairDeliverableContentQuality(featureId, rendered);
      expect(JSON.stringify(result.data)).not.toMatch(/Course-aligned (?:source|evidence) review/i);
      expect(JSON.stringify(result.data)).toContain('Assigned policy handbook');
    },
  );

  it('migrates saved internal claim checks into finished learner evidence tasks', () => {
    const result = repairDeliverableContentQuality('lessonPlans', {
      lessonPlans: [
        {
          lessonTitle: 'Lesson 1: Evidence',
          objectives: ['Check 3: verify this claim from sources.'],
        },
      ],
    });

    expect(result.data.lessonPlans[0].objectives).toEqual([
      'Evidence task 3: compare the lesson claim with assigned evidence.',
    ]);
  });

  it('does not let generic lesson overlap rescue a known off-topic source leak', () => {
    const data = {
      decks: [
        {
          slides: [
            {
              bullets: [
                'Case: Mars provides Fiji/ImageJ2 commands written in Java for common single-molecule analysis tasks using a Molecule Archive architecture that is easily adapted to complex, multistep reproducible analysis pipelines.',
              ],
            },
          ],
        },
      ],
    };

    const result = repairDeliverableContentQuality('slideDecks', data, {
      courseName: 'Python for Public Policy Analysis',
      courseScope: 'Reproducible Analysis Pipeline Statistical Modeling and Uncertainty Quantification',
    });

    expect(result.changed).toBe(true);
    expect(JSON.stringify(result.data)).not.toMatch(/ImageJ|Molecule Archive/i);

    const moleculeArchiveOnly = repairDeliverableContentQuality(
      'courseFaq',
      {
        faqs: [
          {
            answer:
              'Connect the lesson decision to Mars, a molecule archive suite for reproducible analysis and reporting of single-molecule properties from bioimages.',
          },
        ],
      },
      {
        courseName: 'Python for Public Policy Analysis',
        courseScope: 'Reproducible Analysis Pipeline Statistical Modeling and Uncertainty Quantification',
      },
    );
    expect(JSON.stringify(moleculeArchiveOnly.data)).not.toMatch(/Molecule Archive/i);
  });

  it('quarantines an unsafe repeated source fact before fan-out compaction can leave orphan references', () => {
    const unsafeFact =
      'ImageJ2 and Molecule Archive provide a reproducible architecture for complex single-molecule bioimage analysis pipelines.';
    const data = {
      lessonPlans: [
        {
          sourceEvidenceBrief: { claims: [unsafeFact] },
          notes: Array.from({ length: 6 }, () => `Teach this admitted fact: ${unsafeFact}`),
        },
      ],
    };

    const result = repairDeliverableContentQuality('lessonPlans', data, {
      courseName: 'Python for Public Policy Analysis',
      courseScope: 'Policy analysis, functions, data cleaning, and reproducible reporting',
      sourceFacts: [unsafeFact],
    });
    const text = JSON.stringify(result.data);

    expect(text).not.toMatch(/ImageJ|Molecule Archive/i);
    expect(text).not.toContain('the cited source claim');
  });

  it('rewrites a quarantined Course FAQ question and answer as one coherent operational pair', () => {
    const quarantine = {
      rejectedLessonScopes: new Set(['lesson-1']),
      phrases: new Set(),
      markers: new Set(['pygmt']),
      overlayTermsByLesson: new Map(),
      overlayExactValuesByLesson: new Map(),
      sourceAssertionExactValuesByLesson: new Map(),
    };
    const data = {
      faqs: [
        {
          lessonId: 'lesson-1',
          lessonTitle: 'Lesson 1: Python Data Types and Expressions',
          questions: [
            {
              question: 'I thought naming Python was sufficient evidence. Is that wrong? How does Python work?',
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

    const first = repairDeliverableContentQuality('courseFaq', data, context);
    const item = first.data.faqs[0].questions[0];
    const replay = repairDeliverableContentQuality('courseFaq', first.data, context);

    expect(first.changed).toBe(true);
    expect(item.question).toMatch(/Python|expression|data-type/i);
    expect(item.answer).toMatch(/input|type|expression|output/i);
    expect(item.answer).not.toMatch(/source basis|bounded conclusion|PyGMT/i);
    expect(item.relatedConcepts).toEqual([]);
    expect(auditDeliverableContentQuality('courseFaq', first.data).findings).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'faq-compiler-non-answer' })]),
    );
    expect(replay.changed).toBe(false);
    expect(replay.data).toBe(first.data);
  });

  it('does not repeat one quarantined fallback sentence across a study guide', () => {
    const quarantine = {
      rejectedLessonScopes: new Set(['lesson-4']),
      phrases: new Set(),
      markers: new Set(['pygmt']),
      overlayTermsByLesson: new Map(),
      overlayExactValuesByLesson: new Map(),
      sourceAssertionExactValuesByLesson: new Map(),
    };
    const data = {
      guides: [
        {
          lessonId: 'lesson-4',
          lessonTitle: 'Lesson 4: Coastal Risk Decisions',
          summary: 'PyGMT supplies the conclusion.',
          practiceActivities: ['PyGMT supplies the conclusion.', 'PyGMT supplies the conclusion.'],
          examPrep: {
            reviewStrategy: 'PyGMT supplies the conclusion.',
            timeManagement: 'PyGMT supplies the conclusion.',
          },
        },
      ],
    };

    const repaired = repairDeliverableContentQuality('studyGuides', data, {
      rejectedLearnerSourceEvidence: quarantine,
      compilerLessonScopeByTitle: new Map([['lesson 4: coastal risk decisions', 'lesson-4']]),
    }).data;
    const visible = [
      repaired.guides[0].summary,
      ...repaired.guides[0].practiceActivities,
      repaired.guides[0].examPrep.reviewStrategy,
      repaired.guides[0].examPrep.timeManagement,
    ];

    expect(new Set(visible).size).toBe(visible.length);
    expect(visible.join(' ')).not.toMatch(/PyGMT/i);
  });

  it('keeps course-neutral quarantine fallbacks grammatical without a lesson title', () => {
    const repaired = repairDeliverableContentQuality(
      'studyGuides',
      {
        guides: [
          {
            practiceActivities: Array.from({ length: 6 }, () => 'PyGMT supplies the conclusion.'),
          },
        ],
      },
      {
        rejectedLearnerSourceEvidence: {
          rejectedLessonScopes: new Set(),
          phrases: new Set(),
          markers: new Set(['pygmt']),
          overlayTermsByLesson: new Map(),
          overlayExactValuesByLesson: new Map(),
          sourceAssertionExactValuesByLesson: new Map(),
        },
      },
    ).data;

    const text = repaired.guides[0].practiceActivities.join(' ');
    expect(text).not.toMatch(/PyGMT|the this lesson|assigned this lesson/i);
    expect(text).toContain('this lesson');
  });

  it('migrates a saved Course FAQ compiler non-answer even when rejected source text is already gone', () => {
    const data = {
      faqs: [
        {
          lt: 'Lesson 3: Functions and pytest',
          qs: [
            {
              q: 'How does a function actually work?',
              an: "Functions: show the source basis and mark the inference's reach.",
              rc: ['Functions'],
            },
          ],
        },
      ],
    };

    const first = repairDeliverableContentQuality('courseFaq', data);
    const item = first.data.faqs[0].qs[0];
    const replay = repairDeliverableContentQuality('courseFaq', first.data);

    expect(item.q).toMatch(/function|pytest|test/i);
    expect(item.an).toMatch(/input|output|test|failure/i);
    expect(item.an).not.toMatch(/source basis/i);
    expect(item.rc).toEqual([]);
    expect(replay.changed).toBe(false);
  });

  it('rewrites a quarantined quiz item atomically so option labels cannot survive without option text', () => {
    const quarantine = {
      rejectedLessonScopes: new Set(['lesson-1']),
      phrases: new Set(),
      markers: new Set(['pygmt', 'xso']),
      overlayTermsByLesson: new Map(),
      overlayExactValuesByLesson: new Map(),
      sourceAssertionExactValuesByLesson: new Map(),
    };
    const data = {
      quizzes: [
        {
          lessonNumber: 1,
          lessonTitle: 'Lesson 1: Python Data Types and Expressions',
          questions: [
            {
              id: 'lesson-1-q1',
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

    const first = repairDeliverableContentQuality('quizBank', data, context);
    const item = first.data.quizzes[0].questions[0];
    const replay = repairDeliverableContentQuality('quizBank', first.data, context);

    expect(first.changed).toBe(true);
    expect(item.question).toMatch(/record|expression|result/i);
    expect(item.options).toHaveLength(4);
    expect(item.options.every((option) => /^[A-D]\.\s+\S/.test(option))).toBe(true);
    expect(item.answer).toMatch(/^[A-D]$/);
    expect(JSON.stringify(item)).not.toMatch(/PyGMT|XSO|A\.\s*A\.|source basis|bounded conclusion/i);
    expect(replay.changed).toBe(false);
    expect(replay.data).toBe(first.data);
  });

  it('reports a fixed point when a quarantine replacement also matches a coarse rejected assertion', () => {
    const quarantine = {
      rejectedLessonScopes: new Set(['lesson-6']),
      phrases: new Set(),
      markers: new Set(),
      overlayTermsByLesson: new Map(),
      overlayExactValuesByLesson: new Map(),
      sourceAssertionExactValuesByLesson: new Map([
        ['lesson-6', new Set(['flexible pipelines are big hurdles to adopting these advanced methods'])],
      ]),
    };
    const context = {
      rejectedLearnerSourceEvidence: quarantine,
      compilerScenarioMaterialsByLesson: new Map([['lesson-6', []]]),
    };
    const data = {
      decks: [
        {
          lessonId: 'lesson-6',
          lessonTitle: 'Lesson 6: Reproducible Analysis and Visualization',
          slides: [
            {
              bullets: ['Flexible pipelines are big hurdles to adopting these advanced methods.'],
            },
          ],
        },
      ],
    };

    const first = repairDeliverableContentQuality('slideDecks', data, context);
    const replacement = first.data.decks[0].slides[0].bullets[0];
    quarantine.sourceAssertionExactValuesByLesson.get('lesson-6').add(normalizeQuarantinedEvidenceText(replacement));
    const replay = repairDeliverableContentQuality('slideDecks', first.data, context);

    expect(first.changed).toBe(true);
    expect(replay.changed).toBe(false);
    expect(replay.repairedStrings).toBe(0);
    expect(replay.data).toBe(first.data);
  });

  it('drops rejected source-list records whole instead of leaving URL and metadata tails', () => {
    const quarantine = {
      rejectedLessonScopes: new Set(),
      phrases: new Set(),
      markers: new Set(['pygmt']),
      sourceIdentityExactValues: new Set(['https doi org 10 1029 rejected']),
    };
    const syllabus = repairDeliverableContentQuality(
      'syllabus',
      {
        syllabus: {
          weeklySchedule: [
            {
              readings: 'Official Python guide; PyGMT research article — https://doi. org/10.1029/rejected',
            },
          ],
        },
      },
      { rejectedLearnerSourceEvidence: quarantine },
    );
    const lessonPlans = repairDeliverableContentQuality(
      'lessonPlans',
      {
        lessonPlans: [
          {
            materials: ['Official Python guide', '0 (DOAJ article metadata) — https://doi. org/10.1029/rejected'],
          },
        ],
      },
      { rejectedLearnerSourceEvidence: quarantine },
    );

    expect(syllabus.data.syllabus.weeklySchedule[0].readings).toBe('Official Python guide');
    expect(lessonPlans.data.lessonPlans[0].materials).toEqual(['Official Python guide']);
  });

  it('preserves calibrated in-discipline uses of broadly named offender citations', () => {
    const clustering = repairDeliverableContentQuality(
      'lessonPlans',
      { notes: 'Data clustering separates observations into coherent groups.' },
      { courseName: 'Clustering and Dimensionality Reduction' },
    );
    expect(clustering.changed).toBe(false);
    expect(clustering.data.notes).toBe('Data clustering separates observations into coherent groups.');

    const rProgramming = repairDeliverableContentQuality(
      'studyGuides',
      { notes: 'R: A Language and Environment for Statistical Computing is the reference manual.' },
      { courseName: 'R Programming' },
    );
    expect(rProgramming.changed).toBe(false);
    expect(rProgramming.data.notes).toContain('R: A Language');
  });

  it('compacts the legacy compiler-owned code-review direction across saved surfaces', () => {
    const phrase =
      'Defining Reusable Code Blocks code review card: identify one readability issue and one correctness risk';
    const data = {
      decks: [
        {
          assessmentTitle: phrase,
          slides: [
            {
              notes: `Concept map highlights how students use the evidence for ${phrase}.`,
              visual: `Concept map connecting lesson evidence to ${phrase}.`,
            },
          ],
        },
      ],
    };

    const result = repairDeliverableContentQuality('slideDecks', data, {
      courseName: 'Python for Public Policy Analysis',
    });

    expect(result.changed).toBe(true);
    expect(JSON.stringify(result.data)).not.toContain('identify one readability issue');
    expect(result.data.decks[0].assessmentTitle).toBe('Defining Reusable Code Blocks code review');
    expect(result.data.decks[0].slides[0].notes).toBe(
      'Concept map highlights how students use the evidence for Defining Reusable Code Blocks code review',
    );
    expect(result.data.decks[0].slides[0].visual).toBe(
      'Concept map connecting lesson evidence to Defining Reusable Code Blocks code review',
    );
  });

  it('compacts the generic compiler-owned evidence-check direction across saved surfaces', () => {
    const topic = 'Statistical Modeling and Uncertainty Quantification';
    const data = {
      lessonPlans: [
        {
          assessmentTitle: `${topic} evidence check: state one supported, bounded conclusion`,
          notes: [`Students revise ${topic} evidence check: state one supported, bounded conclusion before transfer.`],
        },
      ],
    };

    const result = repairDeliverableContentQuality('lessonPlans', data, {
      courseName: 'Python for Public Policy Analysis',
    });

    expect(result.changed).toBe(true);
    expect(result.data.lessonPlans[0]).toEqual({
      assessmentTitle: `${topic} evidence check`,
      notes: [`Students revise ${topic} evidence check before transfer.`],
    });
  });

  it('migrates only the exact legacy source-boundary correction and is idempotent', () => {
    const legacy =
      'Cite the specific definition or fact that supports the Statistical Modeling claim, then state what that evidence does not establish.';
    const nearMatch =
      'Cite the specific definition or fact supporting the Statistical Modeling claim, then discuss its limits.';
    const compilerSourceBoundaryCorrectionsByLesson = new Map([
      ['lesson-1', new Map([[legacy, 'Statistical Modeling']])],
    ]);
    const data = {
      lessonPlans: [
        {
          lessonNumber: 1,
          lessonTitle: 'Lesson 1: Statistical Modeling',
          misconception: legacy,
          note: `Before transfer, ${legacy}`,
          nearMatch,
          provenance: { quote: legacy },
        },
      ],
    };

    const result = repairDeliverableContentQuality('lessonPlans', data, {
      compilerSourceBoundaryCorrectionsByLesson,
    });

    expect(result.changed).toBe(true);
    expect(result.repairedStrings).toBe(2);
    expect(result.data.lessonPlans[0].misconception).toMatch(/^Statistical Modeling:/);
    expect(result.data.lessonPlans[0].misconception).not.toContain('Cite the specific definition or fact');
    expect(result.data.lessonPlans[0].note).toMatch(/^Before transfer, .+Statistical Modeling evidence-boundary check/);
    expect(result.data.lessonPlans[0].nearMatch).toBe(nearMatch);
    expect(result.data.lessonPlans[0].provenance.quote).toBe(legacy);
    expect(
      repairDeliverableContentQuality('lessonPlans', result.data, { compilerSourceBoundaryCorrectionsByLesson }),
    ).toMatchObject({
      data: result.data,
      changed: false,
      repairedStrings: 0,
    });
  });

  it('never infers compiler ownership from an exact sentence collision', () => {
    const exactInstructorSentence =
      'Cite the specific definition or fact that supports the Statistical Modeling claim, then state what that evidence does not establish.';
    const data = { lessonPlans: [{ instructorDirection: exactInstructorSentence }] };

    const result = repairDeliverableContentQuality('lessonPlans', data);

    expect(result).toMatchObject({ data, changed: false, repairedStrings: 0 });
    expect(result.data.lessonPlans[0].instructorDirection).toBe(exactInstructorSentence);
  });

  it('keeps identical instructor prose and materials outside the researched lesson scope', () => {
    const correction =
      'Cite the specific definition or fact that supports the Statistical Modeling claim, then state what that evidence does not establish.';
    const materials = 'the supplied dataset record, transformation log, competing claims, and documented uncertainty';
    const data = {
      lessonPlans: [
        {
          lessonNumber: 1,
          lessonTitle: 'Lesson 1: Statistical Modeling',
          correction,
          materials,
          provenance: { quote: correction, scenarioMaterials: materials },
        },
        {
          lessonNumber: 2,
          lessonTitle: 'Lesson 2: Instructor Framework',
          instructorDirection: correction,
          instructorMaterials: materials,
          provenance: { quote: correction, scenarioMaterials: materials },
        },
      ],
    };
    const repairContext = {
      compilerSourceBoundaryCorrectionsByLesson: new Map([
        ['lesson-1', new Map([[correction, 'Statistical Modeling']])],
      ]),
      compilerScenarioMaterialsByLesson: new Map([['lesson-1', new Map([[materials, 'Statistical Modeling']])]]),
    };

    const result = repairDeliverableContentQuality('lessonPlans', data, repairContext);

    expect(result.changed).toBe(true);
    expect(result.data.lessonPlans[0].correction).not.toBe(correction);
    expect(result.data.lessonPlans[0].materials).not.toBe(materials);
    expect(result.data.lessonPlans[0].provenance).toEqual(data.lessonPlans[0].provenance);
    expect(result.data.lessonPlans[1]).toEqual(data.lessonPlans[1]);
    expect(repairDeliverableContentQuality('lessonPlans', result.data, repairContext)).toMatchObject({
      data: result.data,
      changed: false,
      repairedStrings: 0,
    });
  });

  it('compacts a production-observed verbose source fact before it fans out across exports', () => {
    const verboseFact = 'Functions in Python allow for the creation of reusable blocks of code for analysis';
    const data = {
      lessonPlans: [
        {
          sourceEvidence: [verboseFact],
          activities: Array.from({ length: 10 }, () => verboseFact),
        },
      ],
    };

    const result = repairDeliverableContentQuality('lessonPlans', data, {
      courseName: 'Python for Public Policy Analysis',
    });

    expect(result.changed).toBe(true);
    expect(result.repairedStrings).toBe(11);
    expect(JSON.stringify(result.data)).not.toContain('allow for the creation of');
    expect(JSON.stringify(result.data)).toContain('Python functions create reusable code for analysis');
    expect(result.repeatedPhraseCount).toBe(0);
  });

  it('caps every explicit long source fact per exported artifact instead of chasing one sentence at a time', () => {
    const branchingFact =
      'Conditional branching logic allows programs to execute different blocks of code based on specified conditions.';
    const iterationFact =
      'Iterative structures enable the systematic processing of sequential data elements within a program.';
    const data = {
      lessonPlans: [
        {
          sourceEvidenceBrief: { claims: [branchingFact, iterationFact] },
          outline: [
            {
              description: `Start with the anchor fact. ${branchingFact} Model one decision path.`,
              instructorNotes: `Use these admitted facts: 1) ${branchingFact} 2) ${iterationFact}`,
              catchUpPlan: `Put this anchor on the board: ${branchingFact} Ask for one prediction.`,
            },
          ],
          formativeCheck: {
            prompt: `Claim A: ${branchingFact} Claim B: ${iterationFact} Compare the claims.`,
            answer: `Claim A states ${branchingFact} Claim B states ${iterationFact}`,
          },
          evidencePlan: {
            sourceCue: `Provenance mirror remains byte-faithful: ${branchingFact}`,
          },
        },
      ],
    };
    const sourceFacts = collectDeliverableSourceFacts({ lessonPlans: { status: 'done', data } });

    expect(sourceFacts).toEqual(expect.arrayContaining([branchingFact.slice(0, -1), iterationFact.slice(0, -1)]));

    const result = repairDeliverableContentQuality('lessonPlans', data, { sourceFacts });
    const visible = JSON.stringify({
      ...result.data.lessonPlans[0],
      evidencePlan: undefined,
    }).toLowerCase();

    expect(result.changed).toBe(true);
    expect(result.repairedStrings).toBeGreaterThan(0);
    expect(
      visible.match(/conditional branching logic allows programs to execute different blocks of code/g),
    ).toHaveLength(1);
    expect(
      visible.match(/iterative structures enable the systematic processing of sequential data elements/g),
    ).toHaveLength(1);
    expect(visible).toContain('the earlier source claim on conditional branching logic');
    expect(visible).not.toContain('the cited source claim');
    expect(result.data.lessonPlans[0].evidencePlan.sourceCue).toContain(branchingFact);

    const replay = repairDeliverableContentQuality('lessonPlans', result.data, { sourceFacts });
    expect(replay.changed).toBe(false);
    expect(replay.repairedStrings).toBe(0);
    expect(replay.data).toBe(result.data);
  });

  it('inventories facts only from selected, completed rendered roots', () => {
    const canonicalFact =
      'Canonical evidence explains how conditional branching selects one policy path from several alternatives.';
    const staleAliasFact =
      'Stale alias evidence should never become authoritative for a canonical rendered lesson plan document.';
    const failedFact =
      'Failed deliverable evidence must not rewrite content from a completed package artifact during finalization.';
    const unselectedFact =
      'Unselected deliverable evidence must not influence the content authority of the requested export package.';
    const faqFact =
      'Canonical FAQ evidence remains part of the package-wide fact union across selected completed features.';
    const missingRootFact =
      'Metadata without a declared rendered collection must never become source authority for another artifact.';
    const missingRootData = { metadata: { sourceEvidenceBrief: { claims: [missingRootFact] } } };
    const facts = collectDeliverableSourceFacts(
      {
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [{ sourceEvidenceBrief: { claims: [canonicalFact] } }],
            plans: [{ sourceEvidenceBrief: { claims: [staleAliasFact] } }],
          },
        },
        studyGuides: {
          status: 'failed',
          data: { guides: [{ sourceEvidenceBrief: { claims: [failedFact] } }] },
        },
        assignments: {
          status: 'done',
          data: { assignments: [{ sourceEvidenceBrief: { claims: [unselectedFact] } }] },
        },
        courseFaq: {
          status: 'done',
          data: { courseFaq: [{ sourceEvidenceBrief: { claims: [faqFact] } }] },
        },
        discussions: {
          status: 'done',
          data: missingRootData,
        },
      },
      ['lessonPlans', 'studyGuides', 'courseFaq', 'discussions'],
    );

    expect(facts).toEqual([canonicalFact.slice(0, -1), faqFact.slice(0, -1)]);
    const missingRootRepair = repairDeliverableContentQuality('discussions', missingRootData, {
      sourceFacts: [missingRootFact],
    });
    expect(missingRootRepair.changed).toBe(false);
    expect(missingRootRepair.data).toBe(missingRootData);
  });

  it('keeps two full visible uses when an artifact has no standalone source-fact ledger', () => {
    const fact =
      'Conditional branching logic allows programs to execute different blocks of code based on specified conditions.';
    const data = {
      quizzes: [
        {
          questions: [
            { question: `Which conclusion follows from this statement: ${fact}`, options: [`A. ${fact}`] },
            { question: `Claim A: ${fact} What remains unproven?`, answer: `Claim A means ${fact}` },
          ],
        },
      ],
    };

    const result = repairDeliverableContentQuality('quizBank', data, { sourceFacts: [fact] });
    const text = JSON.stringify(result.data);
    const occurrences =
      text.match(/Conditional branching logic allows programs to execute different blocks of code/g) || [];

    expect(occurrences).toHaveLength(2);
    expect(text).toContain('the earlier source claim on Conditional branching logic');
    expect(text).not.toContain('the cited source claim');
  });

  it('keeps a 42-copy production fan-out below the package grader limit across seven artifacts', () => {
    const fact =
      'Conditional branching logic allows programs to execute different blocks of code based on specified conditions.';
    const featureShapes = {
      lessonPlans: {
        lessonPlans: [
          {
            sourceEvidenceBrief: { claims: [fact] },
            notes: Array.from({ length: 6 }, () => `Teach from this admitted fact: ${fact}`),
          },
        ],
      },
      slideDecks: {
        decks: [
          {
            slides: [
              { bullets: [fact] },
              ...Array.from({ length: 5 }, () => ({ notes: `Explain this source evidence: ${fact}` })),
            ],
          },
        ],
      },
      quizBank: { quizzes: [{ questions: Array.from({ length: 6 }, () => ({ question: `Claim A: ${fact}` })) }] },
      studyGuides: {
        studyGuides: [
          {
            sourceEvidenceBrief: { claims: [fact] },
            prompts: Array.from({ length: 5 }, () => `Test this explanation against ${fact}`),
          },
        ],
      },
      courseFaq: { faqs: [{ questions: Array.from({ length: 6 }, () => ({ answer: `For example: ${fact}` })) }] },
      syllabus: {
        metadata: ['saved-project receipt'],
        syllabus: {
          definitions: [fact],
          examples: Array.from({ length: 5 }, () => `Use this course statement: ${fact}`),
        },
      },
      rubrics: {
        rubrics: [
          {
            sourceEvidenceBrief: { claims: [fact] },
            criteria: Array.from({ length: 5 }, () => `Evaluate the response against ${fact}`),
          },
        ],
      },
    };
    let packageOccurrences = 0;

    for (const [featureId, data] of Object.entries(featureShapes)) {
      const result = repairDeliverableContentQuality(featureId, data, { sourceFacts: [fact] });
      packageOccurrences += (
        JSON.stringify(result.data).match(
          /Conditional branching logic allows programs to execute different blocks of code/g,
        ) || []
      ).length;
    }

    expect(packageOccurrences).toBeLessThan(24);
    expect(packageOccurrences).toBe(22);
  });

  it('does not rewrite repeated standalone facts that may carry answer or definition meaning', () => {
    const fact =
      'Conditional branching logic allows programs to execute different blocks of code based on specified conditions.';
    const data = {
      quizzes: [
        {
          questions: Array.from({ length: 6 }, () => ({ options: [fact] })),
        },
      ],
    };

    const result = repairDeliverableContentQuality('quizBank', data, { sourceFacts: [fact] });

    expect(result.changed).toBe(false);
    expect(result.repairedStrings).toBe(0);
    expect(result.data).toBe(data);
  });

  it('keeps visible embedded copies when the only standalone fact is in speaker notes', () => {
    const fact =
      'Conditional branching logic allows programs to execute different blocks of code based on specified conditions.';
    const data = {
      decks: [
        {
          slides: [
            { notes: fact },
            ...Array.from({ length: 4 }, () => ({ bullets: [`Apply this source statement: ${fact}`] })),
          ],
        },
      ],
    };

    const result = repairDeliverableContentQuality('slideDecks', data, { sourceFacts: [fact] });
    const text = JSON.stringify(result.data);
    const occurrences =
      text.match(/Conditional branching logic allows programs to execute different blocks of code/g) || [];

    expect(occurrences).toHaveLength(5);
    expect(result.data.decks[0].slides[1].bullets[0]).toContain(fact);
    expect(result.data.decks[0].slides[2].bullets[0]).toContain(fact);
    expect(result.data.decks[0].slides[3].bullets[0]).toContain(fact);
  });

  it('capitalizes a compacted source reference at a sentence boundary', () => {
    const fact =
      'Conditional branching logic allows programs to execute different blocks of code based on specified conditions.';
    const data = {
      lessonPlans: [
        {
          sourceEvidenceBrief: { claims: [fact] },
          description: `Start with the anchor. ${fact} Model one decision path.`,
          catchUpPlan: `Put this anchor on the board: ${fact} Ask for one prediction.`,
        },
      ],
    };

    const result = repairDeliverableContentQuality('lessonPlans', data, { sourceFacts: [fact] });

    expect(result.data.lessonPlans[0].description).toContain(
      'Start with the anchor. Return to the source-backed claim about Conditional branching logic.',
    );
    expect(result.data.lessonPlans[0].catchUpPlan).toContain(
      'board: the source claim concerning Conditional branching logic',
    );
  });

  it('turns a leading adverbial source fact into a grammatical topic reference', () => {
    const fact =
      'By bridging GMT with the Python ecosystem, PyGMT brings geospatial analysis into reproducible Python workflows.';
    const data = {
      lessonPlans: [
        {
          sourceEvidenceBrief: { claims: [fact] },
          descriptions: [fact, fact, `Compare the decision against ${fact}`, `Start with the evidence. ${fact}`],
        },
      ],
    };

    const result = repairDeliverableContentQuality('lessonPlans', data, { sourceFacts: [fact] });
    const text = JSON.stringify(result.data);

    expect(text).toContain('the earlier source claim on PyGMT');
    expect(text).toContain('Recheck the source claim concerning PyGMT.');
    expect(text).not.toMatch(/\b(?:claim (?:about|concerning|on)|source claim concerns) By bridging\b/i);
  });

  it('anchors a generic source-fact subject to a named entity from the fact', () => {
    const fact = 'The components can be created and modified using standard variable types from the XSO framework.';
    const data = {
      lessonPlans: [
        {
          sourceEvidenceBrief: { claims: [fact] },
          descriptions: Array.from({ length: 5 }, () => `Compare the model with ${fact}`),
        },
      ],
    };

    const result = repairDeliverableContentQuality('lessonPlans', data, { sourceFacts: [fact] });
    const text = JSON.stringify(result.data);

    expect(text).toContain('the earlier source claim on XSO components');
    expect(text).not.toContain('source claim on components');
  });

  it.each(['whether', 'if', 'when'])('keeps a compacted reference grammatical after %s', (conjunction) => {
    const fact =
      'Conditional branching logic allows programs to execute different blocks of code based on specified conditions.';
    const data = {
      lessonPlans: [
        {
          sourceEvidenceBrief: { claims: [fact] },
          description: `${fact} ${fact} Ask ${conjunction} ${fact}`,
        },
      ],
    };

    const result = repairDeliverableContentQuality('lessonPlans', data, { sourceFacts: [fact] });

    expect(result.data.lessonPlans[0].description).toContain(
      `${conjunction} the retained claim about Conditional branching logic applies`,
    );
  });

  it('migrates the former opaque source placeholder and its punctuation seam', () => {
    const data = {
      lessonPlans: [
        {
          lessonTitle: 'Lesson 2: Control Flow Structures',
          description: 'Test this admitted claim before deciding: the cited source claim.',
          evidence: 'Evidence: the cited source claim.',
          notes: 'Emphasize the cited source claim. in concrete language and tie it back to the objective.',
          prompt: 'Ask whether the cited source claim applies.',
        },
      ],
    };

    const result = repairDeliverableContentQuality('lessonPlans', data);
    const text = JSON.stringify(result.data);

    expect(result.changed).toBe(true);
    expect(result.data.lessonPlans[0].description).toBe(
      'Compare the source evidence for Control Flow Structures before deciding which conclusion it supports.',
    );
    expect(result.data.lessonPlans[0].evidence).toBe(
      'Evidence: Use the source evidence for Control Flow Structures and identify its limit.',
    );
    expect(result.data.lessonPlans[0].notes).toContain(
      'Emphasize the source evidence for Control Flow Structures in concrete language',
    );
    expect(text).not.toContain('the cited source claim');
    expect(text).not.toContain('retained source statement for this lesson');
    expect(text).not.toContain('claim. in concrete language');
  });

  it('migrates the exact saved-slide signatures that previously survived package preparation', () => {
    const result = repairDeliverableContentQuality('slideDecks', {
      slideDecks: [
        {
          slides: [
            {
              bullets: [
                'Frame Control Flow Structures through Control Flow Structures evidence brief.',
                'Evaluate how Conditional Branching Logic evidence changes Conditional Branching Logic application check.',
                'Practice: Run a problem-to-policy cycle where students frame the public?',
                'Prepare or submit the Week 2 assignment.',
                'Preview: Functions and Pytest Tests',
                'Use feedback from Lesson 2: Control Flow Structures to strengthen the next course task.',
              ],
            },
          ],
        },
      ],
    });

    const text = JSON.stringify(result.data);
    expect(text).toContain('Frame Control Flow Structures through one source-backed example.');
    expect(text).toContain(
      'Evaluate how Conditional Branching Logic evidence changes one decision in the application check.',
    );
    expect(text).toContain('compare two policy options');
    expect(text).toContain('one decision and one limitation');
    expect(text).toContain("identify which part extends today's evidence work");
    expect(text).toContain('revise one claim, one evidence choice, and one limitation');
    expect(text).not.toContain('where students frame the public?');
    expect(text).not.toContain('through Control Flow Structures evidence brief');
    expect(result.changed).toBe(true);
  });

  it('specializes the saved policy activity around control-flow operations', () => {
    const result = repairDeliverableContentQuality('slideDecks', {
      decks: [
        {
          lessonTitle: 'Lesson 2: Control Flow Structures',
          slides: [
            {
              title: 'Policy analysis: test one source-backed revision',
              bullets: [
                'Practice: Run a problem-to-policy cycle where students frame the public?',
                'Evidence: Collect problem definition, affected population, policy authority.',
                'Debrief: Use the feedback routine to identify the strongest move.',
              ],
            },
          ],
        },
      ],
    });

    const text = JSON.stringify(result.data);
    expect(text).toContain('if/elif/else branches');
    expect(text).toContain('test one threshold boundary');
    expect(text).toContain('branch taken, boundary input');
    expect(text).toContain('revise the decision rule when the evidence changes');
    expect(text).not.toContain('frame the public?');
    expect(text).not.toContain('Collect problem definition, affected population, policy authority');
  });

  it('repairs source-fact sentence shells in the same invocation that compacts the fact', () => {
    const fact = 'Conditional branching logic allows programs to execute different blocks of code based on conditions.';
    const result = repairDeliverableContentQuality(
      'slideDecks',
      {
        slideDecks: [
          {
            slides: [
              {
                bullets: [fact, fact, `Test this admitted claim before deciding: ${fact}`, `Evidence: ${fact}`],
              },
            ],
          },
        ],
      },
      { sourceFacts: [fact] },
    );

    const text = JSON.stringify(result.data);
    expect(text).toContain('Compare the source statements before deciding which conclusion they support.');
    expect(text).toContain(
      'Evidence: Use the source claim concerning Conditional branching logic and identify its limit.',
    );
    expect(text).not.toContain('Test this admitted claim');
  });

  it('matches the grader across NFKC, internal punctuation, and whitespace differences', () => {
    const fact =
      'Conditional branching logic allows programs to execute different blocks of code based on specified conditions.';
    const variant =
      'Ｃｏｎｄｉｔｉｏｎａｌ  branching logic—allows programs to execute different blocks of code, based on specified conditions.';
    const data = {
      lessonPlans: [
        {
          sourceEvidenceBrief: { claims: [fact] },
          descriptions: Array.from({ length: 4 }, () => `Model this admitted statement: ${variant}`),
        },
      ],
    };

    const result = repairDeliverableContentQuality('lessonPlans', data, { sourceFacts: [fact] });
    const text = JSON.stringify(result.data);

    expect(result.changed).toBe(true);
    expect(text.match(/Ｃｏｎｄｉｔｉｏｎａｌ/g) || []).toHaveLength(0);
    expect(text).toContain('the earlier source claim on Conditional branching logic');
    expect(text).not.toContain('the cited source claim');
  });

  it('protects a longer standalone fact when another inventoried fact is its prefix', () => {
    const shortFact =
      'Conditional branching logic allows programs to execute different blocks of code based on specified conditions.';
    const longFact =
      'Conditional branching logic allows programs to execute different blocks of code based on specified conditions and policy constraints.';
    const data = {
      studyGuides: [
        {
          sourceEvidenceBrief: { claims: [shortFact, longFact] },
          keyTerms: [{ term: 'Branching', definition: longFact }],
          prompts: Array.from({ length: 4 }, () => `Compare this source statement: ${shortFact}`),
        },
      ],
    };

    const result = repairDeliverableContentQuality('studyGuides', data, {
      sourceFacts: [shortFact, longFact],
    });

    expect(result.data.studyGuides[0].sourceEvidenceBrief.claims).toEqual([shortFact, longFact]);
    expect(result.data.studyGuides[0].keyTerms[0].definition).toBe(longFact);
  });

  it('does not compact an inventoried fact when it is only a prefix of richer prose', () => {
    const shortFact =
      'By bridging GMT with the Python ecosystem, PyGMT enables users to access GMT powerful visualization.';
    const richerSentence =
      'By bridging GMT with the Python ecosystem, PyGMT enables users to access GMT powerful visualization and analysis capabilities directly within Python workflows.';
    const appositiveFact =
      'PyGMT is a free and open-source Python library that provides a high-level interface to the Generic Mapping Tools (GMT).';
    const appositiveSentence =
      'PyGMT is a free and open-source Python library that provides a high-level interface to the Generic Mapping Tools (GMT), a widely used command-line toolset.';
    const data = {
      lessonPlans: [
        {
          sourceEvidenceBrief: { claims: [shortFact, appositiveFact] },
          descriptions: [
            ...Array.from({ length: 4 }, () => shortFact),
            richerSentence,
            ...Array.from({ length: 4 }, () => appositiveFact),
            appositiveSentence,
          ],
        },
      ],
    };

    const result = repairDeliverableContentQuality('lessonPlans', data, {
      sourceFacts: [shortFact, appositiveFact],
    });

    expect(result.data.lessonPlans[0].descriptions).toContain(richerSentence);
    expect(result.data.lessonPlans[0].descriptions).toContain(appositiveSentence);
    expect(JSON.stringify(result.data)).not.toContain('source claim on PyGMT and analysis capabilities');
    expect(JSON.stringify(result.data)).not.toContain('source claim on PyGMT), a widely');
  });

  it('consumes a source-owned opening parenthesis when compacting a See-also fact', () => {
    const fact =
      '(See also Accuracy and precision.) Accuracy is very hard to achieve through data cleansing in the general case.';
    const data = {
      lessonPlans: [
        {
          sourceEvidenceBrief: { claims: [fact] },
          descriptions: Array.from({ length: 5 }, () => `Compare the evidence with ${fact}`),
        },
      ],
    };

    const result = repairDeliverableContentQuality('lessonPlans', data, { sourceFacts: [fact] });
    const text = JSON.stringify(result.data);

    expect(text).toContain('the earlier source claim on Accuracy');
    expect(text).not.toContain('(the earlier source claim');
  });

  it('selects the feature collection instead of an earlier metadata array', () => {
    const fact =
      'Conditional branching logic allows programs to execute different blocks of code based on specified conditions.';
    const metadata = Array.from({ length: 4 }, () => `Metadata mirror: ${fact}`);
    const data = {
      metadata,
      lessonPlans: [
        {
          sourceEvidenceBrief: { claims: [fact] },
          descriptions: Array.from({ length: 4 }, () => `Teach this admitted statement: ${fact}`),
        },
      ],
    };

    const result = repairDeliverableContentQuality('lessonPlans', data, { sourceFacts: [fact] });

    expect(result.data.metadata).toBe(metadata);
    expect(JSON.stringify(result.data.lessonPlans)).toContain(
      'the earlier source claim on Conditional branching logic',
    );
    expect(JSON.stringify(result.data.lessonPlans)).not.toContain('the cited source claim');
  });

  it('repairs the canonical collection selected by the renderer when dual roots coexist', () => {
    const fact =
      'Conditional branching logic allows programs to execute different blocks of code based on specified conditions.';
    const canonical = [
      {
        sourceEvidenceBrief: { claims: [fact] },
        notes: Array.from({ length: 5 }, () => `Canonical statement: ${fact}`),
      },
    ];
    const plans = [
      {
        sourceEvidenceBrief: { claims: [fact] },
        notes: Array.from({ length: 5 }, () => `Rendered plan statement: ${fact}`),
      },
    ];
    const data = { lessonPlans: canonical, plans };

    const result = repairDeliverableContentQuality('lessonPlans', data, { sourceFacts: [fact] });

    expect(result.data.lessonPlans).not.toBe(canonical);
    expect(result.data.plans).toBe(plans);
    expect(
      JSON.stringify(result.data.lessonPlans).match(
        /Conditional branching logic allows programs to execute different blocks of code/g,
      ) || [],
    ).toHaveLength(1);
  });

  it('leaves a stale dual root byte-identical during mechanical seam repair', () => {
    const stalePlans = [{ notes: 'Stale alias text..' }];
    const data = {
      lessonPlans: [{ notes: 'Canonical text..' }],
      plans: stalePlans,
    };
    const staleJson = JSON.stringify(stalePlans);

    const result = repairDeliverableContentQuality('lessonPlans', data);

    expect(result.changed).toBe(true);
    expect(result.data.lessonPlans[0].notes).toBe('Canonical text.');
    expect(result.data.plans).toBe(stalePlans);
    expect(JSON.stringify(result.data.plans)).toBe(staleJson);
  });

  it('repairs a valid alias after a malformed canonical field without touching the malformed root', () => {
    const malformedCanonical = { notes: 'Malformed canonical metadata..' };
    const data = {
      lessonPlans: malformedCanonical,
      lessons: [{ notes: 'Rendered alias text..' }],
    };

    const result = repairDeliverableContentQuality('lessonPlans', data);

    expect(result.changed).toBe(true);
    expect(result.data.lessonPlans).toBe(malformedCanonical);
    expect(result.data.lessonPlans.notes).toBe('Malformed canonical metadata..');
    expect(result.data.lessons[0].notes).toBe('Rendered alias text.');
  });

  it('leaves known-feature metadata unchanged when no declared collection can render', () => {
    const data = {
      lessonPlans: { malformed: true },
      metadata: ['Unrendered metadata..'],
    };

    const result = repairDeliverableContentQuality('lessonPlans', data);

    expect(result.changed).toBe(false);
    expect(result.data).toBe(data);
  });

  it('falls back to a valid canonical collection when a truthy alias is malformed', () => {
    const fact =
      'Conditional branching logic allows programs to execute different blocks of code based on specified conditions.';
    const lessonPlans = [
      {
        sourceEvidenceBrief: { claims: [fact] },
        notes: Array.from({ length: 5 }, () => `Rendered plan statement: ${fact}`),
      },
    ];
    const data = { plans: { malformed: true }, lessonPlans };

    const result = repairDeliverableContentQuality('lessonPlans', data, { sourceFacts: [fact] });

    expect(result.data.plans).toBe(data.plans);
    expect(result.data.lessonPlans).not.toBe(lessonPlans);
    expect(JSON.stringify(result.data.lessonPlans)).toContain(
      'the earlier source claim on Conditional branching logic',
    );
    expect(JSON.stringify(result.data.lessonPlans)).not.toContain('the cited source claim');
  });

  it('repairs an object-rooted syllabus without treating metadata as its artifact collection', () => {
    const fact =
      'Conditional branching logic allows programs to execute different blocks of code based on specified conditions.';
    const metadata = Array.from({ length: 4 }, () => `Unrendered metadata mirror: ${fact}`);
    const data = {
      metadata,
      syllabus: {
        definitions: [fact],
        examples: Array.from({ length: 5 }, () => `Use this course statement: ${fact}`),
      },
    };

    const result = repairDeliverableContentQuality('syllabus', data, { sourceFacts: [fact] });
    const text = JSON.stringify(result.data.syllabus);

    expect(result.changed).toBe(true);
    expect(result.data.metadata).toBe(metadata);
    expect(
      text.match(/Conditional branching logic allows programs to execute different blocks of code/g) || [],
    ).toHaveLength(1);
    expect(text).toContain('the earlier source claim on Conditional branching logic');
    expect(text).not.toContain('the cited source claim');
  });

  it('keeps a local proposition when a question only carries it in an explanation', () => {
    const fact =
      'Conditional branching logic allows programs to execute different blocks of code based on specified conditions.';
    const data = {
      quizzes: [
        {
          sourceEvidenceBrief: { claims: [fact] },
          questions: Array.from({ length: 4 }, (_, index) => ({
            question: `Which policy outcome follows in scenario ${index + 1}?`,
            explanation: `The decision is justified by this source statement: ${fact}`,
          })),
        },
      ],
    };

    const result = repairDeliverableContentQuality('quizBank', data, { sourceFacts: [fact] });

    for (const question of result.data.quizzes[0].questions) {
      expect(question.explanation).toContain(fact);
      expect(question.explanation).not.toContain('the cited source claim');
    }
  });

  it('leaves unrelated paragraph and list whitespace byte-for-byte unchanged', () => {
    const notes = 'Paragraph one.\n\nParagraph two.\n  - indented item';
    const result = repairDeliverableContentQuality(
      'lessonPlans',
      { notes },
      { courseName: 'Python for Public Policy Analysis' },
    );

    expect(result.changed).toBe(false);
    expect(result.repairedStrings).toBe(0);
    expect(result.data.notes).toBe(notes);
  });

  it('turns circular fallback glossary prose into an honest definition-review notice', () => {
    const data = {
      studyGuides: [
        {
          keyTerms: [
            {
              term: 'Accessibility evidence',
              definition:
                'Accessibility evidence names the evidence focus students use when deciding what counts as support.',
            },
          ],
        },
      ],
    };

    expect(auditDeliverableContentQuality('studyGuides', data).findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'procedural-term-definition' })]),
    );
    const result = repairDeliverableContentQuality('studyGuides', data);

    expect(result.changed).toBe(true);
    expect(result.data.studyGuides[0].keyTerms[0].definition).toMatch(/does not supply a disciplinary definition/i);
    expect(auditDeliverableContentQuality('studyGuides', result.data).findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'missing-disciplinary-definition' })]),
    );
  });

  it('preserves identity when nothing needs fixing and leaves ellipses alone', () => {
    const data = { notes: ['All good here.', 'Thinking… more thoughts...'] };
    const { data: repaired, changed } = repairDeliverableContentQuality('studyGuides', data);
    expect(changed).toBe(false);
    expect(repaired).toBe(data);
  });

  it('does not touch abbreviation periods (e.g., etc.)', () => {
    const data = { tip: 'Bring examples, readings, etc. A compact example, e.g., this one, stays intact.' };
    const { changed } = repairDeliverableContentQuality('studyGuides', data);
    expect(changed).toBe(false);
  });

  it('removes an impossible period before a comma without altering disciplinary content', () => {
    const data = {
      faq: [
        'For the Week 1 check., state one accurate claim.',
        'Use “我是学生。,” then compare the corrected example.',
        'The source says “use the contour.”, then asks students to listen again.',
      ],
    };

    const result = repairDeliverableContentQuality('courseFaq', data);

    expect(result.changed).toBe(true);
    expect(result.repairedStrings).toBe(3);
    expect(result.data.faq).toEqual([
      'For the Week 1 check, state one accurate claim.',
      'Use “我是学生,” then compare the corrected example.',
      'The source says “use the contour”, then asks students to listen again.',
    ]);
  });

  it('preserves valid phrasal verbs that end in a preposition', () => {
    const data = {
      notes: [
        'Ask students which cue they should watch for.',
        'Name the source they will work with.',
        'The conclusion holds whatever foods the energy comes from.',
      ],
    };
    const result = repairDeliverableContentQuality('slideDecks', data);

    expect(result.changed).toBe(false);
    expect(result.data).toBe(data);
  });

  it('turns assignment logistics deferrals into self-contained submission requirements', () => {
    const data = {
      assignments: [
        {
          formatRequirements: [
            'Submission format: organize the memo in the medium listed for the task.',
            'Use the format and channel listed for this task.',
            'Follow the word, page, or time limit specified in the course site.',
            'Use the course citation style.',
          ],
        },
      ],
    };

    const before = auditDeliverableContentQuality('assignments', data);
    expect(before.findings.some((finding) => finding.code === 'instructor-configuration-deferral')).toBe(true);

    const result = repairDeliverableContentQuality('assignments', data);
    const after = auditDeliverableContentQuality('assignments', result.data);

    expect(result.changed).toBe(true);
    expect(result.data.assignments[0].formatRequirements).toEqual([
      'Submission format: organize the memo with descriptive headings and an evidence list.',
      'submit one clearly labeled artifact that preserves the required evidence, reasoning, revision, and citations.',
      'use enough space to present the required evidence, reasoning, and revision without padding.',
      'use one consistent citation style and include enough information for readers to locate every source.',
    ]);
    expect(after.findings.filter((finding) => finding.code === 'instructor-configuration-deferral')).toHaveLength(0);
  });
});
