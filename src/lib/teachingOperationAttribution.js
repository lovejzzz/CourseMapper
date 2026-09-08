import { buildEvidenceTask } from './teachingTaskEvidenceBuilder.js';

// Roles are reviewed interpretations of exact spans, never a lexical claim
// classifier. Keeping the basis separate prevents attribution becoming an
// invented story about how a speaker acquired their knowledge.
export function validateAttributionBindings(plan) {
  const issues = [];
  const fail = (message, binding) => issues.push({ code: 'plan-attribution', message, binding });
  for (const [record, fields] of [
    ['observationRecord', ['observer', 'observedClaim', 'observationBasis']],
    ['reportRecord', ['reporter', 'reportedClaim', 'reportingBasis']],
    ['inferenceRecord', ['inferenceAuthor', 'inferredClaim', 'inferenceLimit', 'proposedEvidence']],
  ]) {
    for (const field of fields)
      if (
        plan.bindings[field] &&
        plan.bindings[record] &&
        plan.bindings[field].inputId !== plan.bindings[record].inputId
      )
        fail(`${field} must retain its attribution in ${record}.`, field);
  }
  const records = ['observationRecord', 'reportRecord', 'inferenceRecord'].map((key) => plan.bindings[key]?.inputId);
  if (records.every(Boolean) && new Set(records).size !== 3)
    fail(
      'Compare three separately attributed records; do not reuse one record as all three positions.',
      'reportRecord',
    );
  for (const [basis, claim] of [
    ['observationBasis', 'observedClaim'],
    ['reportingBasis', 'reportedClaim'],
    ['inferenceLimit', 'inferredClaim'],
  ]) {
    const a = plan.bindings[basis],
      b = plan.bindings[claim];
    if (a && b && a.inputId === b.inputId && a.start <= b.start && a.end >= b.end)
      fail(`Locate ${basis} separately; repeating ${claim} or its whole record is not a knowledge basis.`, basis);
  }
  for (const [author, claim] of [
    ['observer', 'observedClaim'],
    ['reporter', 'reportedClaim'],
    ['inferenceAuthor', 'inferredClaim'],
  ]) {
    const a = plan.bindings[author],
      b = plan.bindings[claim];
    if (a && b && a.inputId === b.inputId && a.start < b.end && b.start < a.end)
      fail(`Locate ${author} outside ${claim}; select the speaker or document label, not the statement.`, author);
  }
  const proposed = plan.bindings.proposedEvidence,
    limit = plan.bindings.inferenceLimit;
  if (
    proposed &&
    limit &&
    (proposed.inputId !== limit.inputId || proposed.start < limit.start || proposed.end > limit.end)
  )
    fail(
      'Select a specific missing record or measurement named within the evidence-limit statement.',
      'proposedEvidence',
    );
  if (plan.admission?.kind === 'legacy-explicit-rule')
    fail(
      'Review the observation, reported assertion, inference and their stated limits before admission.',
      'reportingBasis',
    );
  return issues;
}

