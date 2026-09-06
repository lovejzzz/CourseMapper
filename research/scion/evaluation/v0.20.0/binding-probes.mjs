import { STRUCTURE_PROBES } from './structure-probes.mjs';

// A development follow-up on the same exposed inputs. The model selects
// evidence roles; it does not write answer keys or rubric prose in this pass.
export const BINDING_PROBE_SYSTEM = `Extract a compact set of evidence bindings for the teacher's objective. The compiler will build the task and calculate answers later.
Return exactly one JSON object. Start with { and end with }. Do not use Markdown fences or commentary.
Fields:
operation: one of "compare_event_dates", "interpret_proportion", "design_fair_comparison", "needs_review".
bindings: an array of objects with sourceId, role, quote. All three fields are strings. sourceId must identify a supplied record. quote must be an exact nonempty excerpt copied from that record.
unresolved: an array of objects with sourceId and quote, copied exactly from records that state a limitation or missing observation. Use [] when the records state no such issue.
Use these evidence roles where relevant:
- observed-part: the count with the property being measured; observed-whole: the total counted respondents; observed-group: the exact phrase naming those actually counted; excluded-group: those explicitly not counted or surveyed.
- creation-event: the record phrase naming the object's creation and date; publication-event: the phrase naming publication and date; evidence-limit: an explicit limit stated in the record.
- comparison-condition: the actual group's starting state, material or duration; observed-outcome: a measured or reported outcome; missing-measurement: explicit absence of outcome readings; missing-replication: explicit absence of independent repetitions.
Copy only supplied facts. Do not invent observations or design a new procedure. Preserve the distinction between the observed group and excluded people. More than one binding can refer to one record. Keep quotes in the original language. Do not include objective, studentWork, answers, successCriteria or other fields.`;

const ROLES = new Set([
  'observed-part',
  'observed-whole',
  'observed-group',
  'excluded-group',
  'creation-event',
  'publication-event',
  'evidence-limit',
  'comparison-condition',
  'observed-outcome',
  'missing-measurement',
  'missing-replication',
]);

export function checkBindingProbe(raw, probe) {
  const clean = String(raw)
    .trim()
    .replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1');
  const issues = [];
  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch {
    return { parsed: null, transportNormalized: clean !== raw.trim(), issues: ['invalid-json'] };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { parsed, issues: ['not-an-object'] };
  const sourceById = new Map(probe.sources.map((source) => [source.id, source.text]));
  if (
    !['compare_event_dates', 'interpret_proportion', 'design_fair_comparison', 'needs_review'].includes(
      parsed.operation,
    )
  )
    issues.push('invalid-operation');
  for (const key of ['bindings', 'unresolved']) {
    if (!Array.isArray(parsed[key])) {
      issues.push(`invalid-${key}`);
      continue;
    }
    for (const item of parsed[key]) {
      if (!item || !sourceById.has(item.sourceId)) {
        issues.push('unknown-source');
        continue;
      }
      if (typeof item.quote !== 'string' || !item.quote.trim() || !sourceById.get(item.sourceId).includes(item.quote))
        issues.push('quote-not-in-record');
      if (key === 'bindings' && !ROLES.has(item.role)) issues.push('invalid-role');
    }
  }
  if (!parsed.bindings?.length) issues.push('missing-bindings');
  if (Object.keys(parsed).some((key) => !['operation', 'bindings', 'unresolved'].includes(key)))
    issues.push('unexpected-field');
  return { parsed, transportNormalized: clean !== raw.trim(), issues: [...new Set(issues)] };
}

export async function runBindingProbes(api, { onProgress = () => {} } = {}) {
  const receipt = {
    protocol: 'scion-teaching-bindings-m0-v2',
    evaluationKind: 'same-development-inputs-after-initial-failures',
    startedAt: new Date().toISOString(),
    settings: { maxNewTokens: 1024, temperature: 0, topK: 1, topP: 1, seed: 7, thinking: false },
    results: [],
  };
  // Refuse a second load: this experiment measures the already-loaded model.
  if (api.status().phase !== 'ready') throw new Error('Reuse the ready model from the initial structure probes.');
  const runtime = api.status();
  receipt.runtime = {
    activeWeightIdentity: runtime.activeWeightIdentity,
    adapter: runtime.adapter,
    runtime: runtime.runtime,
  };
  for (const probe of STRUCTURE_PROBES) {
    receipt.status = `running:${probe.id}`;
    onProgress(structuredClone(receipt));
    const start = performance.now();
    let completion = null;
    try {
      const raw = await api.complete(
        [
          { role: 'system', content: BINDING_PROBE_SYSTEM },
          { role: 'user', content: JSON.stringify(probe) },
        ],
        {
          ...receipt.settings,
          onCompletion: (value) => {
            completion = value;
          },
        },
      );
      receipt.results.push({
        id: probe.id,
        input: probe,
        raw,
        ...checkBindingProbe(raw, probe),
        elapsedMs: Math.round(performance.now() - start),
        completion,
      });
    } catch (error) {
      receipt.results.push({ id: probe.id, error: error.message, elapsedMs: Math.round(performance.now() - start) });
    }
    onProgress(structuredClone(receipt));
  }
  receipt.status = 'completed-needs-semantic-review';
  receipt.finishedAt = new Date().toISOString();
  onProgress(structuredClone(receipt));
  return receipt;
}
