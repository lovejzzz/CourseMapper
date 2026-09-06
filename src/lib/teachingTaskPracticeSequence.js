import { solveTeachingProportion } from './teachingTaskArithmetic.js';
import { chineseIndependentTask } from './teachingTaskPracticeChinese.js';
import { operationSpecificTransfer } from './teachingTaskTransferOperations.js';

function band(label, strong, proficient, developing, beginning, feedback) {
  return { label, exemplary: strong, proficient, developing, beginning, feedback };
}

function proportionTransfer(task) {
  const cases = [
    {
      context:
        'A fictional club receives 48 forms. Of these, 36 answer a yes/no question, and 15 of the 36 say yes. The other 12 forms leave this question blank.',
      part: 15,
      whole: 36,
      all: 48,
      population: 'all club members',
      result: 'yes answers among forms that answered the question',
    },
    {
      context:
        'A fictional device check logs 45 devices. Nine cannot be tested because their batteries are missing. Of the 36 tested devices, 27 pass.',
      part: 27,
      whole: 36,
      all: 45,
      population: 'all logged devices',
      result: 'passes among tested devices',
    },
    {
      context:
        'A fictional greenhouse receives 60 seeds. Twelve are set aside without testing; 30 of the 48 tested seeds germinate.',
      part: 30,
      whole: 48,
      all: 60,
      population: 'all received seeds',
      result: 'germination among tested seeds',
    },
  ];
  const index = parseInt(task.id.slice(-2), 16) % cases.length;
  const source = cases[index];
  const solved = solveTeachingProportion(source.part, source.whole);
  const answer = `The requested whole is ${source.whole}, giving ${source.part}/${source.whole} ${solved.relation} ${solved.percent}% ${source.result}. ${solved.reverseCheck}. Using ${source.all} as the denominator answers a different question. The unobserved outcomes are unknown, so this result does not establish the rate for ${source.population}.`;
  return {
    sources: [source.context],
    directions: `Calculate the proportion of ${source.result}${solved.exact ? '' : ', to two decimal places'}. Justify the denominator. Explain whether it establishes the rate for ${source.population}.`,
    question: `Try a new case. ${source.context} Calculate the proportion of ${source.result}${solved.exact ? '' : ', to two decimal places'}. Choose and justify the denominator without a worked setup. Explain whether your result establishes the rate for ${source.population}.`,
    answer,
    reasoning: [
      `Identify ${source.part} as the observed part and ${source.whole} as the requested whole.`,
      `Calculate ${source.part}/${source.whole} ${solved.relation} ${solved.percent}%.`,
      'Keep unobserved outcomes separate from failures or no responses.',
    ],
    rubric: [
      band(
        'Choose the relevant whole',
        `Identifies ${source.whole} as the denominator and explains why ${source.all} answers a different question.`,
        `Uses ${source.whole} and names the observed group, without explaining the alternative denominator.`,
        `Uses ${source.whole} without saying who or what it counts.`,
        `Uses ${source.all} for the requested proportion or cannot identify the whole.`,
        'Restate the requested group before choosing its count.',
      ),
      band(
        'Calculate and check',
        `Shows ${source.part}/${source.whole} ${solved.relation} ${solved.percent}% and a valid reverse check, with any rounding labeled.`,
        `Shows the correct fraction and percentage with any rounding labeled, but omits the check.`,
        `States the percentage without a supporting calculation.`,
        'Reverses the fraction, omits conversion, or treats a rounded value as exact.',
        'Separate the exact fraction, conversion and rounding; check using the exact fraction.',
      ),
      band(
        'Respect missing outcomes',
        `Explicitly leaves the missing outcomes unknown and explains why the observed rate cannot establish the rate for ${source.population}.`,
        'Names the missing outcomes and avoids a population claim, without explaining the effect on inference.',
        'Mentions uncertainty without identifying the missing group.',
        'Treats missing observations as failures/no answers, or generalizes the observed rate.',
        'Mark which outcomes were measured and which are unknown.',
      ),
    ],
    feedback:
      'Check the requested denominator first. Then check the conversion and whether missing observations were incorrectly treated as known outcomes.',
    verification: {
      ...solved,
      method: 'exact-rational-calculation',
      scope: 'arithmetic and explicitly defined fictional counts',
    },
  };
}

