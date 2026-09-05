import { describe, expect, it } from 'vitest';

import {
  buildMusicIntervalDiscussionArtifactSet,
  buildMusicIntervalDiscussionCriteriaSet,
  buildMusicIntervalDiscussionFacilitationTips,
  buildMusicIntervalDiscussionGuidelines,
  buildMusicIntervalDiscussionResponseStems,
  buildMusicIntervalFaqCore,
  isMusicIntervalBlueprint,
  isMusicIntervalLesson,
} from '../musicTheoryQuizFrames.js';

const common = {
  source: 'Open Music Theory: Intervals',
  sourceCue: 'Open Music Theory: Intervals',
  artifact: 'Week 2 analysis',
  format: 'Interval Reasoning Clinic',
};

describe('music-interval discussion frames', () => {
  it('gives classification and inversion lessons different, auditable facilitation moves', () => {
    const classification = buildMusicIntervalDiscussionFacilitationTips({
      source: common.source,
      artifact: 'Week 1 check',
      inversionLesson: false,
    });
    const inversion = buildMusicIntervalDiscussionFacilitationTips({
      source: common.source,
      artifact: common.artifact,
      inversionLesson: true,
    });

    expect(classification.ifStalls).toContain('C4–E♭4');
    expect(classification.ifDominates).toContain('counts the letter names inclusively');
    expect(inversion.ifStalls).toContain('major tenth → major third');
    expect(inversion.ifDominates).toContain('total nine');
    expect(inversion.opening).not.toBe(classification.opening);
    expect(inversion.ifStalls).not.toBe(classification.ifStalls);
  });

  it('routes artifacts, response stems, criteria, and guidelines to the lesson reasoning task', () => {
    const artifacts = buildMusicIntervalDiscussionArtifactSet({
      lessonTitle: 'Simple and Compound Intervals and Inversion',
      sourceCue: common.sourceCue,
      artifact: common.artifact,
      inversionLesson: true,
    });
    const stems = buildMusicIntervalDiscussionResponseStems({
      artifact: common.artifact,
      inversionLesson: true,
    });
    const criteria = buildMusicIntervalDiscussionCriteriaSet({
      artifact: common.artifact,
      inversionLesson: true,
    });
    const guidelines = buildMusicIntervalDiscussionGuidelines({ ...common, inversionLesson: true });

    expect(artifacts[0].title).toContain('Compound-Interval Evidence');
    expect(artifacts[1].title).toContain('Inversion Analysis Brief');
    expect(stems.join(' ')).toContain('sum to nine');
    expect(criteria.join(' ')).toContain('sum-to-nine rule');
    expect(guidelines).toContain('simple reduction');
    expect(guidelines).toContain("audit one peer's chain");
  });

  it('keeps classification and inversion FAQ explanations on different evidence chains', () => {
    const facts = ['Intervals keep their generic number from the endpoint letters'];
    const classification = buildMusicIntervalFaqCore({
      facts,
      sourceCue: common.source,
      inversionLesson: false,
    });
    const inversion = buildMusicIntervalFaqCore({ facts, sourceCue: common.source, inversionLesson: true });

    expect(classification).toContain('count their letter names inclusively');
    expect(inversion).toContain('pair the inversion numbers to nine');
    expect(classification).not.toBe(inversion);
  });

  it('does not let a course-wide interval cue overwrite a chord lesson', () => {
    const chordLesson = {
      title: 'Chords and Harmony',
      outcomes: ['Explain how chords organize into progressions.'],
      keyConcepts: ['triad', 'chord progression'],
      readings: ['A source that mentions an interval of a seventh'],
      learnerContextCue: 'Music theory and aural skills with interval identification',
    };

    expect(isMusicIntervalLesson(chordLesson)).toBe(false);
    expect(
      isMusicIntervalBlueprint({
        courseName: 'Music Theory Fundamentals',
        learnerContextProfile: { domain: 'music theory and aural skills' },
        lessons: [
          { title: 'Written Intervals' },
          chordLesson,
          { title: 'Rhythm and Meter' },
          { title: 'Musical Form' },
        ],
      }),
    ).toBe(false);
  });
});
