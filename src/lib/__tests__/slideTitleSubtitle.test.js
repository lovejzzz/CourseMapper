import { describe, expect, it } from 'vitest';
import { isSubstantiveSlideSubtitle } from '../exporters/slideTitleSubtitle.js';

describe('title-slide subtitle admission', () => {
  it('omits an English concept dump without deleting ordinary authored subtitles', () => {
    expect(
      isSubstantiveSlideSubtitle('Capstone Policy Memo, Correlation vs. Causation Distinction, Data cleansing', {
        title: 'Lesson 6: Capstone Policy Memo',
      }),
    ).toBe(false);
    expect(
      isSubstantiveSlideSubtitle('Capstone Policy Memo, Correlation vs. Causation Distinction, Data cleansing'),
    ).toBe(true);
    expect(isSubstantiveSlideSubtitle('A course subtitle line')).toBe(true);
    expect(isSubstantiveSlideSubtitle('Compare evidence before revising the final memo')).toBe(true);
  });

  it('preserves non-English subtitle content without requiring English punctuation or verbs', () => {
    expect(isSubstantiveSlideSubtitle('比较证据并修改最终政策备忘录')).toBe(true);
    expect(isSubstantiveSlideSubtitle('Comparer les preuves avant la révision finale')).toBe(true);
    expect(isSubstantiveSlideSubtitle('Data, model, analisis', { title: 'Analisis Kebijakan' })).toBe(true);
    expect(isSubstantiveSlideSubtitle('Bukti, konteks, revisi akhir', { title: 'Kursus Menulis' })).toBe(true);
  });
});
