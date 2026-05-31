import { describe, expect, it } from 'vitest';
import {
  buildInstructorPreferenceProfile,
  buildInstructorPreferenceProfileFromMemories,
  describeInstructorPreferenceForFeature,
  summarizeInstructorPreferenceProfile,
} from '../instructorPreferenceProfile';

describe('instructorPreferenceProfile', () => {
  it('returns null without enough edit-pattern evidence', () => {
    expect(buildInstructorPreferenceProfile([])).toBeNull();
    expect(
      buildInstructorPreferenceProfile([{ featureId: 'rubrics', field: 'criteria', action: 'accepted' }], {
        minSignalCount: 2,
      }),
    ).toBeNull();
  });

  it('builds feature-specific directives from repeated instructor edit patterns', () => {
    const profile = buildInstructorPreferenceProfile([
      { featureId: 'rubrics', field: 'criteria', action: 'accepted', accessCount: 5, importance: 4 },
      { featureId: 'quizBank', field: 'question', action: 'accepted', accessCount: 2 },
      { featureId: 'slideDecks', field: 'slides.notes', action: 'edited' },
      { featureId: 'lessonPlans', field: 'outline.duration', action: 'edited' },
      { featureId: 'courseMap', field: 'editTitle', action: 'accepted' },
    ]);

    expect(profile).toMatchObject({
      source: 'instructor-edit-patterns',
      confidence: 'medium',
      signalCount: 5,
      feedbackStyle: 'criterion-specific',
      quizDifficulty: 'applied analysis with clear rationales',
      slideStyle: 'concise course-specific notes',
      lessonPacing: 'practice-heavy pacing',
      namingPolicy: 'preserve instructor-edited lesson labels',
    });
    expect(profile.featureSignals.rubrics.weight).toBeGreaterThan(5);
    expect(profile.styleDirectives.join(' ')).toContain('rubric feedback');
    expect(summarizeInstructorPreferenceProfile(profile)).toContain('criterion-specific feedback');
    expect(describeInstructorPreferenceForFeature(profile, 'quizBank')).toContain('applied analysis');
  });

  it('separates rejected patterns into avoidance notes', () => {
    const profile = buildInstructorPreferenceProfileFromMemories([
      {
        category: 'feedback',
        content: 'User frequently rejected the "slides.notes" field in slideDecks.',
        accessCount: 3,
        importance: 3,
        meta: { featureId: 'slideDecks', field: 'slides.notes', action: 'rejected' },
      },
    ]);

    expect(profile.slideStyle).toBe('avoid repetitive slide boilerplate');
    expect(profile.avoidanceNotes[0]).toContain('Slide Decks');
    expect(describeInstructorPreferenceForFeature(profile, 'slideDecks')).toContain('avoid repetitive');
  });
});
