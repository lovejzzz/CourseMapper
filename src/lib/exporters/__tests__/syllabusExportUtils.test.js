import { describe, expect, it } from 'vitest';
import { formatRequiredText } from '../syllabusExportUtils.js';

describe('syllabus export text formatting', () => {
  it('joins complete scholarly metadata without double-period seams', () => {
    const formatted = formatRequiredText({
      author:
        'HOU Mingyi, YANG Yu, LI Zheng, et al. (2025). Characteristics of the Diatom Community in Natural Biofilms. DOAJ metadata.',
      title: 'Characteristics of the Diatom Community in Natural Biofilms.',
      note: 'Open scholarly article.',
    });

    expect(formatted).not.toContain('..');
    expect(formatted).toContain('DOAJ metadata. Characteristics');
  });
});
