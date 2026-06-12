/**
 * V0.14.7 WS-E (E2) proof — on-miss kernel extraction, flag-gated, default OFF.
 *
 * Contracts under test (roadmap E2: "no extraction call ever runs without
 * the flag; nothing model-invented persists unverified"):
 *
 *  (1) Flag off → shouldOfferExtraction never offers, whatever the misses;
 *      runOnMissGenomeExtraction never calls the model.
 *  (2) Citation verification drops model-invented citations: a mock provider
 *      returning no match (or an off-title match) rejects the candidate
 *      entirely — zero verified citations means nothing persists.
 *  (3) Admitted entries match the REAL shard schema: same key set as a
 *      kernel entry in public/genome/psych-intro.json (what buildShards.mjs
 *      emits), every atom capped at T1 with anchors stripped — extracted
 *      knowledge can never impersonate source-anchored (T2) genome content.
 *  (4) buildExtractionPrompt contains the word "JSON" (provider JSON-mode
 *      requirement) and the concept/course context.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  GENOME_EXTRACTION_FLAG,
  buildExtractionPrompt,
  isExtractionFlagEnabled,
  parseExtractionCandidates,
  runOnMissGenomeExtraction,
  shouldOfferExtraction,
  toCachedShardEntries,
  verifyAndAdmitCandidates,
} from '../src/lib/knowledge/genomeExtraction.js';
import { createKernelLibrary } from '../src/lib/genome/kernelLibrary.js';
import { TRUST_TIERS } from '../src/lib/genome/kernelSchema.js';

const missLinkResult = {
  missingIndices: [2, 5, 9],
  telemetry: { misses: 3, resolvedFromGenome: 1, resolvedFromCache: 0 },
};

function candidate(overrides = {}) {
  return {
    id: 'math/related-rates',
    term: 'Related rates',
    aliases: ['related-rates problems'],
    tags: ['derivatives', 'applications'],
    level: 'intro',
    difficulty: 3,
    bloomCeiling: 'Apply',
    definition: {
      text: 'A related-rates problem links the rates of change of two or more quantities through an equation relating the quantities, then differentiates with respect to time.',
    },
    facts: [
      { text: 'Differentiating both sides of the relating equation with respect to time links the rates.' },
      { text: 'Substituting known values before differentiating destroys the variable relationship.' },
    ],
    misconceptions: [
      {
        text: 'Students substitute the known instant values before differentiating.',
        corrective: 'Differentiate the general relationship first; substitute the instant values only afterward.',
      },
    ],
    workedExample: {
      problem:
        'A 10 ft ladder slides down a wall; the base moves away at 2 ft/s. How fast does the top fall when the base is 6 ft out?',
      steps: [
        'Relate sides: x^2 + y^2 = 100.',
        'Differentiate: 2x dx/dt + 2y dy/dt = 0.',
        'Substitute x=6, y=8, dx/dt=2.',
      ],
      result: 'dy/dt = -1.5 ft/s',
    },
    edges: { requires: ['math/the-chain-rule'] },
    citationCandidates: [
      { kind: 'book', title: 'Calculus Volume 1', authors: 'Gilbert Strang, Edwin Herman', year: 2016 },
      {
        kind: 'scholarly',
        title: 'Totally Fabricated Related Rates Compendium of 1842',
        authors: 'N. O. Body',
        year: 1842,
      },
    ],
    ...overrides,
  };
}

/** Providers whose results match only the real citation, never the invented one. */
function matchingProviders() {
  return {
    searchScholarlyReadings: vi.fn(async () => []),
    searchBookMetadata: vi.fn(async (query) =>
      /calculus volume 1/i.test(query)
        ? [
            {
              provider: 'openlibrary',
              kind: 'book',
              title: 'Calculus Volume 1',
              authors: 'Gilbert Strang, Edwin Herman',
              year: 2016,
              url: 'https://openlibrary.org/works/OL17861830W',
              license: 'Open Library public metadata',
              attribution: 'Open Library, Internet Archive',
            },
          ]
        : [],
    ),
  };
}

/** Providers that never match anything — the model invented every citation. */
function noMatchProviders() {
  return {
    searchScholarlyReadings: vi.fn(async () => [
      {
        title: 'An Entirely Different Paper About Soil Microbiomes',
        url: 'x',
        license: 'cc-by',
        attribution: 'OpenAlex',
      },
    ]),
    searchBookMetadata: vi.fn(async () => []),
  };
}

