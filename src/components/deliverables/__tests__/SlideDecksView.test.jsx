import { describe, expect, it } from 'vitest';
import { compactSlideThumbnailText } from '../SlideDecksView';

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
