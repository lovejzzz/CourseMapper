import { describe, expect, it } from 'vitest';
import { formatAssessmentBlockEntry } from '../exporters/docxExporter.js';

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
