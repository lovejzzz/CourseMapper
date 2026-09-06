import { buildEvidenceTask as build } from './teachingTaskEvidenceBuilder.js';
/** Small evidence operations admitted only from an explicit source relationship.
 * This is a reasoning compiler, not an independent historical/scientific oracle.
 * Proposed procedures are labeled proposals and never become observed results. */
const quote = (text) => `“${text}”`;
const han = (text) => /\p{Script=Han}/u.test(text);

export function explicitEvidenceAnalysisTask(claims, objective) {
  if (
    !/(?:\b(?:claims?|records?|accounts?|evidence|inference|diary|narrator|dates?|sources?|conclu\w*)\b|材料|证据|记录|矛盾|时间|推断)/i.test(
      objective,
    )
  )
    return null;
  if (claims.length < 2) return null;
  const text = claims.join(' '),
    zh = han(objective);
  let operator, conclusion, reasoning, limit, error, repair;
  const years = claims.slice(0, 2).map((claim) => [...claim.matchAll(/\b(1\d{3}|20\d{2})\b/g)].map((m) => m[1]));
  if (
    /both refer to|same event|same first|同一事件/i.test(text) &&
    years[0].length === 1 &&
    years[1].length === 1 &&
    years[0][0] !== years[1][0] &&
    /neither|not.*corroborat|unresolved|未经|无法确定/i.test(text)
  ) {
    operator = 'conflicting-claims-same-event';
    conclusion = zh
      ? `两条记录谈的是同一事件，却给出${years[0][0]}和${years[1][0]}两个不同年份，因此存在未解决的冲突。`
      : `The accounts conflict: they date the same event to ${years[0][0]} and ${years[1][0]}, respectively.`;
    reasoning = zh
      ? [
          `材料一：${quote(claims[0])}`,
          `材料二：${quote(claims[1])}`,
          '同一事件的两个不同年份不能仅凭这两条陈述同时确认为准确日期。',
        ]
      : [
          `Account 1: ${quote(claims[0])}`,
          `Account 2: ${quote(claims[1])}`,
          'The event identity is held constant; the reported years differ, so this is a disagreement about that event, not two dates for different events.',
        ];
    limit = zh
      ? '现有材料不能决定哪条记录正确。可寻找一份独立、同时期、明确记录该事件日期的原始记录；这是下一步取证建议，并非已经找到的新证据。'
      : 'Neither account is established as correct. Seek an independent contemporaneous register that explicitly dates the same event and compare its event definition and date with both accounts. This is proposed research, not a source already obtained.';
    error = zh
      ? '较早的年份更接近事件，所以较早的记录必然正确。'
      : 'The earlier year must be correct because it is closer to the event.';
    repair = zh
      ? '先核对两条记录所指的事件，再说明为什么现有材料无法择一。'
      : 'Check the event named in both records, then explain why ordering the dates does not determine credibility.';
  } else if (
    /character|speaker|人物|角色/.test(text) &&
    /no narrator|not.*endorse|没有.*认可|并不代表/i.test(text) &&
    /\b(?:nobody|never)\b/i.test(claims[0]) &&
    /helps? (?:a |any )?stranger/i.test(claims[0]) &&
    /(?:help(?:s|ing)?|tak(?:es|ing)|guid(?:es|ing)|escort(?:s|ing)?)\b[^.!?]{0,80}\b(?:stranger|lost travell?er)/i.test(
      claims[1],
    )
  ) {
    operator = 'universal-claim-and-counterexample';
    conclusion = zh
      ? '人物的概括不能自动当作叙述者或作者的立场；必须与文中行动描写一起判断。'
      : 'The character’s statement is an attributed claim, not automatically the narrator’s or author’s position. The reported action challenges its universal wording.';
    reasoning = [
      `${zh ? '人物陈述' : 'Attributed claim'}: ${quote(claims[0])}`,
      `${zh ? '行动描写' : 'Described action'}: ${quote(claims[1])}`,
      zh
        ? '“所有”或“从不”式的概括需要与反例核对；一个明确相反的行动就足以挑战该绝对说法。'
        : 'A universal “nobody ever” claim is challenged by a described instance of someone doing the excluded action. Quote the action rather than merely calling the character unreliable.',
    ];
    limit = zh
      ? '可以支持其他有证据的解读，但不能由一句人物台词推出作者的全部立场或人物的动机。'
      : 'The excerpt does not establish the author’s complete beliefs or the character’s motive. Other interpretations are acceptable when they account for both the quotation and the described action.';
    error = zh
      ? '引文证明作者认为所有人都不帮助陌生人。'
      : 'The quotation proves that the author believes nobody helps strangers.';
    repair = zh
      ? '给台词标出说话者，再用行动描写检验其概括。'
      : 'Attribute the quotation to its speaker, then test its generalization against the reported action.';
  } else if (
    /advertis|seller|宣传|广告/i.test(text) &&
    /\b(?:all|every)\b|所有|全部/i.test(claims[0]) &&
    /did not test|not tested|没有测试|未测试/i.test(text)
  ) {
    operator = 'bounded-test-versus-universal-claim';
    conclusion = zh
      ? '有限条件下的测试结果不能证明宣传中的全称结论。'
      : 'The measured result supports a bounded finding under the tested conditions; it does not verify the seller’s universal claim.';
    reasoning = [
      `${zh ? '宣传声称' : 'Seller claim'}: ${quote(claims[0])}`,
      `${zh ? '实际测试' : 'Measured evidence'}: ${quote(claims[1])}`,
      zh
        ? '扩大到其他对象或条件需要新的测量；现有测试未覆盖它们。'
        : 'The tested property and conditions define the scope. Extrapolating to every advertised application requires measurements beyond this test.',
    ];
    limit = claims.filter((claim) => /did not test|not tested|没有测试|未测试/i.test(claim)).join(' ');
    error = zh
      ? '一项测试有效，所以广告中的所有效果都得到证实。'
      : 'A result under the tested conditions proves every application claimed in the advertisement.';
    repair = zh
      ? '列出测试对象与条件，再逐一比较宣传覆盖的对象与条件。'
      : 'List what was measured and under which conditions; compare that list with what the advertisement promises.';
  } else if (
    /no date|undated|无日期|没有日期/i.test(text) &&
    /no reason|cause.*unknown|原因.*未知|未说明原因/i.test(text)
  ) {
    operator = 'undated-observation';
    conclusion = zh
      ? '材料支持当事人的所见陈述，但无法确定其日期或原因。'
      : 'The entry supports a report of what its writer encountered. It does not establish when or why the event occurred.';
    reasoning = [
      `${zh ? '实际报告' : 'Reported observation'}: ${quote(claims[0])}`,
      `${zh ? '记录限制' : 'Documented limits'}: ${claims.slice(1).map(quote).join(' ')}`,
    ];
    limit = zh
      ? '日期和原因仍未知。寻找可独立定年的同期日志以及明确记录原因的原始文件；地点图不能替代事件日期的证据。'
      : 'The date and cause remain unknown. A dated contemporaneous log could help date the encounter, while a record explicitly stating the reason would be needed for its cause. A location map does not by itself date this event.';
    error = zh
      ? '未注明日期的记录证明关闭发生在洪水当天。'
      : 'The missing date and cause can be inferred from the location map alone.';
    repair = zh
      ? '分别标记地点、状态、日期与原因；只填写材料确实给出的内容。'
      : 'Separate place, observed state, date and cause; fill only what the records actually supply.';
  } else if (zh && /发布日期不是|发布时间不是/.test(text) && /发生|开始/.test(text)) {
    operator = 'publication-versus-event-time';
    conclusion = '发布时间与事件发生时间属于不同时间字段；不能仅因日期不同就认定报道互相矛盾。';
    reasoning = [
      `分别读出发生、排查、恢复与发布的时间：${claims.slice(0, 2).map(quote).join(' ')}`,
      '先按事件时间排列过程，再单独记录发布时间。发生在前一天、次日发布的报道可以与跨午夜的维修记录同时成立。',
    ];
    limit = claims.filter((claim) => /没有说明|未知|未说明/.test(claim)).join(' ');
    error = '报道在次日发布，所以停电一定也发生在次日。';
    repair = '把“发布”与“发生”分成两列；每个时间都注明它所描述的事件。';
  } else return null;
  if (!limit) return null;
  return build({
    kind: 'evidence-source-analysis',
    operator,
    claims,
    objective,
    zh,
    conclusion,
    reasoning,
    limit,
    error,
    repair,
    question: zh
      ? '根据编号材料完成证据对照表：逐条标明谁在陈述、陈述了什么；判断这些陈述之间的关系，引用关键证据解释结论，最后指出一项仍未知的内容及可以取得的新证据。'
      : 'Use the numbered records to make an evidence table: attribute each claim, state exactly what it reports, and explain the relationship between the claims. Quote the decisive evidence, give your conclusion, and identify a specific unresolved question and evidence that could address it.',
  });
}

