import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { createKernelLibrary } from '../kernelLibrary.js';
import { runGenomeLinker } from '../runGenomeLinker.js';

const CHEM_SHARD = JSON.parse(fs.readFileSync('public/genome/chem-intro.json', 'utf8'));
const GENOME_MANIFEST = JSON.parse(fs.readFileSync('public/genome/manifest.json', 'utf8'));

const WATER_QUALITY_MAP = {
  courseName: 'Environmental Chemistry',
  lessons: [
    {
      title: 'Lesson 1: Water Quality',
      sections: [
        {
          topicSection: '1.1: Water Quality',
          learningObjectives: ['Evaluate water quality metrics', 'Design water quality tests'],
        },
      ],
    },
  ],
};

describe('source-backed environmental chemistry genome', () => {
  it('ships three EPA-anchored environmental chemistry concepts', () => {
    expect(CHEM_SHARD.conceptCount).toBe(6);
    expect(CHEM_SHARD.kernels.map((kernel) => kernel.id)).toEqual(
      expect.arrayContaining(['chem/water-quality-monitoring', 'chem/dissolved-oxygen', 'chem/water-sampling-design']),
    );
    expect(GENOME_MANIFEST.references['epa:water-quality-parameters']).toMatchObject({
      displayTitle: 'Factsheets on Water Quality Parameters',
      sourceUrl: 'https://www.epa.gov/awma/factsheets-water-quality-parameters',
    });
  });

  it('fully resolves a water-quality lesson with three cited concepts', () => {
    const library = createKernelLibrary();
    library.addKernels(CHEM_SHARD.kernels, { source: 'shard' });
    const linked = runGenomeLinker({
      courseMap: WATER_QUALITY_MAP,
      lessonIndices: [0],
      library,
      itemPlan: Array.from({ length: 4 }, (_, index) => ({ index, type: 'multiple_choice', bloom: 'Apply' })),
      sourceReferences: GENOME_MANIFEST.references,
    });

    expect(linked.telemetry).toMatchObject({ resolvedFromGenome: 1, conceptHits: 3 });
    expect(linked.missingIndices).toEqual([]);
    expect(linked.lessonContent['lesson-1'].conceptProvenance.conceptIds).toEqual([
      'chem/water-quality-monitoring',
      'chem/dissolved-oxygen',
      'chem/water-sampling-design',
    ]);
    expect(linked.lessonContent['lesson-1'].conceptProvenance.citations.length).toBeGreaterThanOrEqual(3);
  });

  it('upgrades an older model-only cache entry when complete cited coverage becomes available', () => {
    const library = createKernelLibrary();
    library.addKernels(CHEM_SHARD.kernels, { source: 'shard' });
    const linked = runGenomeLinker({
      courseMap: WATER_QUALITY_MAP,
      lessonIndices: [0],
      library,
      cache: {
        get: () => ({
          enrichmentSource: 'model-kernel',
          keyTerms: [{ term: 'Uncited cached term', definition: 'An older local model-only result.' }],
          quizItems: [],
        }),
      },
      itemPlan: Array.from({ length: 4 }, (_, index) => ({ index, type: 'multiple_choice', bloom: 'Apply' })),
      sourceReferences: GENOME_MANIFEST.references,
    });

    expect(linked.telemetry).toMatchObject({ resolvedFromGenome: 1, resolvedFromCache: 0, conceptHits: 3 });
    expect(linked.lessonContent['lesson-1'].enrichmentSource).toBe('genome-linked');
    expect(linked.lessonContent['lesson-1'].keyTerms.map((term) => term.term)).not.toContain('Uncited cached term');
  });
});