export function renderAttributionTask(plan, inputs, objective, { values: v }) {
  const zh = /\p{Script=Han}/u.test(objective);
  const t = (en, cn) => (zh ? cn : en).replace(/([.!?。！？])”[.。]/gu, '$1”');
  const observation = t(
    `${v.observer} records an observation: “${v.observedClaim}”. Its stated basis or limit is “${v.observationBasis}”. This establishes what the record reports, not independent verification of the event.`,
    `${v.observer}记述观察：“${v.observedClaim}”。原文说明的依据或限制是“${v.observationBasis}”。这表明记录报告了什么，不等于事件已被独立核实。`,
  );
  const report = t(
    `${v.reporter} makes the attributed assertion “${v.reportedClaim}”. The record says “${v.reportingBasis}”. Retain that qualification; do not invent whether the speaker saw, heard, measured or inferred the asserted event.`,
    `${v.reporter}提出陈述“${v.reportedClaim}”。记录说明“${v.reportingBasis}”。保留这项限定，不替陈述者补写亲眼看见、听说、测量或推断的知情方式。`,
  );
  const inference = t(
    `${v.inferenceAuthor} proposes “${v.inferredClaim}”. This is the explanation to evaluate against the records, rather than another observation established by repeating it.`,
    `${v.inferenceAuthor}提出“${v.inferredClaim}”。这是需要对照记录评估的解释，不会因再次出现就成为另一项已证实的观察。`,
  );
  const limit = t(
    `The stated evidence limit is “${v.inferenceLimit}”. Neither accepting “${v.inferredClaim}” nor declaring its opposite proved is justified merely by this gap.`,
    `原文的证据限制是“${v.inferenceLimit}”。不能仅因这项缺口就接受“${v.inferredClaim}”，也不能断言它的反面已被证明。`,
  );
  const next = t(
    `A concrete next check is to seek “${v.proposedEvidence}” linked to the event in these records. Establish its time, location and method, then compare what it actually records with “${v.inferredClaim}”. Report which part it addresses and which parts remain unresolved; a matching result would not automatically prove every causal or intent claim. This is evidence to obtain, not a result already available.`,
    `具体下一步是查找与这些记录中的事件对应的“${v.proposedEvidence}”。核对时间、地点和方法，再把其实际记录的内容与“${v.inferredClaim}”比较。说明它能检验哪一部分、哪些部分仍未解决；即使结果相符，也不会自动证明全部原因或意图。这是待取得的证据，不是现有结果。`,
  );
  const conclusion = t(
    'The three statements have different evidential roles. Keep the speaker, statement and stated basis together before evaluating the explanation.',
    '三项陈述承担不同证据角色。先将陈述者、陈述内容和已说明的依据对应，再评估解释。',
  );
  const error = t(
    `Recording ${v.reporter}'s assertion independently verifies “${v.reportedClaim}”, so “${v.inferredClaim}” is proved.`,
    `记录${v.reporter}的陈述就独立核实了“${v.reportedClaim}”，所以“${v.inferredClaim}”已经得到证明。`,
  );
  const repair = t(
    `Retain the actual qualification “${v.reportingBasis}”. Then test the explanation against “${v.inferenceLimit}”, rather than inventing a knowledge source or treating repetition as corroboration.`,
    `保留实际限定“${v.reportingBasis}”。再对照“${v.inferenceLimit}”检查解释，不补写知情方式，也不把重复陈述当作独立佐证。`,
  );
  const question = t(
    'Make a three-row claim table (equivalent labeled prose is welcome). For each selected statement, identify its speaker or document, quote it, classify its role as a reported observation, attributed assertion or explanation, and quote the stated basis or limit. Explain what the explanation does and does not establish, including why missing evidence proves neither it nor its opposite. Propose one specific evidence check and explain what it could resolve and what would remain unknown.',
    '制作三行陈述表，也可用带标签的文字。逐项标明陈述者或文献、引用原话、区分记述的观察、有归属的陈述和解释，并引用原文说明的依据或限制。说明解释能成立到哪一步，为什么缺证既不证明它、也不证明其反面。提出一项具体补证，说明它能解决什么、仍不能解决什么。',
  );
  const body = buildEvidenceTask({
    kind: 'evidence-source-analysis',
    operator: 'claim-attribution',
    claims: inputs.map((input) => input.text),
    objective,
    zh,
    question,
    conclusion,
    reasoning: [observation, report, inference],
    limit: `${limit} ${next}`,
    error,
    repair,
    scoring: [
      t('Claims, attribution and evidence limits', '陈述归属与证据边界'),
      `${observation} ${report} ${inference}`,
      `${report} ${inference} ${limit}`,
    ],
    levelOverrides: {
      evidence: {
        exemplary: t(
          `Attributes the observation to ${v.observer}, the assertion to ${v.reporter} and the explanation to ${v.inferenceAuthor}; quotes each claim and its stated basis or limit without swapping records.`,
          `将观察归于${v.observer}、陈述归于${v.reporter}、解释归于${v.inferenceAuthor}；引用各自原话和依据或限制，不错配记录。`,
        ),
        proficient: t(
          'Correctly attributes and classifies all three claims but omits one exact basis or limit.',
          '三项归属与分类正确，但漏引一项依据或限制。',
        ),
        developing: t(
          'Correctly identifies some claims but conflates a reported assertion with an observation, or omits an entire record.',
          '部分陈述识别正确，但将转述的陈述与观察混同，或遗漏一份记录。',
        ),
      },
      reasoning: {
        exemplary: t(
          `Uses “${v.reportingBasis}” and “${v.inferenceLimit}” to distinguish a recorded assertion from independent verification; does not invent a knowledge source or treat repetition as proof.`,
          `用“${v.reportingBasis}”和“${v.inferenceLimit}”区分记录中的陈述与独立核实，不补写知情方式或把重复当作证明。`,
        ),
        proficient: t(
          'Keeps the explanation unverified but does not explain why the reported assertion cannot be assigned an unstated knowledge source.',
          '保留解释未被证实的判断，但未解释为什么不能补写陈述者的知情方式。',
        ),
        developing: t(
          'Uses labels such as fact or opinion without comparing the statements with their stated bases.',
          '只贴事实或观点标签，没有把陈述与已说明的依据比较。',
        ),
      },
      boundary: {
        exemplary: t(
          `Proposes obtaining “${v.proposedEvidence}”, checks its connection to this event and explains which part of the explanation it could test. Retains unresolved parts and does not turn missing evidence into proof of the opposite. Equivalent relevant evidence is acceptable.`,
          `提出取得“${v.proposedEvidence}”，核对其与本次事件的联系，说明能检验解释的哪一部分；保留未解决部分，不把缺证当作反面成立。其他同样相关的证据也可接受。`,
        ),
        proficient: t(
          'Preserves both uncertainties and proposes relevant evidence, but omits how to link that evidence to this event.',
          '保留双向不确定性并提出相关证据，但未说明如何与本次事件对应。',
        ),
        developing: t(
          'Asks for more information without naming an obtainable record or measurement and what it would test.',
          '只要求更多信息，没有指出可取得的记录或测量及其检验对象。',
        ),
      },
    },
  });
  body.answer = [conclusion, observation, report, inference, limit, next].join('\n\n');
  body.product = t(
    'One three-row claim-and-basis table plus a bounded conclusion and one proposed evidence check; labeled prose is equally acceptable.',
    '一份三行陈述—依据表，加一段有限结论和一项补证建议；带标签文字同样可用。',
  );
  body.directions = [question];
  body.criteria = body.criteria.map((criterion) => ({
    ...criterion,
    weight: plan.requirements.find((r) => r.id === criterion.id).weight,
  }));
  body.operationPlan = structuredClone(plan);
  const example = (id, response, criterionId, level, rationale) => ({
    id,
    kind: 'synthetic-review-example',
    response,
    judgments: [{ criterionId, level, rationale, evidence: [{ start: 0, end: response.length, quote: response }] }],
  });
  body.contrastResponses = [
    example('complete', body.answer, 'reasoning', 'exemplary', body.criteria[1].levels.exemplary),
    example(
      'conclusion-without-reasoning',
      t(
        `${v.observer}: observation. ${v.reporter}: assertion. ${v.inferenceAuthor}: explanation.`,
        `${v.observer}：观察。${v.reporter}：陈述。${v.inferenceAuthor}：解释。`,
      ),
      'reasoning',
      'developing',
      body.criteria[1].levels.developing,
    ),
    example('misconception', error, 'reasoning', 'beginning', repair),
    example(
      'alternative-representation',
      [next, limit, inference, report, observation].join('\n\n'),
      'boundary',
      'exemplary',
      body.criteria[2].levels.exemplary,
    ),
  ];
  return body;
}
