import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  extractDeveloperTemplateData,
  listDeveloperTemplates,
  saveDeveloperTemplateFromSnapshot,
} from '../developerTemplates';

vi.mock('../cloudStorage', () => ({
  loadDeveloperTemplates: vi.fn(() => Promise.resolve({})),
  saveDeveloperTemplate: vi.fn(() => Promise.resolve()),
  deleteDeveloperTemplate: vi.fn(() => Promise.resolve()),
}));

class FakeStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new FakeStorage(),
    configurable: true,
  });
});

describe('developerTemplates', () => {
  it('extracts reusable setup without project content', () => {
    const data = extractDeveloperTemplateData({
      selectedFeatures: ['courseMap', 'slideDecks'],
      deliverableConfig: { slideDecks: { imageModel: 'gpt-image-2' } },
      lessonScope: { type: 'all' },
      slideTheme: { accent: 'indigo' },
      provider: 'openai',
      modelId: 'gpt-5.4-mini',
      modelName: 'GPT-5.4 Mini',
      columns: [{ key: 'topic' }],
      courseMap: { lessons: [{ title: 'Do not persist' }] },
      deliverables: { slideDecks: { data: [] } },
      chatHistory: [{ role: 'user', text: 'private' }],
    });

    expect(data).toEqual({
      selectedFeatures: ['courseMap', 'slideDecks'],
      deliverableConfig: { slideDecks: { imageModel: 'gpt-image-2' } },
      lessonScope: { type: 'all' },
      slideTheme: { accent: 'indigo' },
      provider: 'openai',
      modelId: 'gpt-5.4-mini',
      modelName: 'GPT-5.4 Mini',
      columns: [{ key: 'topic' }],
    });
  });

  it('saves and lists templates from local storage', () => {
    const saved = saveDeveloperTemplateFromSnapshot({
      selectedFeatures: ['slideDecks'],
      deliverableConfig: {},
    }, 'Slides first');

    expect(saved.name).toBe('Slides first');
    expect(saved.data.selectedFeatures).toEqual(['courseMap', 'slideDecks']);
    expect(listDeveloperTemplates()).toHaveLength(1);
  });
});
