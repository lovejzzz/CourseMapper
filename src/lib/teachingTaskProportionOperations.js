import { explicitSourceProportions, solveTeachingProportion } from './teachingTaskArithmetic.js';

function rubric(id, label, weight, complete, partial, error, feedback, proficient) {
  return {
    id,
    label,
    weight,
    feedback,
    levels: { exemplary: complete, proficient, developing: partial, beginning: error },
  };
}

export function compareSourceProportions(claims, objective) {
  if (!/\bcompar\w*\b|比较/i.test(objective)) return null;
  const values = explicitSourceProportions(claims);
  if (values.length !== 2 || values[0].sourceClaim === values[1].sourceClaim) return null;
  const [a, b] = values;
  const difference = BigInt(a.numerator) * BigInt(b.denominator) - BigInt(b.numerator) * BigInt(a.denominator);
  const relation =
    difference === 0n
      ? 'equal proportions'
      : difference > 0n
        ? 'the first record has the higher proportion'
        : 'the second record has the higher proportion';
  const counts =
    Number(a.numerator) === Number(b.numerator)
      ? 'The two recorded counts are equal.'
      : `The ${Number(a.numerator) > Number(b.numerator) ? 'first' : 'second'} record has more counted outcomes (${a.numerator} versus ${b.numerator}).`;
  const limits = claims.filter((c) => !values.some((v) => v.sourceClaim === c)).join(' ');
  if (!limits) return null;
  const results = values.map(
    (v, i) => `Record ${i + 1}: ${v.numerator}/${v.denominator} ${v.relation} ${v.percent}%. ${v.reverseCheck}.`,
  );
  const answer = `${results.join(' ')} Comparing like denominators by cross-multiplication: ${a.numerator} × ${b.denominator} ${difference === 0n ? '=' : difference > 0n ? '>' : '<'} ${b.numerator} × ${a.denominator}; ${relation}. ${counts} A count and a proportion answer different questions. ${limits}`;
  return {
    kind: 'source-proportion-comparison',
    family: 'calculation',
    title: 'Compare counts and proportions',
    summary: answer,
    question:
      'Compute the two recorded proportions, show how you compare them, and explain which record has the higher proportion and which has the larger count. Explain whether either result establishes a causal group advantage.',
    answer,
    reasoning: [
      ...results,
      `${relation}; ${counts}`,
      'Compare each count against its own whole; do not compare raw counts as though group sizes were equal.',
      limits,
    ],
    criteria: [
      rubric(
        'fractions',
        'Use each record’s own denominator',
        30,
        results.join(' '),
        'Gives both percentages without showing their fractions.',
        'Uses one group’s whole for both records.',
        'Label part and whole separately for each record.',
        'Shows both correct fractions and percentages but omits one reverse check.',
      ),
      rubric(
        'comparison',
        'Separate count from rate',
        35,
        `${relation}. ${counts} Explains the different denominators.`,
        'Chooses the higher proportion without explaining how it differs from the count comparison.',
        'Chooses the larger count as proof of the higher proportion.',
        'Compare equal fractions or cross-products, then compare the raw counts separately.',
        'Correctly identifies both comparisons but does not explain why different group sizes matter.',
      ),
      rubric(
        'scope',
        'Bound the comparison',
        35,
        limits,
        'Mentions uncertainty without identifying its source.',
        'Claims that the higher observed proportion proves that group membership caused success.',
        'Identify how membership was determined and what other differences could explain outcomes.',
        'Names the source limitation and avoids a causal claim, without explaining the competing explanation.',
      ),
    ],
    errors: [
      {
        criterionId: 'comparison',
        response: 'The group with more counted outcomes must have the higher proportion.',
        correction: `${relation}. ${counts}`,
        feedback: 'Divide each count by its own group size before comparing.',
      },
      {
        criterionId: 'scope',
        response: 'The observed proportion proves a causal group advantage.',
        correction: limits,
        feedback: 'Separate arithmetic from evidence about group assignment.',
      },
    ],
    checkpoint: {
      question: 'Explain why the larger count need not mean the higher proportion, using the two records.',
      answer,
    },
    scaffoldQuestions: [
      { question: 'Write each record’s part and whole before calculating.', answer: results.join(' ') },
    ],
  };
}

