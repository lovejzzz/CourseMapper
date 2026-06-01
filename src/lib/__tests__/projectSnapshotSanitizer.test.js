import { describe, expect, it } from 'vitest';
import { sanitizeProjectSnapshot } from '../projectSnapshotSanitizer';

describe('sanitizeProjectSnapshot', () => {
  it('removes secret fields recursively without dropping model configuration', () => {
    const snapshot = {
      provider: 'openai',
      modelId: 'gpt-5.4-mini',
      modelName: 'GPT-5.4 Mini',
      deliverableConfig: {
        slideDecks: {
          apiKey: 'sk-proj-abcdefghijklmnopqrstuvwxyz123456',
          prompt: 'Build a deck.',
        },
      },
      deliverables: {
        slideDecks: {
          data: {
            generatedImage: {
              accessToken: 'image-token',
              url: 'data:image/png;base64,abc',
            },
          },
        },
      },
      chatHistory: [{ role: 'assistant', authorization: 'Bearer hidden-token', text: 'Done.' }],
    };

    const sanitized = sanitizeProjectSnapshot(snapshot);

    expect(sanitized).toMatchObject({
      provider: 'openai',
      modelId: 'gpt-5.4-mini',
      modelName: 'GPT-5.4 Mini',
      deliverableConfig: { slideDecks: { prompt: 'Build a deck.' } },
      deliverables: { slideDecks: { data: { generatedImage: { url: 'data:image/png;base64,abc' } } } },
      chatHistory: [{ role: 'assistant', text: 'Done.' }],
    });
    expect(JSON.stringify(sanitized)).not.toContain('sk-proj');
    expect(JSON.stringify(sanitized)).not.toContain('image-token');
    expect(JSON.stringify(sanitized)).not.toContain('hidden-token');
  });

  it('redacts key-like text values in exported project content', () => {
    const sanitized = sanitizeProjectSnapshot({
      promptText: 'Never persist sk-ant-abcdefghijklmnopqrstuvwxyz123456 in a project backup.',
      courseMap: {
        lessons: [
          {
            title: 'API Design',
            sections: [{ topicSection: 'Use Bearer abcdefghijklmnopqrstuvwxyz1234567890 only in local setup.' }],
          },
        ],
      },
    });

    expect(sanitized.promptText).toBe('Never persist [redacted secret] in a project backup.');
    expect(sanitized.courseMap.lessons[0].title).toBe('API Design');
    expect(sanitized.courseMap.lessons[0].sections[0].topicSection).toBe('Use [redacted secret] only in local setup.');
  });

  it('does not mutate the original snapshot', () => {
    const snapshot = { apiKey: 'sk-proj-abcdefghijklmnopqrstuvwxyz123456', promptText: 'Keep course text.' };
    const sanitized = sanitizeProjectSnapshot(snapshot);

    expect(sanitized).toEqual({ promptText: 'Keep course text.' });
    expect(snapshot).toEqual({
      apiKey: 'sk-proj-abcdefghijklmnopqrstuvwxyz123456',
      promptText: 'Keep course text.',
    });
  });
});
