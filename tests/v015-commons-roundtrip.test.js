/**
 * v0.15 F2/F3 — the flywheel feeds the commons: extracted kernels round-trip
 * into a SHIPPED shard.
 *
 * The Beginning Korean 8 (extracted live by the v0.14.9 A3 proof, citations
 * provider-verified) became scripts/foundry/sources/lang-contributed.json →
 * validateSource 8/8 → buildShards → public/genome/lang-intro.json. The
 * 'lang' discipline — the last 0-link family in the ten-course net — now has
 * a shard EVERY user links against, not one browser's cache.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createKernelLibrary } from '../src/lib/genome/kernelLibrary.js';
import { runGenomeLinker } from '../src/lib/genome/runGenomeLinker.js';
import { inferCourseDisciplines, uncoveredDisciplinesForManifest } from '../src/lib/genome/libraryShardLoader.js';
import { buildContributionSource, readExtractedKernels } from '../src/lib/genome/contributeKernels.js';

const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/manifest.json'), 'utf8'));

function genomeLibrary() {
  const map = new Map();
  const library = createKernelLibrary({
    storage: { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v) },
  });
  for (const shard of manifest.shards) {
    const body = JSON.parse(readFileSync(join(process.cwd(), 'public/genome', shard.path), 'utf8'));
    library.addKernels(body.kernels, { source: 'shard' });
  }
  return library;
}

const KOREAN_COURSE = {
  courseName: 'Beginning Korean I',
  lessons: [
    ['Hangul Foundations', 'hangul consonants vowels syllable blocks alphabet'],
    ['Pronunciation', 'korean pronunciation sound patterns sound rules'],
    ['Greetings and Introductions', 'basic greetings self-introduction polite expressions'],
    ['Numbers and Counting', 'korean numbers counting systems counters age'],
    ['Particles and Sentences', 'subject markers particles basic korean sentence structure'],
    ['Present Tense Verbs', 'present tense verb conjugation non-past forms verb stems'],
    ['Honorifics', 'honorifics politeness levels speech levels polite forms'],
    ['Asking Questions', 'question forms interrogatives question endings'],
    ['Food and Ordering', 'restaurant vocabulary ordering food menu phrases'],
    ['Daily Routines', 'daily routine vocabulary time expressions schedules'],
    ['Simple Past Tense', 'past tense markers yesterday narration'],
    ['Conversation Project', 'final conversation script performance review'],
  ].map(([title, topics], index) => ({
    title: `Lesson ${index + 1}: ${title}`,
    sections: [
      {
        topicSection: `${index + 1}.1: ${topics}`,
        learningObjectives: `Apply ${topics} in practice.`,
        weeklyAssessments: `Check ${index + 1}.`,
      },
    ],
  })),
};

describe('F3 — the lang shard ships and links', () => {
  it('lang-intro carries the contributed 8, tier-1, anchor-less, attributed', () => {
    const shard = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/lang-intro.json'), 'utf8'));
    expect(shard.kernels.length).toBeGreaterThanOrEqual(8);
    for (const kernel of shard.kernels) {
      expect(kernel.definition?.tier, kernel.id).toBe(1); // consensus, never source-anchored
      expect(kernel.definition?.anchor, kernel.id).toBeFalsy();
      expect((kernel.attribution || []).length, kernel.id).toBeGreaterThan(0);
    }
  });

  it('lang is no longer an uncovered discipline', () => {
    expect(uncoveredDisciplinesForManifest(manifest, ['lang'])).toEqual([]);
  });

  it('a Korean course infers lang and links 6+/12 lessons from the shard', () => {
    expect(inferCourseDisciplines(KOREAN_COURSE)).toContain('lang');
    const library = genomeLibrary();
    const linked = runGenomeLinker({
      courseMap: KOREAN_COURSE,
      lessonIndices: KOREAN_COURSE.lessons.map((_, i) => i),
      library,
    });
    const resolved = linked.telemetry.resolvedFromGenome + linked.telemetry.resolvedFromCache;
    expect(resolved).toBeGreaterThanOrEqual(6);
  });
});

describe('F2 — the contribution package', () => {
  it('builds the exact foundry source shape with the review contract stated', () => {
    const kernels = [{ id: 'lang/hangul-foundations', term: 'Hangul Foundations' }];
    const source = buildContributionSource(kernels, { appVersion: '0.15.0' });
    expect(source.sourceSnapshots).toEqual({});
    expect(source.kernels).toEqual(kernels);
    expect(source._comment).toContain('HUMAN REVIEW REQUIRED');
    expect(source._comment).toContain('coverage references, not quoted sources');
  });

  it('reads the extraction cache defensively', () => {
    expect(readExtractedKernels(null)).toEqual([]);
    expect(readExtractedKernels({ getItem: () => 'not json' })).toEqual([]);
    expect(readExtractedKernels({ getItem: () => JSON.stringify({ kernels: [{ id: 'x/y' }] }) })).toEqual([
      { id: 'x/y' },
    ]);
  });

  it('the workspace More menu carries the contribute action (source scan)', () => {
    const appFlow = readFileSync(join(process.cwd(), 'src/AppFlow.jsx'), 'utf8');
    expect(appFlow).toContain('workspace-menu-contribute-kernels');
    expect(appFlow).toContain('downloadContribution({ appVersion: APP_VERSION })');
  });
});
