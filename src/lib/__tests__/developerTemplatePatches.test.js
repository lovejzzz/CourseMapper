import { describe, expect, it } from 'vitest';
import {
  applyDeveloperTemplatePatch,
  buildDeveloperTemplatePatch,
  diffDeveloperTemplatePatch,
} from '../developerTemplatePatches';

const currentConfig = {
  selectedFeatures: ['courseMap', 'lessonPlans'],
  deliverableConfig: {
    lessonPlans: {
      questionsPerLesson: 4,
      extraInstructions: 'Keep current extras',
    },
    quizBank: {
      difficulty: 'medium',
    },
  },
  lessonScope: { type: 'all' },
  slideTheme: null,
  provider: 'openai',
  modelId: 'gpt-5.4-mini',
  modelName: 'GPT-5.4 Mini',
  columns: [{ key: 'learningGoals', label: 'Learning Goals' }],
};

const templateData = {
  selectedFeatures: ['courseMap', 'quizBank'],
  deliverableConfig: {
    lessonPlans: {
      customSystemPrompt: 'System override',
      customUserPrompt: 'User {{courseMap}}',
      extraInstructions: 'Template extras',
      questionsPerLesson: 8,
    },
    studyGuides: {
      customUserPrompt: 'Study {{courseMap}}',
    },
  },
  lessonScope: { type: 'specific', indices: [0] },
  slideTheme: 2,
  provider: 'anthropic',
  modelId: 'claude-sonnet',
  modelName: 'Claude Sonnet',
  columns: [{ key: 'topicSection', label: 'Topic' }],
};

describe('developerTemplatePatches', () => {
  it('builds a full template patch', () => {
    expect(buildDeveloperTemplatePatch(templateData, 'all', currentConfig)).toEqual(templateData);
  });

  it('stages only model fields', () => {
    expect(buildDeveloperTemplatePatch(templateData, 'model', currentConfig)).toEqual({
      provider: 'anthropic',
      modelId: 'claude-sonnet',
      modelName: 'Claude Sonnet',
    });
  });

  it('stages prompt overrides without replacing non-prompt config', () => {
    const patched = applyDeveloperTemplatePatch(currentConfig, templateData, 'prompts');

    expect(patched.deliverableConfig.lessonPlans).toEqual({
      questionsPerLesson: 4,
      customSystemPrompt: 'System override',
      customUserPrompt: 'User {{courseMap}}',
      extraInstructions: 'Template extras',
    });
    expect(patched.deliverableConfig.quizBank).toEqual({ difficulty: 'medium' });
    expect(patched.deliverableConfig.studyGuides).toEqual({
      customUserPrompt: 'Study {{courseMap}}',
    });
    expect(patched.selectedFeatures).toEqual(currentConfig.selectedFeatures);
  });

  it('reports diffs for a partial template patch', () => {
    const diffs = diffDeveloperTemplatePatch(currentConfig, templateData, 'columns', 5);

    expect(diffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'columns[0].key' }),
        expect.objectContaining({ path: 'columns[0].label' }),
      ]),
    );
  });
});
