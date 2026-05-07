import { describe, expect, it, vi } from 'vitest';
import { handleAgentFinalResponse, handleLegacyResponse } from '../../components/chat/useChatMessages';

function createMessageHarness(initialMessages = []) {
  let messages = initialMessages;
  return {
    get messages() {
      return messages;
    },
    setMessages(updater) {
      messages = typeof updater === 'function' ? updater(messages) : updater;
    },
  };
}

function createContext(harness) {
  return {
    setMessages: harness.setMessages,
    delivRef: { current: {} },
    courseMap: { lessons: [] },
    provider: 'openai',
    apiKey: 'sk-secret-should-not-persist',
    sendAgentMessage: vi.fn(),
  };
}

describe('image search chat messages', () => {
  it('does not store apiKey from native agent imageSearch responses', () => {
    const harness = createMessageHarness();

    handleAgentFinalResponse({ imageSearch: { query: 'photosynthesis diagram' } }, createContext(harness));

    expect(harness.messages).toEqual([
      {
        role: 'imageSearch',
        imageSearch: { query: 'photosynthesis diagram' },
        status: 'complete',
        provider: 'openai',
      },
    ]);
    expect(JSON.stringify(harness.messages)).not.toContain('sk-secret');
    expect(harness.messages[0]).not.toHaveProperty('apiKey');
  });

  it('does not store apiKey from legacy parsed imageSearch responses', () => {
    const harness = createMessageHarness([{ role: 'assistant', text: '' }]);

    handleLegacyResponse(
      JSON.stringify({ imageSearch: { query: 'decision tree illustration' } }),
      createContext(harness),
    );

    expect(harness.messages).toEqual([
      {
        role: 'imageSearch',
        imageSearch: { query: 'decision tree illustration' },
        status: 'complete',
        provider: 'openai',
      },
    ]);
    expect(JSON.stringify(harness.messages)).not.toContain('sk-secret');
    expect(harness.messages[0]).not.toHaveProperty('apiKey');
  });
});
