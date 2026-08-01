import { describe, expect, it } from 'vitest';
import { auditDeliverableContentQuality, hasDanglingClauseSeam } from '../contentQualityChecks.js';
import {
  auditOfficeBlobRepetition,
  findWorstPhraseRepetition,
  stripStructuralMetadata,
} from '../exportRenderedTextAudit.js';
import { buildDeliverableDocxBlob } from '../exporters/bulkDocxExporter.js';
import { finalizeCompiledDeliverableLanguage, shortArtifactReference } from '../compiledLanguageFinalizer.js';
import { findPromptArtifactContamination } from '../quality/artifactDefectPatterns.js';

// Defect fixtures lifted verbatim from the June 2026 four-course v0.8.6
// export audit — these are the exact failure shapes the checks must catch.
describe('auditDeliverableContentQuality', () => {
  it('flags procedural glossary copy that does not define the subject term', () => {
    const { findings } = auditDeliverableContentQuality('studyGuides', {
      studyGuides: [
        {
          keyTerms: [
            {
              term: 'Conformance',
              definition: 'Conformance names the evidence focus students use when deciding what counts as support.',
            },
          ],
        },
      ],
    });

    expect(findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'procedural-term-definition' })]));
  });

  it('flags leading-colon labels from unstripped section numbering', () => {
    const { findings } = auditDeliverableContentQuality('studyGuides', {
      studyGuides: [{ keyTerms: [{ term: ': Course Framing and Core Concepts', definition: 'x' }] }],
    });
    expect(findings.some((finding) => finding.code === 'leading-colon-label')).toBe(true);
  });

  it('flags dangling clauses that end mid-thought', () => {
    const { findings } = auditDeliverableContentQuality('assignments', {
      assignments: [
        { notes: 'Strong evidence connects the criterion to a specific decision, limitation, or revision in.' },
      ],
    });
    expect(findings.some((finding) => finding.code === 'dangling-clause')).toBe(true);
  });

  it('does not flag valid phrasal verbs that end in a preposition', () => {
    const { findings } = auditDeliverableContentQuality('slideDecks', {
      notes: [
        'Ask students which cue they should watch for.',
        'Name the source they will work with.',
        'The conclusion holds whatever foods the energy comes from.',
      ],
    });
    expect(findings.some((finding) => finding.code === 'dangling-clause')).toBe(false);
  });

  it('does not flag a complete temporal phrase ending in before', () => {
    const { findings } = auditDeliverableContentQuality('studyGuides', {
      lessons: [
        {
          keyTerms: [
            {
              example:
                'The supported answer to “Which step would most directly have caught this?” is Rehearsing every task the day before.',
            },
          ],
        },
      ],
    });

    expect(findings.some((finding) => finding.code === 'dangling-clause')).toBe(false);
  });

  it('flags article disagreement like "a Energy decision"', () => {
    const { findings } = auditDeliverableContentQuality('syllabus', {
      syllabus: { description: 'Explains a Energy decision, implication, or next step.' },
    });
    expect(findings.some((finding) => finding.code === 'article-agreement')).toBe(true);
  });

  it('flags run-together criteria sentences like "Strong work Names the relevant"', () => {
    const { findings } = auditDeliverableContentQuality('syllabus', {
      syllabus: { description: 'Strong work Names the relevant Climate concept accurately.' },
    });
    expect(findings.some((finding) => finding.code === 'run-together-criteria')).toBe(true);
  });

  it('flags instructor voice inside student-facing assignment instructions', () => {
    const { findings } = auditDeliverableContentQuality('assignments', {
      assignments: [
        { instructions: ['Ask students to define Climate in their own words before new instruction begins.'] },
      ],
    });
    expect(findings.some((finding) => finding.code === 'instructor-voice-in-student-surface')).toBe(true);
  });

  it('flags assignment logistics deferred to missing instructor configuration', () => {
    const { findings } = auditDeliverableContentQuality('assignments', {
      assignments: [
        {
          parameters: ['Submission format: organize the memo in the medium listed for the task.'],
          formatRequirements: {
            citationStyle: 'Apply the course citation format before uploading.',
            submissionPlatform: 'Official course site',
            latePolicy: 'Late work follows the local course policy.',
          },
        },
      ],
    });

    expect(findings.filter((finding) => finding.code === 'instructor-configuration-deferral')).toHaveLength(2);
  });

  it('does not flag concrete assignment logistics', () => {
    const { findings } = auditDeliverableContentQuality('assignments', {
      assignments: [
        {
          parameters: ['Submit a 1,200-word PDF memo.'],
          formatRequirements: {
            citationStyle: 'APA 7',
            submissionPlatform: 'Canvas assignment: Evidence memo',
            latePolicy: 'A 48-hour grace period applies; request longer extensions by email before the deadline.',
          },
        },
      ],
    });

    expect(findings.some((finding) => finding.code === 'instructor-configuration-deferral')).toBe(false);
  });

  it('flags a uniform multiple-choice answer key across lessons', () => {
    const quiz = (lessonNumber) => ({
      lessonNumber,
      questions: [
        { type: 'multiple_choice', answer: 'B' },
        { type: 'multiple_choice', answer: 'C' },
        { type: 'multiple_choice', answer: 'D' },
      ],
    });
    const { findings } = auditDeliverableContentQuality('quizBank', {
      quizzes: [quiz(1), quiz(2), quiz(3), quiz(4)],
    });
    expect(findings.some((finding) => finding.code === 'uniform-quiz-answer-key')).toBe(true);
  });

  it('ignores internal receipt metadata that exports never render', () => {
    const { findings } = auditDeliverableContentQuality('lessonPlans', {
      lessonPlans: [{ blueprintGrounding: { sourceAnchors: [{ anchor: ': Course Framing and Core Concepts' }] } }],
    });
    expect(findings).toHaveLength(0);
  });

  it('passes clean content', () => {
    const { findings } = auditDeliverableContentQuality('assignments', {
      assignments: [
        {
          instructions: ['Before drafting, define climate resilience in your own words.'],
          notes: 'Strong evidence connects the criterion to a visible revision decision.',
        },
      ],
    });
    expect(findings).toHaveLength(0);
  });
});