describe('flag gate (E2: default OFF, no call without the flag)', () => {
  it('exports the roadmap flag key verbatim', () => {
    expect(GENOME_EXTRACTION_FLAG).toBe('coursemapper-genome-extract');
  });

  it('flag off → never offers, even with real misses', () => {
    for (const flagValue of [undefined, null, '', '0', 'false', 'off', 'yes-ish-garbage']) {
      expect(isExtractionFlagEnabled(flagValue)).toBe(false);
      expect(shouldOfferExtraction({ flagValue, linkResult: missLinkResult })).toBe(false);
    }
  });

  it('flag on but zero misses → not offered; flag on with misses → offered', () => {
    const cleanRun = { missingIndices: [], telemetry: { misses: 0 } };
    expect(shouldOfferExtraction({ flagValue: 'true', linkResult: cleanRun })).toBe(false);
    expect(shouldOfferExtraction({ flagValue: 'true', linkResult: missLinkResult })).toBe(true);
    expect(shouldOfferExtraction({ flagValue: '1', linkResult: missLinkResult })).toBe(true);
    expect(shouldOfferExtraction({ flagValue: true, linkResult: missLinkResult })).toBe(true);
    expect(shouldOfferExtraction({ flagValue: 'true' })).toBe(false); // no link result → no offer
  });

  it('runOnMissGenomeExtraction never calls the model when the flag is off', async () => {
    const callModel = vi.fn(async () => '[]');
    const result = await runOnMissGenomeExtraction({
      flagValue: 'off',
      linkResult: missLinkResult,
      conceptNames: ['Related rates'],
      callModel,
      providers: matchingProviders(),
    });
    expect(callModel).not.toHaveBeenCalled();
    expect(result).toEqual({ offered: false, candidateCount: 0, admitted: [], rejected: [], entries: [] });
  });
});

describe('prompt shape (E2: candidates as JSON)', () => {
  it('contains the word "JSON", the concepts, and the course context', () => {
    const prompt = buildExtractionPrompt({
      conceptNames: ['Related rates', 'Implicit differentiation'],
      courseTitle: 'Calculus I',
      discipline: 'math',
    });
    expect(prompt).toContain('JSON');
    expect(prompt).toContain('Related rates');
    expect(prompt).toContain('Implicit differentiation');
    expect(prompt).toContain('Calculus I');
    expect(prompt).toContain('math/<slug>');
    // The honesty rules ride in the prompt itself.
    expect(prompt).toMatch(/Do NOT invent quotes/i);
    expect(prompt).toMatch(/independently verified/i);
  });

  it('parseExtractionCandidates pulls the array and tolerates junk', () => {
    expect(parseExtractionCandidates('Here you go:\n[{"id":"math/x-y","term":"X"}]\nDone.')).toEqual([
      { id: 'math/x-y', term: 'X' },
    ]);
    expect(parseExtractionCandidates('no array here')).toEqual([]);
    expect(parseExtractionCandidates('[{not json')).toEqual([]);
  });
});

describe('citation verification (E2: citations are never model-trusted)', () => {
  it('drops model-invented citations and rejects a candidate with zero verified citations', async () => {
    const providers = noMatchProviders();
    const { admitted, rejected } = await verifyAndAdmitCandidates({
      candidates: [candidate()],
      providers,
      discipline: 'math',
    });
    expect(admitted).toHaveLength(0);
    expect(rejected).toEqual([{ id: 'math/related-rates', reasons: ['no-verified-citations'] }]);
    // Both providers were actually consulted — rejection came from no-match, not a skip.
    expect(providers.searchBookMetadata).toHaveBeenCalled();
    expect(providers.searchScholarlyReadings).toHaveBeenCalled();
  });

  it('keeps the provider-verified citation, drops the invented one, admits the candidate', async () => {
    const { admitted, rejected } = await verifyAndAdmitCandidates({
      candidates: [candidate()],
      providers: matchingProviders(),
      discipline: 'math',
    });
    expect(rejected).toHaveLength(0);
    expect(admitted).toHaveLength(1);
    expect(admitted[0].verifiedCitations).toHaveLength(1);
    expect(admitted[0].verifiedCitations[0].title).toBe('Calculus Volume 1');
    expect(admitted[0].droppedCitations).toEqual([{ title: 'Totally Fabricated Related Rates Compendium of 1842' }]);
    // The verified citation persists as attribution; the invented one is gone.
    const attribution = admitted[0].kernel.attribution.join(' | ');
    expect(attribution).toContain('Calculus Volume 1');
    expect(attribution).not.toContain('Fabricated');
  });

  it('a provider that throws means unverifiable, never trusted', async () => {
    const providers = {
      searchScholarlyReadings: vi.fn(async () => {
        throw new Error('network down');
      }),
      searchBookMetadata: vi.fn(async () => {
        throw new Error('network down');
      }),
    };
    const { admitted, rejected } = await verifyAndAdmitCandidates({
      candidates: [candidate()],
      providers,
      discipline: 'math',
    });
    expect(admitted).toHaveLength(0);
    expect(rejected[0].reasons).toEqual(['no-verified-citations']);
  });

  it('missing providers reject everything instead of admitting unverified', async () => {
    const { admitted, rejected } = await verifyAndAdmitCandidates({ candidates: [candidate()], providers: null });
    expect(admitted).toHaveLength(0);
    expect(rejected[0].reasons).toEqual(['no-providers']);
  });
});

