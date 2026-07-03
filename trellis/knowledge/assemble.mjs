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
import { deriveBeliefForm } from '../graph/schema.mjs';

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

// Discipline gating — the v0.16.1 bycatch class, caught live in Trellis on
// its first real run: "expressions" (Python) token-matched a lang-shard
// kernel about Korean time expressions. A shard is only a linking candidate
// when its discipline plausibly matches the course; if nothing matches, all
// shards stay eligible and the coverage note says so (a wrong link is worse
// than an honest gap, so the filter errs toward gaps).
const SHARD_SUBJECT_HINTS = {
  anatomy: ['anatomy', 'physiology'],
  astro: ['astronomy', 'astrophysics', 'planetary'],
  bio: ['biology', 'life science', 'biological'],
  chem: ['chemistry', 'chemical'],
  cs: ['computer science', 'programming', 'python', 'software', 'computing', 'cs'],
  econ: ['economics', 'microeconomics', 'macroeconomics'],
  geo: ['geology', 'earth science', 'geoscience'],
  history: ['history', 'historical'],
  lang: ['language', 'korean', 'mandarin', 'chinese', 'spanish', 'french', 'japanese', 'linguistics'],
  lit: ['literature', 'literary'],
  math: ['math', 'mathematics', 'calculus', 'algebra', 'linear algebra'],
  nursing: ['nursing', 'clinical'],
  nutrition: ['nutrition', 'dietetics'],
  physics: ['physics', 'mechanics'],
  psych: ['psychology', 'psychological'],
  'research-methods': ['research methods', 'research design', 'empirical'],
  stats: ['statistics', 'statistical', 'probability'],
};

export function shardsForCourse(course, shards) {
  const courseText = `${course.subject} ${course.title}`.toLowerCase();
  const compatible = shards.filter((shard) => {
    const hints = SHARD_SUBJECT_HINTS[shard.discipline] ?? [shard.discipline];
    return hints.some((hint) => courseText.includes(hint));
  });
  return compatible.length > 0 ? { shards: compatible, gated: true } : { shards, gated: false };
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

export function assembleKnowledge(graph, allShards) {
  const { shards, gated } = shardsForCourse(graph.course, allShards);
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
    // The shard's unused riches: worked examples and anchored verbatim
    // quotes ride into the authoring slice (free grounding).
    concept.workedExamples = (kernel.examples ?? []).map((e) => e.text).filter(Boolean);
    concept.anchorQuotes = [kernel.definition?.anchor, ...(kernel.facts ?? []).map((f) => f.anchor)]
      .filter((a) => a?.quote)
      .map((a) => ({ quote: a.quote, src: a.src }));
    for (const m of kernel.misconceptions ?? []) {
      if (!m.corrective) continue; // schema requires the repair; skip repair-less entries honestly
      misconceptionCounter += 1;
      const id = `m-genome-${concept.id}-${misconceptionCounter}`;
      graph.misconceptions.push({
        kind: 'misconception',
        id,
        conceptId: concept.id,
        statement: m.text,
        beliefForm: deriveBeliefForm(m.text),
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
      disciplineGated: gated,
      note: [
        uncovered.length > 0
          ? `genome gap: ${uncovered.length} concept(s) uncovered — flywheel or declaredGap required before authoring`
          : 'all concepts carry kernel facts',
        gated ? 'discipline-gated linking' : 'NO discipline match — all shards eligible, links are lower-confidence',
      ].join('; '),
    },
  };
}
