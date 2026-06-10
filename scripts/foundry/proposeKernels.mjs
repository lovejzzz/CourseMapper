#!/usr/bin/env node
/**
 * proposeKernels.mjs — v0.13.5 P1: model-assisted kernel extraction.
 * The model PROPOSES; the mechanical gate DISPOSES.
 *
 * For each snapshot (from ingestOpenStax.mjs), a build-time model call
 * proposes concept kernels — definition, facts, misconceptions with
 * correctives, worked examples for quantitative concepts, MC items —
 * where every anchored field must quote the snapshot verbatim. Proposals
 * then run through the REAL admission pipeline (admitBatch): rejected
 * anchors are stripped and surfaced in the yield report for human review.
 * Nothing reaches a shard without passing the same gate hand-authored
 * sources pass.
 *
 *   ANTHROPIC_API_KEY=… npx vite-node scripts/foundry/proposeKernels.mjs \
 *     --book astronomy-2e --discipline astro --out astro-proposed.json
 *   npx vite-node scripts/foundry/proposeKernels.mjs --book astronomy-2e --discipline astro --dry-run
 *
 * Build-time only, key-gated. --dry-run exercises the full pipeline
 * (snapshot loading, gating, report) with a deterministic stub proposal —
 * no key, no network.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { admitBatch } from '../../src/lib/genome/foundryAdmission.js';

const here = dirname(fileURLToPath(import.meta.url));

function arg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')
    ? process.argv[index + 1]
    : fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);

const KERNEL_SHAPE = `{
  "id": "<discipline>/<slug>", "rev": 1, "term": "...", "aliases": [], "tags": [],
  "level": "intro", "difficulty": 1-5, "bloomCeiling": "Apply|Analyze|Evaluate",
  "definition": { "text": "...", "anchor": { "src": "<srcId>", "loc": "<section>", "quote": "<VERBATIM substring of the snapshot>" }, "tier": 2 },
  "facts": [ { "text": "...", "anchor": { ...same shape... }, "tier": 2 } ],
  "misconceptions": [ { "text": "<the wrong belief>", "corrective": "<the fix>", "tier": 1 } ],
  "examples": [ "..." ],
  "workedExamples": [ { "problem": "...", "steps": ["..."], "result": "..." } ],
  "mcBank": [ { "stem": "...", "options": ["...","...","...","..."], "answerIndex": 0, "explanationFactRef": 0, "rationaleRefs": [] } ],
  "edges": { "requires": [], "recommends": [], "instanceOf": [] },
  "attribution": [ { "source": "...", "license": "CC BY 4.0" } ]
}`;

function buildPrompt({ snapshot, srcId, discipline }) {
  return `You are extracting concept kernels for a quote-gated curriculum library.

SOURCE SNAPSHOT (srcId "${srcId}", from ${snapshot.url}):
---
${snapshot.text.slice(0, 12000)}
---

Propose 1-3 concept kernels for discipline "${discipline}" from this section as a JSON array. Each kernel uses exactly this shape:
${KERNEL_SHAPE}

HARD RULES:
- Every anchor.quote MUST be a VERBATIM character-for-character substring of the snapshot above. Do not paraphrase inside quotes. A mechanical gate rejects any quote that is not an exact substring.
- anchor.src is always "${srcId}".
- 3-5 facts per kernel, each anchored. 1-2 misconceptions WITH correctives. workedExamples only for genuinely quantitative concepts. 2-3 mcBank items; do not make the correct option the longest.
- Return ONLY the JSON array.`;
}

async function proposeWithModel(prompt) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (anthropicKey) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.FOUNDRY_MODEL || 'claude-sonnet-4-6',
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = await res.json();
    return json.content?.map((block) => block.text || '').join('') || '';
  }
  if (openaiKey) {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({ model: process.env.FOUNDRY_MODEL || 'gpt-5.2', input: prompt }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = await res.json();
    return (
      json.output
        ?.flatMap((item) => item.content || [])
        .map((block) => block.text || '')
        .join('') || ''
    );
  }
  throw new Error(
    'No ANTHROPIC_API_KEY or OPENAI_API_KEY set — proposal is key-gated (use --dry-run to test the pipeline).',
  );
}

function parseKernelArray(text) {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('No JSON array in model response');
  return JSON.parse(match[0]);
}

/** Deterministic stub for --dry-run: quotes the snapshot's first sentence verbatim. */
function stubProposal({ snapshot, srcId, discipline, slug }) {
  const firstSentence = (snapshot.text.match(/[A-Z][^.!?]{40,200}[.!?]/) || [snapshot.text.slice(0, 120)])[0];
  return [
    {
      id: `${discipline}/${slug}-stub`,
      rev: 1,
      term: `${slug} (stub)`,
      aliases: [],
      tags: ['dry-run'],
      level: 'intro',
      difficulty: 2,
      bloomCeiling: 'Apply',
      definition: { text: firstSentence, anchor: { src: srcId, loc: slug, quote: firstSentence }, tier: 2 },
      facts: [{ text: firstSentence, anchor: { src: srcId, loc: slug, quote: firstSentence }, tier: 2 }],
      misconceptions: [],
      examples: [],
      workedExamples: [],
      mcBank: [],
      edges: { requires: [], recommends: [], instanceOf: [] },
      attribution: [{ source: snapshot.url, license: 'CC BY 4.0' }],
    },
  ];
}

