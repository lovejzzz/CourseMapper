import { sha256HexSync } from './sha256Sync.js';
import { SOURCE_ARITHMETIC_PROTOCOL, sourceArithmeticWorkedExample } from './sourceArithmeticStudyPractice.js';

export const TEACHING_TASK_PROTOCOL = 'coursemapper-shared-teaching-task-v1';
const clean = (s) => (typeof s === 'string' ? s.trim() : '');
const unique = (xs) => [...new Set(xs.map(clean).filter(Boolean))];
const bounded = (s) =>
  /\b(?:cannot|could not|do not|does not|no date|without proving|selection bias|excluded)\b/i.test(s);

function criterion(id, label, weight, complete, partial, error, feedback, proficient) {
  return {
    id,
    label,
    weight,
    feedback,
    levels: {
      exemplary: complete,
      proficient,
      developing: partial,
      beginning: error,
    },
  };
}

function proportionTask(claims, objective) {
  if (!/\b(?:proportion|percentage|percent|fraction)\b/i.test(objective)) return null;
  const example = sourceArithmeticWorkedExample({ claims });
  if (!example) return null;
  const { numerator: n, denominator: d, decimal, percent } = example.verification;
  const limits = claims.filter(bounded);
  const interpretation = limits.length
    ? `The result describes the supplied observations. Retain these limits: ${limits.join(' ')}`
    : 'The calculation describes the supplied fraction. The source does not establish whether it estimates a wider population.';
  return {
    kind: 'source-proportion',
    title: 'Calculate and interpret the observed proportion',
    summary: `${n}/${d} = ${decimal} = ${percent}%. The decimal and percentage express the same proportion. Checking the arithmetic and checking the scope of the observations are separate parts of the response.`,
    question: `Calculate ${n}/${d} as a decimal and percentage, show a reverse check, and explain which observations the result describes and what the source does not establish.`,
    reasoning: [...example.steps, interpretation],
    answer: `${n} ÷ ${d} = ${decimal}; ${decimal} × 100 = ${percent}%; ${decimal} × ${d} = ${n}. The decimal and percentage express the same proportion. ${interpretation}`,
    criteria: [
      criterion(
        'part-whole',
        'Identify the part and whole',
        25,
        `Uses ${n} as the part and ${d} as the whole, with labels supported by the supplied record.`,
        `Uses ${n}/${d} but does not explain which is the whole.`,
        `Reverses the fraction to ${d}/${n}, or substitutes unsupported counts.`,
        'Ask which count represents the whole; relabel before recalculating.',
        `Correctly identifies ${n} as the part and ${d} as the whole, but does not link the labels to the supplied record.`,
      ),
      criterion(
        'conversion',
        'Calculate and verify',
        40,
        `Shows ${n} ÷ ${d} = ${decimal}, ${decimal} × 100 = ${percent}%, and ${decimal} × ${d} = ${n}.`,
        `Gives ${percent}% without showing the division or conversion.`,
        'Uses an incorrect conversion or cannot recover the original count.',
        'Separate division from multiplication by 100; reverse the calculation to check the numerator.',
        `Shows ${n} ÷ ${d} = ${decimal} and ${decimal} × 100 = ${percent}%, but omits or does not complete the reverse check.`,
      ),
      criterion(
        'scope',
        'Interpret the result within its evidence',
        35,
        interpretation,
        'Reports the observed proportion but leaves the source limitations implicit.',
        'Claims that correct arithmetic proves a population-wide rate.',
        'Name the observed group, then identify who or what the source leaves out.',
        'Names the observed group and a source limitation, but does not explain why that limitation restricts a population claim.',
      ),
    ],
    errors: [
      {
        criterionId: 'conversion',
        response: `${n}/${d} = ${decimal}%.`,
        correction: `${decimal} is a decimal proportion; it converts to ${percent}%.`,
        feedback: `Multiply ${decimal} by 100, then check the numerator.`,
      },
      {
        criterionId: 'scope',
        response: `${percent}% must be the rate in the entire population because the calculation is correct.`,
        correction: interpretation,
        feedback:
          'A numerical check tests the calculation. Identify the separate evidence needed for the population claim.',
      },
    ],
    checkpoint: {
      question: `Recover the numerator from ${percent}% of ${d}, then state one source limitation.`,
      answer: `${decimal} × ${d} = ${n}. ${interpretation}`,
    },
    scaffoldQuestions: [
      {
        question: 'Which count is the part and which is the whole? Identify the observations these counts describe.',
        answer: `${n} is the part and ${d} is the whole. ${example.inputs.join(' ')}`,
      },
      {
        question:
          'Can this numerical calculation alone establish a population-wide rate? Explain what the source allows.',
        answer: interpretation,
      },
    ],
    workedExample: example,
  };
}

