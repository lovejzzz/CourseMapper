import { describe, expect, it } from 'vitest';
import { detectOffDisciplineReadingDomain } from '../deepQualityGrader.js';

describe('deep quality reading-domain markers', () => {
  const uxCourse = { id: 'ux-design', title: 'User Experience Design Studio' };

  it('does not classify a research method as clinical without clinical subject evidence', () => {
    expect(
      detectOffDisciplineReadingDomain(
        'A Systematic Review of Design Creativity in the Architectural Design Studio',
        uxCourse,
      ),
    ).toBe('architecture');
    expect(detectOffDisciplineReadingDomain('A systematic review of interaction design patterns', uxCourse)).toBeNull();
  });

  it('names the actual foreign domain and exempts courses in that domain', () => {
    const sonification = 'A Systematic Review of Mapping Strategies for the Sonification of Physical Quantities';
    expect(detectOffDisciplineReadingDomain(sonification, uxCourse)).toBe('audio');
    expect(detectOffDisciplineReadingDomain(sonification, { title: 'Music and Sonification Studio' })).toBeNull();
  });

  it('retains clinical detection when the title contains clinical subject evidence', () => {
    expect(
      detectOffDisciplineReadingDomain(
        'A systematic literature review of clinical interventions for patient diagnosis',
        uxCourse,
      ),
    ).toBe('clinical-methods');
  });
});
