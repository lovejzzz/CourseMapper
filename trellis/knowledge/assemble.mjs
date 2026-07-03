// Knowledge assembly — docs/TRELLIS.md §14 (knowledge/).
// Links graph concepts to genome shard kernels (term/alias token match) and
// fills empty kernelFacts + misconceptions from the shard. Reads the same
// public/genome/*.json data files the app loads — shared data, not forked
// code. A concept the genome cannot cover is returned in `uncovered` for the
// flywheel; it is NEVER silently left hollow (V5 forces kernelFacts or
// declaredGap before authoring).

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { contentTokens, tokenOverlapRatio } from '../judgment/text.mjs';

export async function loadShards({ genomeDir = 'public/genome' } = {}) {
  const files = (await readdir(genomeDir)).filter(
    (name) => name.endsWith('.json') && name !== 'manifest.json' && name !== 'archetypes.json',
  );
  const shards = [];
  for (const name of files) {
    try {
      const shard = JSON.parse(await readFile(join(genomeDir, name), 'utf8'));
      if (Array.isArray(shard.kernels)) shards.push(shard);
    } catch {
      // A malformed shard is skipped, not fatal — coverage honesty happens below.
    }
  }
  return shards;
}

export function linkConceptToKernel(concept, kernels) {
  let best = null;
  let bestScore = 0;
  const conceptTokens = new Set(contentTokens(concept.name));
  for (const kernel of kernels) {
    const names = [kernel.term, ...(kernel.aliases ?? [])];
    for (const name of names) {
      const score = tokenOverlapRatio(name, concept.name) + tokenOverlapRatio(concept.name, name);
      if (score > bestScore) {
        bestScore = score;
        best = kernel;
      }
    }
  }
  // Require a real match: at least half of one side's tokens shared.
  if (!best || bestScore < 1.0 || conceptTokens.size === 0) return null;
  return best;
}

export function assembleKnowledge(graph, shards) {
  const kernels = shards.flatMap((shard) => shard.kernels);
  const linked = [];
  const uncovered = [];
  let misconceptionCounter = 0;

  for (const concept of graph.concepts) {
    if (concept.kernelFacts.length > 0) {
      linked.push({ conceptId: concept.id, via: 'authored' });
      continue; // intake already provided facts (or a fixture did)
    }
    const kernel = linkConceptToKernel(concept, kernels);
    if (!kernel) {
      uncovered.push(concept.id);
      continue;
    }
    concept.genomeRef = kernel.id;
    concept.kernelFacts = [
      ...(kernel.definition?.text ? [kernel.definition.text] : []),
      ...(kernel.facts ?? []).map((fact) => fact.text),
    ].filter(Boolean);
    for (const m of kernel.misconceptions ?? []) {
      if (!m.corrective) continue; // schema requires the repair; skip repair-less entries honestly
      misconceptionCounter += 1;
      const id = `m-genome-${concept.id}-${misconceptionCounter}`;
      graph.misconceptions.push({
        kind: 'misconception',
        id,
        conceptId: concept.id,
        statement: m.text,
        corrective: m.corrective,
      });
      concept.misconceptionIds.push(id);
    }
    linked.push({ conceptId: concept.id, via: kernel.id });
  }

  return {
    graph,
    coverage: {
      total: graph.concepts.length,
      linked: linked.length,
      uncovered,
      note:
        uncovered.length > 0
          ? `genome gap: ${uncovered.length} concept(s) uncovered — flywheel or declaredGap required before authoring`
          : 'all concepts carry kernel facts',
    },
  };
}
