// Tendril-S from Node (zero-API mode) — wraps the persistent Python
// inference server (distill/serve_s.py). $0 per call, local only. The
// deployment prompts here are the EXACT single-entry prompts S was
// trained on (distill/prep_data.py) — serving a model off its training
// distribution is a self-inflicted wound.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SKIN_SYSTEM =
  "You are the course's own instructor unifying a lesson plan assembled from proven parts. Rewrite the segment MINIMALLY so it reads as one instructor: fix week/lesson references, add one-clause transitions where segments collide, unify register. NEVER change technical content, examples, numbers, or code; never add new claims; keep the rewrite within ±40% of the original length. Return only the rewritten segment text.";
export const BLEND_SYSTEM =
  "You polish quiz explanations. The text contains corrective sentences that were pasted in mechanically, so it reads as two voices. Rewrite it as ONE natural explanation (2-3 sentences) that makes every corrective's content its own point — keep the key technical terms (a lexical gate checks this), never paste a corrective as a standalone sentence. Return only the rewritten explanation text.";

const DEFAULT_ITEMS_PYTHON = 'trellis/tendril/.venv-g4/bin/python';
const DEFAULT_ITEMS_SCRIPT = 'trellis/tendril/distill/serve_g4.py';

function executable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveItemsRuntime({ cwd = process.cwd(), env = process.env, home = os.homedir() } = {}) {
  const explicitPython = String(env.TENDRIL_ITEMS_PYTHON || '').trim();
  const cachedPython = path.join(home, '.cache', 'coursemapper', 'venv-g4', 'bin', 'python');
  return {
    python: explicitPython
      ? path.resolve(cwd, explicitPython)
      : executable(cachedPython)
        ? cachedPython
        : path.resolve(cwd, DEFAULT_ITEMS_PYTHON),
    script: path.resolve(cwd, String(env.TENDRIL_ITEMS_SCRIPT || DEFAULT_ITEMS_SCRIPT).trim()),
  };
}

const itemsRuntime = resolveItemsRuntime();

// TASK-ROUTED local serving (v0.2, 'the better model is a pair'): the
// held-out gate bench measured complementary strengths — Qwen2.5-0.5B
// (s3b, 800-iter checkpoint) wins SKIN 71.7% vs 61.7%, while the
// SmolLM2 round-2 tune keeps BLEND 83.3% vs 61.7%. Routing by task
// scores 77.5% combined vs 72.5% single-model. Servers start lazily.
const ROUTES = {
  skin: {
    base: 'Qwen/Qwen2.5-0.5B-Instruct',
    adapters: 'trellis/tendril/distill/adapters-s3-800',
  },
  blend: {
    base: 'HuggingFaceTB/SmolLM2-135M-Instruct',
    adapters: 'trellis/tendril/distill/adapters',
  },
  // items: Gemma 4 E2B zero-shot via mlx-vlm (plan v0.2 A1) — beat the
  // paid author 26/30 vs 22/30 on its own gates at $0.
  items: {
    python: itemsRuntime.python,
    script: itemsRuntime.script,
  },
};

// Scion (the V2.1 house model name) IS the g4 server — the alias resolves
// to the same route entry so skin/polish/fill seats share one loaded 4B
// process with the items author instead of spawning a twin.
export function resolveRoute(task) {
  if (task === 'scion') return 'items';
  return ROUTES[task] ? task : 'skin';
}

let nextId = 1;
const servers = new Map(); // route -> { proc, pending }