async function main() {
  const book = arg('book');
  const discipline = arg('discipline');
  const out = arg('out', `${discipline || 'proposed'}-proposed.json`);
  const dryRun = flag('dry-run');
  if (!book || !discipline) {
    console.error(
      'usage: npx vite-node scripts/foundry/proposeKernels.mjs --book <book-slug> --discipline <prefix> [--out file] [--dry-run]',
    );
    process.exit(1);
  }
  const snapshotDir = join(here, 'snapshots', book);
  if (!existsSync(snapshotDir)) {
    console.error(`No snapshots at ${snapshotDir} — run ingestOpenStax.mjs first.`);
    process.exit(1);
  }

  const sourceSnapshots = {};
  const proposals = [];
  const yieldReport = [];
  for (const file of readdirSync(snapshotDir).filter((name) => name.endsWith('.json'))) {
    const snapshot = JSON.parse(readFileSync(join(snapshotDir, file), 'utf8'));
    const slug = snapshot.slug || file.replace(/\.json$/, '');
    const chapter = (slug.match(/^(\d+)/) || [])[1] || slug;
    const srcId = `openstax:${book}#${chapter}`;
    sourceSnapshots[srcId] = `${sourceSnapshots[srcId] || ''}\n${snapshot.text}`.trim();
    try {
      const kernels = dryRun
        ? stubProposal({ snapshot, srcId, discipline, slug })
        : parseKernelArray(await proposeWithModel(buildPrompt({ snapshot, srcId, discipline })));
      proposals.push(...kernels);
      yieldReport.push({ section: slug, proposed: kernels.length });
      console.log(`[propose] ${slug}: ${kernels.length} kernel(s) proposed${dryRun ? ' (dry-run stub)' : ''}`);
    } catch (err) {
      yieldReport.push({ section: slug, proposed: 0, error: err.message });
      console.error(`[propose] ${slug} FAILED: ${err.message}`);
    }
  }

  // The gate disposes: same admission pipeline as hand-authored sources.
  const { admitted, report, aliasCollisions } = admitBatch(proposals, {
    sources: sourceSnapshots,
    requireAnchors: true,
  });
  for (const entry of report) {
    if (!entry.admitted) console.log(`[gate] REJECTED ${entry.id}: ${JSON.stringify(entry.rejections)}`);
  }
  if ((aliasCollisions || []).length > 0) console.log(`[gate] alias collisions: ${JSON.stringify(aliasCollisions)}`);

  const outPath = join(here, 'sources', out);
  const body = {
    _comment: `PROPOSED by model, gated mechanically (${admitted.length}/${proposals.length} admitted). Human review required before genome:build. Source: ${book}.`,
    _yield: { proposed: proposals.length, admitted: admitted.length, sections: yieldReport },
    sourceSnapshots,
    kernels: admitted,
  };
  writeFileSync(outPath, JSON.stringify(body, null, 2));
  console.log(
    `[propose] wrote ${outPath}: ${admitted.length}/${proposals.length} kernels admitted (yield ${proposals.length ? Math.round((admitted.length / proposals.length) * 100) : 0}%)`,
  );
  console.log(
    '[propose] review the file, then validate: npx vite-node scripts/foundry/validateSource.mjs sources/' + out,
  );
}

main();
