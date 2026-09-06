// Author-constructed development probes, not held-out or external evaluation.
// Inputs contain source records and teacher intent only, never reference answers.
export const STRUCTURE_PROBE_PROTOCOL = 'scion-teaching-structure-m0-v1';

export const STRUCTURE_PROBES = [
  {
    id: 'm0-source-dates-en',
    language: 'en',
    objective:
      'Teach learners to distinguish dates attached to different events and identify what the records leave unresolved.',
    sources: [
      { id: 'r1', text: 'An archive register says the photograph was taken in 1931.' },
      { id: 'r2', text: 'The exhibition booklet containing a reproduction was published in 1986.' },
      {
        id: 'r3',
        text: 'The supplied records do not describe the photograph’s custody between its creation and the exhibition.',
      },
    ],
  },
  {
    id: 'm0-proportion-en',
    language: 'en',
    objective:
      'Teach learners to calculate an observed proportion and explain the population to which the record applies.',
    sources: [
      { id: 'r1', text: 'Of 40 voluntary respondents at a pilot workshop, 17 selected the afternoon session.' },
      { id: 'r2', text: 'People who did not attend the pilot workshop were not surveyed.' },
    ],
  },
  {
    id: 'm0-experiment-zh',
    language: 'zh',
    objective: '让学生设计一个可执行的比较方案，检验两种滤材对浑浊度的影响。',
    sources: [
      { id: 'r1', text: '甲杯最初的浑浊度为80单位，使用滤材A处理了6分钟。' },
      { id: 'r2', text: '乙杯最初的浑浊度为30单位，使用滤材B处理了15分钟。' },
      { id: 'r3', text: '观察者认为乙杯更清，但没有记录处理后的仪器读数，也没有重复实验。' },
    ],
  },
];

export const STRUCTURE_PROBE_SYSTEM = `You propose a compact teaching structure from the supplied teacher objective and numbered source records.
Return only valid JSON with these keys:
{"objective":"observable learner performance","operation":"compare_event_dates | interpret_proportion | design_fair_comparison | needs_review","evidence":[{"sourceId":"supplied ID","quote":"exact excerpt from that record","claim":"what that excerpt actually supports"}],"task":{"question":"one specific question answerable from the records or asking for a clearly proposed procedure","studentWork":["observable student work"],"successCriteria":["specific evidence to check in that work"]},"unknowns":["a concrete unresolved issue"]}
Choose one operation string, not the pipe-separated list. Keep evidence excerpts verbatim, including in Chinese. Do not add records, observations, measured results or institutional policies. A suggested experiment is a proposal, not something already performed. Preserve attribution and limits. Write explanatory text in the requested language. Three evidence entries and three success criteria are sufficient. Do not output a lesson plan or ten documents.`;

export function checkStructureProbeResponse(raw, probe) {
  const issues = [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { parsed: null, issues: ['invalid-json'] };
  }
  const sources = new Map(probe.sources.map((source) => [source.id, source.text]));
  if (
    !['compare_event_dates', 'interpret_proportion', 'design_fair_comparison', 'needs_review'].includes(
      parsed.operation,
    )
  )
    issues.push('invalid-operation');
  if (!Array.isArray(parsed.evidence) || !parsed.evidence.length) issues.push('missing-evidence');
  for (const evidence of parsed.evidence || []) {
    if (!sources.has(evidence.sourceId)) issues.push('unknown-source');
    else if (
      typeof evidence.quote !== 'string' ||
      !evidence.quote.trim() ||
      !sources.get(evidence.sourceId).includes(evidence.quote)
    )
      issues.push('quote-not-in-record');
    if (typeof evidence.claim !== 'string' || !evidence.claim.trim()) issues.push('missing-supported-claim');
  }
  if (!parsed.task?.question?.trim()) issues.push('missing-question');
  for (const key of ['studentWork', 'successCriteria'])
    if (
      !Array.isArray(parsed.task?.[key]) ||
      !parsed.task[key].length ||
      parsed.task[key].some((value) => typeof value !== 'string' || !value.trim())
    )
      issues.push(`missing-${key}`);
  if (!Array.isArray(parsed.unknowns) || !parsed.unknowns.length) issues.push('missing-unknowns');
  return { parsed, issues: [...new Set(issues)] };
}

/** Uses the application's real runtime API in a single browser/model instance.
 * Shape/quotation results require a separate semantic and educational review. */
export async function runStructureProbes(api, { onProgress = () => {}, signal } = {}) {
  const receipt = {
    protocol: STRUCTURE_PROBE_PROTOCOL,
    evaluationKind: 'author-constructed-development',
    startedAt: new Date().toISOString(),
    userAgent: globalThis.navigator?.userAgent || null,
    settings: { contextSize: 8192, maxNewTokens: 1536, temperature: 0, topK: 1, topP: 1, seed: 7, thinking: false },
    results: [],
    status: 'loading',
  };
  onProgress(structuredClone(receipt));
  try {
    const loadStarted = performance.now();
    await api.load({ contextSize: receipt.settings.contextSize, signal });
    receipt.loadMs = Math.round(performance.now() - loadStarted);
    receipt.runtime = api.status();
    for (const probe of STRUCTURE_PROBES) {
      receipt.status = `running:${probe.id}`;
      onProgress(structuredClone(receipt));
      const start = performance.now();
      let completion = null;
      try {
        const raw = await api.complete(
          [
            { role: 'system', content: STRUCTURE_PROBE_SYSTEM },
            { role: 'user', content: JSON.stringify(probe) },
          ],
          {
            ...receipt.settings,
            signal,
            onCompletion: (value) => {
              completion = value;
            },
          },
        );
        receipt.results.push({
          id: probe.id,
          input: probe,
          raw,
          ...checkStructureProbeResponse(raw, probe),
          elapsedMs: Math.round(performance.now() - start),
          completion,
        });
      } catch (error) {
        receipt.results.push({
          id: probe.id,
          input: probe,
          elapsedMs: Math.round(performance.now() - start),
          error: error.message,
          code: error.code || null,
        });
        if (signal?.aborted) break;
      }
      onProgress(structuredClone(receipt));
    }
    receipt.status = signal?.aborted ? 'cancelled' : 'completed-needs-semantic-review';
  } catch (error) {
    receipt.status = 'failed';
    receipt.error = error.message;
    receipt.code = error.code || null;
  }
  receipt.finishedAt = new Date().toISOString();
  onProgress(structuredClone(receipt));
  return receipt;
}
