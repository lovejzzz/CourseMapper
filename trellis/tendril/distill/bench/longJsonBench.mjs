// LONG-JSON BENCH (E2B-MAX V2, frozen instrument — roadmap Phase 0).
// Fixture: bench/longjson-bodies-v1.jsonl — the 2026-07-06 compiler-seat
// autopsy bodies (SHIM_BODY_LOG). V1 baseline: every response ≥15K chars
// failed JSON.parse (near-miss commas/brackets); everything ≤2K parsed.
// The bench replays each unique large prompt through sGenerate with
// jsonMode (llguidance permissive-object grammar) and scores:
//   parse-valid · top-level keys · chars · degenerate-repetition ratio.
// Run:  LONGJSON=run npx vite-node trellis/tendril/distill/bench/longJsonBench.mjs
import fs from 'node:fs';
import { sGenerate, stopS } from '../../sModel.mjs';

const FIXTURE = new URL('./longjson-bodies-v1.jsonl', import.meta.url).pathname;

function repetitionRatio(text) {
  // crude degeneracy probe: fraction of 40-char windows that repeat verbatim
  const windows = new Map();
  let repeats = 0;
  let total = 0;
  for (let i = 0; i + 40 <= text.length; i += 40) {
    const w = text.slice(i, i + 40);
    total += 1;
    if (windows.has(w)) repeats += 1;
    else windows.set(w, 1);
  }
  return total ? repeats / total : 0;
}

export async function runLongJsonBench({ maxTokens = 12_000, minChars = 5_000 } = {}) {
  const rows = fs
    .readFileSync(FIXTURE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const seen = new Set();
  const cases = rows.filter((r) => {
    if ((r.response ?? '').length < minChars) return false;
    const key = r.response.slice(0, 400);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const results = [];
  for (const [index, c] of cases.entries()) {
    const started = Date.now();
    const text = String(
      (await sGenerate(
        { system: c.system, user: c.user, task: 'items', maxTokens, jsonMode: true },
        { timeoutMs: 1_200_000 },
      )) ?? '',
    );
    const seconds = Math.round((Date.now() - started) / 100) / 10;
    let parsed = null;
    let parseError = '';
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      parseError = String(error.message).slice(0, 80);
    }
    const v1Valid = (() => {
      try {
        JSON.parse(c.response);
        return true;
      } catch {
        return false;
      }
    })();
    results.push({
      case: index,
      systemHead: c.system.slice(0, 48),
      v1: { chars: c.response.length, valid: v1Valid },
      v2: {
        chars: text.length,
        valid: parsed !== null,
        parseError,
        keys: parsed && typeof parsed === 'object' ? Object.keys(parsed).slice(0, 6) : null,
        repetition: Math.round(repetitionRatio(text) * 1000) / 1000,
        seconds,
      },
    });
    console.error(
      `[longjson] case ${index}: v1 ${c.response.length}ch ${v1Valid ? 'valid' : 'INVALID'} -> v2 ${text.length}ch ${parsed ? 'VALID' : `INVALID (${parseError})`} in ${seconds}s`,
    );
  }
  return results;
}

if (process.env.LONGJSON === 'run') {
  const results = await runLongJsonBench();
  console.log(JSON.stringify(results, null, 2));
  stopS();
}
