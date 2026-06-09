import { describe, expect, it } from 'vitest';
import { auditDeliverableContentQuality } from '../contentQualityChecks.js';
import { findWorstPhraseRepetition } from '../exportRenderedTextAudit.js';
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
    const data = { items: [{ note: 'Explains a Energy decision about the work.. Next step follows.' }] };
    finalizeCompiledDeliverableLanguage('assignments', data, { lessons: [] });
    expect(data.items[0].note).toContain('an Energy decision');
    expect(data.items[0].note).not.toContain('..');
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
