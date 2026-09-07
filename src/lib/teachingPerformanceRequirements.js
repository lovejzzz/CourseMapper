import { sha256HexSync } from './sha256Sync.js';
import { canonicalJson } from './canonicalJson.js';

// Version 2 lives inside the operation plan, not beside it as another
// editable task authority. Version 1 plans continue to use computed defaults.
export const AUTHORED_REQUIREMENTS_PLAN_VERSION = 2;
export const PERFORMANCE_LEVELS = ['exemplary', 'proficient', 'developing', 'beginning'];
const record = (v) => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const text = (v) => typeof v === 'string' && Boolean(v.trim()) && v.length <= 6000;
const texts = (v) => Array.isArray(v) && v.length > 0 && v.length <= 12 && v.every(text);
const identity = (v) => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,95}$/.test(v);

export function performanceSourceRevision(inputs) {
  return sha256HexSync(canonicalJson(inputs.map(({ id, text: content }) => ({ id, text: content }))));
}

/** These are structural and dependency checks. A reviewed answer remains a
 * teacher judgment; well-formed levels do not prove grading validity. */
export function validatePerformanceRequirements(plan, inputs, objective) {
  const issues = [];
  const push = (code, message) => issues.push({ code, message });
  const requirements = plan.requirements;
  if (
    !Array.isArray(requirements) ||
    !requirements.length ||
    requirements.length > 12 ||
    requirements.some((r) => !record(r) || !identity(r.id)) ||
    new Set(requirements.map((r) => r.id)).size !== requirements.length
  ) {
    push('performance-identities', 'Use one to twelve teaching requirements with unique stable identities.');
    return { valid: false, issues };
  }
  if (
    requirements.some((r) => !Number.isInteger(r.weight) || r.weight <= 0) ||
    requirements.reduce((total, r) => total + r.weight, 0) !== 100
  )
    push('performance-weights', 'Give every teaching requirement a positive whole scoring weight; total 100.');
  function checkResponse(content, name, main) {
    if (!record(content)) {
      push('performance-content', `${name} needs a task, reference, scoring and feedback.`);
      return;
    }
    for (const field of ['action', 'answer', 'feedback'])
      if (!text(content[field])) push('performance-content', `${name} needs ${field}.`);
    if (!texts(content.reasoning)) push('performance-reasoning', `${name} needs explicit reasoning steps.`);
    if (
      !record(content.levels) ||
      PERFORMANCE_LEVELS.some((level) => !text(content.levels[level])) ||
      new Set(PERFORMANCE_LEVELS.map((level) => content.levels?.[level]?.trim())).size !== 4
    )
      push('performance-levels', `${name} needs four distinct descriptions of observable performance.`);
    if (!main) return;
    if (!text(content.label)) push('performance-label', `${name} needs a short teaching requirement label.`);
    if (!record(content.guided) || !text(content.guided.question) || !text(content.guided.answer))
      push('performance-guided', `${name} needs a guided question and its reference response.`);
    if (
      !record(content.examples) ||
      ['partial', 'misconception', 'alternative'].some((key) => !text(content.examples[key]))
    )
      push('performance-examples', `${name} needs partial, mistaken and acceptable alternative review responses.`);
    else if (
      content.examples.partial.trim() === content.answer?.trim() ||
      content.examples.misconception.trim() === content.answer?.trim()
    )
      push('performance-examples', `${name} cannot use the complete reference as its partial or mistaken response.`);
  }
  for (const r of requirements) {
    checkResponse(r, `Requirement ${r.id}`, true);
    checkResponse(r.transfer, `Independent practice for ${r.id}`, false);
  }
  const sources = plan.practiceInputs;
  if (
    !Array.isArray(sources) ||
    !sources.length ||
    sources.length > 8 ||
    sources.some(
      (s) => !record(s) || !identity(s.id) || !text(s.text) || !['fictional', 'teacher-provided'].includes(s.kind),
    ) ||
    new Set(sources.map((s) => s.id)).size !== sources.length
  )
    push('performance-practice-sources', 'Independent practice needs identified records and their stated origin.');
  else if (canonicalJson(sources.map((s) => s.text.trim())) === canonicalJson(inputs.map((s) => s.text.trim())))
    push('performance-same-case', 'Supply a new practice case; the main source packet is already guided practice.');
  if (
    !record(plan.contentReview) ||
    plan.contentReview.sourceRevision !== performanceSourceRevision(inputs) ||
    !text(plan.contentReview.objective)
  )
    push(
      'performance-stale-source',
      'Review the authored requirements, references and practice against these source records.',
    );
  if (objective !== undefined && plan.contentReview?.objective !== objective)
    push(
      'performance-stale-objective',
      'The teaching objective changed. Review which performances and practice it now requires.',
    );
  return { valid: !issues.length, issues };
}

const t = (zh, en, cn) => (zh ? cn : en);
const numbered = (items) => items.map((item, i) => `${i + 1}. ${item}`).join('\n');