export function explicitExperimentalDesignTask(claims, objective) {
  if (
    !/(?:\b(?:design|experiment|comparison|treatment|trial|experimental unit|replication|confound)\b|试验|实验|设计|混杂|比较)/i.test(
      objective,
    )
  )
    return null;
  const text = claims.join(' '),
    zh = han(objective);
  let operator, conclusion, reasoning, limit, error, repair, procedure;
  if (
    /no counterbalanced|order.*confound|未.*平衡.*顺序/i.test(text) &&
    /repeat.*same|practice.*coincide|练习|重复/i.test(text) &&
    /music/i.test(text) &&
    /silence/i.test(text)
  ) {
    operator = 'counterbalance-order-and-task';
    conclusion =
      'The comparison cannot isolate the condition effect because condition, practice and position in the sequence coincide.';
    reasoning = [
      quote(claims[0]),
      quote(claims[1]),
      'Repeating the same task can improve performance through practice even without a helpful treatment. Everyone receiving the condition second leaves that explanation confounded with the condition.',
    ];
    procedure = [
      'Prepare two comparable versions, A and B, with the same instructions and completion-time measurement. Each participant attempts each version once.',
      'Randomly allocate participants across four sequences: A in silence then B with music; B with music then A in silence; A with music then B in silence; B in silence then A with music.',
      'Keep equipment, timing rules, rest period and other conditions consistent. Record completion time and errors for each attempt.',
      'Compare music and silence while accounting for participant, version and order. Inspect whether the apparent effect changes with order; report those differences instead of pooling them away.',
    ];
    limit =
      'The supplied observations cannot establish whether music improves performance. New counterbalanced measurements are needed; the repair does not guarantee equivalent versions or eliminate every carryover effect.';
    error = 'Music caused the improvement because everyone was faster when music played.';
    repair =
      'List what changed from first to second trial. Balance both condition order and task version before interpreting a condition effect.';
  } else if (
    /no random assignment|没有随机分配/i.test(text) &&
    /pretest|starting knowledge|baseline|起始|前测/i.test(text) &&
    /choose|self.select|自选|自行选择/i.test(text)
  ) {
    operator = 'self-selection-and-baseline';
    conclusion =
      'The later group difference cannot be attributed to the study method alone: learners selected their method and the groups differed before practice.';
    reasoning = claims.map(quote);
    procedure = [
      'Measure baseline knowledge with the same pretest for all learners.',
      'For a new comparison, randomly assign learners to the two methods within comparable baseline-score bands. State that assignment is proposed, not what happened in the original class.',
      'Use the same study content, time allowance, instructions and final test; score the final test without knowing each learner’s group where feasible.',
      'Compare final-test results while accounting for baseline scores; report missing tests and departures from the assigned method. An observational adjustment may be discussed, but must retain possible unmeasured differences.',
    ];
    limit =
      'The original data do not establish a causal advantage of either study method. A new allocation and new outcomes would test that question; adjustment of the old comparison cannot rule out every unmeasured difference.';
    error = 'The method must be better because its group scored higher at the end.';
    repair =
      'Compare starting knowledge before interpreting the final scores, and distinguish randomized assignment from statistical adjustment.';
  } else if (
    /within a (\w+)|within each (\w+)/i.test(text) &&
    /only one|one whole|each.*one/i.test(text) &&
    /replicat|experimental unit/i.test(objective)
  ) {
    const unit = text.match(/within (?:a|each) (\w+)/i)?.[1];
    if (!unit) return null;
    operator = 'cluster-treatment-unit';
    conclusion = `The ${unit} is the treatment-assignment unit. Individuals sharing one ${unit} are measurements within that unit, not independent treatment replicates.`;
    reasoning = claims.map(quote);
    procedure = [
      `Propose multiple independent ${unit}s for each treatment, and randomly assign whole ${unit}s to treatments. The number of units needs a precision and feasibility justification; the original pair alone cannot supply independent replication.`,
      `Keep measurement duration and non-treatment conditions comparable across ${unit}s. Record environmental differences rather than assuming they vanish.`,
      `Measure individuals consistently, then summarize the outcome within each ${unit} or use an analysis that explicitly accounts for clustering.`,
      `Compare variation between independent ${unit}s assigned to each treatment; do not treat every individual as independently assigned.`,
    ];
    limit = `The observed comparison cannot distinguish the treatment from ${unit}-specific conditions. More individuals in the original units do not create new treatment replication; new independent units and results are needed.`;
    error = 'Every measured individual is an independently randomized treatment replicate.';
    repair = `Mark where treatment was assigned. Count independent ${unit}s per treatment separately from individuals measured.`;
  } else if (
    /does not specify|未规定|没有规定/i.test(text) &&
    /outcome|指标/.test(text) &&
    /when|time|时间/i.test(text) &&
    /plants?|植物/i.test(text)
  ) {
    operator = 'incomplete-measurement-plan';
    conclusion =
      'The plan is not ready to test its treatment claim: outcome, measurement time and allocation are unspecified.';
    reasoning = claims.map(quote);
    procedure = [
      'Write an operational outcome and time before collecting data. For a plant-growth classroom example, propose change in height in cm from baseline to day 14; label both the measure and duration as proposed choices.',
      'Define the two treatment conditions and randomly assign independent plants to them; avoid assigning all plants in one shared container to only one condition.',
      'Keep seed type, light, water and measurement method comparable; record baseline height and missing or unusable measurements.',
      'Measure the stated outcome at the stated time and compare the groups with uncertainty. Other feasible outcomes and durations are acceptable when specified and justified in advance.',
    ];
    limit =
      'There are no observed results, so no treatment effect can be claimed. The example outcome and duration are proposed design parameters, not facts found in the source.';
    error = 'The planned comparison already demonstrates that one treatment works better.';
    repair =
      'State exactly what will be measured, when and on which independently assigned units before making any result claim.';
  } else if (zh && /(.+?)和(.+?)同时改变，不能分离(.+?)的作用/.test(text)) {
    const m = text.match(/[；;。]([^；;。]+?)和([^；;。]+?)同时改变，不能分离([^；;。]+?)的作用/);
    if (!m) return null;
    const treatment = m[3],
      confound = m[1] === treatment ? m[2] : m[1];
    operator = 'paired-condition-confound';
    conclusion = `${treatment}与${confound}同时改变，因此原比较不能把结果差异单独归因于${treatment}。`;
    reasoning = claims.map(quote);
    procedure = [
      `以${treatment}作为唯一计划改变的条件，把${confound}以及材料已说明的其他操作保持一致。`,
      '随机决定实施顺序，对每种条件进行独立重复；每次按相同的起点、终点和测量规则记录结果。',
      '逐次保留记录，比较两种条件的结果及变动程度；先检查操作是否一致，再解释差异。',
    ];
    limit = '尚未提供改进设计的结果，因此不能说改进已经证明某种条件更好；还需要按新方案取得数据。';
    error = `原比较已经证明${treatment}造成了差异。`;
    repair = `分别列出${treatment}和${confound}在两组中的状态，再写只改变前者的操作方案。`;
  } else return null;
  return build({
    kind: 'evidence-experiment',
    operator,
    claims,
    objective,
    zh,
    conclusion,
    reasoning,
    limit,
    error,
    repair,
    procedure,
    question: zh
      ? '根据所给记录标明计划比较的条件、实际同时改变的条件和结果指标。解释现有结论的限制，写出他人可以执行或核对的改进方案，并区分已有观察与尚需取得的新结果。'
      : 'Annotate the supplied design: identify the intended comparison, other conditions that change with it, the measurement and the assignment unit. Explain what the current evidence cannot establish. Write a revised protocol with allocation/order, comparable measurement and independent replication, then distinguish the proposed design from results still needed.',
  });
}
