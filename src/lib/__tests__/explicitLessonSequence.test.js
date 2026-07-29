import { describe, expect, it } from 'vitest';
import { extractExplicitLessonSequence } from '../explicitLessonSequence.js';

describe('extractExplicitLessonSequence', () => {
  it('recognizes an exact counted in-order lesson contract with semicolon boundaries', () => {
    const sequence = extractExplicitLessonSequence(
      'Use exactly these six lessons in order: 1) Framing a data question and stakeholder stakes; ' +
        '2) Data provenance, consent, and missing voices; ' +
        '3) Cleaning a public-transit reliability dataset; ' +
        '4) Choosing honest visual encodings and scales; ' +
        '5) Building a narrative sequence that communicates uncertainty; ' +
        '6) Public critique, revision, and publication.',
    );

    expect(sequence).toEqual([
      'Framing a data question and stakeholder stakes',
      'Data provenance, consent, and missing voices',
      'Cleaning a public-transit reliability dataset',
      'Choosing honest visual encodings and scales',
      'Building a narrative sequence that communicates uncertainty',
      'Public critique, revision, and publication',
    ]);
  });

  it('does not turn an ordinary unordered topic list into a lesson sequence', () => {
    expect(extractExplicitLessonSequence('Cover sources, cleaning, charts, uncertainty, and revision.')).toEqual([]);
  });
});