export function inconsistentParticipantCountsTask(claims, objective) {
  if (!/\b(?:check|supports?|valid|proportion)\b|检查|比例/i.test(objective)) return null;
  const counts = claims.flatMap((text, index) =>
    [...text.matchAll(/\b(\d+) distinct participants\b/g)].map((m) => ({ value: Number(m[1]), text, index })),
  );
  if (counts.length !== 2 || !/each participant.*at most once/i.test(claims.join(' '))) return null;
  const attendance = counts.find((c) => /attendance|attended|enrolled/i.test(c.text));
  const completion = counts.find((c) => /completed|completion/i.test(c.text));
  if (!attendance || !completion || completion.value <= attendance.value) return null;
  const conclusion = `The counts cannot support a participant completion proportion: ${completion.value} distinct completers exceed the ${attendance.value} distinct participants, although each participant can complete at most once.`;
  const limit =
    'The packet does not identify which count is wrong. Reconcile attendance and completion records for the same session and deduplicate participant identities before calculating; do not change either count by guesswork.';
  return {
    kind: 'source-proportion-validation',
    family: 'calculation',
    title: 'Check the record before calculating',
    summary: conclusion,
    question:
      'Decide whether the supplied counts can form a valid participant completion proportion. State the violated counting constraint, identify which source records need reconciliation, and explain what you can and cannot conclude.',
    answer: `${conclusion} ${limit}`,
    reasoning: [
      `Attendance record: ${attendance.text}`,
      `Completion record: ${completion.text}`,
      `A count of distinct completers must be between 0 and ${attendance.value}, inclusive.`,
      limit,
    ],
    criteria: [
      rubric(
        'counts',
        'Identify the incompatible counts',
        30,
        conclusion,
        'Names the two counts without explaining the mismatch.',
        'Treats completers as a separate unlimited population.',
        'Label the same-session whole and its completed subset.',
        'Identifies that completions exceed participants but omits the at-most-once rule.',
      ),
      rubric(
        'constraint',
        'Explain the part–whole constraint',
        35,
        `Distinct completers must satisfy 0 ≤ completed ≤ ${attendance.value}; ${completion.value} violates that condition.`,
        'Says the percentage looks unusual without stating why it is invalid.',
        'Presents a participant completion percentage above 100% as valid.',
        'Check whether the numerator can be a subset of the denominator before dividing.',
        'States the correct inequality and violation but does not tie it to distinct participants.',
      ),
      rubric(
        'repair',
        'Reconcile without inventing a correction',
        35,
        limit,
        'Asks for better data without naming the records to compare.',
        'Deletes completions or increases attendance to force a valid ratio.',
        'Compare the two identity lists for the same event; investigate duplicate or mismatched records.',
        'Names both records and avoids guessing, but omits how identities/session scope should be checked.',
      ),
    ],
    errors: [
      {
        criterionId: 'constraint',
        response: 'Any two positive counts can be divided to give a valid participant completion proportion.',
        correction: conclusion,
        feedback: 'Check subset membership and the at-most-once condition first.',
      },
      {
        criterionId: 'repair',
        response: `Replace the completion count with ${attendance.value} so the result is 100%.`,
        correction: limit,
        feedback: 'A plausible corrected number is not evidence; inspect the original records.',
      },
    ],
    checkpoint: {
      question: 'Can you determine which count is wrong? Explain the next check using the source.',
      answer: limit,
    },
    scaffoldQuestions: [
      {
        question:
          'What is the maximum possible distinct completion count under the stated attendance and counting rule?',
        answer: `${attendance.value}, if every distinct participant completes once.`,
      },
    ],
  };
}

