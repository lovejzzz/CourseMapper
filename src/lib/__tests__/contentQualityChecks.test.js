import { describe, expect, it } from 'vitest';
import { auditDeliverableContentQuality } from '../contentQualityChecks.js';
import {
  auditOfficeBlobRepetition,
  findWorstPhraseRepetition,
  stripStructuralMetadata,
} from '../exportRenderedTextAudit.js';
import { buildDeliverableDocxBlob } from '../exporters/bulkDocxExporter.js';
import { finalizeCompiledDeliverableLanguage, shortArtifactReference } from '../compiledLanguageFinalizer.js';

// Defect fixtures lifted verbatim from the June 2026 four-course v0.8.6
// export audit — these are the exact failure shapes the checks must catch.
describe('auditDeliverableContentQuality', () => {
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

  it('leaves multiple-choice answer letters alone', () => {
    const data = { items: [{ explanation: 'A is correct because it cites evidence.' }] };
    finalizeCompiledDeliverableLanguage('quizBank', data, { lessons: [] });
    expect(data.items[0].explanation).toMatch(/^A is correct/);
  });

  it('builds week-anchored short references by artifact kind', () => {
    expect(shortArtifactReference('Low-stakes check for understanding aligned to 2.1', 2)).toBe('the Week 2 check');
    expect(shortArtifactReference('Notebook check and discussion post', 1)).toBe('the Week 1 discussion post');
    expect(shortArtifactReference('Introductory discussion post and short diagnostic quiz', 1)).toBe(
      'the Week 1 discussion and quiz',
    );
  });
});