describe('findWorstPhraseRepetition', () => {
  it('counts template-stamped 8-grams', () => {
    const sentence = 'Introductory discussion post and short diagnostic quiz needs review now.';
    const result = findWorstPhraseRepetition(Array.from({ length: 20 }, () => sentence));
    expect(result.count).toBe(20);
    expect(result.limit).toBeGreaterThan(0);
  });

  it('stays quiet for varied prose', () => {
    const result = findWorstPhraseRepetition([
      'Each lesson uses a different framing for its evidence.',
      'Students compare sources before drafting the weekly memo.',
    ]);
    expect(result.count).toBeLessThan(2);
  });

  // ── v0.14.4 WS-C3a: structural quiz scaffolding is exempt from shingling ──
  // The exact live flag: 'quizBank: Rendered text repeats the phrase
  // "multiple choice 2 pts 2 min which statement" 13 times within one
  // section' — item headers, not content.
  const QUIZ_TOPICS = [
    'minerals',
    'basalt',
    'granite',
    'shale',
    'gneiss',
    'magma',
    'faults',
    'strata',
    'erosion',
    'plates',
    'quartz',
    'fossils',
    'soils',
  ];

  it('never flags the quiz item-header pattern family alone (13 uniform headers, unique stems)', () => {
    const paragraphs = QUIZ_TOPICS.map(
      (topic, index) =>
        `Q${index + 1} (Multiple choice, 2 pts, ~2 min):  Which statement about ${topic} is supported by the ${
          QUIZ_TOPICS[(index + 5) % QUIZ_TOPICS.length]
        } evidence collected in week ${index + 1}?`,
    );
    const result = findWorstPhraseRepetition(paragraphs);
    expect(result.count, `flagged "${result.shingle}"`).toBeLessThan(result.limit);
  });

  it('never flags answer-key scaffold, Aligns to / Intended use, or pts/min meta lines alone', () => {
    const paragraphs = [];
    QUIZ_TOPICS.forEach((topic, index) => {
      // makeCallout's uppercased label run + body-case explanation run.
      paragraphs.push(`ANSWER — B Correct because the ${topic} specimen logged in lab ${index + 1} matches option B.`);
      paragraphs.push('Aligns to: Analyze mineral identification using specimen evidence.');
      paragraphs.push('Intended use: weekly retrieval check before the lab practical.');
      paragraphs.push('2 pts · ~2 min');
    });
    const result = findWorstPhraseRepetition(paragraphs);
    expect(result.count, `flagged "${result.shingle}"`).toBeLessThan(result.limit);
  });

  it('still flags a 13× repeated content sentence (the v0.14.2 license-style repetition)', () => {
    const sentence =
      'Open educational resources used in this course package, with their licenses and attribution. ' +
      'Attribution must remain with redistributed materials for CC BY sources.';
    const result = findWorstPhraseRepetition(Array.from({ length: 13 }, () => sentence));
    expect(result.count).toBe(13);
    expect(result.count).toBeGreaterThanOrEqual(result.limit);
  });

  it('strips only the scaffold prefix, preserving question and explanation content', () => {
    expect(stripStructuralMetadata('Q3 (Multiple choice, 2 pts, ~2 min):  Which statement is accurate?')).toBe(
      'Which statement is accurate?',
    );
    expect(stripStructuralMetadata('Q4 (True/False, 1 pt, ~1 min): Granite is intrusive.')).toBe(
      'Granite is intrusive.',
    );
    expect(stripStructuralMetadata('Q5 (Essay, 10 pts): Explain the rock cycle.')).toBe('Explain the rock cycle.');
    expect(stripStructuralMetadata('ANSWER — B The sample shows visible crystals.')).toBe(
      'The sample shows visible crystals.',
    );
    // A content sentence that merely starts with "Answer" keeps its case-led words.
    expect(stripStructuralMetadata('Answers vary by region and rock type.')).toBe(
      'Answers vary by region and rock type.',
    );
    expect(stripStructuralMetadata('Aligns to: Analyze mineral identification.')).toBe('');
    expect(stripStructuralMetadata('Intended use: retrieval check.')).toBe('');
    expect(stripStructuralMetadata('2 pts · ~5 min')).toBe('');
    // Non-scaffold lines pass through untouched.
    expect(stripStructuralMetadata('Quiz 3 covers 2 pts of extra credit material.')).toBe(
      'Quiz 3 covers 2 pts of extra credit material.',
    );
  });
});