export function localizeProportionTask(body, claims, objective) {
  if (!/\p{Script=Han}/u.test(objective) || body.kind !== 'source-proportion') return body;
  const v = body.workedExample.verification;
  const s = solveTeachingProportion(v.numerator, v.denominator);
  const calculation = `${s.numerator}/${s.denominator} ${s.relation} ${s.decimal} ${s.relation} ${s.percent}%；检验：${s.reverseCheck}。`;
  const scope = claims.filter((c) => !c.includes(`${s.numerator}/${s.denominator}`)).join(' ');
  const limit = `该比例只描述已观察到的样本。${scope} 数值计算正确并不能证明全体人群的比例；未观察群体的结果仍未知。`;
  const answer = `${calculation}${s.exact ? '以上数值表示同一个精确比例。' : '百分比保留两位小数，是近似值；用精确分数进行反向检验。'}${limit}`;
  return {
    ...body,
    language: 'zh',
    title: '计算并解释样本比例',
    summary: answer,
    question: `把${s.numerator}/${s.denominator}换算成小数和百分比，写出检验过程；说明分母所代表的群体，以及为什么不能直接推广到全体。`,
    answer,
    reasoning: [`分子为${s.numerator}，分母为${s.denominator}；先核对它们描述的观察范围。`, calculation, limit],
    criteria: [
      rubric(
        'part-whole',
        '识别部分与整体',
        25,
        `把${s.numerator}标为所求部分，把${s.denominator}标为已观察整体，并用材料说明所指群体。`,
        '写出了分数，但没有解释分母所指的群体。',
        '颠倒分子分母，或使用材料没有给出的计数。',
        '先用语言写清楚“谁占谁的比例”，再列分数。',
        `正确标出${s.numerator}和${s.denominator}，但缺少材料中的群体说明。`,
      ),
      rubric(
        'conversion',
        '换算并核验',
        40,
        calculation,
        `只给出${s.percent}%，没有展示换算。`,
        '把小数直接标为百分数，或把近似值当成精确值。',
        '先做除法，再乘100；必要时标明舍入，用精确分数反向检查。',
        '分数与百分比正确且舍入标记恰当，但缺少检验。',
      ),
      rubric(
        'scope',
        '解释证据边界',
        35,
        limit,
        '提到了局限，但没有指出未观察到的具体群体。',
        '把样本比例直接当成全体比例，或把缺失结果当成反对/失败。',
        '列出谁被观察、谁未被观察，再判断推广结论所需的证据。',
        '指出样本范围与缺失群体，但没有解释这为何限制推广。',
      ),
    ],
    errors: [
      {
        criterionId: 'conversion',
        response: `${s.numerator}/${s.denominator}=${s.decimal}%。`,
        correction: calculation,
        feedback: '小数换为百分比需要乘100。',
      },
      {
        criterionId: 'scope',
        response: `全体人群的比例必定为${s.percent}%。`,
        correction: limit,
        feedback: '计算是否正确与样本是否能代表全体是两个问题。',
      },
    ],
    checkpoint: { question: '写出精确检验，并指出一个未观察到的群体。', answer: `${s.reverseCheck}。${limit}` },
    scaffoldQuestions: [
      {
        question: '分子与分母分别代表谁？',
        answer: `分子${s.numerator}是所求部分，分母${s.denominator}是已观察到的整体。${claims[0]}`,
      },
      { question: '哪些结果仍然未知？', answer: limit },
    ],
    workedExample: {
      ...body.workedExample,
      studentTask: `计算${s.numerator}/${s.denominator}并解释观察范围。`,
      problem: `计算${s.numerator}/${s.denominator}。`,
      steps: [calculation, limit],
      result: answer,
      interpretation: limit,
      boundary: limit,
    },
  };
}
