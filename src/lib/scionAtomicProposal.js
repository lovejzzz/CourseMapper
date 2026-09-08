import { repairAtomicCountPair } from './scionAtomicCountPair.js';
import { resolveAtomicSourceAnswer, atomicAnswerSentenceContext } from './scionAtomicSourceAnswer.js';
import { TEACHING_OPERATION_SPECS } from './teachingOperationPlan.js';
import {
  assessTeachingProposal,
  teachingProposalInputRevision,
  SCION_TEACHING_PROPOSAL_PROTOCOL,
} from './scionTeachingProposal.js';

export const SCION_ATOMIC_PROPOSAL_PROTOCOL = 'scion-atomic-source-questions-v1';
export const SCION_ATOMIC_ATTRIBUTION_PROTOCOL = 'scion-attribution-atomic-questions-v2';
export const SCION_ATOMIC_CALL_LIMIT = 12;
const grammar = String.raw`root ::= "{" ws "\"answer\"" ws ":" ws string ws "}"
string ::= "\"" character{1,1000} "\""
character ::= [^"\\\x00-\x1F] | "\\" (["\\/bfnrt] | "u" [0-9a-fA-F]{4})
ws ::= [ \t\n\r]{0,4}`;
let running = false;

export function atomicSourceQuestions(operation, bindings = {}, zh = false) {
  const t = (en, cn) => (zh ? cn : en),
    label = (role) => bindings[role]?.quote || t('the selected group or event', '所选群体或活动');
  const q = (role, type, owner, en, cn) => ({ role, type, owner, question: t(en, cn) });
  if (operation === 'claim-attribution')
    return [
      q(
        'observedClaim',
        'text',
        null,
        'Which statement describes what the writer directly saw or sensed? Copy that observation, not an explanation of its cause.',
        '哪项陈述描述记录者直接看见或感受到的内容？复制该观察，不要复制原因解释。',
      ),
      q(
        'observer',
        'label',
        'observedClaim',
        'Who wrote this observation, or what document records it? Copy only the short name or document label outside the quotation.',
        '这项观察由谁记下，或记在哪份文献中？只复制引文之外的简短姓名或文献标签。',
      ),
      q(
        'observationBasis',
        'text',
        'observedClaim',
        'Which separate clause states how the observation was obtained or what was not tested? Copy only that basis or limitation, not the whole record.',
        '哪个独立分句说明观察如何取得，或没有做哪些检测？只复制该依据或限制，不要复制整份记录。',
      ),
      q(
        'inferredClaim',
        'text',
        null,
        'Which statement explicitly argues that an observation establishes a cause, explanation or intent? Copy the argument itself, not a separate person’s report that an event happened. If none explicitly makes this inference, answer UNKNOWN.',
        '哪项陈述明确论证某项观察足以确立原因、解释或意图？复制论断本身，不要选择另一个人关于事件发生的报告。若没有明确作出这种推断，回答 UNKNOWN。',
      ),
      q(
        'inferenceAuthor',
        'label',
        'inferredClaim',
        'Who proposes this explanation, or which publication states it? Copy only the short name or document label outside the claim.',
        '谁提出这个解释，或哪份刊物表达它？只复制陈述之外的简短姓名或文献标签。',
      ),
      q(
        'inferenceLimit',
        'text',
        'inferredClaim',
        'Which complete sentence states what evidence for this explanation is missing?',
        '哪个完整句子说明该解释还缺少什么证据？',
      ),
      q(
        'proposedEvidence',
        'text',
        'inferenceLimit',
        'Copy the name of ONE specific missing record or measurement listed in this evidence gap. Do not copy the entire list or the negation.',
        '复制该证据缺口中列出的一项具体记录或测量的名称。不要复制整份清单或否定词。',
      ),
      q(
        'reportedClaim',
        'text',
        null,
        'Which assertion is attributed to another person whose basis for knowing is qualified or unstated? Copy the assertion itself, without its speaker label.',
        '哪项陈述归于另一个人，但其知情依据受到限定或尚未说明？只复制陈述本身，不要包含说话者标签。',
      ),
      q(
        'reporter',
        'label',
        'reportedClaim',
        'Who makes this assertion? Copy only the short speaker name or role before the quotation, without reporting verbs or the assertion.',
        '谁提出这项陈述？只复制引文之前的简短姓名或身份，不要包含转述动词或陈述内容。',
      ),
      q(
        'reportingBasis',
        'text',
        'reportedClaim',
        'Which sentence states the speaker’s basis for knowing or explicitly states the missing basis or verification? Copy that sentence; do not invent how the speaker knew.',
        '哪个句子说明说话者的知情依据，或明确说明缺失的知情依据或核实？复制该句，不要推测其如何得知。',
      ),
    ];
  if (operation === 'union-bounds')
    return [
      q(
        'populationCount',
        'count',
        null,
        'How many members belong to the common registered population? Copy the relevant count phrase.',
        '共同登记总体有多少名成员？复制相应计数短语。',
      ),
      q(
        'populationName',
        'text',
        'populationCount',
        'What is the name of the organization or group? Copy its name only.',
        '组织或群体的名称是什么？只复制名称。',
      ),
      q(
        'stablePopulation',
        'text',
        'populationCount',
        'Which complete sentence states that the membership list was unchanged and both events used that population?',
        '哪个完整句子说明成员名册没有变化，且两次活动均使用这一总体？',
      ),
      q(
        'firstEvent',
        'text',
        null,
        'What is the name of the first event described? Copy its name only.',
        '材料中先描述的活动叫什么？只复制活动名称。',
      ),
      q(
        'secondEvent',
        'text',
        'firstEvent',
        'What is the name of the second event described? Copy its name only.',
        '材料中第二个活动叫什么？只复制活动名称。',
      ),
      q(
        'firstCount',
        'count',
        'firstEvent',
        `How many distinct members attended “${label('firstEvent')}”? Copy the count phrase.`,
        `有多少名不同成员参加“${label('firstEvent')}”？复制计数短语。`,
      ),
      q(
        'secondCount',
        'count',
        'secondEvent',
        `How many distinct members attended “${label('secondEvent')}”? Copy the count phrase.`,
        `有多少名不同成员参加“${label('secondEvent')}”？复制计数短语。`,
      ),
      q(
        'withinGroupDistinct',
        'text',
        'firstEvent',
        'Which sentence states that each attendance list counts each person once?',
        '哪个句子说明每份签到表内部每个人只计一次？',
      ),
      q(
        'missingOverlap',
        'text',
        null,
        'Which sentence states that membership overlap across the two events was not recorded or matched?',
        '哪个句子说明两次活动之间的重复成员尚未记录或核对？',
      ),
    ];
  if (operation === 'pooled-proportion')
    return [
      q(
        'firstGroup',
        'label',
        null,
        'What is the first named group with reported counts in these records? Copy its name only.',
        '记录中最先报告数量的群体叫什么？只复制名称。',
      ),
      q(
        'secondGroup',
        'label',
        null,
        'What is the second named group with reported counts in these records? Copy its name only.',
        '记录中第二个报告数量的群体叫什么？只复制名称。',
      ),
      q(
        'firstWhole',
        'count',
        'firstGroup',
        `How many units are in the complete counted group “${label('firstGroup')}”? Copy the total count phrase.`,
        `“${label('firstGroup')}”计数的完整群体共有多少个对象？复制整体计数短语。`,
      ),
      q(
        'firstPart',
        'count',
        'firstGroup',
        `How many units met the reported outcome for “${label('firstGroup')}”? Copy the outcome count phrase.`,
        `“${label('firstGroup')}”有多少个对象达到所报告的结果？复制结果计数短语。`,
      ),
      q(
        'secondWhole',
        'count',
        'secondGroup',
        `How many units are in the complete counted group “${label('secondGroup')}”? Copy the total count phrase.`,
        `“${label('secondGroup')}”计数的完整群体共有多少个对象？复制整体计数短语。`,
      ),
      q(
        'secondPart',
        'count',
        'secondGroup',
        `How many units met the reported outcome for “${label('secondGroup')}”? Copy the outcome count phrase.`,
        `“${label('secondGroup')}”有多少个对象达到所报告的结果？复制结果计数短语。`,
      ),
      q(
        'countingUnit',
        'text',
        'firstGroup',
        'What kind of object or person does the total count measure in this sentence? Copy the common noun only, not the group name.',
        '这句话中的总人数或总数是在数什么人或物？只复制普通名词，不要复制组名。',
      ),
      q(
        'countedOutcome',
        'text',
        'firstGroup',
        'Which action or condition defines the counted outcome in this sentence? Copy the action or condition only, without its count or group name.',
        '这句话用哪个动作或条件表示所计数的结果？只复制动作或条件，不要包含人数、数量或组名。',
      ),
      q(
        'commonDefinition',
        'text',
        null,
        'Which complete sentence establishes the same outcome definition and observation deadline for both groups?',
        '哪个完整句子说明两个群体使用相同的结果定义和观察截止时间？',
      ),
      q(
        'distinctMembership',
        'text',
        null,
        'Copy a complete sentence explicitly stating that the groups share no counted units. If the record leaves membership overlap unknown, answer UNKNOWN.',
        '复制明确说明两组没有重复计数对象的完整句子。如果记录没有确定是否重复，回答 UNKNOWN。',
      ),
      q(
        'limitRecord',
        'record',
        null,
        'Which source sentence says why these records cannot explain the cause of the difference between groups?',
        '哪个来源句子说明这些记录为什么不能解释群体差异的原因？',
      ),
    ];
  throw Error('Unsupported atomic proposal operation.');
}