// End-to-end through the REAL quiz DOCX renderer (the same builder the export
// verifier audits): uniform per-item metadata never flags; a genuinely
// repeated stem still does.
describe('auditOfficeBlobRepetition — quiz structural metadata exemption (v0.14.4 C3a)', () => {
  const topics = [
    'minerals',
    'basalt',
    'granite',
    'shale',
    'gneiss',
    'magma',
    'faults',
    'strata',
    'erosion',
    'plates',
    'quartz',
    'fossils',
    'soils',
  ];
  const buildQuiz = (questionFor) => ({
    quizzes: [
      {
        lessonTitle: 'Lesson 1: Minerals',
        questions: topics.map((topic, index) => ({
          type: 'multiple_choice',
          points: 2,
          estimatedMinutes: 2,
          question: questionFor(topic, index),
          options: ['A. first option', 'B. second option', 'C. third option', 'D. fourth option'],
          answer: 'B',
          explanation: `Option B matches the ${topic} evidence recorded in the field notebook.`,
          objectiveAligned: 'Analyze mineral identification using specimen evidence.',
          intendedUse: 'weekly retrieval check before the lab practical.',
        })),
      },
    ],
  });

  it('13 uniform "(Multiple choice, 2 pts, ~2 min)" headers with unique stems stay clean', async () => {
    const blob = await buildDeliverableDocxBlob(
      'quizBank',
      buildQuiz(
        (topic, index) =>
          `Which statement about ${topic} is supported by the ${
            topics[(index + 5) % topics.length]
          } evidence collected in week ${index + 1}?`,
      ),
      'Physical Geology',
    );
    const finding = await auditOfficeBlobRepetition(blob, 'docx');
    expect(finding, finding && `flagged "${finding.sample}" ×${finding.count}`).toBeNull();
  });

  it('a 13× repeated question stem still flags through the same renderer', async () => {
    const blob = await buildDeliverableDocxBlob(
      'quizBank',
      buildQuiz(
        () => 'Which statement about the rock cycle is supported by the specimen evidence from this week of lab?',
      ),
      'Physical Geology',
    );
    const finding = await auditOfficeBlobRepetition(blob, 'docx');
    expect(finding).not.toBeNull();
    expect(finding.code).toBe('phrase-repetition');
    expect(finding.count).toBeGreaterThanOrEqual(13);
  });
});

