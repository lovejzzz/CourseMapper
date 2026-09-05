import type { InferenceRequest, InferenceResult } from '../../src/studio/scion';

// This allowlist deliberately contains only the Gemma models that Google lists
// as free. Never fall through to a paid Gemini model or a client-supplied URL.
export const HOSTED_GEMMA = 'gemma-4-26b-a4b-it';
export const GOOGLE_MODELS = [HOSTED_GEMMA, 'gemma-4-31b-it'] as const;
export type HostedGemma = (typeof GOOGLE_MODELS)[number];

export function googleRequest(request: InferenceRequest) {
  return {
    systemInstruction: {
      parts: [
        {
          text:
            request.system +
            (request.schema ? `\nReturn JSON using this exact schema:\n${JSON.stringify(request.schema)}` : ''),
        },
      ],
    },
    contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
    generationConfig: {
      temperature: request.temperature ?? 1,
      topP: 0.95,
      topK: 64,
      seed: request.seed,
      maxOutputTokens: Math.min(16384, request.maxTokens + (request.thinking ? 4096 : 0)),
      thinkingConfig: { thinkingLevel: request.thinking ? 'high' : 'minimal' },
      // The live Gemma API forced-JSON canary corrupts reasoning and repeats
      // text. Keep the contract in the prompt; validate the complete response
      // in the course engine instead of constraining its reasoning channel.
    },
  };
}

export class HostedScionError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfter = 0,
  ) {
    super(message);
  }
}

// Count the same complete request that will be generated, including the system
// instruction and schema. Character estimates undercount CJK and large schemas.
export async function countGoogleTokens(
  request: InferenceRequest,
  key: string,
  model: HostedGemma = HOSTED_GEMMA,
  signal?: AbortSignal,
): Promise<number> {
  if (!GOOGLE_MODELS.includes(model)) throw new Error('Only explicitly free Gemma models are allowed.');
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:countTokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ generateContentRequest: { model: `models/${model}`, ...googleRequest(request) } }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new HostedScionError(
      'The free provider could not check its input allowance. Your course is saved.',
      response.status === 429 ? 429 : 503,
      60,
    );
  const body = (await response.json()) as { totalTokens?: number };
  if (!Number.isSafeInteger(body.totalTokens) || body.totalTokens! < 1)
    throw new HostedScionError('The free provider returned an invalid input count. Your course is saved.', 502);
  return body.totalTokens!;
}

type GoogleChunk = {
  modelVersion?: string;
  error?: unknown;
  candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
};

async function readCompletion(response: Response): Promise<GoogleChunk> {
  if (!response.headers.get('Content-Type')?.includes('text/event-stream'))
    return (await response.json()) as GoogleChunk;
  const reader = response.body?.getReader();
  if (!reader) throw new HostedScionError('The provider returned an empty stream.', 502);
  const decoder = new TextDecoder();
  let pending = '',
    text = '',
    size = 0;
  const result: GoogleChunk = { candidates: [{ content: { parts: [] } }] };
  const consume = (event: string) => {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data || data === '[DONE]') return;
    const chunk = JSON.parse(data) as GoogleChunk;
    if (chunk.error) throw new HostedScionError('The provider interrupted generation. Resume the saved course.', 502);
    if (chunk.modelVersion) {
      if (result.modelVersion && result.modelVersion !== chunk.modelVersion)
        throw new HostedScionError('The provider changed model identity during generation.', 502);
      result.modelVersion = chunk.modelVersion;
    }
    const candidate = chunk.candidates?.[0];
    text +=
      candidate?.content?.parts
        ?.filter((part) => !part.thought)
        .map((part) => part.text ?? '')
        .join('') ?? '';
    if (candidate?.finishReason) result.candidates![0].finishReason = candidate.finishReason;
    if (chunk.usageMetadata) result.usageMetadata = { ...result.usageMetadata, ...chunk.usageMetadata };
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4_000_000) throw new HostedScionError('The provider response exceeded its safe size limit.', 502);
      pending += decoder.decode(value, { stream: true });
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(pending))) {
        consume(pending.slice(0, boundary.index));
        pending = pending.slice(boundary.index + boundary[0].length);
      }
    }
    pending += decoder.decode();
    if (pending.trim()) consume(pending);
    result.candidates![0].content!.parts = [{ text }];
    return result;
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof SyntaxError) throw new HostedScionError('The provider returned an incomplete stream.', 502);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export async function completeGoogle(
  request: InferenceRequest,
  key: string,
  model: HostedGemma = HOSTED_GEMMA,
  signal?: AbortSignal,
): Promise<InferenceResult> {
  if (!GOOGLE_MODELS.includes(model)) throw new Error('Only explicitly free Gemma models are allowed.');
  const start = performance.now();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(googleRequest(request)),
      signal,
    },
  );
  if (!response.ok) {
    const status = response.status;
    throw new HostedScionError(
      status === 429
        ? 'The shared free Scion allowance is busy or exhausted. Your saved course can be resumed later.'
        : status === 401 || status === 403
          ? 'Hosted Scion needs a valid site credential.'
          : `The free Scion provider returned HTTP ${status}. Your course is saved.`,
      status === 429 ? 429 : 503,
      status === 429 ? 60 : status >= 500 ? 30 : 0,
    );
  }
  const body = await readCompletion(response);
  const candidate = body.candidates?.[0];
  const text =
    candidate?.content?.parts
      ?.filter((part) => !part.thought)
      .map((part) => part.text ?? '')
      .join('') ?? '';
  if (!text) {
    const reason = candidate?.finishReason;
    // Retrying a policy block cannot repair it. Empty STOP/unfinished responses
    // are transient provider failures; let the bounded client retry recover.
    if (reason && !['STOP', 'MAX_TOKENS'].includes(reason))
      throw new HostedScionError(
        'The provider could not complete this request. Review the brief and source material.',
        422,
      );
    throw new HostedScionError(
      reason === 'MAX_TOKENS'
        ? 'Scion reached its response limit before producing content. The saved build can be retried.'
        : 'Scion returned no course content. The saved build can be retried.',
      502,
      30,
    );
  }
  // Preserve the provider's model identity, including a version when supplied.
  if (body.modelVersion && !body.modelVersion.startsWith(model))
    throw new HostedScionError('Scion model identity does not match the requested model.', 502);
  return {
    text,
    finishReason:
      candidate?.finishReason === 'STOP'
        ? 'stop'
        : candidate?.finishReason === 'MAX_TOKENS'
          ? 'length'
          : (candidate?.finishReason ?? 'unknown'),
    inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: (body.usageMetadata?.candidatesTokenCount ?? 0) + (body.usageMetadata?.thoughtsTokenCount ?? 0),
    elapsedMs: Math.round(performance.now() - start),
    model: `google/${body.modelVersion ?? model}`,
    route: 'server',
  };
}