async function startRoute(route, { timeoutMs = 120_000 } = {}) {
  const existing = servers.get(route);
  if (existing) {
    await existing.readyPromise;
    return existing;
  }
  const cfg = ROUTES[route];
  const proc = spawn(
    cfg.python ?? 'trellis/tendril/.venv/bin/python',
    [cfg.script ?? 'trellis/tendril/distill/serve_s.py'],
    {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...(cfg.base ? { S_BASE: cfg.base } : {}),
        ...(cfg.adapters ? { S_ADAPTERS: cfg.adapters } : {}),
      },
    },
  );
  const pending = new Map();
  let resolveReady;
  let rejectReady;
  const readyPromise = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const entry = { proc, pending, readyPromise, ready: false };
  servers.set(route, entry);
  // Always drain stderr. Model loaders and Hugging Face progress reporters can
  // emit enough startup diagnostics to fill an unread pipe, deadlocking the
  // child before it writes the JSON `ready` record on stdout.
  proc.stderr.on('data', (chunk) => {
    if (process.env.TENDRIL_SERVER_DEBUG === '1') process.stderr.write(`[tendril-s:${route}] ${chunk}`);
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
          entry.ready = true;
          resolveReady();
        } else if (pending.has(msg.id)) {
          const p = pending.get(msg.id);
          pending.delete(msg.id);
          clearTimeout(p.timer);
          if (process.env.TENDRIL_SERVER_DEBUG === '1' && msg.constrained) {
            process.stderr.write(`[tendril-s:${route}] response ${msg.id} constrained=${msg.constrained}\n`);
          }
          if (msg.error) p.reject(new Error(msg.error));
          else
            p.resolve(
              p.includeMetadata
                ? {
                    text: msg.text,
                    constrained: msg.constrained ?? null,
                    adapterMode: msg.adapterMode ?? null,
                    nativeAdapterActive: msg.nativeAdapterActive === true,
                    adapterScale: Number.isFinite(Number(msg.adapterScale)) ? Number(msg.adapterScale) : null,
                  }
                : msg.text,
            );
        }
      } catch {
        /* non-JSON stdout chatter ignored */
      }
    }
  });
  let startupTimer = null;
  const rejectPending = (error) => {
    if (startupTimer) clearTimeout(startupTimer);
    if (!entry.ready) rejectReady(error);
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject?.(error);
    }
    pending.clear();
    servers.delete(route);
  };
  proc.on('error', (error) => rejectPending(error));
  proc.on('exit', (code, signal) => {
    const detail = signal ? `signal ${signal}` : Number.isInteger(code) ? `code ${code}` : 'unknown status';
    rejectPending(new Error(`tendril-s [${route}] server exited (${detail})`));
  });
  startupTimer = setTimeout(() => {
    if (!entry.ready) {
      servers.delete(route);
      proc.kill();
      rejectReady(new Error(`tendril-s [${route}] did not start within ${Math.round(timeoutMs / 1000)}s`));
    }
  }, timeoutMs);
  await readyPromise;
  clearTimeout(startupTimer);
  return entry;
}

export async function startS(options = {}) {
  await startRoute('skin', options); // blend starts lazily on first use
}

export async function startItems(options = {}) {
  await startRoute('items', options);
}

export async function sGenerate(
  // V2: schema (JSON Schema dict) / jsonMode (bool) engage llguidance
  // grammar-constrained decoding on the g4 route (serve_g4.py) — parse
  // validity by construction. Ignored by serve_s routes.
  { system, user, source = '', task = 'skin', maxTokens, temperature, schema, jsonMode, adapterMode },
  { timeoutMs = 180_000, includeMetadata = false } = {},
) {
  const route = resolveRoute(task);
  // The items route may need to download or cold-load several GB of weights.
  // Its caller already supplies a queue-inclusive timeout; use the same budget
  // for startup instead of misclassifying a slow first load after 120 seconds.
  const entry = await startRoute(route, { timeoutMs });
  const id = String(nextId++);
  const promise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (entry.pending.has(id)) {
        entry.pending.delete(id);
        servers.delete(route);
        entry.proc.kill();
        reject(new Error('tendril-s timeout'));
      }
    }, timeoutMs);
    entry.pending.set(id, { resolve, reject, timer, includeMetadata });
  });
  entry.proc.stdin.write(
    `${JSON.stringify({
      id,
      system,
      user,
      source,
      ...(maxTokens ? { maxTokens } : {}),
      ...(temperature ? { temperature } : {}),
      ...(schema ? { schema } : {}),
      ...(jsonMode ? { jsonMode: true } : {}),
      ...(adapterMode ? { adapterMode } : {}),
    })}\n`,
  );
  return promise;
}

export function stopS() {
  for (const { proc } of servers.values()) proc.kill();
  servers.clear();
}