// Bounded source operations, not subject-name templates. A recipe is available
// only when the packet actually supplies the relationship and its solution.
// Neither operation supplies missing historical or experimental facts.
function eventComparisonTask(claims, objective) {
  if (!/\b(?:date|record|historical|observation|inference)\b/i.test(objective)) return null;
  const creationDate = /\b(?:drawn|created|produced|made)\s+in\s+(\d{3,4})\b/gi;
  const acquisitionDate =
    /\b(?:received|acquired)\b[^.!?;\d]{0,80}?\bin\s+(\d{3,4})\b|\baccession(?:\s+date)?[: ]+(\d{3,4})\b/gi;
  const creationRecords = claims.filter((s) => [...s.matchAll(creationDate)].length === 1);
  const acquisitionRecords = claims.filter((s) => [...s.matchAll(acquisitionDate)].length === 1);
  if (creationRecords.length !== 1 || acquisitionRecords.length !== 1) return null;
  const [created] = creationRecords,
    [acquired] = acquisitionRecords;
  const relation = claims.find(
    (s) => /\bcreation\b/i.test(s) && /\bacquisition\b/i.test(s) && /different events|need not be the same/i.test(s),
  );
  const creationYear = [...created.matchAll(creationDate)][0][1];
  const acquisitionMatch = [...acquired.matchAll(acquisitionDate)][0];
  const acquisitionYear = acquisitionMatch[1] || acquisitionMatch[2];
  const limits = claims.filter(bounded);
  const observations = claims.filter(
    (s) => s !== created && s !== acquired && /\b(?:records|documents)\s+(?:that\s+)?/i.test(s),
  );
  const repairUnknown = limits.some((s) => /no date for the repair/i.test(s));
  if (!created || !acquired || !relation || !limits.length) return null;
  const reasoning = [
    `Identify the creation record: ${created}`,
    `Identify the acquisition record: ${acquired}`,
    `The dates need not conflict: ${relation}`,
    `Keep documented observations separate from additional historical claims: ${limits.join(' ')}`,
  ];
  return {
    kind: 'record-event-comparison',
    scaffoldQuestions: [
      {
        question: 'Label each supplied date with its event and supporting record.',
        answer: `Creation: ${creationYear}. ${created} Acquisition: ${acquisitionYear}. ${acquired}`,
      },
      {
        question: 'Report a documented physical observation and a historical claim that the record does not establish.',
        answer: unique([...observations, ...limits]).join(' '),
      },
    ],
    title: 'Compare the dated records and bound the inference',
    summary:
      'A date describes a particular event. Creation and acquisition can occur at different times; a documented physical observation does not establish an entire object history.',
    question:
      'Do the creation and acquisition records conflict? Label each date with its event and source, explain your conclusion, then distinguish a documented physical observation from a historical claim the record cannot establish.',
    reasoning,
    answer: `${creationYear} dates creation; ${acquisitionYear} dates acquisition. The dates need not conflict because they describe different events. ${unique([created, acquired, ...observations, ...limits]).join(' ')}`,
    criteria: [
      criterion(
        'event-labels',
        'Link each date to its event and record',
        30,
        `${created} ${acquired} Correctly distinguishes creation from acquisition.`,
        'Identifies both dates but leaves one event or record unlabeled.',
        'Treats an acquisition date as creation, or labels both dates as the same event.',
        'Write one row per date: date, event, and record. Then check the event labels.',
        'Labels both dates with the correct events, but does not identify the supporting record for one date.',
      ),
      criterion(
        'relationship',
        'Explain whether the dates conflict',
        35,
        `Explains that both dates can be true because they describe different events. ${relation}`,
        'Says the dates do not conflict but does not explain the different events.',
        'Concludes that one record must be false merely because the dates differ.',
        'Ask whether both records make a claim about the same event before judging conflict.',
        'Explains that different events can have different dates, but applies the explanation to only one of the two records.',
      ),
      criterion(
        'inference-limit',
        'Separate observation from unsupported history',
        35,
        `Reports the physical observation and preserves the stated limit: ${limits.join(' ')}`,
        'Reports the observation but leaves its uncertainty or historical limit implicit.',
        'Invents a repair date, original purpose, or complete history from the physical observation.',
        'Underline the documented observation. Cross out each added claim that no record supports.',
        'Names the observation and the stated uncertainty, but does not explain why the observation cannot establish the additional historical claim.',
      ),
    ],
    errors: [
      {
        criterionId: 'relationship',
        response: 'The dates differ, so one of these records must be wrong.',
        correction: relation,
        feedback: 'Label each date with its event. Reconsider whether the two claims are incompatible.',
      },
      {
        criterionId: 'inference-limit',
        response: repairUnknown
          ? 'The object must have been repaired when it was acquired.'
          : 'This observation establishes the complete history of the object.',
        correction: limits.join(' '),
        feedback: repairUnknown
          ? 'Locate a record that explicitly dates the repair. If there is none, report the date as unknown.'
          : 'Separate the documented observation from the additional history; retain the stated uncertainty.',
      },
    ],
    checkpoint: {
      question:
        'A classmate says different dates prove that one record is false. Give a correction using both records.',
      answer: `${created} ${acquired} ${relation}`,
    },
  };
}

