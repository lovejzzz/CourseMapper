import { it, expect } from 'vitest';
import {
  quantityCountCatalog,
  normalizeQuantitySelection,
  quantitySelectionMessages,
  quantitySelectionGrammar,
} from '../scionQuantitySelection.js';
import { pooledCountsFixture } from '../../../tests/fixtures/teaching/pooledCounts.js';
import { assessTeachingProposal, SCION_TEACHING_PROPOSAL_PROTOCOL } from '../scionTeachingProposal.js';

it('enumerates exact count occurrences without accepting fragments, percentages or approximate counts', () => {
  const inputs = [
    {
      id: 's',
      text: 'twelve tablets; twelve of forty-eight. 50名成员、35名参加。not 4; about 6; 12%; -7; 2.5; someone; one hundred; 三十五人；至少八人。',
    },
  ];
  const catalog = quantityCountCatalog(inputs);
  expect(catalog.map((c) => c.quote)).toEqual(['twelve', 'twelve', 'forty-eight', '50', '35', '三十五']);
  expect(catalog.filter((c) => c.quote === 'twelve').map((c) => c.occurrence)).toEqual([0, 1]);
  for (const c of catalog) expect(inputs[0].text.slice(c.start, c.end)).toBe(c.quote);
  expect(() => quantityCountCatalog([{ text: '1 '.repeat(161) }])).toThrow('Too many count');
});

it('resolves typed selections to the original source spans and derives only parent records', () => {
  const f = pooledCountsFixture(),
    request = { operation: 'pooled-proportion', objective: f.objective, inputs: f.inputs },
    catalog = quantityCountCatalog(f.inputs);
  const countRoles = ['firstPart', 'firstWhole', 'secondPart', 'secondWhole'];
  const derived = ['firstCountRecord', 'secondCountRecord', 'identityRecord'];
  const counts = Object.fromEntries(
    countRoles.map((k) => [
      k,
      catalog.find(
        (c) => c.source === 'r1' && c.quote === f.selections[k].quote && c.occurrence === f.selections[k].occurrence,
      ).id,
    ]),
  );
  const bindings = Object.fromEntries(
    Object.entries(f.selections)
      .filter(([k]) => !countRoles.includes(k) && !derived.includes(k))
      .map(([k, s]) => [
        k,
        k === 'limitRecord'
          ? { source: 'r2' }
          : {
              source: 'r' + (f.inputs.findIndex((i) => i.id === s.inputId) + 1),
              quote: s.quote,
              occurrence: s.occurrence,
            },
      ]),
  );
  const result = normalizeQuantitySelection({ counts, bindings, unknowns: [] }, request);
  const assessed = assessTeachingProposal(JSON.stringify(result), request, SCION_TEACHING_PROPOSAL_PROTOCOL);
  expect(assessed.issues).toEqual([]);
  expect(assessed.missing).toEqual([]);
  expect(assessed.bindings.secondPart.occurrence).toBe(1);
  expect(result.firstCountRecord).toBeUndefined();
  expect(result.bindings.firstCountRecord).toEqual({ source: 'r1' });
  expect(() =>
    normalizeQuantitySelection({ counts: { ...counts, firstPart: 'n999' }, bindings, unknowns: [] }, request),
  ).toThrow('current catalog ID');
  expect(() =>
    normalizeQuantitySelection(
      { counts, bindings: { ...bindings, firstCountRecord: { source: 'r3' } }, unknowns: [] },
      request,
    ),
  ).toThrow('only the specified');
  const missing = normalizeQuantitySelection(
    { counts: { ...counts, firstPart: null }, bindings, unknowns: ['First count missing'] },
    request,
  );
  expect(missing.bindings.firstPart).toBeNull();
  expect(missing.bindings.firstCountRecord).toBeNull();
  const messages = quantitySelectionMessages(request);
  expect(JSON.parse(messages[1].content).countCatalog.length).toBe(catalog.length);
  expect(quantitySelectionGrammar(request)).not.toContain('Fictional library');
});

import fs from 'node:fs';
it('replays first-run false structural passes and rejects bare counts as names or population evidence', () => {
  const receipt = JSON.parse(
    fs.readFileSync(
      new URL('../../../research/scion/evaluation/v0.20.0/count-selection/first-run-raw.json', import.meta.url),
      'utf8',
    ),
  );
  for (const c of receipt.cases.filter((c) => c.id.startsWith('union'))) {
    const raw = c.result.receipt.attempts[c.result.receipt.selectedAttempt - 1].normalized;
    const reviewed = assessTeachingProposal(JSON.stringify(raw), c.request, SCION_TEACHING_PROPOSAL_PROTOCOL);
    expect(reviewed.issues.some((s) => s.includes('populationName'))).toBe(true);
    if (c.id === 'union-zh-01') expect(reviewed.issues.some((s) => s.includes('stablePopulation'))).toBe(true);
  }
  const english = receipt.cases.find((c) => c.id === 'pool-en-01');
  const issues = english.result.receipt.attempts.map(
    (a) =>
      assessTeachingProposal(JSON.stringify(a.normalized), english.request, SCION_TEACHING_PROPOSAL_PROTOCOL).issues,
  );
  expect(issues[0]).toHaveLength(3);
  expect(issues[1]).toHaveLength(1);
});

import { proposeTeachingSourceBindings } from '../scionTeachingProposal.js';
it('selects the actual improved repair instead of tying several joined failures with one', async () => {
  const receipt = JSON.parse(
    fs.readFileSync(
      new URL('../../../research/scion/evaluation/v0.20.0/count-selection/first-run-raw.json', import.meta.url),
      'utf8',
    ),
  );
  const c = receipt.cases.find((c) => c.id === 'pool-en-01');
  let call = 0;
  const result = await proposeTeachingSourceBindings(c.request, {
    runtimeLoader: async () => ({
      loadScionBrowserWllama: async () => {},
      getScionBrowserWllamaStatus: () => ({}),
      completeScionBrowserWllama: async () => JSON.stringify(c.result.receipt.attempts[call++].normalized),
    }),
  });
  expect(result.modelCalls).toBe(2);
  expect(result.receipt.selectedAttempt).toBe(2);
  expect(result.issues).toHaveLength(1);
  expect(result.bindings.secondPart.inputId).toBe('south');
});
