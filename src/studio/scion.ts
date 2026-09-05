import type { Wllama } from '@wllama/wllama';
import type { ChatCompletionParams, ChatCompletionResponse } from '@wllama/wllama/esm/types/oai-compat';

// The model identity is independent of the legacy compiler and its adapter gates.
export const SCION_MODEL = {
  id: 'google/gemma-4-E2B-it-qat-q4_0-gguf',
  revision: '69536a21d70340464240401ba38223d805f6a709',
  delivery: 'ryanhlewis/gemma-4-E2B-it-qat-q4_0-gguf-webgpu',
  deliveryRevision: '3ce648b4ba851cb23917b766f4bb2d9d47eaff81',
  bytes: 3349514688,
  runtime: '@wllama/wllama@3.6.1',
} as const;

export interface InferenceRequest {
  system: string;
  prompt: string;
  schema?: Record<string, unknown>;
  seed: number;
  maxTokens: number;
  thinking: boolean;
  temperature?: number;
}
export interface InferenceResult {
  text: string;
  finishReason: string;
  inputTokens: number;
  outputTokens: number;
  elapsedMs: number;
  model: string;
  route: 'browser' | 'server';
  transportAttempts?: number;
}
export interface Inference {
  complete(request: InferenceRequest, signal?: AbortSignal): Promise<InferenceResult>;
}

export function completionParams(request: InferenceRequest): ChatCompletionParams & { stream: false } {
  return {
    messages: [
      // llama.cpp constrains decoding with response_format; it does not teach
      // the model the field meanings. Include the contract in the prompt too.
      {
        role: 'system',
        content: request.system + (request.schema ? `\nOUTPUT JSON SCHEMA:\n${JSON.stringify(request.schema)}` : ''),
      },
      { role: 'user', content: request.prompt },
    ],
    seed: request.seed,
    max_tokens: request.maxTokens,
    temperature: request.temperature ?? 0.35,
    top_k: 64,
    top_p: 0.95,
    min_p: 0,
    chat_template_kwargs: { enable_thinking: request.thinking },
    ...(request.schema
      ? {
          response_format: {
            type: 'json_schema' as const,
            json_schema: { name: 'course_content', strict: true, schema: request.schema },
          },
        }
      : {}),
    cache_prompt: true,
    stream: false,
  };
}

export function normalizeCompletion(
  response: ChatCompletionResponse,
  elapsedMs: number,
  route: 'browser' | 'server',
): InferenceResult {
  const choice = response.choices?.[0];
  if (!choice) throw new Error('Scion returned no completion.');
  return {
    text: choice.message.content ?? '',
    finishReason: choice.finish_reason ?? 'unknown',
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    elapsedMs: Math.round(elapsedMs),
    model: SCION_MODEL.id,
    route,
  };
}

let localRuntime: Wllama | null = null;
let loading: Promise<Wllama> | null = null;
let queue: Promise<unknown> = Promise.resolve();

export async function unloadLocalScion(): Promise<void> {
  await queue.catch(() => {});
  const runtime = localRuntime;
  localRuntime = null;
  if (runtime) await runtime.exit();
}

export const SCION_ENDPOINT =
  import.meta.env?.VITE_SCION_ENDPOINT ||
  (import.meta.env?.PROD ? 'https://edutool-scion.xingpicture.workers.dev/api/scion' : '/api/scion');

export async function loadLocalScion(
  onProgress: (message: string) => void = () => {},
  signal?: AbortSignal,
): Promise<Wllama> {
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  if (localRuntime?.isModelLoaded()) return localRuntime;
  if (loading) return loading;
  loading = (async () => {
    const { Wllama } = await import('@wllama/wllama');
    const { default: wasm } = await import('@wllama/wllama/esm/wasm/wllama.wasm?url');
    const candidate = new Wllama(
      { default: new URL(wasm, location.href).href },
      {
        allowOffline: true,
        logger: { debug() {}, log() {}, warn: console.warn, error: console.error },
      },
    );
    // No implicit CDN compatibility download; hosted Scion handles unsupported devices.
    candidate.setCompat(null);
    if (!candidate.isSupportWebGPU()) throw new Error('This device needs hosted Scion. Choose Server.');
    try {
      onProgress('Preparing Scion on this device…');
      const url = `https://huggingface.co/${SCION_MODEL.delivery}/resolve/${SCION_MODEL.deliveryRevision}/gemma-4-E2B_q4_0-it-00001-of-00005.gguf`;
      await candidate.loadModelFromUrl(url, {
        n_ctx: 16384,
        n_threads: 1,
        n_parallel: 1,
        n_gpu_layers: 99999,
        jinja: true,
        reasoning_format: 'deepseek',
        reasoning_budget_tokens: 1536,
        signal,
        progressCallback: ({ loaded, total }) =>
          onProgress(total > 0 ? `Preparing Scion · ${Math.round((loaded / total) * 100)}%` : 'Preparing Scion…'),
      });
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      if (candidate.getModelMetadata().meta['general.architecture'] !== 'gemma4')
        throw new Error('Unexpected Scion model architecture.');
      localRuntime = candidate;
      onProgress('Scion is ready on this device.');
      return candidate;
    } catch (error) {
      await candidate.exit().catch(() => {});
      throw error;
    }
  })().finally(() => {
    loading = null;
  });
  return loading;
}

export function browserInference(onProgress?: (message: string) => void): Inference {
  return {
    complete(request, signal) {
      const run = queue
        .catch(() => {})
        .then(async () => {
          const runtime = await loadLocalScion(onProgress, signal);
          if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
          const start = performance.now();
          const result = await runtime.createChatCompletion({ ...completionParams(request), abortSignal: signal });
          return normalizeCompletion(result, performance.now() - start, 'browser');
        });
      queue = run;
      return run;
    },
  };
}

function retryWait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Cancelled', 'AbortError'));
      return;
    }
    const cancel = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', cancel);
      resolve();
    }, milliseconds);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

export function serverInference(
  endpoint = SCION_ENDPOINT,
  headers: Record<string, string> = {},
  onProgress?: (message: string) => void,
): Inference {
  return {
    async complete(request, signal) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        const timeout = AbortSignal.timeout(270000);
        let response: Response;
        try {
          response = await fetch(`${endpoint}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify(request),
            signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
          });
        } catch (error) {
          if (signal?.aborted) throw error;
          if (timeout.aborted)
            throw new Error('Scion took too long to respond. Completed work is saved; resume the build to try again.');
          throw new Error(
            'The connection to Scion was interrupted. Completed work is saved; resume when your connection is available.',
          );
        }
        const body = await response.json().catch(() => null);
        if (!response.ok || !body?.text) {
          const retry = Math.min(86400, Number(response.headers.get('Retry-After')) || 0);
          if (attempt < 3 && [429, 502, 503, 504].includes(response.status) && retry > 0 && retry <= 90) {
            onProgress?.(
              `The free service is busy. Saved progress is safe; retrying in ${retry} seconds (${attempt}/2).`,
            );
            await retryWait(retry * 1000, signal);
            continue;
          }
          const when = retry > 0 ? ` Try again after ${new Date(Date.now() + retry * 1000).toLocaleTimeString()}.` : '';
          throw new Error((body?.error || `Hosted Scion is unavailable (${response.status}).`) + when);
        }
        return { ...body, transportAttempts: attempt } as InferenceResult;
      }
      throw new Error('The shared Scion service is unavailable. Resume your saved course later.');
    },
  };
}