function sourceTransfer() {
  return {
    directions:
      'Decide which records conflict. Explain whether Record C resolves the disagreement, and propose one specific additional record that could help.',
    sources: [
      'In a fictional archive, Record A dates the first public broadcast of a community radio station to 12 May 1941.',
      'Record B dates the same first public broadcast to 12 May 1942. Record C records a building permit in 1940 but gives no broadcast date.',
    ],
    question:
      'Try a new fictional archive case. Record A dates a station’s first public broadcast to 12 May 1941; Record B dates that same first broadcast to 12 May 1942. Record C dates a building permit to 1940 but gives no broadcast date. Decide which records conflict. Explain whether Record C resolves the disagreement, and propose one specific additional record that could help.',
    answer:
      'A and B conflict because they assign incompatible dates to the same first broadcast. C concerns a building permit, a different event, and does not choose between 1941 and 1942. The broadcast date remains unresolved. A dated transmission log or contemporaneous program listing explicitly recording the first broadcast could help; that is a proposed source to seek, not evidence already supplied. Equivalent relevant source proposals are acceptable.',
    reasoning: [
      'Label both the event and date in each record.',
      'Test compatibility only between claims about the same event.',
      'Keep the unresolved date open and describe the evidence needed to resolve it.',
    ],
    rubric: [
      band(
        'Identify the actual conflict',
        'Names A and B and explains that their dates are incompatible for the same first broadcast.',
        'Identifies A and B as conflicting and labels the common event, but leaves the incompatibility implicit.',
        'Notes different dates without distinguishing the events.',
        'Says all three records conflict, or that A and B cannot conflict because dates can differ.',
        'Write a date/event row for each record before comparing it.',
      ),
      band(
        'Bound what Record C establishes',
        'Explains that a permit date does not establish the first broadcast date and cannot resolve A versus B.',
        'Distinguishes the permit from broadcasting but does not explicitly address resolution.',
        'Says C is irrelevant without explaining the different event.',
        'Treats the permit as proof of a 1940 broadcast or as proof one later record is false.',
        'Separate permission to use a building from evidence of an actual broadcast.',
      ),
      band(
        'Propose useful further evidence',
        'Names a specific contemporaneous broadcast record, explains its relevance, and leaves the current date unresolved.',
        'Suggests a relevant specific record and avoids choosing a date, without explaining its evidential role.',
        'Asks for more research without naming what evidence is missing.',
        'Invents a confirming document or chooses a date unsupported by the packet.',
        'State what event the proposed record must explicitly document.',
      ),
    ],
    feedback:
      'If your answer chooses a date, underline the supplied statement that supports that choice. If none resolves the conflict, revise the conclusion to unresolved.',
  };
}

