/**
 * v0.14.1 Phase 1 batch B fixture tests (roadmap items 1.1, 1.8, 1.10
 * finalizer part, 1.14, 1.15).
 *
 * Failure shapes lifted from the OUTPUT-V014 four-course audit:
 *  - 1.1  CS shipped 12 lessons titled "Autograded quiz and lab checkpoint"
 *         and every document rewrote mentions to "the Week 2 quiz" (×1,064).
 *  - 1.8  evaluateDesign rotated 4 always-positive verdicts it never checked.
 *  - 1.10 "Lab Evidence Thread" survived into syllabus + brief (keep: 1).
 *  - 1.14 the repair pass stripped "1a." goal labels and logged 30 fake
 *         objective "repairs" per run.
 *  - 1.15 Mandarin row 26 shipped raw JSON ('topicSection": "') in a cell.
 */
import { describe, expect, it } from 'vitest';

import { finalizeCompiledDeliverableLanguage } from '../src/lib/compiledLanguageFinalizer';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler';
import { repairDeliverableContentQuality } from '../src/lib/contentQualityRepair';
import { deriveCompilerOwnedColumns, expandLeanCourseMap, expandLeanSectionField } from '../src/lib/leanCourseMap';
import { repairCourseMapReadiness } from '../src/lib/deliverableReadiness';
import { deriveCourseGraphFromCourseMap } from '../src/lib/courseGraph';
import { verifyPackageExports } from '../src/lib/packageExportVerifier';

const OBJECTIVE_COLUMNS = [
  { key: 'learningObjectives', label: 'Learning Objectives', enabled: true },
  { key: 'topicSection', label: 'Topic Section', enabled: true },
];

describe('1.1 — week numbers resolve from the enclosing lesson, not the first minted target', () => {
  const sharedTitle = 'Autograded quiz and lab checkpoint';
  const mentionBlock = [
    `Complete ${sharedTitle} this week.`,
    `Review ${sharedTitle} expectations with a partner.`,
    `Submit ${sharedTitle} online before Friday.`,
    `Revisit ${sharedTitle} feedback before the next class.`,
  ].join(' ');
  const blueprint = {
    lessons: [
      { lessonNumber: 2, title: 'Lesson 2: Loops', studentArtifact: sharedTitle },
      { lessonNumber: 5, title: 'Lesson 5: Functions', studentArtifact: sharedTitle },
      { lessonNumber: 9, title: 'Lesson 9: Files', studentArtifact: sharedTitle },
    ],
    assessments: [
      { title: sharedTitle, artifact: sharedTitle, lessonNumbers: [2] },
      { title: sharedTitle, artifact: sharedTitle, lessonNumbers: [5] },
      { title: sharedTitle, artifact: sharedTitle, lessonNumbers: [9] },
    ],
  };

  it('gives every per-lesson document its OWN week number for a title shared across lessons', () => {
    const data = {
      lessonPlans: [
        { lessonNumber: 2, overview: mentionBlock },
        { lessonNumber: 5, overview: mentionBlock },
        { lessonNumber: 9, overview: mentionBlock },
      ],
    };
    finalizeCompiledDeliverableLanguage('lessonPlans', data, blueprint);

    expect(data.lessonPlans[0].overview).toContain('the Week 2 quiz');
    expect(data.lessonPlans[1].overview).toContain('the Week 5 quiz');
    expect(data.lessonPlans[1].overview).not.toContain('Week 2');
    expect(data.lessonPlans[2].overview).toContain('the Week 9 quiz');
    expect(data.lessonPlans[2].overview).not.toContain('Week 2');
  });

  it('uses week-neutral phrasing for course-level documents when the title is multi-lesson', () => {
    const data = {
      lessonPlans: [{ lessonNumber: 2, overview: mentionBlock }],
      courseOverview: `${sharedTitle} anchors practice. Each week revisit ${sharedTitle} for feedback. The ${sharedTitle} recurs every week.`,
    };
    finalizeCompiledDeliverableLanguage('lessonPlans', data, blueprint);

    expect(data.courseOverview).toContain('weekly quiz');
    expect(data.courseOverview).not.toMatch(/Week \d/);
  });

  it('keeps the correct week for distinct titles, including in course-level scopes', () => {
    const labTitle = 'Mineral identification lab report';
    const mentions = `Draft ${labTitle} early. Refine ${labTitle} with feedback. Submit ${labTitle} before class ends.`;
    const geoBlueprint = {
      lessons: [{ lessonNumber: 7, title: 'Lesson 7: Minerals', studentArtifact: labTitle }],
      assessments: [{ title: labTitle, artifact: labTitle, lessonNumbers: [7] }],
    };
    const data = {
      lessonPlans: [{ lessonNumber: 7, overview: mentions }],
      syllabusNote: mentions,
    };
    finalizeCompiledDeliverableLanguage('lessonPlans', data, geoBlueprint);

    expect(data.lessonPlans[0].overview).toContain('the Week 7 lab work');
    // Unique title: a lesson-less scope falls back to the artifact's own lesson.
    expect(data.syllabusNote).toContain('the Week 7 lab work');
    expect(JSON.stringify(data)).not.toContain('Week 2');
  });
});

describe('1.10 (finalizer part) — projectName internal vocabulary is replaced everywhere', () => {
  it('leaves zero "Lab Evidence Thread" mentions (keep: 0)', () => {
    const blueprint = {
      lessons: [
        {
          lessonNumber: 1,
          title: 'Lesson 1: Variables and Types',
          studentArtifact: 'Weekly reflection memo on variables',
          throughlineCase: { projectName: 'Python Foundations Lab Evidence Thread', evidencePacket: '' },
        },
      ],
    };
    const data = {
      syllabus: {
        overview:
          'Add one item to the Python Foundations Lab Evidence Thread after each lab. ' +
          'The Python Foundations Lab Evidence Thread is reviewed at midterm. ' +
          'Bring the Python Foundations Lab Evidence Thread to office hours.',
      },
    };
    finalizeCompiledDeliverableLanguage('syllabus', data, blueprint);

    expect(JSON.stringify(data)).not.toContain('Lab Evidence Thread');
    expect(data.syllabus.overview).toContain('lesson materials');
  });
});

describe('1.8 — evaluateDesign reports computed alignment, never asserted praise', () => {
  const OLD_TEMPLATE_SIGNATURES = [
    'chain is intact',
    'is the evidence for the stated objectives',
    'Alignment check:',
    'practice precedes evidence',
  ];

  const mapFor = (sections) => ({
    courseName: 'Intro CS',
    lessons: sections.map((section, index) => ({
      title: `Lesson ${index + 1}: Topic ${index + 1}`,
      sections: [section],
    })),
  });

  it('names an objective that no assessment reflects', () => {
    const derived = deriveCompilerOwnedColumns(
      mapFor([
        {
          topicSection: '3.1: While Loops',
          learningGoals: 'Master control flow',
          learningObjectives: '1. Trace while loop execution\n2. Create a counter function',
          weeklyAssessments: '1. Autograded check: counter function creation',
          asyncActivities: '1. Read: textbook pages on counters',
          syncActivities: '1. Lab: build counter functions together',
        },
      ]),
    );
    const cell = derived.lessons[0].sections[0].evaluateDesign;
    expect(cell).toContain("Objective 'Trace while loop execution' has no matching assessment");
  });

  it('emits the measured sentence on a clean section and never the old templates', () => {
    const derived = deriveCompilerOwnedColumns(
      mapFor([
        {
          topicSection: '4.1: Dictionaries',
          learningGoals: 'Use key-value stores',
          learningObjectives: '1. Create a dictionary of records\n2. Retrieve values by key',
          weeklyAssessments: '1. Quiz: create and retrieve dictionary entries',
          asyncActivities: '1. Read: dictionary basics',
          syncActivities: '1. Lab: create dictionaries and retrieve values by key',
        },
        {
          topicSection: '5.1: Files',
          learningGoals: 'Persist data',
          learningObjectives: '1. Write records to a file\n2. Parse file contents into lists',
          weeklyAssessments: '1. Lab checkpoint: write and parse a records file',
          asyncActivities: '1. Read: file handling chapter',
          syncActivities: '1. Workshop: write and parse files in pairs',
        },
      ]),
    );
    const cells = derived.lessons.map((lesson) => lesson.sections[0].evaluateDesign);
    expect(cells[0]).toBe(
      'Each objective verb (create, retrieve) is exercised by an activity and measured by an assessment.',
    );
    for (const cell of cells) {
      for (const signature of OLD_TEMPLATE_SIGNATURES) {
        expect(cell).not.toContain(signature);
      }
    }
  });

  it('reports a missing assessment column instead of praising it', () => {
    const derived = deriveCompilerOwnedColumns(
      mapFor([
        {
          topicSection: '1.1: Orientation',
          learningGoals: 'Get oriented',
          learningObjectives: '1. Describe the course workflow',
          weeklyAssessments: '',
          asyncActivities: '1. Read: the syllabus',
          syncActivities: '',
        },
      ]),
    );
    const cell = derived.lessons[0].sections[0].evaluateDesign;
    expect(cell).toContain('No assessment is listed for this section');
  });
});

