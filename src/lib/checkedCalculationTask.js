import { sha256HexSync } from './sha256Sync.js';
import { buildVerifiedQuantitativePractice } from './verifiedQuantitativePractice.js';

// One rebuildable exercise owns every material copy. Inputs are hypothetical
// instructor exercise data, never admitted external-source facts.
export function buildCheckedCalculationTask({ lessonId, title, brief, sessionMinutes = 50, practiceMinutes }) {
  const practice = buildVerifiedQuantitativePractice({ title }, brief);
  if (!practice) return null;
  const kind = `checked-calculation:${practice.kind}`;
  const id = `task-${sha256HexSync(`${lessonId}:${kind}`).slice(0, 16)}`;
  const checks = [
    ['inputs', 'Given inputs', 'Uses the supplied values without substitution.', 'One input is copied incorrectly.'],
    [
      'method',
      'Method and assumptions',
      'States the appropriate formula and its assumptions.',
      'Uses an inappropriate formula or convention.',
    ],
    [
      'calculation',
      'Calculation',
      'Shows the substitution, intermediate steps and correct result.',
      'An arithmetic error changes the result.',
    ],
    [
      'interpretation',
      'Interpretation',
      'Explains the result within the exercise assumptions.',
      'Claims a result beyond the given model or observations.',
    ],
  ];
  const task = {
    protocol: 'coursemapper-shared-teaching-task-v1',
    identityKey: lessonId,
    id,
    kind,
    checkedPractice: practice,
    objective: practice.objective,
    title: `${title}: checked calculation`,
    purpose: 'Practice on supplied hypothetical inputs; external sources require separate review.',
    inputs: [{ id: `${id}:inputs`, text: practice.workedExample.problem }],
    summary: practice.workedExample.problem,
    question: practice.workedExample.problem + ' Show each step and state the assumptions behind your result.',
    answer: practice.workedExample.steps.join(' '),
    reasoning: practice.workedExample.steps,
    product: 'Labeled calculations showing the given values, formula, substitution, result and interpretation.',
    minutes:
      Number(practiceMinutes) > 0 ? Number(practiceMinutes) : Math.max(6, Math.min(15, Math.round(sessionMinutes / 5))),
    criteria: checks.map(([id, label, complete, error]) => ({
      id,
      label,
      weight: 25,
      feedback: `${complete} Check this against your own response.`,
      levels: {
        exemplary: complete,
        proficient: `${complete} One explanatory detail is omitted.`,
        developing: error,
        beginning: 'No assessable response for this criterion.',
      },
    })),
    errors: [
      {
        criterionId: 'calculation',
        response: 'A numerical answer without showing which values and formula produced it is a complete solution.',
        correction: practice.questions[0].explanation,
        feedback: 'Show the setup and the calculation so another learner can check the result.',
      },
    ],
    checkpoint: practice.questions[3],
    scaffoldQuestions: practice.questions.slice(0, 3),
    // Same-case practice is not labeled as transfer to an unseen case.
    sequence: [],
    workedExample: {
      ...practice.workedExample,
      inputs: [practice.workedExample.problem],
      interpretation: practice.provenance,
    },
    validation: {
      method: 'checked-explicit-calculation',
      scope: 'Bounded calculations on supplied inputs; not verification of source truth, course fit or learning gains.',
    },
  };
  task.revision = sha256HexSync(JSON.stringify(task));
  return task;
}
