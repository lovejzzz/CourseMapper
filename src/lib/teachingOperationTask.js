import { evaluateTeachingOperationPlan, TEACHING_OPERATION_SPECS } from './teachingOperationPlan.js';
import {
  AUTHORED_REQUIREMENTS_PLAN_VERSION,
  renderPerformanceRequirements,
} from './teachingPerformanceRequirements.js';
import { buildEvidenceTask } from './teachingTaskEvidenceBuilder.js';
import { renderObservedProportion } from './teachingOperationProportion.js';
import { renderComparisonTask } from './teachingOperationComparisonTask.js';
import { renderChronologyTask } from './teachingOperationChronology.js';
import { renderPoolingTask } from './teachingOperationPooling.js';

/** Material language is a projection of the same checked operation. Neither
 * model prose nor a material's saved answer is a second answer authority. */
export function renderTeachingOperationTask(plan, inputs, objective) {
  const evaluated = evaluateTeachingOperationPlan(plan, inputs, objective);
  if (evaluated.status !== 'ready') return null;
  const authoredPlan = plan;
  const project = (body) =>
    renderPerformanceRequirements(
      { ...body, operationPlan: structuredClone(authoredPlan) },
      authoredPlan,
      inputs,
      objective,
    );
  if (plan.version === AUTHORED_REQUIREMENTS_PLAN_VERSION) {
    const spec = TEACHING_OPERATION_SPECS[plan.operation];
    // Compute the operation's factual boundary independently of scoring.
    // Its default teaching prose is then replaced by the reviewed contract.
    plan = {
      ...plan,
      requirements: spec.requirements.map((id, i) => ({ id, weight: (spec.defaultWeights || [30, 35, 35])[i] })),
    };
  }
  if (plan.operation === 'observed-proportion')
    return project(renderObservedProportion(plan, inputs, objective, evaluated));
  if (plan.operation === 'pooled-proportion') return project(renderPoolingTask(plan, inputs, objective, evaluated));
  if (plan.operation === 'paired-condition-confound')
    return project(renderComparisonTask(plan, inputs, objective, evaluated));
  if (plan.operation === 'record-relative-day')
    return project(renderChronologyTask(plan, inputs, objective, evaluated));
  const zh = /\p{Script=Han}/u.test(objective);
  const {
    priorValue: prior,
    amendedValue: next,
    priorUnit: unit,
    effectiveDate: date,
    priorRecord,
    amendedRecord,
    observationLimit,
  } = evaluated.values;
  const conclusion = zh
    ? `所给记录最初记载 ${prior} ${unit}；修订条目规定自 ${date} 起为 ${next} ${unit}。这表示规则的适用时间发生变化，并不证明早期条目本来就是错误的。`
    : `The supplied log first records ${prior} ${unit}; the amendment sets ${next} ${unit} from ${date}. This is an effective-date change, not proof that the earlier entry was simply false.`;
  const limit = zh
    ? `尚不能确定这次观察适用哪一版规则：${observationLimit} 需要确定观察的发生日期及当时有效的规则。不能仅凭未注明日期的观察就选定 ${prior} 或 ${next} ${unit}，也不能补写材料未提供的年份。`
    : `The applicable capacity for the undated observation is unresolved: ${observationLimit} Establish its event date and the rule version in force then. Do not assign either ${prior} or ${next} ${unit} merely from the observation or assume a year the record does not supply.`;
  const error = zh
    ? `修订证明 ${prior} ${unit} 一直都是错的，所以未注明日期的观察一定适用 ${next} ${unit}。`
    : `The amendment proves that ${prior} ${unit} was always incorrect, so the undated observation must be judged against ${next} ${unit}.`;
  const repair = zh
    ? '按照适用时间把两个值放在时间线上。选择规则版本前，先取得观察日期；保留早期条目作为早期规则的记录。'
    : 'Place each capacity on a timeline using its effective scope. Obtain the observation date before choosing a version; preserve the earlier entry as evidence of the recorded earlier rule.';
  const body = buildEvidenceTask({
    kind: 'evidence-source-analysis',
    operator: 'effective-record-amendment',
    claims: inputs.map((input) => input.text),
    objective,
    zh,
    conclusion,
    limit,
    error,
    repair,
    question: zh
      ? '用时间线或等效的带标签文字列出原条目、修订值及生效日期。解释修订是否证明原条目错误，判断未注明日期的观察能否被分配到某版规则，并提出一项能帮助确定适用版本的具体新证据。'
      : 'Construct a version timeline with the initial entry, amendment and effective date. Explain whether amendment makes the earlier entry false, decide what can be said about the rule applicable to the undated observation, and propose one specific new record that could help determine the applicable version.',
    reasoning: [
      `“${priorRecord}”`,
      `“${amendedRecord}”`,
      zh
        ? `区分条目的记录时间和规则的生效时间。修订明确提供的生效日期是 ${date}；其余未提供的日历信息保持未知。`
        : `Separate the date an entry was written from the date the rule takes effect. The amendment explicitly supplies ${date} as its effective date; missing calendar context must remain missing.`,
    ],
    scoring: [
      zh ? '规则及其修订' : 'A rule and its amendment',
      zh
        ? `准确引用 ${prior} ${unit}、${next} ${unit} 和生效日期 ${date}，分别注明原条目与修订条目。`
        : `Quotes ${prior} ${unit}, ${next} ${unit} and the effective date ${date}, attributing the values to the initial and amended records.`,
      conclusion,
    ],
    levelOverrides: {
      evidence: {
        proficient: zh
          ? `正确指出两个值和 ${date}，但有一条未注明出处。`
          : `Identifies both capacities and ${date}, but omits attribution for one entry.`,
        developing: zh
          ? '指出值发生变化，但遗漏或误标生效日期。'
          : 'Identifies the changed capacity but omits or mislabels its effective date.',
      },
      reasoning: {
        exemplary: zh
          ? `说明 ${prior} ${unit} 属于早期规则，${next} ${unit} 自 ${date} 起适用；用适用时间解释为何修订不使原条目自动失真，以及为何需要观察日期才能选定版本。`
          : `Explains that ${prior} ${unit} belongs to the earlier rule and ${next} ${unit} applies from ${date}; uses effective scope to explain why amendment does not make the earlier entry false and why assigning the observation needs its date.`,
        proficient: zh
          ? '正确区分原规则和修订的适用时间，但未解释为何原条目仍可能正确。'
          : 'Correctly separates the effective scopes of the two rules, but leaves unexplained why the earlier entry can still be correct.',
        developing: zh
          ? '说出发生变化或结论未定，却没有解释生效时间和观察之间的关系。'
          : 'States a change or an unresolved conclusion without explaining the relationship between effective scope and the observation.',
      },
      boundary: {
        exemplary: zh
          ? `${limit} 提出带日期、能确认与同一观察相关的登记记录，并解释它如何与有效规则对照；这是建议查找的证据，不是已经取得的事实。其他同样相关的证据也可以。`
          : `${limit} Proposes a dated register linked to this same observation and explains how to compare it with the rule in force; this is evidence to seek, not a document already obtained. Other relevant corroborating records are acceptable.`,
        proficient: zh
          ? '在取得观察日期之前保留判断，但没有提出具体的带日期佐证。'
          : 'Keeps the applicable version unresolved until the observation is dated, but does not specify a dated corroborating record.',
        developing: zh
          ? '笼统要求更多信息，没有指出缺失的是观察日期。'
          : 'Says more context is needed without identifying the missing observation date.',
      },
    },
  });
  body.criteria = body.criteria.map((criterion) => ({
    ...criterion,
    weight: plan.requirements.find((entry) => entry.id === criterion.id).weight,
  }));
  const relevantEvidence = zh
    ? '可以查找能与这次观察对应的带日期登记记录，再与当时有效的规则对照。这只是查证建议；其他同样相关的佐证也可以。'
    : 'Seek a dated register that can be linked to this same observation, then compare it with the rule in force. This is a proposed check; other relevant corroborating records are acceptable.';
  // The question and highest scoring band request new evidence, so the
  // reference response must model it too; a generic "more context" is not enough.
  body.answer += ` ${relevantEvidence}`;
  body.reasoning.push(relevantEvidence);
  body.operationPlan = structuredClone(plan);
  body.derivation = evaluated.steps;
  body.contrastResponses = [
    {
      id: 'complete',
      kind: 'synthetic-review-example',
      response: body.answer,
      judgments: body.criteria.map((criterion) => ({
        criterionId: criterion.id,
        level: 'exemplary',
        evidence: criterion.levels.exemplary,
      })),
    },
    {
      id: 'conclusion-without-reasoning',
      kind: 'synthetic-review-example',
      response: zh
        ? `规则从 ${prior} 改为 ${next} ${unit}，无法确定观察适用哪个版本。`
        : `The rule changes from ${prior} to ${next} ${unit}; the applicable version for the observation is unresolved.`,
      judgments: [
        {
          criterionId: 'evidence',
          level: 'developing',
          evidence: zh ? '遗漏日期与两条出处。' : 'Omits the date and both record attributions.',
        },
        {
          criterionId: 'reasoning',
          level: 'developing',
          evidence: zh
            ? '给出结论，未解释生效时间与观察的关系。'
            : 'Gives the conclusion without explaining how effective scope and the observation relate.',
        },
        {
          criterionId: 'boundary',
          level: 'developing',
          evidence: zh
            ? '未指出缺失的观察日期或具体佐证。'
            : 'Does not name the missing observation date or a specific corroborating record.',
        },
      ],
    },
    {
      id: 'misconception',
      kind: 'synthetic-review-example',
      response: error,
      judgments: [
        { criterionId: 'reasoning', level: 'beginning', evidence: error },
        {
          criterionId: 'boundary',
          level: 'beginning',
          evidence: zh ? '无日期却选择了规则版本。' : 'Selects a rule version without the observation date.',
        },
      ],
    },
    {
      id: 'alternative-representation',
      kind: 'synthetic-review-example',
      response: zh
        ? `表格：原条目 → ${prior} ${unit}；修订条目 → ${date} 起 ${next} ${unit}；观察 → 日期未知、版本未定。修订改变适用时间，不否定原条目。可查找同次活动的带日期签到记录，确认与观察有关后对照当时规则。`
        : `Table: initial record → ${prior} ${unit}; amendment → ${next} ${unit} from ${date}; observation → date unknown, version unresolved. The amendment changes effective scope without disproving the initial entry. A dated attendance register linked to this same event could date the observation for comparison with the rule in force.`,
      judgments: body.criteria.map((criterion) => ({
        criterionId: criterion.id,
        level: 'exemplary',
        evidence: criterion.levels.exemplary,
      })),
    },
  ];
  for (const example of body.contrastResponses) {
    example.judgments = example.judgments.map(({ evidence: rationale, ...judgment }) => {
      const excerpts =
        example.id === 'complete'
          ? judgment.criterionId === 'evidence'
            ? [priorRecord, amendedRecord]
            : judgment.criterionId === 'reasoning'
              ? [conclusion]
              : [observationLimit, relevantEvidence]
          : [example.response];
      return {
        ...judgment,
        rationale,
        evidence: excerpts.map((quote) => {
          const start = example.response.indexOf(quote);
          return { start, end: start + quote.length, quote };
        }),
      };
    });
  }
  return project(body);
}