function experimentTransfer() {
  return {
    directions:
      'Identify the confound. Propose a repeatable repaired procedure with measurement, order control and replication. State what conclusion still needs results.',
    sources: [
      'A fictional absorbency comparison dips a 10 cm × 10 cm piece of paper A and a 20 cm × 20 cm piece of paper B into the same liquid for ten seconds.',
      'Mass gain in grams is measured immediately afterward. Paper type and area differ together; no results from equal-area pieces are supplied.',
    ],
    question:
      'Try a new fictional experiment. A 10 cm × 10 cm piece of paper A and a 20 cm × 20 cm piece of paper B are dipped into the same liquid for ten seconds; mass gain in grams is then measured. Identify what prevents the comparison from isolating paper type. Propose a repeatable repaired procedure, including assignment/order, measurement and replication. State what conclusion still needs results.',
    answer:
      'Paper type and area vary together, so a difference in mass gain cannot be attributed to paper type alone. Cut independent pieces of A and B to the same dimensions; use the same liquid, immersion time and weighing method. Randomize the testing order, use multiple independent pieces of each paper, and measure mass before and immediately after immersion to calculate gain. This tests the defined paper-type comparison under those conditions; it does not prove that A or B absorbs more before results exist. Other workable equal-area procedures with comparable controls and measurement are acceptable.',
    reasoning: [
      'Identify paper type as the intended comparison and area as a competing explanation.',
      'Specify equal area and a repeatable mass-gain measurement.',
      'Separate a repaired design from empirical evidence of a treatment effect.',
    ],
    rubric: [
      band(
        'Diagnose the confound',
        'Identifies both paper type and unequal area and explains why either can account for a mass-gain difference.',
        'Names unequal area and paper type, but does not explain the alternative explanation.',
        'Says the experiment is unfair without specifying what differs.',
        'Attributes any difference only to paper type or names a condition already held equal as the confound.',
        'List each condition for A and B and circle the differences.',
      ),
      band(
        'Specify an executable repair',
        'Uses equal-area independent pieces, matched liquid/time/weighing, randomized order and replication; specifies before/after mass gain.',
        'Controls area and states a usable mass-gain procedure, but omits order control or independent replication.',
        'Proposes equal pieces but leaves the measurement or other conditions unclear.',
        'Changes the intended treatment too, retains unequal area, or supplies no workable comparison.',
        'Write the materials, dimensions, timing and measurement steps another student would need.',
      ),
      band(
        'Bound the conclusion',
        'States that results are still needed to compare mass gain and limits any later conclusion to the tested conditions.',
        'Avoids claiming a result and states that testing is required, but leaves the conditions implicit.',
        'Uses cautious wording while still suggesting a preferred paper without results.',
        'Claims the repaired design proves one paper is better.',
        'Distinguish what the design controls from what observations would establish.',
      ),
    ],
    feedback:
      'Check whether your repair still changes area with paper type. Then check whether a peer can repeat your measurement and whether you claimed a result not yet observed.',
  };
}

export function buildTeachingTaskPracticeSequence(task) {
  const transfer =
    operationSpecificTransfer(task) ||
    (task.language === 'zh'
      ? chineseIndependentTask(task)
      : task.kind === 'source-proportion' || task.family === 'calculation'
        ? proportionTransfer(task)
        : task.kind === 'record-event-comparison' || task.family === 'source-analysis'
          ? sourceTransfer()
          : ['confound-diagnosis', 'controlled-comparison-repair'].includes(task.kind) || task.family === 'experiment'
            ? experimentTransfer()
            : null);
  if (!transfer) return [];
  return [
    {
      id: `${task.id}:worked`,
      kind: 'worked-example',
      question: task.question,
      sources: task.inputs.map((input) => input.text),
      answer: task.answer,
      reasoning: task.reasoning,
    },
    {
      id: `${task.id}:guided`,
      kind: 'guided-practice',
      question: task.scaffoldQuestions?.[0]?.question || task.checkpoint.question,
      answer: task.scaffoldQuestions?.[0]?.answer || task.checkpoint.answer,
      sources: task.inputs.map((input) => input.text),
      feedback: task.criteria[0].feedback,
    },
    {
      id: `${task.id}:transfer`,
      kind: 'independent-transfer',
      ...transfer,
      provenance: { kind: 'explicitly-fictional-compiler-practice', externalFactualClaim: false },
      criteria: transfer.rubric.map((criterion) => criterion.exemplary),
    },
    {
      id: `${task.id}:revision`,
      kind: 'feedback-retry',
      question:
        task.language === 'zh'
          ? '收到反馈后，指出第一处错误或缺失的推理。修正这一步，再不看参考答案独立写出完整的修改稿。'
          : 'After feedback, identify the first incorrect or missing reasoning step. Correct that step, then write the complete revised response without copying the key.',
      answer: transfer.answer,
      feedback: transfer.feedback,
    },
  ];
}
