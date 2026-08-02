import { describe, expect, it } from 'vitest';

import { findInternalTextInString, sanitizeInternalExportLanguage } from '../exportTextInspector.js';

describe('internal export text boundary', () => {
  it.each([
    ['fact-ledger-projection', 'fact-ledger projection'],
    ['verified-quiz-projection', 'verified-quiz projection'],
    ['Existing course map fields.', 'course-map source placeholder'],
    ['Use the cited source claim.', 'opaque source-claim placeholder'],
    ['Emphasize the claim. in concrete language.', 'mechanical sentence seam'],
    ['Test this admitted claim before deciding: evidence.', 'compiler-owned admitted-claim shell'],
    ['Compare “(the earlier source claim on Accuracy”.', 'malformed compacted source reference'],
    ['Revisit the earlier source claim on By bridging GMT.', 'malformed compacted source reference'],
    ['Use the earlier source claim on PyGMT).', 'malformed compacted source reference'],
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
