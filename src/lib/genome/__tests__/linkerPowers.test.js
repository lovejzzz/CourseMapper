import { describe, expect, it } from 'vitest';
import { auditPrerequisites } from '../prerequisiteAudit.js';
import { buildGlossaryGraph } from '../glossaryGraph.js';
import { createKernelLibrary } from '../kernelLibrary.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
  };
}

function libraryWith(kernels) {
  const lib = createKernelLibrary({ storage: memoryStorage() });
  for (const kernel of kernels) lib.addKernel(kernel);
  return lib;
}

const SAMPLING = {
  id: 'stats/sampling-distribution',
  term: 'Sampling distribution',
  definition: { text: 'The probability distribution of a statistic across many samples from a population.' },
  facts: [{ text: 'The central limit theorem makes it approach normal as n grows.' }],
};
const PVALUE = {
  id: 'stats/p-value',
  term: 'p-value',
  definition: { text: 'The probability of data at least as extreme as observed, assuming the null is true.' },
  facts: [{ text: 'A small p-value means the data would be unlikely under the null.' }],
  edges: { requires: ['stats/sampling-distribution'] },
};

describe('auditPrerequisites', () => {
  it('flags a missing prerequisite the course never teaches', () => {
    const library = libraryWith([PVALUE]); // sampling-distribution kernel absent from course
    const perLesson = [{ lessonIndex: 0, conceptRefs: [{ id: 'stats/p-value' }] }];
    const { findings } = auditPrerequisites(perLesson, library);
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe('missing-prerequisite');
    expect(findings[0].prerequisiteId).toBe('stats/sampling-distribution');
  });

  it('flags a prerequisite taught later in the course (out of order)', () => {
    const library = libraryWith([SAMPLING, PVALUE]);
    const perLesson = [
      { lessonIndex: 0, conceptRefs: [{ id: 'stats/p-value' }] },
      { lessonIndex: 1, conceptRefs: [{ id: 'stats/sampling-distribution' }] },
    ];
    const { findings } = auditPrerequisites(perLesson, library);
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe('out-of-order');
    expect(findings[0].introducedAtLesson).toBe(1);
  });

  it('passes a correctly sequenced course', () => {
    const library = libraryWith([SAMPLING, PVALUE]);
    const perLesson = [
      { lessonIndex: 0, conceptRefs: [{ id: 'stats/sampling-distribution' }] },
      { lessonIndex: 1, conceptRefs: [{ id: 'stats/p-value' }] },
    ];
    expect(auditPrerequisites(perLesson, library).findings).toEqual([]);
  });
});

describe('buildGlossaryGraph', () => {
  it('keeps one canonical definition and emits spiral references for repeats', () => {
    const library = libraryWith([SAMPLING, PVALUE]);
    const perLesson = [
      { lessonIndex: 0, conceptRefs: [{ id: 'stats/sampling-distribution' }] },
      { lessonIndex: 2, conceptRefs: [{ id: 'stats/sampling-distribution' }, { id: 'stats/p-value' }] },
    ];
    const { glossary, spiralReferences } = buildGlossaryGraph(perLesson, library);
    expect(glossary.find((g) => g.id === 'stats/sampling-distribution').firstLesson).toBe(0);
    expect(spiralReferences.get(2).some((ref) => ref.conceptId === 'stats/sampling-distribution')).toBe(true);
    expect(spiralReferences.get(2)[0].note).toContain('Lesson 1');
  });
});
