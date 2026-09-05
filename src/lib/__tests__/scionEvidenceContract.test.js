import { describe, expect, it } from 'vitest';

import {
  extractScionNumberedSourceClaims,
  scionFactContractForLesson,
  scionFactCountForPrompt,
  scionPromptUsesSourceLedger,
} from '../scionEvidenceContract.js';
import { compactLessonKernelSchemaProfile } from '../scionContracts.js';

const LEDGER_LESSON = {
  lessonId: 'lesson-3',
  sourceFactPolicy: 'numbered-source-ledger-v1',
  topics:
    'Claim 0: Currents produce magnetic fields. Claim 1: Field lines form closed loops around a current. Claim 2: Moving charges experience magnetic influence in a field.',
};

describe('Scion source fact ledger', () => {
  it('activates only with explicit compiler provenance and preserves source order', () => {
    expect(extractScionNumberedSourceClaims(LEDGER_LESSON)).toEqual([
      'Currents produce magnetic fields.',
      'Field lines form closed loops around a current.',
      'Moving charges experience magnetic influence in a field.',
    ]);
    expect(scionFactContractForLesson(LEDGER_LESSON)).toMatchObject({
      mode: 'numbered-source-ledger-v1',
      factCount: 3,
    });
    expect(scionFactContractForLesson({ ...LEDGER_LESSON, sourceFactPolicy: undefined })).toEqual({
      mode: 'authored-five-v1',
      factCount: 5,
      claims: [],
    });
  });

  it('accepts compiler-owned direct facts without encoding them into topic prose', () => {
    const lesson = {
      lessonId: 'lesson-2',
      sourceFactPolicy: 'numbered-source-ledger-v1',
      topics: 'Magnetic field relationships',
      sourceFacts: [
        'Currents produce magnetic fields.',
        'Field lines form closed loops around a current.',
        'Moving charges experience magnetic influence in a field.',
      ],
    };
    expect(extractScionNumberedSourceClaims(lesson)).toEqual(lesson.sourceFacts);
    expect(scionFactContractForLesson(lesson)).toMatchObject({ factCount: 3, claims: lesson.sourceFacts });
  });

  it('keeps frozen five-fact prompts backward compatible', () => {
    expect(
      scionFactContractForLesson(LEDGER_LESSON, {
        userPrompt: '- Write 5 facts per lesson.',
      }),
    ).toEqual({ mode: 'authored-five-v1', factCount: 5, claims: [] });
  });

  it('narrows schema counts and citation indexes to the evidence density', () => {
    const factCount = scionFactCountForPrompt({ lessons: [LEDGER_LESSON], userPrompt: 'SOURCE FACT LEDGER' }, [
      'lesson-3',
    ]);
    const profile = compactLessonKernelSchemaProfile({ expectedLessonIds: ['lesson-3'], factCount });
    const lesson = profile.schema.properties.lessons.items;

    expect(factCount).toBe(3);
    expect(lesson.properties.facts).toMatchObject({ minItems: 3, maxItems: 3 });
    expect(lesson.properties.mc.items.properties.fi).toMatchObject({ maxItems: 2 });
    expect(lesson.properties.mc.items.properties.fi.items.maximum).toBe(2);
    expect(
      scionPromptUsesSourceLedger({ lessons: [LEDGER_LESSON], userPrompt: 'SOURCE FACT LEDGER' }, ['lesson-3']),
    ).toBe(true);
    expect(
      scionPromptUsesSourceLedger({ lessons: [{ lessonId: 'lesson-3', topics: 'Ordinary topic' }] }, ['lesson-3']),
    ).toBe(false);
  });

  it('rejects sparse, out-of-order, and fragmentary ledgers', () => {
    expect(
      extractScionNumberedSourceClaims({
        topics: 'Claim 0: A complete supported statement. Claim 2: Another complete supported statement.',
      }),
    ).toEqual([]);
    expect(
      extractScionNumberedSourceClaims({
        topics: 'Claim 0: Too short. Claim 1: Another statement. Claim 2: Third statement.',
      }),
    ).toEqual([]);
  });
});
