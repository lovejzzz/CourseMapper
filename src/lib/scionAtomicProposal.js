import { resolveAtomicSourceAnswer } from './scionAtomicSourceAnswer.js';
import { TEACHING_OPERATION_SPECS } from './teachingOperationPlan.js';
import {
  assessTeachingProposal,
  teachingProposalInputRevision,
  SCION_TEACHING_PROPOSAL_PROTOCOL,
} from './scionTeachingProposal.js';

export const SCION_ATOMIC_PROPOSAL_PROTOCOL = 'scion-atomic-source-questions-v1';
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
        'text',
        null,
        'What is the name of the first group whose results are compared? Copy its name only.',
        '先描述的被比较群体叫什么？只复制群体名称。',
      ),
      q(
        'secondGroup',
        'text',
        null,
        'What is the name of the second group whose results are compared? Copy its name only.',
        '第二个被比较群体叫什么？只复制群体名称。',
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
        'What kind of object or person is counted? Copy the noun phrase.',
        '计数的对象或人是哪一类？复制名词短语。',
      ),
      q(
        'countedOutcome',
        'text',
        'firstGroup',
        'What reported outcome is counted within the group? Copy the outcome phrase.',
        '群体内部计数的是哪个结果？复制结果短语。',
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
        'Which complete sentence establishes that no counted unit belongs to both groups?',
        '哪个完整句子说明没有计数对象同时属于两个群体？',
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
    protocol: SCION_ATOMIC_PROPOSAL_PROTOCOL,
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
      const sources = owner ? snapshot.inputs.filter((i) => i.id === owner) : snapshot.inputs;
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
            (zh ? '教学目标：' : 'Teaching objective: ') +
            snapshot.objective +
            '\n' +
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
      const entry = { role: item.role, messages, grammar, ...(owner ? { requiredInputId: owner } : {}) };
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
        promptProtocol: SCION_ATOMIC_PROPOSAL_PROTOCOL,
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
            : resolveAtomicSourceAnswer(value.answer, snapshot.inputs, { type: item.type, inputId: owner });
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
        delete issuesByRole[role];
      } else issuesByRole[role] = resolved.reason;
    };
    for (const step of profile) {
      const item = atomicSourceQuestions(snapshot.operation, bindings, zh).find((i) => i.role === step.role);
      accept(item.role, await ask(item));
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