export async function proposeAtomicSourceBindings(
  request,
  { signal, onProgress, runtimeLoader = () => import('./scionBrowserWllama.js') } = {},
) {
  if (running) return { status: 'unavailable', message: 'A source proposal is already running.', modelCalls: 0 };
  const snapshot = structuredClone(request),
    started = performance.now();
  let profile;
  try {
    profile = atomicSourceQuestions(snapshot.operation);
    if (
      !Array.isArray(snapshot.inputs) ||
      !snapshot.inputs.length ||
      snapshot.inputs.length > 8 ||
      snapshot.inputs.some(
        (i) => !i || typeof i.id !== 'string' || !i.id || typeof i.text !== 'string' || !i.text.trim(),
      ) ||
      new Set(snapshot.inputs.map((i) => i.id)).size !== snapshot.inputs.length ||
      typeof snapshot.objective !== 'string' ||
      !snapshot.objective.trim() ||
      snapshot.inputs.reduce((n, i) => n + i.text.length, snapshot.objective.length) > 6000
    )
      throw Error('Supply a focused objective and one to eight unique complete source records.');
  } catch (error) {
    return { status: 'unavailable', message: error.message, modelCalls: 0 };
  }
  const receipt = {
    protocol:
      snapshot.operation === 'claim-attribution' ? SCION_ATOMIC_ATTRIBUTION_PROTOCOL : SCION_ATOMIC_PROPOSAL_PROTOCOL,
    inputRevision: teachingProposalInputRevision(snapshot),
    startedAt: new Date().toISOString(),
    callLimit: SCION_ATOMIC_CALL_LIMIT,
    maxNewTokens: 192,
    modelCalls: 0,
    attempts: [],
  };
  const bindings = {},
    issuesByRole = {},
    statusesByRole = {},
    witnessesByRole = {},
    zh = /\p{Script=Han}/u.test(snapshot.objective);
  const abort = () => {
    if (signal?.aborted) throw new DOMException('Source proposal cancelled.', 'AbortError');
  };
  running = true;
  try {
    abort();
    const api = await runtimeLoader();
    onProgress?.('Loading the local model…');
    const load = performance.now();
    await api.loadScionBrowserWllama({ signal });
    abort();
    receipt.loadMs = Math.round(performance.now() - load);
    receipt.runtime = api.getScionBrowserWllamaStatus?.();
    if (receipt.runtime?.runtime?.grammar !== 'gbnf-state-v1')
      throw Error('This source proposal requires the verified grammar-state runtime.');
    const ask = async (item, repair) => {
      abort();
      if (receipt.modelCalls >= SCION_ATOMIC_CALL_LIMIT)
        return { status: 'needs-review', reason: 'The fixed source-question budget is exhausted.' };
      const owner = item.owner ? bindings[item.owner]?.inputId : undefined;
      if (item.owner && !owner) return { status: 'needs-review', reason: `Locate ${item.owner} before ${item.role}.` };
      const contextRole =
        snapshot.operation === 'pooled-proportion'
          ? { countingUnit: 'firstWhole', countedOutcome: 'firstPart' }[item.role]
          : undefined;
      const countWitness = contextRole ? witnessesByRole[contextRole] : null;
      const questionContext = countWitness ? atomicAnswerSentenceContext(countWitness, snapshot.inputs) : null;
      if (contextRole && !questionContext)
        return { status: 'needs-review', reason: `Locate ${contextRole} before ${item.role}.` };
      const sources = questionContext
        ? [{ id: questionContext.inputId, text: questionContext.quote }]
        : owner
          ? snapshot.inputs.filter((i) => i.id === owner)
          : snapshot.operation === 'claim-attribution'
            ? snapshot.inputs.filter(
                (input) =>
                  !['observedClaim', 'inferredClaim', 'reportedClaim'].some(
                    (role) => role !== item.role && bindings[role]?.inputId === input.id,
                  ),
              )
            : snapshot.inputs;
      const previous = repair ? receipt.attempts.findLast((a) => a.role === item.role && a.answer) : null;
      const clarifyContext = previous?.resolution?.reason?.includes('occurs more than once');
      const narrowCount = previous?.resolution?.reason?.includes('contains several counts');
      const repairInstruction = clarifyContext
        ? `Copy a longer unique source excerpt containing your previous answer: ${JSON.stringify(previous.answer)}.`
        : narrowCount
          ? `Within this excerpt, copy only the count answering the question: ${JSON.stringify(previous.answer)}.`
          : repair;

      const instruction = zh
        ? '只依据记录回答问题。复制确切原文；问题要求完整句子时复制完整句子。若记录没有提供答案，回答 UNKNOWN。不解释。'
        : 'Answer only from the record. Copy exact source text; copy the full sentence when requested. If the answer is not stated, answer UNKNOWN. Do not explain.';
      const messages = [
        { role: 'system', content: instruction + ' Return only a JSON object with one string field: answer.' },
        {
          role: 'user',
          content:
            (snapshot.operation === 'pooled-proportion'
              ? ''
              : (zh ? '教学目标：' : 'Teaching objective: ') + snapshot.objective + '\n') +
            (zh ? '记录：' : 'Records:') +
            '\n' +
            sources.map((i) => i.text).join('\n\n') +
            '\n' +
            (zh ? '问题：' : 'Question:') +
            ' ' +
            item.question +
            (repair ? '\n' + (zh ? '上次问题：' : 'Previous problem: ') + repairInstruction : ''),
        },
      ];
      const entry = {
        role: item.role,
        messages,
        grammar,
        ...(owner ? { requiredInputId: owner } : {}),
        ...(questionContext ? { questionContext } : {}),
      };
      receipt.attempts.push(entry);
      receipt.modelCalls++;
      onProgress?.(
        zh
          ? `核对来源 ${receipt.modelCalls}/${SCION_ATOMIC_CALL_LIMIT}…`
          : `Checking sources ${receipt.modelCalls}/${SCION_ATOMIC_CALL_LIMIT}…`,
      );
      const time = performance.now();
      entry.raw = await api.completeScionBrowserWllama(messages, {
        maxNewTokens: 192,
        temperature: 0,
        topK: 1,
        topP: 1,
        seed: 7,
        thinking: false,
        grammar,
        signal,
        taskFamily: 'unclassified',
        promptProtocol: receipt.protocol,
        onCompletion: (c) => {
          entry.completion = c;
        },
        onAdapterRoute: (r) => {
          entry.route = r;
        },
      });
      entry.inferenceMs = Math.round(performance.now() - time);
      abort();
      let resolved;
      try {
        const value = JSON.parse(entry.raw);
        if (!value || Array.isArray(value) || Object.keys(value).length !== 1 || typeof value.answer !== 'string')
          throw Error('Return exactly one answer string.');
        entry.answer = value.answer;
        resolved =
          entry.completion?.finishReason === 'length'
            ? { status: 'needs-review', reason: 'Truncated source answer; no partial result accepted.' }
            : resolveAtomicSourceAnswer(
                value.answer,
                snapshot.operation === 'claim-attribution' ? sources : snapshot.inputs,
                {
                  type: item.type,
                  inputId: owner,
                  ...(questionContext ? { context: questionContext } : {}),
                },
              );
        if (entry.completion?.finishReason !== 'length' && clarifyContext) {
          const locatedContext = resolveAtomicSourceAnswer(value.answer, snapshot.inputs, {
            type: 'text',
            inputId: owner,
          });
          resolved =
            locatedContext.status === 'located'
              ? resolveAtomicSourceAnswer(previous.answer, snapshot.inputs, {
                  type: item.type,
                  inputId: owner,
                  context: locatedContext.witness,
                })
              : locatedContext;
          entry.clarifies = previous.answer;
        } else if (entry.completion?.finishReason !== 'length' && narrowCount) {
          resolved = resolveAtomicSourceAnswer(value.answer, snapshot.inputs, {
            type: item.type,
            inputId: owner,
            context: previous.resolution.witness,
          });
          entry.narrows = previous.answer;
        }
      } catch (error) {
        resolved = { status: 'needs-review', reason: error.message };
      }
      entry.resolution = resolved;
      return resolved;
    };
    const accept = (role, resolved) => {
      statusesByRole[role] = resolved.status;
      if (resolved.status === 'located') {
        bindings[role] = resolved.binding;
        witnessesByRole[role] = resolved.witness;
        delete issuesByRole[role];
      } else issuesByRole[role] = resolved.reason;
    };
    for (const step of profile) {
      const item = atomicSourceQuestions(snapshot.operation, bindings, zh).find((i) => i.role === step.role);
      accept(item.role, await ask(item));
      // Reserve five remaining base questions. Dependent unit/outcome reading
      // follows this one joint repair, using its updated source witnesses.
      if (
        snapshot.operation === 'pooled-proportion' &&
        item.role === 'secondPart' &&
        receipt.modelCalls + 6 <= SCION_ATOMIC_CALL_LIMIT
      ) {
        const side = ['first', 'second'].find((side) => {
          const part = bindings[`${side}Part`],
            whole = bindings[`${side}Whole`];
          const unresolved = ['Part', 'Whole'].some(
            (role) => !bindings[side + role] && statusesByRole[side + role] !== 'missing',
          );
          return (
            Boolean(bindings[`${side}Group`]) &&
            (unresolved ||
              (part &&
                whole &&
                part.inputId === whole.inputId &&
                part.quote === whole.quote &&
                part.occurrence === whole.occurrence))
          );
        });
        if (side) {
          abort();
          const repaired = await repairAtomicCountPair({
            api,
            inputs: snapshot.inputs,
            group: bindings[`${side}Group`],
            side,
            signal,
            protocol: SCION_ATOMIC_PROPOSAL_PROTOCOL,
            onAttempt: (entry) => {
              receipt.attempts.push(entry);
              receipt.modelCalls++;
              onProgress?.(zh ? '核对部分与整体…' : 'Checking part and whole…');
            },
          });
          abort();
          if (repaired)
            for (const role of ['part', 'whole']) {
              const field = side + (role === 'part' ? 'Part' : 'Whole');
              delete bindings[field];
              delete witnessesByRole[field];
              accept(field, repaired[role]);
            }
        }
      }
    }
    for (const step of profile) {
      if (
        bindings[step.role] ||
        statusesByRole[step.role] === 'missing' ||
        receipt.modelCalls >= SCION_ATOMIC_CALL_LIMIT
      )
        continue;
      const item = atomicSourceQuestions(snapshot.operation, bindings, zh).find((i) => i.role === step.role);
      accept(item.role, await ask(item, issuesByRole[item.role]));
    }
    const derived =
      snapshot.operation === 'union-bounds'
        ? { rosterRecord: 'populationCount', attendanceRecord: 'firstCount', limitRecord: 'missingOverlap' }
        : snapshot.operation === 'claim-attribution'
          ? { observationRecord: 'observedClaim', reportRecord: 'reportedClaim', inferenceRecord: 'inferredClaim' }
          : { firstCountRecord: 'firstPart', secondCountRecord: 'secondPart', identityRecord: 'distinctMembership' };
    for (const [role, child] of Object.entries(derived))
      if (bindings[child]) {
        const input = snapshot.inputs.find((i) => i.id === bindings[child].inputId);
        bindings[role] = { inputId: input.id, quote: input.text, occurrence: 0 };
      }
    abort();
    const wire = {
      bindings: Object.fromEntries(
        Object.entries(TEACHING_OPERATION_SPECS[snapshot.operation].bindings).map(([role, type]) => {
          const b = bindings[role];
          return [
            role,
            b
              ? {
                  source: 'r' + (snapshot.inputs.findIndex((i) => i.id === b.inputId) + 1),
                  ...(type === 'record' ? {} : { quote: b.quote, occurrence: b.occurrence }),
                }
              : null,
          ];
        }),
      ),
      unknowns: [],
    };
    const assessment = assessTeachingProposal(JSON.stringify(wire), snapshot, SCION_TEACHING_PROPOSAL_PROTOCOL);
    receipt.fieldIssues = issuesByRole;
    return { status: 'review', ...assessment, receipt, modelCalls: receipt.modelCalls };
  } catch (error) {
    return {
      status: signal?.aborted || error.name === 'AbortError' ? 'cancelled' : 'unavailable',
      message: error.message,
      receipt,
      modelCalls: receipt.modelCalls,
    };
  } finally {
    receipt.elapsedMs = Math.round(performance.now() - started);
    running = false;
  }
}