describe('1.14 — objectives round-trip with goal labels intact and honest repair logs', () => {
  it('render adds no bare numbering and keeps model-authored goal prefixes', () => {
    expect(expandLeanSectionField('learningObjectives', ['Analyze X', 'Compare Y'])).toBe('Analyze X\nCompare Y');
    expect(expandLeanSectionField('learningObjectives', ['1a. Analyze policy impact', '2b. Evaluate strategies'])).toBe(
      '1a. Analyze policy impact\n2b. Evaluate strategies',
    );
  });

  it('survives render → repair with prefixes intact, and the repair log separates formatting from fills', () => {
    const leanMap = {
      courseName: 'Policy Lab',
      lessons: [
        {
          title: 'Lesson 1: Foundations',
          sections: [
            {
              topicSection: '1.1: Foundations',
              learningObjectives: ['1a. Analyze policy impact', '2b. Evaluate strategies'],
              weeklyAssessments: ['Memo: policy analysis'],
              asyncActivities: ['Read: chapter 1'],
            },
          ],
        },
        {
          title: 'Lesson 2: Methods',
          sections: [
            {
              topicSection: '2.1: Methods',
              learningObjectives: '',
              weeklyAssessments: ['Quiz: methods'],
              asyncActivities: ['Read: chapter 2'],
            },
          ],
        },
      ],
    };
    const expanded = expandLeanCourseMap(leanMap);
    expect(expanded.lessons[0].sections[0].learningObjectives).toBe(
      '1a. Analyze policy impact\n2b. Evaluate strategies',
    );

    const repair = repairCourseMapReadiness({
      courseMap: expanded,
      columns: [{ key: 'learningObjectives', label: 'Learning Objectives', enabled: true }],
    });
    // Goal labels intact; deterministic terminal punctuation still applied.
    expect(repair.courseMap.lessons[0].sections[0].learningObjectives).toBe(
      '1a. Analyze policy impact.\n2b. Evaluate strategies.',
    );
    // The normalize branch is labeled (formatting); the genuine template
    // fill keeps the loud unsuffixed label.
    expect(repair.repairedFields).toContain('Lesson 1, Section 1 Learning Objectives (formatting)');
    expect(repair.repairedFields).toContain('Lesson 2, Section 1 Learning Objectives');
    expect(repair.repairedFields).not.toContain('Lesson 2, Section 1 Learning Objectives (formatting)');

    // deriveFromCourseMap still receives the goal labels it maps outcomes
    // back to goals with (compatibility check — file untouched).
    const graph = deriveCourseGraphFromCourseMap(repair.courseMap);
    const lessonOneLabels = graph.outcomes
      .filter((outcome) => outcome.sessionRef === graph.sessions[0].id)
      .map((outcome) => outcome.label);
    expect(lessonOneLabels).toEqual(['1a', '2b']);
  });

  it('logs zero objective repairs for an already-canonical cell', () => {
    const canonical = {
      courseName: 'Policy Lab',
      lessons: [
        {
          title: 'Lesson 1: Foundations',
          sections: [
            {
              topicSection: '1.1: Foundations',
              learningObjectives: '1a. Analyze policy impact.\n2b. Evaluate strategies.',
            },
          ],
        },
      ],
    };
    const repair = repairCourseMapReadiness({
      courseMap: canonical,
      columns: [{ key: 'learningObjectives', label: 'Learning Objectives', enabled: true }],
    });
    expect(repair.repairedFields).toEqual([]);
  });
});