function controlledComparisonTask(claims, objective) {
  if (!/\b(?:confound|variable|experiment|design|causal)/i.test(objective)) return null;
  const contrasts = claims.filter((s) => /\bgroup\s+\w+\b/i.test(s) && /\b(?:while|whereas)\b/i.test(s));
  if (contrasts.length !== 1) return null;
  const [contrast] = contrasts;
  const limit = claims.find((s) => /\b(?:cannot|does not) isolate\b/i.test(s) && /\b(?:both differ|confound)/i.test(s));
  const repair = claims.find(
    (s) => /\brandom assignment\b/i.test(s) && /\b(?:equal|constant)\b/i.test(s) && /\bremoves?\b/i.test(s),
  );
  if (!contrast || !limit || !repair) return null;
  const treatment = limit.match(/\beffect of ([\p{L} -]+)[.!]?$/iu)?.[1]?.trim();
  const otherCondition = repair.match(/\bkeeping (.+?) (?:equal|constant)\b/i)?.[1]?.trim();
  const outcome = limit.match(/^(.+?) is the outcome\b/i)?.[1]?.trim();
  const controls = contrast.match(/\bboth (?:use|have|receive) (?:the )?same ([^.!]+)/i)?.[1]?.trim();
  if (!treatment || !otherCondition || !outcome || !controls) return null;
  const diagnosisOnly = !/\b(?:propose|design|repair|revise|construct|random assignment)\b/i.test(objective);
  const reasoning = [
    `Compare the conditions in the actual groups: ${contrast}`,
    `Identify the outcome and the competing explanation: ${limit}`,
    ...(diagnosisOnly ? [] : [`Repair the stated comparison using the supplied design principle: ${repair}`]),
    'The stated confound limits attribution even if an outcome difference is observed. Do not infer a treatment effect beyond the supplied result and its stated limits.',
  ];
  return {
    scaffoldQuestions: [
      {
        question:
          'For the supplied groups, identify the intended treatment, the other differing condition, the outcome and the stated controls.',
        answer: `${contrast} The intended treatment is ${treatment}; ${otherCondition} is the other difference. The outcome is ${outcome.toLowerCase()}. The stated controls are ${controls}.`,
      },
      {
        question: diagnosisOnly
          ? 'Why can this comparison not isolate the intended treatment effect?'
          : 'What do random assignment and equal comparison conditions each contribute to the supplied design repair?',
        answer: diagnosisOnly ? limit : repair,
      },
    ],
    kind: diagnosisOnly ? 'confound-diagnosis' : 'controlled-comparison-repair',
    title: diagnosisOnly ? 'Diagnose the confounded comparison' : 'Repair the confounded comparison',
    summary: `${otherCondition[0].toUpperCase() + otherCondition.slice(1)} changes with ${treatment}, so their effects cannot be separated by this comparison. ${outcome} is the measured outcome. A repair must remove the stated systematic difference.`,
    sourceClaims: [contrast, limit, ...(diagnosisOnly ? [] : [repair])],
    question: `Identify what differs between the supplied groups, what is measured, and why the comparison cannot isolate the intended effect.${diagnosisOnly ? '' : ' Propose a repaired design: state what changes, what stays equal, how units are assigned, and how the outcome is measured.'} Do not invent an experimental result.`,
    reasoning,
    answer: `${contrast} ${otherCondition[0].toUpperCase() + otherCondition.slice(1)} differs between the ${treatment} conditions, so it is an alternative explanation for the outcome. The outcome is ${outcome.toLowerCase()}.${diagnosisOnly ? '' : ` Randomly assign experimental units to the ${treatment} conditions, keeping ${otherCondition} equal and retaining the same ${controls}. Use the same outcome measurement.`} The original comparison cannot isolate the effect of ${treatment}.`,
    criteria: [
      criterion(
        'conditions',
        'Identify the actual conditions and outcome',
        25,
        `Reports both original group conditions, identifies ${treatment} as the intended contrast, ${otherCondition} as the other differing condition, and ${outcome.toLowerCase()} as the outcome.`,
        'Defines variables correctly but identifies only part of the actual comparison.',
        'Only gives definitions or substitutes a different experiment.',
        'Compare the supplied groups column by column; label the measured outcome separately.',
        `Identifies ${treatment}, ${otherCondition}, and the measured outcome, but leaves one original group condition unspecified.`,
      ),
      criterion(
        'confound',
        'Explain the alternative cause',
        diagnosisOnly ? 50 : 35,
        `Explains that ${otherCondition} changes with ${treatment} and offers an alternative cause of any outcome difference.`,
        'Names the differing condition but does not explain its alternative-cause role.',
        'Attributes the outcome entirely to the intended treatment despite the other difference.',
        'State which other condition changes at the same time, and how that limits attribution.',
        `States that ${otherCondition} changes with ${treatment} and limits attribution, but does not explain its role as an alternative cause.`,
      ),
      ...(diagnosisOnly
        ? [
            criterion(
              'result-limit',
              'Avoid an invented result',
              25,
              'Distinguishes any reported outcome from an attributable treatment effect; preserves the stated causal limit without inventing results.',
              'Avoids inventing data but does not state the causal limit.',
              'Invents a measured effect or claims that the comparison proves the treatment works.',
              'Separate a design flaw from a measured outcome; report only what the record supplies.',
              'Preserves the source result and its causal limit, but does not distinguish observed difference from treatment effect.',
            ),
          ]
        : [
            criterion(
              'repair',
              'Specify a design that removes the stated confound',
              40,
              `Changes ${treatment}, keeps ${otherCondition} equal, assigns units by chance, and retains ${controls} and the same outcome measurement.`,
              'Proposes equal conditions but omits random assignment or a stated control requirement.',
              'Merely increases the sample or randomizes while retaining the systematic condition difference.',
              'Write both revised groups side by side. Remove the condition difference, retain controls, and specify assignment and measurement.',
              `Changes ${treatment}, keeps ${otherCondition} equal, assigns units by chance, and retains ${controls}, but omits how the outcome will be measured.`,
            ),
          ]),
    ],
    errors: [
      {
        criterionId: 'confound',
        response: 'The difference must be caused entirely by the intended treatment.',
        correction: limit,
        feedback: 'Identify the other factor that differs with treatment before making a causal claim.',
      },
      ...(diagnosisOnly
        ? []
        : [
            {
              criterionId: 'repair',
              response:
                'Use more experimental units but keep the two groups under their original different conditions.',
              correction: repair,
              feedback: 'More units do not remove this systematic difference. Rewrite the group conditions first.',
            },
          ]),
    ],
    checkpoint: diagnosisOnly
      ? {
          question:
            'Identify the competing explanation in the supplied groups and explain why the treatment effect is not isolated.',
          answer: `${contrast} ${limit}`,
        }
      : {
          question:
            'Would adding more units while preserving the original group conditions remove this confound? Explain and specify the needed design change.',
          answer: `No. ${limit} ${repair}`,
        },
  };
}

