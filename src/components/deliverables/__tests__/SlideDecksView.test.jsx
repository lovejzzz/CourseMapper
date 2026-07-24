import { describe, expect, it } from 'vitest';
import { compactSlideThumbnailText, computeSlidePreviewScale } from '../SlideDecksView';

describe('slide deck thumbnail copy', () => {
  it('uses the slide title and shortens it without cutting a word in half', () => {
    const result = compactSlideThumbnailText(
      'Modeling chemical reactions allows for the conservation of atoms and mass',
      40,
    );

    expect(result).toBe('Modeling chemical reactions allows for…');
    expect(result).not.toContain('allows for t');
  });

  it('keeps short labels unchanged', () => {
    expect(compactSlideThumbnailText('Chemical reaction model')).toBe('Chemical reaction model');
  });
});

describe('computeSlidePreviewScale', () => {
  it('scales the complete fixed slide artboard inside a narrow workspace', () => {
    expect(computeSlidePreviewScale(384)).toBe(0.5);
    expect(computeSlidePreviewScale(576)).toBe(0.75);
  });

  it('never enlarges the artboard or emits an invalid scale', () => {
    expect(computeSlidePreviewScale(1024)).toBe(1);
    expect(computeSlidePreviewScale(0)).toBe(1);
    expect(computeSlidePreviewScale(Number.NaN)).toBe(1);
  });
});
