import { describe, expect, it, vi } from 'vitest';
import { buildRetryFailedPrompt, prepareAutoReviewSend, prepareEditAndResendMessages } from '../useChatRouter';

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