/** Read-only v0.19.2 baseline for a three-way migration. It is never the new
 * write path: compare authored wording with the actual older generated
 * contract before proposing the expanded task and reference. */
function historicalObservationWording(value) {
  if (typeof value === 'string')
    return value
      .replaceAll('merely from the observation or assume', 'merely from the photograph or assume')
      .replaceAll('so the undated observation must be judged', 'so the undated image must be judged');
  if (Array.isArray(value)) return value.map(historicalObservationWording);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, historicalObservationWording(entry)]));
  return value;
}

export function legacyAmendmentProjection(body) {
  if (body?.operationPlan?.version === AUTHORED_REQUIREMENTS_PLAN_VERSION) return body;
  if (body?.operationPlan?.operation !== 'record-amendment' || body.language !== 'en') return body;
  const previous = historicalObservationWording(body);
  const proposedEvidence = previous.reasoning.pop();
  if (previous.answer.endsWith(` ${proposedEvidence}`))
    previous.answer = previous.answer.slice(0, -(proposedEvidence.length + 1));
  previous.criteria.find((criterion) => criterion.id === 'boundary').levels.exemplary = previous.reasoning.at(-1);
  Object.assign(previous.criteria.find((criterion) => criterion.id === 'reasoning').levels, {
    exemplary: previous.summary,
    proficient:
      'Correctly distinguishes the earlier rule from the amendment, but does not explain why an undated observation cannot be assigned to a version.',
    developing: 'Recognizes a change but treats the most recently written entry as applicable to every time.',
  });
  previous.question =
    'Construct a version timeline with the initial entry, amendment and effective date. Explain whether amendment makes the earlier entry false, then decide what can be said about the rule applicable to the undated observation.';
  delete previous.operationPlan;
  delete previous.operationInputIds;
  delete previous.derivation;
  delete previous.contrastResponses;
  return previous;
}
