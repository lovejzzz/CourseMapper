import { describe, expect, it } from 'vitest';
import {
  createDeveloperTemplateBundle,
  DEVELOPER_TEMPLATE_BUNDLE_KIND,
  parseDeveloperTemplateBundle,
  stringifyDeveloperTemplateBundle,
} from '../developerTemplateExchange';

const template = {
  id: 'local-id',
  name: 'Slides Setup',
  data: {
    selectedFeatures: ['slideDecks'],
    deliverableConfig: { slideDecks: { extraInstructions: 'Visual' } },
    lessonScope: { type: 'all' },
    slideTheme: 2,
    provider: 'openai',
    modelId: 'gpt-5.4-mini',
    modelName: 'GPT-5.4 Mini',
    columns: [{ key: 'topic' }],
    courseMap: { lessons: [{ title: 'Do not export' }] },
  },
};

describe('developerTemplateExchange', () => {
  it('creates a sanitized template bundle', () => {
    const bundle = createDeveloperTemplateBundle([template], 123);

    expect(bundle).toEqual({
      kind: DEVELOPER_TEMPLATE_BUNDLE_KIND,
      formatVersion: 1,
      exportedAt: 123,
      templates: [
        {
          name: 'Slides Setup',
          data: {
            selectedFeatures: ['courseMap', 'slideDecks'],
            deliverableConfig: { slideDecks: { extraInstructions: 'Visual' } },
            lessonScope: { type: 'all' },
            slideTheme: 2,
            provider: 'openai',
            modelId: 'gpt-5.4-mini',
            modelName: 'GPT-5.4 Mini',
            columns: [{ key: 'topic' }],
          },
        },
      ],
    });
  });

  it('round-trips bundle JSON', () => {
    const raw = stringifyDeveloperTemplateBundle([template], 123);
    const parsed = parseDeveloperTemplateBundle(raw);

    expect(parsed.warnings).toEqual([]);
    expect(parsed.templates).toHaveLength(1);
    expect(parsed.templates[0].name).toBe('Slides Setup');
    expect(parsed.templates[0].data.courseMap).toBeUndefined();
  });

  it('accepts a single template object and adds courseMap', () => {
    const parsed = parseDeveloperTemplateBundle({
      name: 'Single',
      selectedFeatures: ['quizBank'],
      deliverableConfig: {},
    });

    expect(parsed.templates[0]).toEqual(
      expect.objectContaining({
        name: 'Single',
        data: expect.objectContaining({
          selectedFeatures: ['courseMap', 'quizBank'],
        }),
      }),
    );
  });

  it('rejects invalid or empty imports', () => {
    expect(() => parseDeveloperTemplateBundle('{')).toThrow('Template import JSON is invalid');
    expect(() => parseDeveloperTemplateBundle({ templates: [] })).toThrow('did not contain');
  });

  it('rejects imported templates containing secrets', () => {
    expect(() =>
      parseDeveloperTemplateBundle({
        name: 'Unsafe',
        selectedFeatures: ['slideDecks'],
        deliverableConfig: {
          slideDecks: {
            apiKey: 'sk-secret-value',
          },
        },
      }),
    ).toThrow('contains a secret');
  });
});
