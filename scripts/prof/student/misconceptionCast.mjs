/**
 * scripts/prof/student/misconceptionCast.mjs — students are instantiated
 * FROM the genome misconception library (design §3d), our unique asset.
 * Static seeding only in P1; propagation/genesis are P2.
 *
 * Coverage is accounted honestly: concepts with no genome misconception are
 * reported untestable-by-sim, never silently generic.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '..', '..', '..');
const GENOME_DIR = path.join(repoRoot, 'public', 'genome');

function normalizeTerm(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Load every kernel from every shard, indexed by normalized term + aliases. */
export function loadGenomeMisconceptionIndex() {
  const index = new Map();
  const shardFiles = fs
    .readdirSync(GENOME_DIR)
    .filter((name) => name.endsWith('.json') && name !== 'manifest.json' && name !== 'archetypes.json');
  let kernelCount = 0;
  for (const shardFile of shardFiles) {
    let shard;
    try {
      shard = JSON.parse(fs.readFileSync(path.join(GENOME_DIR, shardFile), 'utf8'));
    } catch {
      continue;
    }
    for (const kernel of shard.kernels || []) {
      const misconceptions = (kernel.misconceptions || [])
        .map((entry, i) => ({
          id: `${kernel.id}#m${i + 1}`,
          claim: typeof entry === 'string' ? entry : entry.text || entry.claim || entry.misconception || '',
          correction: typeof entry === 'object' ? entry.corrective || entry.correction || '' : '',
        }))
        .filter((entry) => entry.claim);
      if (misconceptions.length === 0) continue;
      kernelCount += 1;
      const names = [kernel.term, ...(kernel.aliases || [])].map(normalizeTerm).filter(Boolean);
      for (const name of names) {
        if (!index.has(name)) index.set(name, { kernelId: kernel.id, misconceptions });
      }
    }
  }
  return { index, kernelCount };
}

/** Token-overlap resolve: course concept term → genome kernel entry. */
export function resolveConceptToGenome(conceptTerm, index) {
  const normalized = normalizeTerm(conceptTerm);
  if (!normalized) return null;
  if (index.has(normalized)) return index.get(normalized);
  const tokens = new Set(normalized.split(' ').filter((token) => token.length > 3));
  if (tokens.size === 0) return null;
  let best = null;
  let bestScore = 0;
  for (const [name, entry] of index) {
    const nameTokens = name.split(' ').filter((token) => token.length > 3);
    if (nameTokens.length === 0) continue;
    let shared = 0;
    for (const token of nameTokens) if (tokens.has(token)) shared += 1;
    // Min-side containment: a short course concept ("variables", "consent")
    // legitimately matches a longer kernel name ("Independent and dependent
    // variables") — that is what aliases are.
    const score = shared / Math.max(1, Math.min(nameTokens.length, tokens.size));
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return bestScore >= 0.75 ? best : null;
}

/**
 * Build the misconception cast for a course:
 *  - per concept: genome misconceptions (or untestable-by-sim)
 *  - per student: seeded held misconceptions by susceptibility (seeded rng)
 * Returns coverage accounting alongside — the Sim-coverage KPI's numerator
 * and denominator, never hidden.
 */
export function buildMisconceptionCast({ concepts, students, rng }) {
  const { index } = loadGenomeMisconceptionIndex();
  const byConcept = new Map();
  const coverage = { total: 0, covered: 0, untestable: [] };
  for (const concept of concepts) {
    coverage.total += 1;
    const resolved = resolveConceptToGenome(concept.term, index);
    if (resolved) {
      coverage.covered += 1;
      byConcept.set(concept.id, resolved.misconceptions);
    } else {
      coverage.untestable.push(concept.term);
    }
  }
  const seededByStudent = new Map();
  for (const student of students) {
    const seeded = new Map();
    for (const [conceptId, misconceptions] of byConcept) {
      const held = misconceptions
        .filter(() => rng() < student.traits.misconceptionSusceptibility)
        .map((entry) => entry.id);
      if (held.length > 0) seeded.set(conceptId, held);
    }
    seededByStudent.set(student.studentId, seeded);
  }
  return { byConcept, seededByStudent, coverage };
}

export { normalizeTerm };