describe('shard-schema parity (E2: cache entries merge like shard kernels)', () => {
  it('admitted entries carry exactly the key set of a real shard kernel entry', async () => {
    const realShard = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/psych-intro.json'), 'utf8'));
    const realEntryKeys = Object.keys(realShard.kernels[0]).sort();

    const { admitted } = await verifyAndAdmitCandidates({
      candidates: [candidate()],
      providers: matchingProviders(),
      discipline: 'math',
    });
    const entries = toCachedShardEntries(admitted);
    expect(entries).toHaveLength(1);
    expect(Object.keys(entries[0]).sort()).toEqual(realEntryKeys);
    expect(entries[0].id).toBe('math/related-rates');
    expect(entries[0].discipline).toBe('math');
    expect(entries[0].workedExamples).toHaveLength(1);
    expect(entries[0].edges.requires).toEqual(['math/the-chain-rule']);
  });

  it('extracted atoms are capped at T1 with anchors stripped — never source-anchored', async () => {
    const sneaky = candidate({
      definition: {
        text: 'A related-rates problem links the rates of change of two or more quantities through a shared equation differentiated with respect to time.',
        tier: 2,
        anchor: { src: 'openstax:calculus-volume-1#4', loc: '4.1', quote: 'a quote the model made up entirely' },
      },
    });
    const { admitted } = await verifyAndAdmitCandidates({
      candidates: [sneaky],
      providers: matchingProviders(),
      discipline: 'math',
    });
    expect(admitted).toHaveLength(1);
    const entry = toCachedShardEntries(admitted)[0];
    expect(entry.definition.anchor).toBeNull();
    expect(entry.definition.tier).toBeLessThanOrEqual(TRUST_TIERS.CONSENSUS);
    for (const fact of entry.facts) {
      expect(fact.anchor).toBeNull();
      expect(fact.tier).toBeLessThanOrEqual(TRUST_TIERS.CONSENSUS);
    }
  });

  it('entries merge into the runtime kernel library like a shard load', async () => {
    const { admitted } = await verifyAndAdmitCandidates({
      candidates: [candidate()],
      providers: matchingProviders(),
      discipline: 'math',
    });
    const map = new Map();
    const library = createKernelLibrary({
      storage: { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v) },
    });
    const added = library.addKernels(toCachedShardEntries(admitted), { source: 'extracted' });
    expect(added).toBe(1);
    expect(library.getKernel('math/related-rates')?.term).toBe('Related rates');
  });
});

describe('end-to-end orchestration (flag on, mocked model + providers)', () => {
  it('one call proposes, verification gates, entries come back shard-shaped', async () => {
    const callModel = vi.fn(async (prompt) => {
      expect(prompt).toContain('JSON');
      return JSON.stringify([
        candidate(),
        candidate({
          id: 'math/no-real-sources',
          term: 'Vibes-based calculus',
          citationCandidates: [{ kind: 'scholarly', title: 'A Journal That Does Not Exist Quarterly' }],
        }),
      ]);
    });
    const result = await runOnMissGenomeExtraction({
      flagValue: 'true',
      linkResult: missLinkResult,
      conceptNames: ['Related rates'],
      courseTitle: 'Calculus I',
      discipline: 'math',
      callModel,
      providers: matchingProviders(),
    });
    expect(callModel).toHaveBeenCalledTimes(1);
    expect(result.offered).toBe(true);
    expect(result.candidateCount).toBe(2);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].id).toBe('math/related-rates');
    expect(result.rejected).toEqual([{ id: 'math/no-real-sources', reasons: ['no-verified-citations'] }]);
  });
});
