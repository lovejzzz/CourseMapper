// L1 proof: refusal → shipped. For each poetry-form gap kernel, build a
// minimal one-lesson graph and compose it in ZERO mode. Before the coverage
// fill these kernels had 0/4 plan-move assets → composeLesson yields an empty
// plan (a course over them refuses). After the fill they carry the full move
// set → a real lesson assembles, at $0. Run before and after buildAssets.
//   COVERAGE_PROOF=run npx vite-node trellis/researcher/coverageProof.mjs
import { readFile } from 'node:fs/promises';
import { loadAssets } from '../composer/assets.mjs';
import { composeLesson } from '../composer/compose.mjs';

const STEM = [
  ['physics/electric-field', 'electric field'],
  ['physics/resistance-ohms-law', 'ohmic resistance'],
  ['physics/faradays-law', "Faraday's law of induction"],
  ['stats/p-value', 'p-value'],
  ['stats/sampling-distribution', 'sampling distribution'],
  ['chem/chemical-equilibrium', 'chemical equilibrium'],
  ['chem/titration', 'titration'],
];

const GAPS = [
  ['lit/ghazal-form', 'ghazal'],
  ['lit/scansion', 'scansion'],
  ['lit/metrical-feet-and-line-length', 'poetic metre'],
  ['lit/rhyme-scheme-and-internal-rhyme', 'rhyme scheme'],
  ['lit/language-of-images', 'imagery'],
  ['lit/ballad-form', 'ballad'],
  ['lit/abecedarian-poem', 'abecedarian poem'],
];

function miniGraph(kernelId, term) {
  return {
    course: { title: 'Forms of Poetry', level: 'intro' },
    concepts: [{ kind: 'concept', id: 'c-1', name: term, genomeRef: kernelId, requires: [], kernelFacts: [] }],
    misconceptions: [
      {
        kind: 'misconception',
        id: 'm-1',
        conceptId: 'c-1',
        statement: `A common error about ${term}.`,
        corrective: `The corrected view of ${term}.`,
      },
    ],
    outcomes: [{ kind: 'outcome', id: 'o-1', text: `Understand ${term}.`, bloom: 'understand' }],
    lessons: [
      {
        kind: 'lesson',
        id: 'l1',
        week: 1,
        session: 1,
        title: term,
        introduces: ['c-1'],
        reinforces: [],
        outcomeIds: ['o-1'],
      },
    ],
    assessments: [],
    sources: [],
  };
}

if (process.env.COVERAGE_PROOF === 'run' && !process.env.VITEST) {
  const store = await loadAssets({ path: 'trellis/bank/assets.json' });
  const bank = JSON.parse(await readFile('trellis/bank/all-items.json', 'utf8'));
  const rows = [];
  const set = process.env.PROOF_SET === 'stem' ? STEM : GAPS;
  for (const [kernelId, term] of set) {
    let segments = 0,
      quiz = 0,
      note = '';
    try {
      const { composed } = await composeLesson(miniGraph(kernelId, term), 'l1', store, {
        ledger: null,
        budgetUsd: 0,
        tiers: {},
        bank,
        zero: true,
      });
      segments = composed.plan?.segments?.length ?? 0;
      quiz = composed.quizItems?.length ?? 0;
    } catch (error) {
      note = String(error.message).slice(0, 60);
    }
    rows.push({ kernelId, segments, quiz, ships: segments >= 3, note });
    console.error(`  ${kernelId}: ${segments} segments, ${quiz} quiz items${note ? ` — ${note}` : ''}`);
  }
  const shipped = rows.filter((r) => r.ships).length;
  console.log(JSON.stringify({ shipped: `${shipped}/${rows.length}`, rows }, null, 2));
}
