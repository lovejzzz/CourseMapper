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
import { deriveCompilerOwnedColumns, expandLeanCourseMap, expandLeanSectionField } from '../src/lib/leanCourseMap';
import { repairCourseMapReadiness } from '../src/lib/deliverableReadiness';
import { deriveCourseGraphFromCourseMap } from '../src/lib/courseGraph';

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
    expect(faqText).toMatch(/Project Management assessment/i);
    expect(faqText).toMatch(/Project Management source evidence|project charter/i);
  });
});
