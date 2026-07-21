import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { createKernelLibrary } from '../kernelLibrary.js';
import { kernelIsFullyAnchored } from '../kernelSchema.js';
import { runGenomeLinker } from '../runGenomeLinker.js';

const BIO_SHARD = JSON.parse(fs.readFileSync('public/genome/bio-intro.json', 'utf8'));
const GENOME_MANIFEST = JSON.parse(fs.readFileSync('public/genome/manifest.json', 'utf8'));

const GENETICS_LESSON_TITLES = [
  'Mendelian Inheritance Basics',
  'Meiosis Mechanics',
  'DNA Structure and Replication',
  'Transcription Processes',
  'Translation Mechanisms',
  'Gene Regulation Control',
  'Mutation Types',
  'Molecular Genetics Methods',
  'Genome Editing Techniques',
  'Population Genetics Theory',
  'Quantitative Genetics Principles',
  'Epigenetic Modifications',
  'Model-Organism Investigation',
  'Cumulative Genetics Investigation',
  'Advanced Genetic Application',
];

const GENETICS_MAP = {
  courseName: 'Introduction to Genetics',
  lessons: GENETICS_LESSON_TITLES.map((title, index) => ({
    title: `Lesson ${index + 1}: ${title}`,
    sections: [
      {
        topicSection: `${index + 1}.1: ${title}`,
        learningObjectives: [`Analyze ${title} using course evidence`],
      },
    ],
  })),
};

describe('source-backed introductory Genetics genome', () => {
  it('ships 15 fully anchored public-domain NHGRI concepts', () => {
    const geneticsKernels = BIO_SHARD.kernels.filter((kernel) =>
      kernel.attribution?.includes('National Human Genome Research Institute'),
    );

    expect(BIO_SHARD.conceptCount).toBe(23);
    expect(geneticsKernels).toHaveLength(15);
    expect(geneticsKernels.every(kernelIsFullyAnchored)).toBe(true);
    expect(geneticsKernels.every((kernel) => kernel.license === 'U.S. Government Work')).toBe(true);
    expect(GENOME_MANIFEST.references['nhgri:mendelian-inheritance']).toMatchObject({
      displayTitle: 'Mendelian Inheritance',
      sourceUrl: 'https://www.genome.gov/genetics-glossary/Mendelian-Inheritance',
    });
    expect(GENOME_MANIFEST.references['nhgri:epigenomics']).toMatchObject({
      displayTitle: 'Epigenomics Fact Sheet',
      sourceUrl: 'https://www.genome.gov/about-genomics/fact-sheets/Epigenomics-Fact-Sheet',
    });
  });

  it('adds a trusted concept overlay to every lesson in the live 15-lesson Genetics course', () => {
    const library = createKernelLibrary();
    library.addKernels(BIO_SHARD.kernels, { source: 'shard' });
    const linked = runGenomeLinker({
      courseMap: GENETICS_MAP,
      lessonIndices: GENETICS_MAP.lessons.map((_, index) => index),
      library,
      itemPlan: Array.from({ length: 4 }, (_, index) => ({ index, type: 'multiple_choice', bloom: 'Apply' })),
      sourceReferences: GENOME_MANIFEST.references,
    });

    expect(linked.telemetry.resolvedFromGenome).toBe(15);
    expect(linked.telemetry.partialFromGenome).toBe(15);
    expect(linked.missingIndices).toEqual(GENETICS_MAP.lessons.map((_, index) => index));
    for (let index = 0; index < GENETICS_MAP.lessons.length; index += 1) {
      const lesson = linked.lessonContent[`lesson-${index + 1}`];
      expect(lesson.enrichmentSource).toBe('genome-linked');
      expect(lesson.conceptProvenance.conceptIds.length).toBeGreaterThan(0);
      expect(lesson.conceptProvenance.citations.length).toBeGreaterThan(0);
      expect(lesson.conceptProvenance.citations.every((citation) => citation.sourceUrl?.startsWith('https://'))).toBe(
        true,
      );
    }
  });
});