function contrastResponses(requirements) {
  return [
    ['complete', 'exemplary', (r) => r.answer],
    ['conclusion-without-reasoning', 'developing', (r) => r.examples.partial],
    ['misconception', 'beginning', (r) => r.examples.misconception],
    ['alternative-representation', 'exemplary', (r) => r.examples.alternative],
  ].map(([id, level, responseFor]) => {
    let response = '';
    const judgments = requirements.map((r) => {
      if (response) response += '\n\n';
      const quote = responseFor(r),
        start = response.length;
      response += quote;
      return {
        criterionId: r.id,
        level,
        rationale: r.levels[level],
        evidence: [{ start, end: response.length, quote }],
      };
    });
    return { id, kind: 'synthetic-review-example', response, judgments, reviewBasis: 'teacher-authored' };
  });
}

/** Project the complete reviewed requirement set. Dropped requirements cannot
 * survive as hidden questions, criteria, worked answers or error feedback. */
export function renderPerformanceRequirements(body, plan, inputs, objective) {
  if (plan.version !== AUTHORED_REQUIREMENTS_PLAN_VERSION) return body;
  if (!validatePerformanceRequirements(plan, inputs, objective).valid) return null;
  const zh = body.language === 'zh';
  const requirements = plan.requirements;
  const directions = requirements.map((r) => r.action);
  const question = `${t(zh, 'Use the supplied records to complete these tasks:', '根据所给记录完成以下任务：')}\n${numbered(directions)}`;
  const answer = requirements.map((r) => r.answer).join('\n\n');
  const reasoning = requirements.flatMap((r) => r.reasoning);
  const criteria = requirements.map(({ id, label, weight, levels, feedback }) => ({
    id,
    label,
    weight,
    levels: structuredClone(levels),
    feedback,
  }));
  const product = t(
    zh,
    `Submit a labelled response covering: ${requirements.map((r) => r.label).join('; ')}. Equivalent accessible formats are welcome.`,
    `提交一份带标签的作答，覆盖：${requirements.map((r) => r.label).join('；')}。可采用等效的无障碍表达形式。`,
  );
  return {
    ...body,
    question,
    directions,
    answer,
    reasoning,
    criteria,
    product,
    contentValidation: { method: 'teacher-reviewed-requirements', automatedSemanticProof: false },
    errors: requirements.map((r) => ({
      criterionId: r.id,
      response: r.examples.misconception,
      correction: r.answer,
      feedback: r.feedback,
    })),
    scaffoldQuestions: requirements.map((r) => ({ criterionId: r.id, ...structuredClone(r.guided) })),
    checkpoint: { question, answer },
    contrastResponses: contrastResponses(requirements),
    workedExample: {
      ...body.workedExample,
      protocol: body.workedExample?.protocol || 'coursemapper-shared-teaching-task-v1',
      problem: question,
      studentTask: question,
      inputs: inputs.map((s) => s.text),
      steps: reasoning,
      result: answer,
      transferTask: t(
        zh,
        'Hide the reference and reconstruct this response; this rehearses the same case.',
        '遮住参考答案，重新完成本题；这是同案例练习。',
      ),
      // Checked operation arithmetic is separate from authored reasoning.
      verification: {
        method: 'teacher-reviewed-content',
        checked: false,
        scope: 'Authored reasoning is not machine-proven.',
      },
    },
  };
}

export function performancePracticeSequence(task) {
  const plan = task.operationPlan;
  if (plan?.version !== AUTHORED_REQUIREMENTS_PLAN_VERSION) return null;
  const zh = task.language === 'zh';
  const directions = numbered(plan.requirements.map((r) => r.transfer.action));
  const sources = plan.practiceInputs.map((s) => s.text);
  const answer = plan.requirements.map((r) => r.transfer.answer).join('\n\n');
  const feedback = plan.requirements.map((r) => r.transfer.feedback).join(' ');
  return [
    {
      id: `${task.id}:worked`,
      kind: 'worked-example',
      question: task.question,
      sources: task.inputs.map((s) => s.text),
      answer: task.answer,
      reasoning: task.reasoning,
    },
    ...plan.requirements.map((r) => ({
      id: `${task.id}:guided:${r.id}`,
      kind: 'guided-practice',
      requirementId: r.id,
      question: r.guided.question,
      answer: r.guided.answer,
      sources: task.inputs.map((s) => s.text),
      feedback: r.feedback,
    })),
    {
      id: `${task.id}:transfer`,
      kind: 'independent-transfer',
      sources,
      directions,
      question: `${t(zh, 'Apply the requirements to this new case.', '将这些要求应用到以下新案例。')}\n${numbered(sources)}\n${directions}`,
      answer,
      reasoning: plan.requirements.flatMap((r) => r.transfer.reasoning),
      feedback,
      rubric: plan.requirements.map((r) => ({
        criterionId: r.id,
        label: r.label,
        weight: r.weight,
        ...r.transfer.levels,
        feedback: r.transfer.feedback,
      })),
      criteria: plan.requirements.map((r) => r.transfer.levels.exemplary),
      provenance: {
        kind: 'teacher-reviewed-practice',
        records: plan.practiceInputs.map(({ id, kind }) => ({ id, kind })),
      },
      verification: {
        method: 'teacher-review',
        checked: false,
        scope: 'Reference and new-context alignment require teacher review.',
      },
    },
    {
      id: `${task.id}:revision`,
      kind: 'feedback-retry',
      answer,
      feedback,
      question: t(
        zh,
        'Use the feedback to identify and repair a missing or incorrect step, then submit your revised response without copying the reference.',
        '根据反馈指出并修正缺失或错误的步骤，再不看参考答案提交修改稿。',
      ),
    },
  ];
}
