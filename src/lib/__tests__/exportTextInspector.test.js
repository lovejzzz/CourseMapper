import { describe, expect, it } from 'vitest';

import { findInternalTextInString, sanitizeInternalExportLanguage } from '../exportTextInspector.js';

describe('internal export text boundary', () => {
  it.each([
    ['fact-ledger-projection', 'fact-ledger projection'],
    ['verified-quiz-projection', 'verified-quiz projection'],
    ['Existing course map fields.', 'course-map source placeholder'],
  ])('detects %s as internal language', (value, label) => {
    expect(findInternalTextInString(value)).toEqual({ label });
  });

  it('turns internal provenance into readable backup copy before an Office export', () => {
    const clean = sanitizeInternalExportLanguage(
      'Use fact-ledger-projection with verified-quiz-projection and Existing course map fields.',
    );

    expect(clean).toBe('Use course evidence with course evidence and course plan and instructor notes.');
    expect(findInternalTextInString(clean)).toBeNull();
  });
});
