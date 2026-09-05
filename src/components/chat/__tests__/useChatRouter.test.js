import { describe, expect, it, vi } from 'vitest';
import {
  buildAttachedFileDisplayText,
  buildAttachedFilePrompt,
  buildRetryFailedPrompt,
  mergeSyncSuggestionResult,
  prepareAutoReviewSend,
  prepareEditAndResendMessages,
  resolveChatRoute,
} from '../useChatRouter';

vi.mock('../../../lib/customDeliverableLibrary', () => ({
  getCustomDeliverable: vi.fn((id) => {
    if (id === 'custom_peerReview') return { name: 'Peer Review' };
    return null;
  }),
}));

describe('prepareEditAndResendMessages', () => {
  it('resends even when the edited text matches the original message', () => {
    const messages = [
      { role: 'user', text: 'Review my course' },
      { role: 'assistant', text: 'Done' },
    ];

    const result = prepareEditAndResendMessages(messages, 0, 'Review my course');

    expect(result).toEqual({
      history: [],
      text: 'Review my course',
    });
  });

  it('keeps only messages before the edited user turn', () => {
    const messages = [
      { role: 'user', text: 'First' },
      { role: 'assistant', text: 'First reply' },
      { role: 'user', text: 'Second' },
      { role: 'assistant', text: 'Second reply' },
    ];

    const result = prepareEditAndResendMessages(messages, 2, 'Updated second');

    expect(result).toEqual({
      history: messages.slice(0, 2),
      text: 'Updated second',
    });
  });

  it('rejects empty edits and non-user message indices', () => {
    const messages = [
      { role: 'user', text: 'First' },
      { role: 'assistant', text: 'First reply' },
    ];

    expect(prepareEditAndResendMessages(messages, 0, '   ')).toBeNull();
    expect(prepareEditAndResendMessages(messages, 1, 'Retry')).toBeNull();
  });
});

describe('prepareAutoReviewSend', () => {
  it('keeps auto-review prompts silent while preserving the full agent prompt', () => {
    const result = prepareAutoReviewSend('[AUTO-REVIEW] Generation complete. Run validate_course.');

    expect(result).toEqual({
      text: 'Review my course',
      agentPromptOverride: '[AUTO-REVIEW] Generation complete. Run validate_course.',
      silent: true,
    });
  });

  it('leaves normal user prompts visible', () => {
    expect(prepareAutoReviewSend('Review my course')).toEqual({
      text: 'Review my course',
      agentPromptOverride: null,
      silent: false,
    });
  });
});

describe('resolveChatRoute', () => {
  it('routes a map-only workspace through the real Agent when its executor is ready', () => {
    expect(
      resolveChatRoute({ courseMap: { lessons: [{ title: 'One' }] }, hasDeliverables: false, hasExecutor: true }),
    ).toBe('agent');
  });

  it('keeps in-progress work in help mode and preserves revision as a legacy fallback', () => {
    expect(
      resolveChatRoute({
        courseMap: { lessons: [{ title: 'One' }] },
        hasDeliverables: true,
        isGenerating: true,
        hasExecutor: true,
      }),
    ).toBe('help');
    expect(
      resolveChatRoute({ courseMap: { lessons: [{ title: 'One' }] }, hasDeliverables: false, hasExecutor: false }),
    ).toBe('revision');
  });
});

describe('attached file prompt helpers', () => {
  it('appends attached source text to the full model prompt, not just the visible label', () => {
    const prompt = buildAttachedFilePrompt('Improve Lesson Plans with detailed classroom-readiness instructions.', [
      { name: 'field-notes.txt', text: 'Students need more lab notebook scaffolding.' },
    ]);

    expect(prompt).toContain('Improve Lesson Plans with detailed classroom-readiness instructions.');
    expect(prompt).toContain('The user also attached these additional reference files:');
    expect(prompt).toContain('=== Attached File: field-notes.txt ===');
    expect(prompt).toContain('lab notebook scaffolding');
  });

  it('uses a readable visible label for file-only turns', () => {
    expect(buildAttachedFileDisplayText('', [{ name: 'source.txt', text: 'Source' }])).toBe(
      'Attached reference files [+1 file]',
    );
  });
});

describe('buildRetryFailedPrompt', () => {
  it('uses resolved custom deliverable names instead of internal IDs', () => {
    const prompt = buildRetryFailedPrompt(
      [
        {
          action: 'editItem',
          featureId: 'custom_peerReview',
          lessonIndex: 1,
          message: 'Missing required field',
          originalInput: { path: ['peerReviews', 1, 'prompt'] },
        },
      ],
      'edit_deliverables',
    );

    expect(prompt).toContain('editItem on Peer Review (Lesson 2)');
    expect(prompt).not.toContain('custom_peerReview');
  });

  it('falls back to course map when no feature is provided', () => {
    const prompt = buildRetryFailedPrompt([{ action: 'editCell', message: 'Invalid section' }], 'edit_course_map');

    expect(prompt).toContain('editCell on course map');
    expect(prompt).toContain('edit_course_map');
  });
});

describe('mergeSyncSuggestionResult', () => {
  it('clears old failed items and preserves prior completions after a successful retry', () => {
    const previous = {
      id: 'sync-1',
      role: 'syncSuggestion',
      status: 'partialFail',
      completedFeatureIds: ['syllabus'],
      failedItems: [{ featureId: 'lessonPlans' }, { featureId: 'rubrics' }],
    };

    expect(
      mergeSyncSuggestionResult(previous, {
        status: 'done',
        completedFeatureIds: ['lessonPlans', 'rubrics'],
      }),
    ).toMatchObject({
      status: 'done',
      completedFeatureIds: ['syllabus', 'lessonPlans', 'rubrics'],
      failedItems: [],
    });
  });
});
