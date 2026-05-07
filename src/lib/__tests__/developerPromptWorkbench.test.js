import { describe, expect, it } from 'vitest';
import {
  analyzeDeveloperPrompt,
  estimatePromptTokens,
  extractPromptPlaceholders,
  summarizePromptDiff,
} from '../developerPromptWorkbench';

describe('developerPromptWorkbench', () => {
  it('estimates tokens from prompt text', () => {
    expect(estimatePromptTokens('abcd')).toBe(1);
    expect(estimatePromptTokens('abcde')).toBe(2);
    expect(estimatePromptTokens('')).toBe(0);
  });

  it('extracts placeholders and marks exact replaceability', () => {
    expect(extractPromptPlaceholders('Use {{courseMap}} and {{ courseMap }} and {{foo}}')).toEqual([
      {
        raw: '{{courseMap}}',
        name: 'courseMap',
        supported: true,
        exact: true,
      },
      {
        raw: '{{ courseMap }}',
        name: 'courseMap',
        supported: true,
        exact: false,
      },
      {
        raw: '{{foo}}',
        name: 'foo',
        supported: false,
        exact: false,
      },
    ]);
  });

  it('warns when a custom user prompt will omit course content', () => {
    const analysis = analyzeDeveloperPrompt({
      systemPrompt: 'You are a helpful course design assistant.',
      userPrompt: 'Generate a quiz.',
      hasUserOverride: true,
    });

    expect(analysis.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        level: 'warning',
        actionId: 'insertCourseMap',
      }),
    ]));
  });

  it('summarizes built-in versus active prompt deltas', () => {
    expect(summarizePromptDiff('short prompt', 'short prompt plus more')).toEqual(expect.objectContaining({
      changed: true,
      tokenDelta: expect.any(Number),
      wordDelta: 2,
    }));
  });
});
