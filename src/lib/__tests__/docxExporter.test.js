import { describe, expect, it } from 'vitest';
import { formatAssessmentBlockEntry, mastheadTitleSize } from '../exporters/docxExporter.js';

describe('DOCX masthead sizing', () => {
  it('shrinks long titles using course-agnostic length tiers', () => {
    expect(mastheadTitleSize('Short course title')).toBe(36);
    expect(mastheadTitleSize('x'.repeat(73))).toBe(32);
    expect(mastheadTitleSize('x'.repeat(97))).toBe(28);
  });

  it('normalizes repeated whitespace before choosing a tier', () => {
    expect(mastheadTitleSize(`  ${'x'.repeat(70)}   `)).toBe(36);
  });
});

describe('DOCX assessment labels', () => {
  it('does not print the same assessment percentage twice', () => {
    expect(
      formatAssessmentBlockEntry({
        title: 'Translation Mediation interpretation (7%)',
        weight: '7%',
      }),
    ).toBe('Translation Mediation interpretation (7%)');
  });

  it('still prints separately stored weights and in-class status', () => {
    expect(formatAssessmentBlockEntry({ title: 'Translation Mediation interpretation', weight: '7%' })).toBe(
      'Translation Mediation interpretation (7%)',
    );
    expect(formatAssessmentBlockEntry({ title: 'Close-reading clinic', weight: 'in class' })).toBe(
      'Close-reading clinic — in class',
    );
  });
});