/** Build once from unrotated, lesson-owned evidence, then project everywhere.
 * Structural admission does not prove a model-authored answer true. Unsupported
 * operations remain unavailable; they never receive a fabricated answer.
 */
export function buildSharedTeachingTask({
  lessonId,
  objective,
  claims = [],
  admitted = false,
  workedExample,
  sessionMinutes = 50,
  practiceMinutes,
} = {}) {
  if (!admitted) return null;
  const inputs = unique(claims);
  if (
    workedExample &&
    ![SOURCE_ARITHMETIC_PROTOCOL, 'coursemapper-source-claim-comparison-study-practice-v1'].includes(
      workedExample.protocol,
    )
  )
    return null;
  const body =
    proportionTask(inputs, objective) ||
    eventComparisonTask(inputs, objective) ||
    controlledComparisonTask(inputs, objective);
  if (!body) return null;
  const task = {
    protocol: TEACHING_TASK_PROTOCOL,
    id: `task-${sha256HexSync(`${lessonId}:${body.kind}`).slice(0, 16)}`,
    objective: clean(objective),
    inputs: (body.sourceClaims || inputs).map((text) => ({ id: `source-${sha256HexSync(text).slice(0, 12)}`, text })),
    ...body,
    purpose: 'source-bound guided practice',
    product:
      body.kind === 'source-proportion'
        ? 'One calculation record showing division, percentage conversion and reverse check, with a 2–4-sentence interpretation of the observations and their limits.'
        : 'One annotated response with the reasoning, conclusion, and evidence limit; prose, a labeled diagram, or an equivalent accessible response.',
    minutes:
      Number(practiceMinutes) > 0
        ? Number(practiceMinutes)
        : Math.max(6, Math.min(15, Math.round(Number(sessionMinutes) / 5) || 10)),
    validation: {
      method: 'explicit-source-relationship',
      scope: 'The stated source operation; not independent factual verification or measured learning gain.',
    },
  };
  task.revision = sha256HexSync(JSON.stringify(task));
  return task;
}

