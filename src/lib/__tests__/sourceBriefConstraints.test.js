import { describe, expect, it } from 'vitest';
import {
  analyzeSourceBriefConstraints,
  detectRequestedClassSessionMinutes,
  extractInstructorProvidedFacts,
  requiresInstructorSourcesOnly,
} from '../sourceBriefConstraints';

describe('source brief constraints', () => {
  it('reads an explicit hyphenated class duration without confusing other counts', () => {
    const brief =
      'Mandarin has four main tones. Build a 50-minute lesson with guided listening and one evidence check.';
    expect(detectRequestedClassSessionMinutes(brief)).toBe(50);
    expect(detectRequestedClassSessionMinutes('Build 15 lessons about four main tones.')).toBeNull();
  });

  it('recognizes explicit instructor-only evidence boundaries', () => {
    expect(requiresInstructorSourcesOnly('Use only these instructor-provided facts: Pinyin uses Latin letters.')).toBe(
      true,
    );
    expect(requiresInstructorSourcesOnly('Use open readings and these instructor notes.')).toBe(false);
  });

  it('returns both constraints as one stable policy object', () => {
    expect(
      analyzeSourceBriefConstraints(
        'Use only the following facts. Create a class lasting 75 minutes with a source-grounded check.',
      ),
    ).toEqual({
      sessionMinutes: 75,
      instructorSourcesOnly: true,
      instructorProvidedFacts: [],
    });
  });

  it('preserves explicitly labeled facts and stops before teaching directions', () => {
    const brief =
      'Use only these instructor-provided facts: Pinyin uses Latin letters. Tone changes meaning: mā means mother, má means hemp, mǎ means horse, and mà means scold. Learners must identify the contour. Build a 50-minute lesson.';
    expect(extractInstructorProvidedFacts(brief)).toEqual([
      'Pinyin uses Latin letters.',
      'Tone changes meaning: mā means mother, má means hemp, mǎ means horse, and mà means scold.',
    ]);
  });
});
