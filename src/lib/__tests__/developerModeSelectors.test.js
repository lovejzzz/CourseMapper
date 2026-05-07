import { describe, expect, it } from 'vitest';
import {
  countDeveloperSearchMatches,
  getDeveloperSectionStats,
  getPromptFeatureOptions,
  titleFromDeveloperId,
} from '../developerModeSelectors.js';

describe('developerModeSelectors', () => {
  it('formats developer ids for UI labels', () => {
    expect(titleFromDeveloperId('customLessonPlan')).toBe('Lesson Plan');
    expect(titleFromDeveloperId('risk-matrix')).toBe('Risk Matrix');
    expect(titleFromDeveloperId('')).toBe('Untitled');
  });

  it('builds prompt feature options from selected features, config, and outputs', () => {
    const options = getPromptFeatureOptions({
      selectedFeatures: ['courseMap', 'slides'],
      deliverableConfig: {
        syllabus: { extraInstructions: 'short' },
        slides: { customUserPrompt: 'x' },
      },
      deliverables: {
        assessmentPlan: { status: 'done' },
      },
    });

    expect(options).toEqual([
      { id: 'slides', label: 'Slides' },
      { id: 'syllabus', label: 'Syllabus' },
      { id: 'assessmentPlan', label: 'Assessment Plan' },
    ]);
  });

  it('counts case-insensitive editor search matches', () => {
    expect(countDeveloperSearchMatches('Alpha alpha ALPHA', 'alpha')).toBe(3);
    expect(countDeveloperSearchMatches('Alpha', '')).toBe(0);
  });

  it('summarizes section stats', () => {
    const snapshot = {
      courseMap: { lessons: [{ title: 'One' }] },
      selectedFeatures: ['courseMap', 'slides'],
      deliverableConfig: {
        slides: { extraInstructions: 'Use examples' },
      },
      deliverables: {
        slides: { status: 'done' },
      },
      columns: [{ enabled: true }, { enabled: false }],
      slideTheme: 2,
      modelName: 'GPT',
    };

    expect(getDeveloperSectionStats(snapshot, 'themeLayout')).toEqual(['1 enabled columns', 'Theme 2']);
    expect(getDeveloperSectionStats(snapshot, 'prompts')).toEqual(['1 prompt overrides', '1 deliverables']);
    expect(getDeveloperSectionStats(snapshot, 'courseMap')).toEqual(['1 lessons', '2 columns']);
  });
});