export function teachingTaskWorkedExample(task) {
  return (
    task?.workedExample ||
    (task
      ? {
          protocol: TEACHING_TASK_PROTOCOL,
          taskId: task.id,
          taskRevision: task.revision,
          studentTask: task.question,
          problem: task.question,
          inputs: task.inputs.map((x) => x.text),
          steps: task.reasoning,
          result: task.answer,
          interpretation: 'Each step uses the supplied record; the conclusion addresses this specific task.',
          boundary: task.reasoning.at(-1),
          transferTask: task.checkpoint.question,
        }
      : null)
  );
}

export function teachingTaskRubric(task, totalPoints = 100) {
  const total = Math.max(0, Number(totalPoints) || 0);
  let assigned = 0;
  return task.criteria.map((c, index) => {
    const points = index === task.criteria.length - 1 ? total - assigned : Math.round((total * c.weight) / 100);
    assigned += points;
    return {
      criterionId: c.id,
      taskId: task.id,
      taskRevision: task.revision,
      criterion: c.label,
      weight: c.weight,
      points,
      objectiveAligned: task.objective,
      evidenceSignal: c.levels.exemplary,
      feedbackUse: c.feedback,
      ...c.levels,
    };
  });
}

export function teachingTaskPracticeUnits(task) {
  const shared = { taskId: task.id, taskRevision: task.revision, sourceClaims: task.inputs.map((x) => x.text) };
  return [
    {
      ...shared,
      id: `${task.id}:response`,
      kind: 'task-rehearsal',
      question: task.question,
      answer: task.answer,
      criteria: task.criteria.map((c) => c.levels.exemplary),
    },
    ...task.errors.map((error, i) => ({
      ...shared,
      id: `${task.id}:error-${i}`,
      kind: 'error-analysis',
      question: `Evaluate this response: “${error.response}” Correct the reasoning using the supplied record.`,
      answer: error.correction,
      feedback: error.feedback,
      criteria: [task.criteria.find((c) => c.id === error.criterionId).levels.exemplary],
    })),
    ...(task.scaffoldQuestions || []).map((q, i) => ({
      ...shared,
      ...q,
      id: `${task.id}:scaffold-${i}`,
      kind: 'task-scaffold',
      criteria: ['Uses the supplied record and states the specific reasoning shown in the reference answer.'],
    })),
    {
      ...shared,
      id: `${task.id}:check`,
      kind: 'task-check',
      ...task.checkpoint,
      criteria: task.criteria.map((c) => c.label),
    },
  ];
}
