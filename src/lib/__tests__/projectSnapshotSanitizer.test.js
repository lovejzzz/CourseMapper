import { describe, expect, it } from 'vitest';
import { prepareProjectSnapshotForRestore, sanitizeProjectSnapshot } from '../projectSnapshotSanitizer';

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

  it('preserves non-plain objects such as Firestore timestamps', () => {
    const timestampLike = {
      toDate: () => new Date('2026-06-01T00:00:00Z'),
    };
    Object.setPrototypeOf(timestampLike, { constructor: { name: 'Timestamp' } });

    const sanitized = sanitizeProjectSnapshot({
      updatedAt: timestampLike,
      nested: {
        apiKey: 'sk-proj-abcdefghijklmnopqrstuvwxyz123456',
        title: 'Keep this',
      },
    });

    expect(sanitized.updatedAt).toBe(timestampLike);
    expect(sanitized.nested).toEqual({ title: 'Keep this' });
  });
});

describe('prepareProjectSnapshotForRestore', () => {
  it('sanitizes legacy project snapshots before restoring them to app state', () => {
    const legacy = {
      courseMap: {
        courseName: 'Legacy sk-proj-abcdefghijklmnopqrstuvwxyz1234567890',
        lessons: [
          {
            title: 'Keep lesson title',
            apiKey: 'sk-proj-abcdefghijklmnopqrstuvwxyz1234567890',
          },
        ],
      },
      promptText: 'Connected with Bearer abcdefghijklmnopqrstuvwxyz1234567890ABCDE',
      deliverables: {
        lessonPlans: {
          stale: true,
          data: {
            notes: 'Provider sk-ant-abcdefghijklmnopqrstuvwxyz1234567890',
            refreshToken: 'sk-ant-abcdefghijklmnopqrstuvwxyz1234567890',
          },
        },
      },
    };

    const restored = prepareProjectSnapshotForRestore(legacy);

    expect(restored.formatVersion).toBe(1);
    expect(restored.courseMap.courseName).toBe('Legacy [redacted secret]');
    expect(restored.courseMap.lessons[0]).toEqual({ title: 'Keep lesson title' });
    expect(restored.promptText).toBe('Connected with [redacted secret]');
    expect(restored.deliverables.lessonPlans).toMatchObject({
      stale: true,
      staleConfidence: { level: 'high', maxWeight: 1.0, dominantField: null },
      data: {
        notes: 'Provider [redacted secret]',
      },
    });
    expect(restored.deliverables.lessonPlans.data).not.toHaveProperty('refreshToken');
    expect(JSON.stringify(restored)).not.toContain('sk-proj-');
    expect(JSON.stringify(restored)).not.toContain('sk-ant-');
    expect(JSON.stringify(restored)).not.toContain('Bearer ');
  });

  it('does not mutate the legacy snapshot while applying restore migrations', () => {
    const legacy = {
      courseMap: { lessons: [] },
      deliverables: {
        slideDecks: { stale: true },
      },
    };

    const restored = prepareProjectSnapshotForRestore(legacy);

    expect(restored).not.toBe(legacy);
    expect(restored.deliverables.slideDecks.staleConfidence).toEqual({
      level: 'high',
      maxWeight: 1.0,
      dominantField: null,
    });
    expect(legacy).toEqual({
      courseMap: { lessons: [] },
      deliverables: {
        slideDecks: { stale: true },
      },
    });
  });
});
