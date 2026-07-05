// Tendril-S from Node (zero-API mode) — wraps the persistent Python
// inference server (distill/serve_s.py). $0 per call, local only. The
// deployment prompts here are the EXACT single-entry prompts S was
// trained on (distill/prep_data.py) — serving a model off its training
// distribution is a self-inflicted wound.

import { spawn } from 'node:child_process';

export const SKIN_SYSTEM =
  "You are the course's own instructor unifying a lesson plan assembled from proven parts. Rewrite the segment MINIMALLY so it reads as one instructor: fix week/lesson references, add one-clause transitions where segments collide, unify register. NEVER change technical content, examples, numbers, or code; never add new claims; keep the rewrite within ±40% of the original length. Return only the rewritten segment text.";
export const BLEND_SYSTEM =
  "You polish quiz explanations. The text contains corrective sentences that were pasted in mechanically, so it reads as two voices. Rewrite it as ONE natural explanation (2-3 sentences) that makes every corrective's content its own point — keep the key technical terms (a lexical gate checks this), never paste a corrective as a standalone sentence. Return only the rewritten explanation text.";

let proc = null;
let nextId = 1;
const pending = new Map();

export async function startS({ timeoutMs = 60_000 } = {}) {
  if (proc) return;
  proc = spawn('trellis/tendril/.venv/bin/python', ['trellis/tendril/distill/serve_s.py'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buffer = '';
  proc.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.ready) {
          pending.get('ready')?.resolve();
          pending.delete('ready');
        } else if (pending.has(msg.id)) {
          const p = pending.get(msg.id);
          pending.delete(msg.id);
          if (msg.error) p.reject(new Error(msg.error));
          else p.resolve(msg.text);
        }
      } catch {
        /* non-JSON chatter on stdout is ignored */
      }
    }
  });
  proc.on('exit', () => {
    for (const p of pending.values()) p.reject?.(new Error('tendril-s server exited'));
    pending.clear();
    proc = null;
  });
  await new Promise((resolve, reject) => {
    pending.set('ready', { resolve, reject });
    setTimeout(() => reject(new Error('tendril-s server did not start (is the venv built?)')), timeoutMs);
  });
}

export function sGenerate({ system, user, source = '' }, { timeoutMs = 90_000 } = {}) {
  if (!proc) return Promise.reject(new Error('tendril-s server not started'));
  const id = String(nextId++);
  const promise = new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error('tendril-s timeout'));
      }
    }, timeoutMs);
  });
  proc.stdin.write(`${JSON.stringify({ id, system, user, source })}\n`);
  return promise;
}

export function stopS() {
  proc?.kill();
  proc = null;
}
