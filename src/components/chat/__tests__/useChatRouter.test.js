import { describe, expect, it } from 'vitest';
import { prepareEditAndResendMessages } from '../useChatRouter';

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