describe('compiledLanguageFinalizer', () => {
  const blueprint = {
    lessons: [
      {
        lessonNumber: 1,
        title: 'Lesson 1: Climate Science, Justice Frameworks, and Community Resilience Basics',
        studentArtifact: 'Introductory discussion post and short diagnostic quiz',
        readings: [],
      },
    ],
  };

  it('shortens repeated artifact titles after the first mentions', () => {
    const data = {
      items: [
        {
          overview:
            'Introductory discussion post and short diagnostic quiz is due this week. Prepare Introductory discussion post and short diagnostic quiz early. Revise Introductory discussion post and short diagnostic quiz with feedback. Submit Introductory discussion post and short diagnostic quiz online.',
        },
      ],
    };
    finalizeCompiledDeliverableLanguage('assignments', data, blueprint);
    const text = data.items[0].overview;
    const fullMentions = text.match(/Introductory discussion post and short diagnostic quiz/g) || [];
    expect(fullMentions.length).toBeLessThanOrEqual(2);
    expect(text).toContain('Week 1');
  });

  it('does not amputate a coordinated lesson title after a stranded preposition', () => {
    const philosophyBlueprint = {
      lessons: [
        {
          lessonNumber: 7,
          title: 'Lesson 7: Arguments for and against God',
          studentArtifact: 'Theism exit note connecting the activity to one visible product',
          readings: [],
        },
      ],
    };
    const data = {
      assignments: [
        {
          lessonNumber: 7,
          progressTracking:
            'Review Lesson 7: Arguments for and against God once. Revisit Lesson 7: Arguments for and against God with feedback. Monitor readiness for Lesson 7: Arguments for and against God.',
        },
      ],
    };

    finalizeCompiledDeliverableLanguage('assignments', data, philosophyBlueprint);

    expect(data.assignments[0].progressTracking).toContain('Arguments for and against God.');
    expect(data.assignments[0].progressTracking).not.toContain('Arguments for.');
    expect(hasDanglingClauseSeam(data.assignments[0].progressTracking)).toBe(false);
  });

  it('repairs article agreement and double periods at template seams', () => {
    const data = {
      items: [
        {
          note:
            'Explains a Energy decision about the work.. Next step follows. ' +
            'Define project management: Define project management before selecting evidence.',
        },
      ],
    };
    finalizeCompiledDeliverableLanguage('assignments', data, { lessons: [] });
    expect(data.items[0].note).toContain('an Energy decision');
    expect(data.items[0].note).not.toContain('..');
    expect(data.items[0].note).not.toContain('Define project management: Define project management');
  });

  it('collapses identical week labels created where schedule and artifact references meet', () => {
    const data = {
      items: [
        {
          note: 'Submit the Week 2 Week 2 oral response, then revise the Week 2 the Week 2 evidence memo.',
        },
      ],
    };
    finalizeCompiledDeliverableLanguage('assignments', data, { lessons: [] });
    expect(data.items[0].note).toBe('Submit the Week 2 oral response, then revise the Week 2 evidence memo.');
  });

  it('repairs assignment parameter scaffolds before prompt-artifact grading', () => {
    const data = {
      assignments: [
        {
          instructions: [
            'Work within these parameters: Use brief written explanations; Include at least 2 misconceptions; Focus on concepts and application; Support answers with reasons.',
          ],
        },
      ],
    };

    finalizeCompiledDeliverableLanguage('assignments', data, { lessons: [] });

    const text = data.assignments[0].instructions.join(' ');
    expect(text).toContain('Submission requirements:');
    expect(text).toContain('write brief explanations');
    expect(text).toContain('address at least 2 common misunderstandings');
    expect(text).toContain('connect concepts and application to the submitted evidence');
    expect(text).toContain('justify each answer with a reason');
    expect(text).not.toMatch(/Work within these parameters|Focus on concepts|misconceptions/i);
    expect(findPromptArtifactContamination(text)).toBeNull();
  });

  it('does not treat ordinary assignment-management prose as prompt-artifact leakage', () => {
    const uxAnswer =
      'A defensible position: Personas should focus on the most common patterns to stay usable. ' +
      'In a scenario where a team has interviews with six students about managing assignments, deadlines, and notifications, ' +
      'the persona should name the repeated scheduling pain points rather than every unique preference.';

    expect(findPromptArtifactContamination(uxAnswer)).toBeNull();
    expect(
      findPromptArtifactContamination('This activity focuses on Assignment Briefs rather than the course concept.'),
    ).toEqual(expect.objectContaining({ label: 'assignment briefs' }));
  });

  it('leaves multiple-choice answer letters alone', () => {
    const data = { items: [{ explanation: 'A is correct because it cites evidence.' }] };
    finalizeCompiledDeliverableLanguage('quizBank', data, { lessons: [] });
    expect(data.items[0].explanation).toMatch(/^A is correct/);
  });

  it('repairs versioned WCAG subject-verb agreement on learner-facing surfaces', () => {
    const data = {
      items: [{ question: 'WCAG 2.0 consist of twelve guidelines organized under four principles.' }],
    };
    finalizeCompiledDeliverableLanguage('quizBank', data, { lessons: [] });
    expect(data.items[0].question).toBe('WCAG 2.0 consists of twelve guidelines organized under four principles.');
  });

  it('preserves accessibility acronyms and bounds policy-specific web obligations', () => {
    const data = {
      items: [
        {
          question: 'How does Wcag connect Html semantics to a Ux artifact? How does Wcag principles actually work?',
          answer:
            "The W3C's Techniques for WCAG 2.0 is a list of techniques that help authors. " +
            'All websites will need to adhere to the WCAG Principles. ' +
            'For example: The regulations require compliance with WCAG 2.0.',
        },
      ],
    };

    finalizeCompiledDeliverableLanguage('courseFaq', data, { lessons: [] });

    expect(data.items[0].question).toBe(
      'How does WCAG connect HTML semantics to a UX artifact? How do WCAG principles actually work?',
    );
    expect(data.items[0].answer).toContain("W3C's Techniques for WCAG 2.0 lists techniques that help authors.");
    expect(data.items[0].answer).toContain(
      'In the cited policy context, covered websites are expected to follow the WCAG principles.',
    );
    expect(data.items[0].answer).toContain(
      'For example, in that cited policy context, the regulations require compliance with WCAG 2.0.',
    );
    expect(data.items[0].answer).not.toMatch(/\bWcag\b|All websites will need|For example:/);
  });

  it('restores the article before assigned course materials in prepositional phrases', () => {
    const data = {
      items: [
        {
          answer:
            'Ground the conclusion in assigned course materials, then cite evidence from assigned course materials.',
        },
      ],
    };

    finalizeCompiledDeliverableLanguage('courseFaq', data, { lessons: [] });

    expect(data.items[0].answer).toBe(
      'Ground the conclusion in the assigned course materials, then cite evidence from the assigned course materials.',
    );
  });

  it('presents completed non-writing course materials without unfinished draft labels', () => {
    const data = {
      items: [
        {
          instruction:
            'Draft the Week 1 explanation, point to a visible part of the draft, and show how the next draft responds to feedback.',
        },
      ],
    };

    finalizeCompiledDeliverableLanguage('assignments', data, {
      courseName: 'Digital Accessibility for Product Teams',
      lessons: [],
    });

    expect(data.items[0].instruction).toBe(
      'Develop the Week 1 explanation, point to a visible part of the work, and show how the next revision responds to feedback.',
    );
    expect(data.items[0].instruction).not.toMatch(/\bdraft\b/i);
  });

  it('polishes a numbered assignment instruction that omits the article before Week', () => {
    const data = {
      items: [{ instruction: 'Draft Week 1 evidence explanation so each section addresses one criterion.' }],
    };

    finalizeCompiledDeliverableLanguage('assignments', data, {
      courseName: 'Digital Accessibility for Product Teams',
      lessons: [],
    });

    expect(data.items[0].instruction).toBe(
      'Develop Week 1 evidence explanation so each section addresses one criterion.',
    );
  });

  it('preserves drafting vocabulary when drafting is the course content', () => {
    const data = { items: [{ instruction: 'Draft the poem, then revise the draft in workshop.' }] };

    finalizeCompiledDeliverableLanguage('assignments', data, {
      courseName: 'Poetry Writing Workshop',
      lessons: [],
    });

    expect(data.items[0].instruction).toBe('Draft the poem, then revise the draft in workshop.');
  });

  it('builds week-anchored short references by artifact kind', () => {
    expect(shortArtifactReference('Low-stakes check for understanding aligned to 2.1', 2)).toBe('the Week 2 check');
    expect(shortArtifactReference('Weekly autograded quizzes', 4)).toBe('the Week 4 quiz');
    expect(shortArtifactReference('Notebook check and discussion post', 1)).toBe('the Week 1 discussion post');
    expect(shortArtifactReference('Introductory discussion post and short diagnostic quiz', 1)).toBe(
      'the Week 1 discussion and quiz',
    );
  });

  it('does not turn abstract lesson language into a week artifact name', () => {
    expect(shortArtifactReference('Applying theoretical lenses', 11)).toBe('the revision task');
    expect(shortArtifactReference('Core tenets of power politics limitation', 14)).toBe('the evidence task');
  });
});