describe('1.15 — JSON corruption never reaches a course-map cell', () => {
  it('recovers bare wire keys spliced into a lean objective array', () => {
    const capturedProductionShape = {
      courseName: 'Research Methods in the Social Sciences',
      lessons: [
        {
          title: 'Lesson 2: Sampling and Survey Design',
          sections: [
            {
              topicSection: '2.1: Sampling and Survey Design',
              learningObjectives: [
                'Apply sampling techniques',
                'Design survey',
                'weeklyAssessments',
                ':',
                'Quiz: apply sampling techniques,Task: design survey,asyncActivities,:,Practice: apply sampling techniques,Draft: design survey,syncActivities,:,Workshop: design survey,Peer review: apply sampling techniques,supportingResources,:,Research Methods in the Social Sciences',
              ],
            },
          ],
        },
      ],
    };

    const section = expandLeanCourseMap(capturedProductionShape).lessons[0].sections[0];
    expect(section.learningObjectives).toBe('Apply sampling techniques\nDesign survey');
    expect(section.weeklyAssessments).toBe('1. Quiz: apply sampling techniques\n2. Task: design survey');
    expect(section.asyncActivities).toBe('1. Practice: apply sampling techniques\n2. Draft: design survey');
    expect(section.syncActivities).toBe('1. Workshop: design survey\n2. Peer review: apply sampling techniques');
    expect(section.supportingResources).toBe('1. Research Methods in the Social Sciences');
    expect(JSON.stringify(section)).not.toMatch(/weeklyAssessments,:,|asyncActivities,:,/);
  });

  it('rejects a lean section value carrying spliced JSON and repairs it from the clean template', () => {
    const corruptLean = {
      courseName: 'Elementary Mandarin Chinese I',
      lessons: [
        {
          title: 'Lesson 1: Review',
          sections: [
            {
              topicSection: 'Greetings review',
              learningObjectives: [
                'Recognize the four tones',
                'topicSection": "Numbers", "learningObjectives": ["Count to ten',
              ],
              weeklyAssessments: ['Oral check: tone pairs'],
            },
          ],
        },
      ],
    };
    const expanded = expandLeanCourseMap(corruptLean);
    // The corrupted value never reaches the cell — rejected wholesale.
    expect(expanded.lessons[0].sections[0].learningObjectives).toBe('');

    const repaired = repairCourseMapReadiness({ courseMap: expanded, columns: OBJECTIVE_COLUMNS });
    const cell = repaired.courseMap.lessons[0].sections[0].learningObjectives;
    expect(cell.length).toBeGreaterThan(5);
    expect(cell).not.toMatch(/"\s*:\s*["[]/);
    expect(
      repaired.repairedFields.some((label) => label.includes('Learning Objectives') && !label.includes('(formatting)')),
    ).toBe(true);
  });

  it('asserts on already-spliced string cells in repairCourseMapReadiness and logs a corruption repair', () => {
    const corruptMap = {
      courseName: 'Elementary Mandarin Chinese I',
      lessons: [
        {
          title: 'Lesson 1: Numbers',
          sections: [
            {
              topicSection: 'Numbers',
              learningObjectives: 'Recognize tones, topicSection": "Numbers", "learningObjectives": [',
            },
          ],
        },
      ],
    };
    const result = repairCourseMapReadiness({ courseMap: corruptMap, columns: OBJECTIVE_COLUMNS });
    const after = result.courseMap.lessons[0].sections[0].learningObjectives;
    expect(after).not.toMatch(/topicSection"/);
    expect(after).not.toMatch(/(?:^|[^\\])"\s*:\s*["[]/);
    expect(result.repairedFields).toContain('Lesson 1, Section 1 Learning Objectives (corruption)');
  });
});

describe('1.16 — prompt artifact labels never become course-map concepts', () => {
  it('repairs deliverable-request nouns back to the lesson topic before compilation', () => {
    const contaminatedMap = {
      courseName: 'Introduction to Environmental Science: Climate, Ecology, and Sustainability',
      lessons: [
        {
          title: 'Lesson 1: Ecosystems',
          sections: [
            {
              topicSection: '1.1: ecosystems',
              learningGoals: 'Use 1.1: ecosystems to explain ecosystem boundaries.',
              learningObjectives: 'Explain ecosystem components and interactions.',
              weeklyAssessments: 'Quick evidence check: apply 1.1: ecosystems to a new example.',
              supportingResources: [
                'evidence-rich lesson plans',
                'slide decks',
                'assignment briefs',
                'rubrics',
                'discussion prompts',
                'quizzes',
                'study guides',
                'course FAQ',
              ].join('\n'),
            },
            {
              topicSection: '1.2: evidence-rich lesson plans',
              learningGoals:
                'Trace how 1.2: evidence-rich lesson plans changes what students can observe, label, calculate, or decide.',
              learningObjectives:
                'Explain the key ideas in 1.2: evidence-rich lesson plans and apply them in course activities.',
              weeklyAssessments: 'Quick evidence check: apply 1.2: evidence-rich lesson plans to a new example.',
              supportingResources:
                'Instructor-approved readings, examples, or lab materials for 1.2: evidence-rich lesson plans.',
            },
            {
              topicSection: '1.3: slide decks',
              learningGoals: 'Develop an evidence-backed account of 1.3: slide decks for course applications.',
              learningObjectives: 'Explain the key ideas in 1.3: slide decks and apply them in course activities.',
              weeklyAssessments: 'Quick evidence check: apply 1.3: slide decks to a new example.',
              supportingResources: 'Instructor-approved readings, examples, or lab materials for 1.3: slide decks.',
            },
            {
              topicSection: '1.4: ecological succession',
              learningGoals: 'Use ecological succession to explain ecosystem recovery.',
              learningObjectives: 'Explain ecological succession and apply it to course evidence.',
              weeklyAssessments: 'Quick evidence check: apply ecological succession to a new example.',
              supportingResources: 'slide decks',
            },
          ],
        },
      ],
    };

    const result = repairCourseMapReadiness({ courseMap: contaminatedMap });
    const repairedText = JSON.stringify(result.courseMap);

    expect(result.repairedFields).toEqual(
      expect.arrayContaining([
        'Lesson 1, Section 1 Supporting Resources (prompt artifact)',
        'Lesson 1, Section 2 Topic Section (prompt artifact)',
        'Lesson 1, Section 2 Learning Goals (prompt artifact)',
        'Lesson 1, Section 3 Topic Section (prompt artifact)',
        'Lesson 1, Section 4 Supporting Resources (prompt artifact)',
      ]),
    );
    expect(result.courseMap.lessons[0].sections[1].topicSection).toBe('ecosystems');
    expect(result.courseMap.lessons[0].sections[2].topicSection).toBe('ecosystems');
    expect(result.courseMap.lessons[0].sections[3].supportingResources).toMatch(/ecological succession/i);
    expect(result.courseMap.lessons[0].sections[3].supportingResources).not.toBe('slide decks');
    expect(repairedText).not.toMatch(/\b\d+\.\d+:\s*(?:evidence-rich lesson plans|slide decks)\b/i);
    expect(repairedText).not.toContain('course FAQ\\nworked examples');
  });

  it('repairs sentence-shaped Project Management artifact labels before Course FAQ and Study Guide compilation', () => {
    const contaminatedMap = {
      courseName: 'Project Management',
      lessons: [
        {
          title: 'Lesson 1: Project charter',
          sections: [
            {
              topicSection: '1.1: course map',
              learningGoals: 'Trace how course map changes what students can observe or decide.',
              learningObjectives: 'Describe how lesson plans organize project management content.',
              weeklyAssessments:
                'Exit ticket using Describe how lesson plans organize project management content to justify one course-relevant decision.',
              asyncActivities: 'Review assigned materials and prepare notes on syllabus.',
              syncActivities:
                'Focus on Project Management, the relationship between slide decks, lesson objectives, then connect those ideas to practice.',
              supportingResources: 'quiz and exam bank',
              evaluateDesign: 'Check that lesson objectives and slide decks align to the assessment.',
            },
            {
              topicSection: '1.2: project charter',
              learningGoals: 'Use project charter evidence to reason about stakeholder decisions.',
              learningObjectives: 'Explain project charter purpose and apply it in a course activity.',
              weeklyAssessments: 'Project charter evidence check.',
              asyncActivities: 'Read project charter guidance and annotate one example.',
              syncActivities: 'Discuss examples and practice applying charter purpose.',
              supportingResources:
                'Wikipedia contributors. Project charter. Wikipedia: https://en.wikipedia.org/wiki/Project_charter',
              evaluateDesign: 'Check project charter decisions against source evidence.',
            },
          ],
        },
      ],
    };

    const repairedResult = repairCourseMapReadiness({ courseMap: contaminatedMap });
    const repairedText = JSON.stringify(repairedResult.courseMap);

    expect(repairedResult.repairedFields).toEqual(
      expect.arrayContaining([
        'Lesson 1, Section 1 Topic Section (prompt artifact)',
        'Lesson 1, Section 1 Learning Goals (prompt artifact)',
        'Lesson 1, Section 1 Learning Objectives (prompt artifact)',
        'Lesson 1, Section 1 Weekly Assessments (prompt artifact)',
        'Lesson 1, Section 1 Async Activities (prompt artifact)',
        'Lesson 1, Section 1 Sync Activities (prompt artifact)',
        'Lesson 1, Section 1 Supporting Resources (prompt artifact)',
        'Lesson 1, Section 1 Evaluate Design (prompt artifact)',
      ]),
    );
    expect(repairedText).toMatch(/project charter/i);
    expect(repairedText).not.toMatch(
      /\b(?:course map|syllabus|lesson plans|lesson objectives|slide decks|quiz and exam bank)\b/i,
    );

    const blueprint = buildCourseBlueprint(repairedResult.courseMap);
    const compiled = compileBlueprintDeliverables(blueprint, ['courseFaq', 'studyGuides'], {
      configMap: { courseFaq: { questionsPerLesson: 5 } },
    });
    const faqText = compiled.courseFaq.faqs
      .flatMap((faq) => faq.qs || [])
      .map((item) => `${item.q || ''} ${item.an || ''} ${(item.rc || []).join(' ')}`)
      .join(' ');
    const guideText = [
      compiled.studyGuides.studyGuides[0].examScope,
      compiled.studyGuides.studyGuides[0].summary,
      ...(compiled.studyGuides.studyGuides[0].keyTerms || []).map((term) =>
        [term.term, term.definition, term.example].join(' '),
      ),
      ...(compiled.studyGuides.studyGuides[0].reviewQuestions || []).map((item) =>
        [item.question, item.hint].join(' '),
      ),
      ...(compiled.studyGuides.studyGuides[0].practiceActivities || []),
      compiled.studyGuides.studyGuides[0].examPrep?.reviewStrategy,
    ].join(' ');
    const studentFacingText = `${faqText} ${guideText}`;

    expect(studentFacingText).not.toMatch(
      /\b(?:course map|syllabus|lesson plans|lesson objectives|slide decks|quiz and exam bank)\b/i,
    );
    expect(studentFacingText).toMatch(/project charter|Project Management source evidence|source evidence/i);
  });

  it('does not use sentence-shaped fallback prose as the topic for repaired Project Management cells', () => {
    const courseMap = {
      courseName: 'Project Management',
      lessons: [
        {
          title: 'Lesson 1: Project charter',
          sections: [
            {
              topicSection: 'course map',
              learningGoals: 'Develop an evidence-backed account of Project Management for course applications.',
              learningObjectives: 'lesson plans',
              weeklyAssessments: '',
            },
          ],
        },
      ],
    };

    const repaired = repairCourseMapReadiness({ courseMap }).courseMap;
    const repairedText = JSON.stringify(repaired);

    expect(repaired.lessons[0].sections[0].topicSection).toBe('Project charter');
    expect(repaired.lessons[0].sections[0].weeklyAssessments).toContain('Project charter');
    expect(repairedText).not.toContain('course applications..');
    expect(repairedText).not.toMatch(/needed for Develop an evidence-backed account/i);
  });

  it('repairs the audited one-word Focus label from the literature lesson identity before compilation', () => {
    const courseMap = {
      courseName: 'World Literature',
      lessons: [
        {
          title: 'Lesson 1: Tang Poetry using Li Bai and Du Fu',
          compilerDerived: ['evaluateDesign', 'presentationFormat', 'technologyNeeded'],
          sections: [
            {
              topicSection: '1.1: Focus',
              learningGoals: 'Analyze poetic styles',
              learningObjectives: 'Compare Li Bai and Du Fu.\nSynthesize poetic analysis.',
              weeklyAssessments: '',
              asyncActivities: 'Practice: compare Li Bai and Du Fu\nDraft: synthesize poetic analysis',
              syncActivities: 'Workshop: compare Li Bai and Du Fu',
              supportingResources: 'Selected poems by Li Bai and Du Fu',
              evaluateDesign:
                'Each objective verb (memorize) is exercised by an activity and measured by an assessment.',
            },
          ],
        },
      ],
    };

    const repair = repairCourseMapReadiness({ courseMap });
    const section = repair.courseMap.lessons[0].sections[0];

    expect(repair.changed).toBe(true);
    expect(section.topicSection).toBe('Tang Poetry using Li Bai and Du Fu');
    expect(section.weeklyAssessments).toContain('Tang Poetry using Li Bai and Du Fu');
    expect(section.weeklyAssessments).toMatch(/textual|passage|interpret|reading|evidence/i);
    expect(section.weeklyAssessments).toMatch(/comparative|compare/i);
    expect(section.weeklyAssessments).toMatch(/synthesize/i);
    expect(section.evaluateDesign).not.toBe(
      'Each objective verb (memorize) is exercised by an activity and measured by an assessment.',
    );
    expect(section.evaluateDesign).toBe(
      'Each objective verb (compare, synthesize) is exercised by an activity and measured by an assessment.',
    );
    expect(JSON.stringify(repair.courseMap)).not.toMatch(/\bFocus(?: group| on the Family)?\b/i);
  });

  it('repairs native skeleton Session N labels before Project Management export', () => {
    const courseMap = {
      courseName: 'Project Management',
      lessons: [
        {
          title: 'Lesson 1: Session 1',
          sections: [
            {
              topicSection: '1.1: Session 1',
              learningGoals: 'Use Session 1 to explain a course problem and prepare evidence for the next assessment.',
              learningObjectives: 'Explain the key ideas in Session 1 and apply them in course activities.',
              weeklyAssessments: 'Quick evidence check: apply Session 1 to a new example.',
            },
          ],
        },
        {
          title: 'Lesson 2: Session 2',
          sections: [
            {
              topicSection: '2.1: Session 2',
              learningGoals: 'Use Session 2 to explain a course problem and prepare evidence for the next assessment.',
              learningObjectives: 'Explain the key ideas in Session 2 and apply them in course activities.',
              weeklyAssessments: 'project charter',
            },
          ],
        },
        {
          title: 'Lesson 3: Session 3',
          sections: [
            {
              topicSection: '3.1: Session 3',
              learningGoals: 'Trace how Session 3 changes what students can observe, label, calculate, or decide.',
              learningObjectives: 'Apply the main concepts from Session 3 to a course task or example.',
              weeklyAssessments: 'scheduling lab',
            },
          ],
        },
      ],
    };

    const repaired = repairCourseMapReadiness({ courseMap }).courseMap;
    const repairedText = JSON.stringify(repaired);

    expect(repaired.lessons[0].title).toBe('Lesson 1: project life cycle and charter purpose');
    expect(repaired.lessons[0].sections[0].topicSection).toBe('project life cycle and charter purpose');
    expect(repaired.lessons[1].title).toBe('Lesson 2: project charter');
    expect(repaired.lessons[1].sections[0].topicSection).toBe('project charter');
    expect(repaired.lessons[2].title).toBe('Lesson 3: scheduling lab');
    expect(repaired.lessons[2].sections[0].topicSection).toBe('scheduling lab');
    expect(repairedText).not.toMatch(/\bSession\s+\d+\b/i);
  });

  it('repairs repeated Python assessment scaffolds before course graph export', () => {
    const topics = [
      ['variables and data types', 'Quick evidence check: apply variables and data types to a new example.'],
      ['conditionals', 'Exit ticket using conditionals to justify one course-relevant decision.'],
      ['loops', 'Practice response that names loops, checklist, and prepared response.'],
      ['functions', 'Quick evidence check: apply functions to a new example.'],
      ['lists', 'Exit ticket using lists to justify one course-relevant decision.'],
      ['dictionaries', 'Quick evidence check: apply dictionaries to a new example.'],
    ];
    const courseMap = {
      courseName: 'Introduction to Computer Science with Python',
      lessons: topics.map(([topic, weeklyAssessments], index) => ({
        title: `Lesson ${index + 1}: ${topic}`,
        sections: [
          {
            topicSection: `${index + 1}.1: ${topic}`,
            learningGoals: `Use ${topic} to explain Python program behavior.`,
            learningObjectives: `Write or revise short Python code that uses ${topic}.`,
            weeklyAssessments,
            asyncActivities: `Trace a short Python example for ${topic}.`,
            syncActivities: `Debug a short ${topic} example in pairs.`,
            supportingResources: `${topic} starter code and test notes.`,
            evaluateDesign: `Check that ${topic} practice asks for code evidence.`,
          },
        ],
      })),
    };

    const repair = repairCourseMapReadiness({ courseMap });
    const repairedAssessments = repair.courseMap.lessons
      .flatMap((lesson) => lesson.sections)
      .map((section) => section.weeklyAssessments)
      .join(' ');

    expect(repair.changed).toBe(true);
    expect(repair.repairedFields).toEqual(
      expect.arrayContaining(
        topics.map((_, index) => `Lesson ${index + 1}, Section 1 Weekly Assessments (assessment scaffold)`),
      ),
    );
    expect(repairedAssessments).toMatch(/trace memo/i);
    expect(repairedAssessments).toMatch(/mini-program/i);
    expect(repairedAssessments).toMatch(/bug-fix note/i);
    expect(repairedAssessments).toMatch(/partner review/i);
    expect(repairedAssessments).toMatch(/transfer task/i);
    expect(repairedAssessments).not.toMatch(
      /\b(?:quick evidence check|exit ticket using|apply\b[^.?!\n]{0,120}\bto a new example|prepared response|course-relevant decision)\b/i,
    );
    expect(repairedAssessments).not.toMatch(/\bpredict output and explain the state change\b/i);

    const graph = deriveCourseGraphFromCourseMap(repair.courseMap);
    const graphAssessmentText = graph.assessments.map((assessment) => assessment.title).join(' ');
    expect(graphAssessmentText).not.toMatch(/\b(?:quick evidence check|exit ticket using|prepared response)\b/i);
  });

  it('varies sparse Python section fallback wording across a full 12-week map', () => {
    const lessons = Array.from({ length: 12 }, (_, lessonIndex) => ({
      title: `Lesson ${lessonIndex + 1}: Python topic ${lessonIndex + 1}`,
      sections: Array.from({ length: 3 }, (_, sectionIndex) => ({
        topicSection: `${lessonIndex + 1}.${sectionIndex + 1}: Python topic ${lessonIndex + 1}.${sectionIndex + 1}`,
        learningGoals: '',
        learningObjectives: '',
        weeklyAssessments: 'Quick evidence check: apply Python to a new example.',
        asyncActivities: '',
        syncActivities: '',
        supportingResources: '',
        evaluateDesign: '',
      })),
    }));
    const courseMap = {
      courseName: 'Introduction to Computer Science with Python',
      lessons,
    };

    const repair = repairCourseMapReadiness({ courseMap });
    const repairedSections = repair.courseMap.lessons.flatMap((lesson) => lesson.sections);
    const assessmentText = repairedSections.map((section) => section.weeklyAssessments).join(' ');
    const evaluateText = repairedSections.map((section) => section.evaluateDesign).join(' ');
    const uniqueAssessments = new Set(repairedSections.map((section) => section.weeklyAssessments));

    expect(repair.changed).toBe(true);
    expect(uniqueAssessments.size).toBeGreaterThanOrEqual(10);
    expect(assessmentText).not.toMatch(/\bpredict output and explain the state change\b/i);
    expect(evaluateText).not.toMatch(/\brunnable Python artifact or trace\b/i);
    expect(evaluateText).not.toMatch(/\bsame input\/output evidence used in grading\b/i);
  }, 15000);

  it('varies sparse UX technology and presentation fallback wording across a full map', () => {
    const lessons = Array.from({ length: 12 }, (_, lessonIndex) => ({
      title: `Lesson ${lessonIndex + 1}: UX topic ${lessonIndex + 1}`,
      sections: Array.from({ length: 3 }, (_, sectionIndex) => ({
        topicSection: `${lessonIndex + 1}.${sectionIndex + 1}: UX topic ${lessonIndex + 1}.${sectionIndex + 1}`,
        learningGoals: '',
        learningObjectives: '',
        weeklyAssessments: '',
        asyncActivities: '',
        syncActivities: '',
        technologyNeeded: '',
        presentationFormat: '',
        supportingResources: '',
        evaluateDesign: '',
      })),
    }));
    const courseMap = {
      courseName: 'User Experience Design Studio',
      lessons,
    };

    const repair = repairCourseMapReadiness({ courseMap });
    const sections = repair.courseMap.lessons.flatMap((lesson) => lesson.sections);
    const technologyValues = sections.map((section) => section.technologyNeeded).filter(Boolean);
    const presentationValues = sections.map((section) => section.presentationFormat).filter(Boolean);
    const maxCount = (values) =>
      Math.max(
        ...Object.values(
          values.reduce((counts, value) => {
            counts[value] = (counts[value] || 0) + 1;
            return counts;
          }, {}),
        ),
      );

    expect(repair.changed).toBe(true);
    expect(technologyValues).toHaveLength(36);
    expect(presentationValues).toHaveLength(36);
    expect(new Set(technologyValues).size).toBeGreaterThanOrEqual(12);
    expect(new Set(presentationValues).size).toBeGreaterThanOrEqual(12);
    expect(maxCount(technologyValues)).toBeLessThanOrEqual(3);
    expect(maxCount(presentationValues)).toBeLessThanOrEqual(3);
  }, 15000);

  it('compacts objective-shaped Python assessment labels before they fan out into assignments and discussions', async () => {
    const livePhrase = 'Analyze file processing code for line-by-line input handling and explain the test output';
    const courseMap = {
      courseName: 'Introduction to Computer Science with Python',
      lessons: [
        {
          title: 'Lesson 1: File processing',
          sections: [
            {
              topicSection: '1.1: file processing',
              learningGoals: 'Use file input to inspect program behavior.',
              learningObjectives: livePhrase,
              weeklyAssessments: livePhrase,
              asyncActivities: 'Read a Python file-processing example and predict the output.',
              syncActivities: 'Debug a file-reading snippet in pairs.',
              supportingResources: 'Python file processing notes and starter code.',
              evaluateDesign: 'Check that students submit code, output, and a short explanation.',
            },
          ],
        },
      ],
    };

    const blueprint = buildCourseBlueprint(courseMap);
    expect(blueprint.lessons[0].studentArtifact).toBe('File-processing code trace');

    const compiled = compileBlueprintDeliverables(blueprint, ['assignments', 'discussions']);
    expect(compiled.assignments.assignments[0].title).toBe('File-processing code trace');
    expect(compiled.discussions.discussions[0].prompt.toLowerCase()).not.toContain(
      'analyze file processing code for line-by-line',
    );

    const verification = await verifyPackageExports({
      courseMap,
      deliverables: {
        assignments: { status: 'done', data: compiled.assignments },
        discussions: { status: 'done', data: compiled.discussions },
      },
      selectedFeatures: ['assignments', 'discussions'],
    });
    expect(verification.checks.filter((check) => /Rendered text repeats/i.test(check.message))).toEqual([]);
  }, 15000);

  it('diagnoses repeated Python shingles without rewriting semantic prose', () => {
    const repeated = 'Analyze file processing code for line by line';
    const data = {
      assignments: [
        {
          title: 'File processing lab',
          overview: Array.from(
            { length: 12 },
            () => `Students ${repeated} input handling and submit output evidence.`,
          ).join(' '),
          instructions: Array.from({ length: 4 }, () => `Use ${repeated} evidence in the explanation.`),
        },
      ],
    };

    const result = repairDeliverableContentQuality('assignments', data);
    const text = JSON.stringify(result.data).toLowerCase();
    const remaining = (text.match(/analyze file processing code for line by line/g) || []).length;

    expect(result.changed).toBe(false);
    expect(result.data).toBe(data);
    expect(result.repeatedPhrase).toBe(repeated.toLowerCase());
    expect(result.repairedPhrases).toBe(0);
    expect(result.repeatedPhraseCount).toBeGreaterThanOrEqual(12);
    expect(remaining).toBe(16);
    expect(text).not.toMatch(/file-processing code trace|debugging checkpoint|program-output check/);
  });

  it('repairs assessment-label course-title identities before they seed filenames and source concepts', () => {
    const assessmentLabels = [
      'Evidence check',
      'Applied problem',
      'Practice brief',
      'Concept transfer',
      'Evidence check',
      'Applied problem',
      'Practice brief',
      'Concept transfer',
      'Evidence check',
      'Applied problem',
      'Practice brief',
      'Concept transfer',
      'Evidence check',
      'Applied problem',
      'Practice brief',
    ];
    const courseMap = {
      courseName: 'Introduction to Computer Science with Python',
      lessons: assessmentLabels.map((label, index) => {
        const weakIdentity = `${label}: Introduction to Computer Science with Python (7%)`;
        return {
          title: `Lesson ${index + 1}: ${weakIdentity}`,
          sections: [
            {
              topicSection: `${index + 1}.1: ${weakIdentity}`,
              learningGoals: `Use ${weakIdentity} to explain Python program behavior.`,
              learningObjectives: `Explain the key ideas in ${weakIdentity} and apply them in course activities.`,
              weeklyAssessments: `${weakIdentity} code trace: predict output and explain the state change.`,
              asyncActivities: `Review assigned materials and prepare notes on ${weakIdentity}.`,
              syncActivities: `Discuss examples and practice applying ${weakIdentity}.`,
              supportingResources: `${weakIdentity} starter code and test notes.`,
              evaluateDesign: `Check that the ${weakIdentity} activity, resource, and assessment use code evidence.`,
            },
          ],
        };
      }),
    };

    const repair = repairCourseMapReadiness({ courseMap });
    const repairedText = JSON.stringify(repair.courseMap);

    expect(repair.changed).toBe(true);
    expect(repair.courseMap.lessons[0].title).toBe('Lesson 1: course orientation and computational thinking');
    expect(repair.courseMap.lessons[1].title).toBe('Lesson 2: variables, expressions, and data types');
    expect(repair.courseMap.lessons[0].sections[0].topicSection).toBe('course orientation and computational thinking');
    expect(repair.courseMap.lessons[1].sections[0].topicSection).toBe('variables, expressions, and data types');
    expect(repairedText).not.toMatch(
      /\b(?:evidence check|applied problem|practice brief|concept transfer):\s*Introduction to Computer Science with Python\s*\(\s*7%\s*\)/i,
    );

    const graph = deriveCourseGraphFromCourseMap(repair.courseMap);
    const graphIdentityText = [
      ...graph.sessions.map((session) => session.title),
      ...graph.concepts.map((concept) => concept.term),
      ...graph.assessments.map((assessment) => assessment.title),
    ].join(' ');

    expect(graphIdentityText).toMatch(/course orientation and computational thinking/i);
    expect(graphIdentityText).toMatch(/variables, expressions, and data types/i);
    expect(graphIdentityText).not.toMatch(
      /\b(?:evidence check|applied problem|practice brief|concept transfer):\s*Introduction to Computer Science with Python\s*\(\s*7%\s*\)/i,
    );
    expect(graphIdentityText).not.toMatch(/\(\s*7%\s*\)/);
  });

  it('repairs conjoined Quiz Week and Assignment Week labels before they replace Python topics', () => {
    const courseMap = {
      courseName: 'Introduction to Computer Science with Python',
      lessons: Array.from({ length: 12 }, (_, index) => {
        const lessonNumber = index + 1;
        const weakIdentity = `Quiz: Week ${lessonNumber},Assignment: Week ${lessonNumber}`;
        return {
          title: `Lesson ${lessonNumber}: ${weakIdentity}`,
          sections: [
            {
              topicSection: `${lessonNumber}.1: ${weakIdentity}`,
              learningGoals: `Use ${weakIdentity} to read, predict, and explain a small Python program.`,
              learningObjectives: `Trace Python code using ${weakIdentity} and explain the output before running it.`,
              weeklyAssessments: `${weakIdentity} trace memo: predict two lines, run the code, and annotate the changed variable.`,
              asyncActivities: `Trace a short Python example for ${weakIdentity} and note the inputs, variables, and output.`,
              syncActivities: `Live-code a ${weakIdentity} example, then have students predict the next program state.`,
              supportingResources: `${weakIdentity} starter code, worked example, and test-case checklist.`,
              evaluateDesign: `Verify the ${weakIdentity} section ties the sample, lab checkpoint, and grading evidence to one observable behavior.`,
            },
          ],
        };
      }),
    };

    const repair = repairCourseMapReadiness({ courseMap });
    const repairedText = JSON.stringify(repair.courseMap);

    expect(repair.changed).toBe(true);
    expect(repair.repairedFields).toEqual(
      expect.arrayContaining([
        'Lesson 1 title',
        'Lesson 1, Section 1 Topic Section (assessment identity)',
        'Lesson 1, Section 1 Learning Goals (assessment identity)',
        'Lesson 1, Section 1 Learning Objectives (assessment identity)',
        'Lesson 1, Section 1 Weekly Assessments (assessment identity)',
      ]),
    );
    expect(repair.courseMap.lessons[0].title).toBe('Lesson 1: course orientation and computational thinking');
    expect(repair.courseMap.lessons[1].title).toBe('Lesson 2: variables, expressions, and data types');
    expect(repair.courseMap.lessons[0].sections[0].topicSection).toBe('course orientation and computational thinking');
    expect(repair.courseMap.lessons[1].sections[0].topicSection).toBe('variables, expressions, and data types');
    expect(repairedText).not.toMatch(/\b(?:Quiz|Assignment)\s*:\s*Week\s+\d{1,2}\b/i);

    const graph = deriveCourseGraphFromCourseMap(repair.courseMap);
    const graphIdentityText = [
      ...graph.sessions.map((session) => session.title),
      ...graph.concepts.map((concept) => concept.term),
      ...graph.assessments.map((assessment) => assessment.title),
    ].join(' ');

    expect(graphIdentityText).toMatch(/course orientation and computational thinking/i);
    expect(graphIdentityText).toMatch(/variables, expressions, and data types/i);
    expect(graphIdentityText).not.toMatch(/\b(?:Quiz|Assignment)\s*:\s*Week\s+\d{1,2}\b/i);
  });

  it('keeps repaired single artifact-resource labels out of compiled Course FAQ answers', () => {
    const courseMap = {
      courseName: 'Genetics and Society',
      lessons: [
        {
          title: 'Lesson 1: DNA and inheritance basics',
          sections: [
            {
              topicSection: '1.1: DNA',
              learningGoals: 'Use DNA to explain a course problem and prepare evidence for the next assessment.',
              learningObjectives: 'Explain the key ideas in DNA and apply them in course activities.',
              weeklyAssessments: 'Lesson 1 evidence check: DNA and inheritance basics (25%)',
              asyncActivities: 'Review assigned materials and prepare notes on DNA.',
              syncActivities: 'Discuss examples and practice applying DNA.',
              supportingResources: 'slide decks',
              evaluateDesign: 'Check that the DNA activity, resource, and assessment ask students to produce evidence.',
            },
          ],
        },
      ],
    };

    const repaired = repairCourseMapReadiness({ courseMap }).courseMap;
    const blueprint = buildCourseBlueprint(repaired);
    const compiled = compileBlueprintDeliverables(blueprint, ['courseFaq'], {
      configMap: { courseFaq: { questionsPerLesson: 5 } },
    });
    const faqText = compiled.courseFaq.faqs
      .flatMap((faq) => faq.qs || [])
      .map((item) => `${item.q || ''} ${item.an || ''}`)
      .join(' ');

    expect(repaired.lessons[0].sections[0].supportingResources).not.toBe('slide decks');
    expect(faqText).not.toMatch(/Strong work uses slide decks/i);
    expect(faqText).not.toMatch(/\bslide decks\b/i);
  });

  it('replaces a pasted build brief in supporting resources with a concise lesson resource', () => {
    const pastedBrief =
      'Elementary Mandarin — one lesson: Pinyin and Tones for adult beginners. Use only these instructor-provided facts: Pinyin writes Mandarin pronunciation with Latin letters. A syllable may contain an initial followed by a final. Mandarin has four main tones. Learners must identify tone contours, distinguish an initial from a complete syllable, and choose the tone-marked syllable that matches a stated meaning. Build a 50-minute lesson with guided listening, production practice, and a source-grounded evidence check.';
    const courseMap = {
      courseName: 'Elementary Mandarin',
      lessons: [
        {
          title: 'Lesson 1: Pinyin and Tones',
          sections: [
            {
              topicSection: 'Pinyin and Tones',
              learningGoals: 'Distinguish Pinyin tone contours in guided listening.',
              learningObjectives: 'Identify initials, finals, and four tone contours.',
              weeklyAssessments: 'Tone-contour evidence check.',
              asyncActivities: 'Listen to the supplied tone examples.',
              syncActivities: 'Compare and produce tone contours in pairs.',
              supportingResources: pastedBrief,
            },
          ],
        },
      ],
    };

    const repaired = repairCourseMapReadiness({ courseMap }).courseMap;
    const resource = repaired.lessons[0].sections[0].supportingResources;
    expect(resource).not.toBe(pastedBrief);
    expect(resource.length).toBeLessThan(180);
    expect(resource).toMatch(/Pinyin and Tones/i);
  });

  it('keeps compact numbered artifact-resource lists out of compiled Course FAQ answers', () => {
    const courseMap = {
      courseName: 'Genetics and Society',
      lessons: [
        {
          title: 'Lesson 1: DNA and inheritance basics',
          sections: [
            {
              topicSection: '1.1: DNA and inheritance basics',
              learningGoals: 'Use DNA and inheritance basics to explain inheritance evidence.',
              learningObjectives: 'Explain DNA and inheritance basics and apply them in course activities.',
              weeklyAssessments: 'Lesson 1 evidence check: DNA and inheritance basics (25%)',
              asyncActivities: 'Review assigned materials and prepare notes on DNA.',
              syncActivities: 'Discuss examples and practice applying DNA.',
              supportingResources: 'slide decks 2. quiz bank 3. study guides',
              evaluateDesign: 'Check that the DNA activity, resource, and assessment ask students to produce evidence.',
            },
          ],
        },
      ],
    };

    const repaired = repairCourseMapReadiness({ courseMap }).courseMap;
    const blueprint = buildCourseBlueprint(repaired);
    blueprint.lessons[0].throughlineCase.evidencePacket = 'slide decks 2. quiz bank 3. study guides';
    blueprint.lessons[0].evidencePlan = {
      ...(blueprint.lessons[0].evidencePlan || {}),
      sourceCue: 'slide decks 2. quiz bank 3. study guides',
    };
    blueprint.lessons[0].assessmentAnchorExamples = {
      ...(blueprint.lessons[0].assessmentAnchorExamples || {}),
      strongSample:
        'Strong Week 1 check anchor: cites a concrete detail from slide decks 2. quiz bank 3., explains how it changes the DNA decision, names one limitation, and states the revision made before submission.',
    };

    const compiled = compileBlueprintDeliverables(blueprint, ['courseFaq'], {
      configMap: { courseFaq: { questionsPerLesson: 7 } },
    });
    const faqText = compiled.courseFaq.faqs
      .flatMap((faq) => faq.qs || [])
      .map((item) => `${item.q || ''} ${item.an || ''}`)
      .join(' ');

    expect(repaired.lessons[0].sections[0].supportingResources).not.toMatch(
      /\b(?:slide decks|quiz bank|study guides)\b/i,
    );
    expect(faqText).not.toMatch(/\b(?:slide decks|quiz bank|study guides)\b/i);
    expect(faqText).toMatch(/DNA and inheritance basics source evidence|source evidence/i);
  });

  it('keeps CourseIR source-review placeholders out of compiled Course FAQ answers and related concepts', () => {
    const courseMap = {
      courseName: 'Project Management',
      lessons: [
        {
          title: 'Lesson 4: Scheduling and the critical path',
          sections: [
            {
              topicSection: '4.1: Activity sequencing',
              learningGoals: 'Use activity sequencing to reason about schedule decisions.',
              learningObjectives: 'Sequence project activities logically.',
              weeklyAssessments: 'Scenario quizzes',
              asyncActivities: 'Review the activity sequencing materials.',
              syncActivities: 'Solve network sequencing cases.',
              supportingResources: 'Existing course map fields.',
              evaluateDesign: 'Check sequencing decisions against the project schedule.',
            },
          ],
        },
      ],
    };

    const blueprint = buildCourseBlueprint(courseMap);
    blueprint.lessons[0].evidencePlan = {
      ...(blueprint.lessons[0].evidencePlan || {}),
      sourceCue: 'Existing course map fields',
    };
    blueprint.lessons[0].throughlineCase = {
      ...(blueprint.lessons[0].throughlineCase || {}),
      evidencePacket: 'Existing course map fields',
    };
    blueprint.lessons[0].assessmentAnchorExamples = {
      ...(blueprint.lessons[0].assessmentAnchorExamples || {}),
      strongSample:
        'Strong scenario quizzes anchor: grounds the claim in Existing course map fields, separates evidence from assumption, and names the feedback-informed edit.',
    };

    const compiled = compileBlueprintDeliverables(blueprint, ['courseFaq'], {
      configMap: { courseFaq: { questionsPerLesson: 5 } },
    });
    const faqText = compiled.courseFaq.faqs
      .flatMap((faq) => faq.qs || [])
      .map((item) => `${item.q || ''} ${item.an || ''} ${(item.rc || []).join(' ')}`)
      .join(' ');

    expect(faqText).not.toMatch(/Existing course map fields/i);
    expect(faqText).not.toMatch(/\banchor examples\b/i);
    expect(faqText).not.toMatch(/\brubric criteria\b/i);
    expect(faqText).toMatch(/Scheduling and the critical path source evidence|source evidence/i);
  });

  it('keeps CourseIR prerequisite labels out of compiled Course FAQ evidence cues', () => {
    const courseMap = {
      courseName: 'Project Management',
      lessons: [
        {
          title: 'Lesson 3: Scheduling',
          sections: [
            {
              topicSection: '3.1: Scheduling',
              learningGoals: 'Use scheduling evidence to reason about project timelines.',
              learningObjectives: 'Build a schedule and explain dependency decisions.',
              weeklyAssessments: 'Scheduling lab 2. scenario quizzes',
              asyncActivities: 'Review scheduling notes and dependency examples.',
              syncActivities: 'Practice scheduling cases with peer feedback.',
              supportingResources: 'Prerequisite concept: 2.1: Requirements; scheduling lab 2. scenario quizzes',
              evaluateDesign: 'Check scheduling decisions against scenario evidence.',
            },
          ],
        },
      ],
    };

    const blueprint = buildCourseBlueprint(courseMap);
    const unsafeCue = 'Prerequisite concept: 2.1: Requirements; scheduling lab 2. scenario quizzes';
    blueprint.lessons[0].evidencePlan = {
      ...(blueprint.lessons[0].evidencePlan || {}),
      sourceCue: unsafeCue,
    };
    blueprint.lessons[0].throughlineCase = {
      ...(blueprint.lessons[0].throughlineCase || {}),
      evidencePacket: unsafeCue,
    };
    blueprint.lessons[0].assessmentAnchorExamples = {
      ...(blueprint.lessons[0].assessmentAnchorExamples || {}),
      strongSample: `Strong work uses ${unsafeCue}, explains how it changes the scheduling decision, and names one limitation.`,
    };

    const compiled = compileBlueprintDeliverables(blueprint, ['courseFaq'], {
      configMap: { courseFaq: { questionsPerLesson: 5 } },
    });
    const faqText = compiled.courseFaq.faqs
      .flatMap((faq) => faq.qs || [])
      .map((item) => `${item.q || ''} ${item.an || ''} ${(item.rc || []).join(' ')}`)
      .join(' ');

    expect(faqText).not.toMatch(/Prerequisite concept/i);
    expect(faqText).not.toMatch(/Strong work uses Prerequisite/i);
    expect(faqText).toMatch(/Scheduling source evidence|source evidence/i);
  });

  it('keeps compact assessment-artifact runs out of compiled Course FAQ focus answers', () => {
    const courseMap = {
      courseName: 'Project Management',
      lessons: [
        {
          title: 'Lesson 1: Project Management',
          sections: [
            {
              topicSection: 'Project charter',
              learningGoals: 'Use project charter evidence to reason about project management decisions.',
              learningObjectives: 'Explain project charter purpose and apply it in a course activity.',
              weeklyAssessments: 'Project charter checkpoint.',
              asyncActivities: 'Read project charter guidance and annotate one example.',
              syncActivities: 'Discuss examples and practice applying charter purpose.',
              supportingResources:
                'Wikipedia contributors. Project charter. Wikipedia: https://en.wikipedia.org/wiki/Project_charter',
              evaluateDesign: 'Check project charter decisions against source evidence.',
            },
          ],
        },
      ],
    };
    const blueprint = buildCourseBlueprint(courseMap);
    blueprint.lessons[0].studentArtifact =
      'scenario quizzes 2. rubric-driven assignments 3. final capstone presentation';
    blueprint.lessons[0].evidencePlan = {
      ...(blueprint.lessons[0].evidencePlan || {}),
      sourceCue: 'Instructor-approved readings, examples, or lab materials for project charter.',
    };
    blueprint.lessons[0].throughlineCase = {
      ...(blueprint.lessons[0].throughlineCase || {}),
      projectName: 'Project Management',
      evidencePacket: 'Instructor-approved readings, examples, or lab materials for project charter.',
    };

    const compiled = compileBlueprintDeliverables(blueprint, ['courseFaq'], {
      configMap: { courseFaq: { questionsPerLesson: 5 } },
    });
    const faqText = compiled.courseFaq.faqs
      .flatMap((faq) => faq.qs || [])
      .map((item) => `${item.q || ''} ${item.an || ''} ${(item.rc || []).join(' ')}`)
      .join(' ');

    expect(faqText).not.toMatch(/scenario quizzes\s+2\./i);
    expect(faqText).not.toMatch(/rubric-driven assignments\s+3\./i);
    expect(faqText).not.toMatch(/Instructor-approved readings/i);
    expect(faqText).toMatch(/Week 1 project|Project Management assessment/i);
    expect(faqText).toMatch(/Project Management source evidence|project charter/i);
  });

  it('rewrites weekly-assessment and source-packet scaffolds before Course FAQ export', () => {
    const courseMap = {
      courseName: 'User Experience Design Studio',
      lessons: [
        {
          title: 'Lesson 10: Analyze a design issue from multiple perspectives',
          sections: [
            {
              topicSection: '10.1: Design issue analysis',
              learningGoals: 'Use critique evidence to analyze a design issue from multiple perspectives.',
              learningObjectives: 'Explain how design evidence changes a critique decision.',
              weeklyAssessments: 'Weekly assessment: Discussion prompts',
              asyncActivities: 'Review critique notes and prepare one evidence-backed response.',
              syncActivities: 'Discuss examples and practice applying critique evidence.',
              supportingResources: 'Analyze design issue from source packet',
              evaluateDesign: 'Check design decisions against inspectable user evidence.',
            },
          ],
        },
      ],
    };
    const blueprint = buildCourseBlueprint(courseMap);
    blueprint.lessons[0].studentArtifact = 'Weekly assessment: Discussion prompts';
    blueprint.lessons[0].evidencePlan = {
      ...(blueprint.lessons[0].evidencePlan || {}),
      sourceCue: 'Analyze design issue from source packet',
    };
    blueprint.lessons[0].throughlineCase = {
      ...(blueprint.lessons[0].throughlineCase || {}),
      projectName: 'Design prototype',
      evidencePacket: 'Analyze design issue from source packet',
    };
    blueprint.lessons[0].assessmentAnchorExamples = {
      strongSample:
        'Strong Weekly assessment: Quiz and exam bank anchor: uses Review core UX concepts source packet to support the core UX concepts decision.',
    };

    const compiled = compileBlueprintDeliverables(blueprint, ['courseFaq'], {
      configMap: { courseFaq: { questionsPerLesson: 5 } },
    });
    const faqText = compiled.courseFaq.faqs
      .flatMap((faq) => faq.qs || [])
      .map((item) => `${item.q || ''} ${item.an || ''} ${(item.rc || []).join(' ')}`)
      .join(' ');

    expect(faqText).toMatch(/What matters most/i);
    expect(faqText).not.toMatch(/What should I focus on/i);
    expect(faqText).not.toMatch(/Weekly assessment:/i);
    expect(faqText).not.toMatch(/\bsource packet\b/i);
    expect(faqText).not.toMatch(/Quiz and exam bank/i);
    expect(faqText).not.toMatch(/anchor contrast/i);
    // The scaffolded artifact resolves to a lesson-specific short reference
    // (head noun of the real artifact), then completion-language polish avoids
    // presenting a finished generated package as a draft.
    expect(faqText).toMatch(/the Week 1 work/i);
    expect(faqText).not.toMatch(/Week\s+\d+\s+artifact/i);
    expect(faqText).toMatch(/source evidence/i);
  });

  it('keeps prompt artifact labels out of compiled Study Guides and shared lesson metadata', () => {
    const courseMap = {
      courseName: 'Project Management',
      lessons: [
        {
          title: 'Lesson 3: Scenario quizzes',
          sections: [
            {
              topicSection: 'Project scenarios',
              learningGoals: 'Use project scenario evidence to choose defensible project actions.',
              learningObjectives: 'Select appropriate project actions and explain the evidence for the choice.',
              weeklyAssessments: 'scenario quizzes 2. rubric-driven assignments 3. final capstone presentation',
              asyncActivities: 'Review project scenario notes and mark the decision evidence.',
              syncActivities: 'Compare scenario choices and justify the selected project action.',
              supportingResources: 'Instructor-approved readings, examples, or lab materials for project scenarios.',
              evaluateDesign: 'Check whether project actions are justified with source evidence.',
            },
          ],
        },
      ],
    };

    const blueprint = buildCourseBlueprint(courseMap);
    blueprint.lessons[0].keyConcepts = [
      'Scenario quizzes',
      'rubric-driven assignments',
      'rubric-driven assignments 2. discussion prompts',
      'quiz and exam bank, final capstone presentation',
      'final capstone presentation',
      'project scenarios',
      'project actions',
    ];
    blueprint.lessons[0].studentArtifact =
      'scenario quizzes 2. rubric-driven assignments 3. final capstone presentation';
    blueprint.assessmentRegistry = [
      ...(blueprint.assessmentRegistry || []),
      {
        id: 'discussion-prefix-review',
        dueSession: 1,
        kind: 'in-class',
        title: 'Discussion prompt: project scenarios',
      },
      {
        id: 'live-review',
        dueSession: 3,
        kind: 'in-class',
        title: 'rubric-driven assignments 2. discussion prompts',
      },
      {
        id: 'capstone-bank-review',
        dueSession: 3,
        kind: 'in-class',
        title: 'quiz and exam bank, final capstone presentation',
      },
    ];
    blueprint.lessons[0].enrichment = {
      keyTerms: [
        {
          term: 'Study Guides',
          definition: 'Internal deliverable label that must not become a study-guide term.',
          example: 'Do not teach this as content.',
          misconception: 'Study guides are the lesson concept.',
          correction: 'Project scenarios are the lesson concept.',
        },
        {
          term: 'Project scenario evidence',
          definition: 'Evidence students use to justify a project action in a scenario.',
          example: 'A project manager cites schedule risk before selecting an action.',
        },
      ],
    };
    blueprint.lessons[0].evidencePlan = {
      ...(blueprint.lessons[0].evidencePlan || {}),
      sourceCue: 'Instructor-approved readings, examples, or lab materials for project scenarios.',
    };
    blueprint.lessons[0].throughlineCase = {
      ...(blueprint.lessons[0].throughlineCase || {}),
      evidencePacket: 'Instructor-approved readings, examples, or lab materials for project scenarios.',
    };

    const customDeliverables = {
      custom_weeklyReflection: {
        name: 'Weekly Reflection Journal',
        description: 'Each week students write one reflection for the lesson.',
        userPromptTemplate: 'For each lesson, ask for a brief reflection check-in.',
      },
      custom_readingResponse: {
        name: 'Reading Response Log',
        description: 'Each week students write one reading response for the lesson.',
        userPromptTemplate: 'For each lesson, ask for a response to the assigned reading.',
      },
    };

    const compiled = compileBlueprintDeliverables(
      blueprint,
      ['studyGuides', 'discussions', 'quizBank', 'custom_weeklyReflection', 'custom_readingResponse'],
      { customDeliverables },
    );
    const compiledText = JSON.stringify(compiled);
    const guideText = JSON.stringify(compiled.studyGuides.studyGuides[0]);
    const guideStudentText = [
      compiled.studyGuides.studyGuides[0].examScope,
      compiled.studyGuides.studyGuides[0].summary,
      ...(compiled.studyGuides.studyGuides[0].keyTerms || []).map((term) =>
        [term.term, term.definition, term.example].join(' '),
      ),
      ...(compiled.studyGuides.studyGuides[0].commonMisconceptions || []).map((item) =>
        [item.misconception, item.correction].join(' '),
      ),
      ...(compiled.studyGuides.studyGuides[0].reviewQuestions || []).map((item) =>
        [item.question, item.hint].join(' '),
      ),
      ...(compiled.studyGuides.studyGuides[0].practiceActivities || []),
      compiled.studyGuides.studyGuides[0].examPrep?.reviewStrategy,
    ].join(' ');

    expect(blueprint.lessons[0].title).toMatch(/Project scenarios|Select appropriate project actions/i);
    expect(compiledText).not.toMatch(/scenario quizzes/i);
    expect(compiledText).not.toMatch(/rubric-driven assignments/i);
    expect(compiledText).not.toMatch(/final capstone presentation/i);
    expect(compiledText).not.toMatch(/Instructor-approved readings/i);
    expect(compiledText).not.toMatch(/\bStudy Guides\b/);
    expect(guideStudentText).not.toMatch(/discussion prompts/i);
    expect(guideStudentText).not.toMatch(/quiz and exam bank/i);
    expect(guideStudentText).not.toMatch(/rubric-driven assignments/i);
    expect(guideStudentText).not.toMatch(/final capstone presentation/i);
    expect(guideStudentText).toMatch(/discussion on project scenarios/i);
    expect(guideText).toMatch(/project scenarios|project actions/i);
    expect(guideText).toMatch(/source evidence/i);
    expect(compiledText).toMatch(/Project scenario evidence|project scenarios|project actions/i);
  });
});
