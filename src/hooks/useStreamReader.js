import { useRef, useCallback } from 'react';
import { supportsCustomTemperature } from '../lib/agentProviders';
import { DEFAULT_PROVIDER_TIMEOUT_MS, fetchWithTimeout } from '../lib/fetchWithTimeout';
import { getLocalEndpoint, localModelOption } from '../lib/localProvider';
import { failureEventFields, toClassifiedError } from '../lib/failureClassification';
import { GOOGLE_ENDPOINT_FAMILIES, isVertexKey } from '../lib/googleProvider';
import { buildProviderTextRequest } from '../lib/modelRequestBuilders';
import { PUBLIC_SCION_PROVIDER_ID, publicScionModelOption } from '../lib/publicScionProvider';
import {
  buildApiUsageEvent,
  extractUsageFromProviderChunk,
  mergeReportedUsage,
  normalizeApiUsage,
} from '../lib/apiUsageCost';

export { isVertexKey } from '../lib/googleProvider';

/**
 * Strip <think>...</think> tags from reasoning model output.
 */
function stripThinkTags(text) {
  let result = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  result = result.replace(/<think>[\s\S]*$/gi, '');
  return result.trim();
}

/**
 * Recursively strip think tags from all string values in a parsed object.
 */
function deepStripThinkTags(obj) {
  if (typeof obj === 'string') return stripThinkTags(obj);
  if (Array.isArray(obj)) return obj.map(deepStripThinkTags);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = deepStripThinkTags(v);
    return out;
  }
  return obj;
}

// Module-level cache: models that don't support custom temperature
const _noTempModels = new Set();

function googleGenerateUrlFromStreamUrl(streamUrl) {
  const url = new URL(streamUrl);
  url.pathname = url.pathname.replace(':streamGenerateContent', ':generateContent');
  url.searchParams.delete('alt');
  return url.toString();
}

function extractGoogleText(data) {
  return data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
}

function estimateCharsAsTokens(...values) {
  return Math.round(values.reduce((sum, value) => sum + String(value || '').length, 0) / 4);
}

/**
 * Shared SSE stream reader with auto-retry and exponential backoff.
 * Streams directly from the selected provider in the static BYOK build.
 */
export default function useStreamReader() {
  const abortControllerRef = useRef(null);

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  /**
   * Parse partial/incomplete JSON by patching brackets and quotes.
   *
   * Sets `lastParseRecovery` to describe what happened on the most recent
   * call — callers can surface this as a truncation signal. Shape:
   *   { recovered: boolean, parseError?: string, bytes: number }
   * Previously this was invisible: models that exceeded the output budget
   * would silently fall through to the recovery path and the downstream
   * completenessCheck retry was the only feedback. Now useDeliverables can
   * log truncation cases so they're investigatable.
   */
  const lastParseRecoveryRef = useRef({ recovered: false, bytes: 0 });
  const parsePartialJSON = useCallback((text) => {
    const originalBytes = (text || '').length;
    let cleaned = stripThinkTags(text);
    const fenceStart = cleaned.indexOf('```');
    if (fenceStart !== -1) {
      cleaned = cleaned
        .slice(fenceStart)
        .replace(/^```\w*\n?/, '')
        .replace(/```\s*$/, '');
    }
    const start = cleaned.indexOf('{');
    if (start === -1) {
      lastParseRecoveryRef.current = { recovered: false, bytes: originalBytes, parseError: 'no-json' };
      return null;
    }
    let jsonStr = cleaned.slice(start);
    // Strip any trailing text after the last } (e.g. markdown notes the model appended)
    const lastBrace = jsonStr.lastIndexOf('}');
    if (lastBrace !== -1 && lastBrace < jsonStr.length - 1) {
      const trailing = jsonStr.slice(lastBrace + 1).trim();
      // Only trim if trailing chars are non-JSON (not starting another object)
      if (trailing && !trailing.startsWith('{') && !trailing.startsWith('[')) {
        jsonStr = jsonStr.slice(0, lastBrace + 1);
      }
    }
    try {
      const clean = deepStripThinkTags(JSON.parse(jsonStr));
      lastParseRecoveryRef.current = { recovered: false, bytes: originalBytes };
      return clean;
    } catch (parseErr) {
      let patched = jsonStr;
      // Truncate any trailing broken string value (cut mid-value)
      const lastQuote = patched.lastIndexOf('"');
      if (lastQuote > 0) {
        const afterLast = patched.slice(lastQuote + 1).trim();
        // If the text ends with an unclosed string, close it
        if (afterLast === '' || /^[,\s]*$/.test(afterLast)) {
          // already looks okay
        } else if (!/^[\s,:}\]]/.test(afterLast)) {
          // Junk after last quote — truncate to last quote and close
          patched = patched.slice(0, lastQuote + 1);
        }
      }
      const quoteCount = (patched.match(/(?<!\\)"/g) || []).length;
      if (quoteCount % 2 !== 0) patched += '"';
      // Strip trailing comma at end of string (common in truncated JSON)
      patched = patched.replace(/,\s*$/, '');
      // Remove incomplete key-value pair at end (e.g. "key": or "key":  )
      patched = patched.replace(/,\s*"[^"]*"\s*:\s*$/, '');
      const opens = [];
      for (const ch of patched) {
        if (ch === '{' || ch === '[') opens.push(ch);
        else if (ch === '}' && opens.length && opens[opens.length - 1] === '{') opens.pop();
        else if (ch === ']' && opens.length && opens[opens.length - 1] === '[') opens.pop();
      }
      for (let i = opens.length - 1; i >= 0; i--) {
        patched += opens[i] === '{' ? '}' : ']';
      }
      try {
        const recovered = deepStripThinkTags(JSON.parse(patched));
        lastParseRecoveryRef.current = { recovered: true, bytes: originalBytes, parseError: parseErr?.message };
        return recovered;
      } catch {
        lastParseRecoveryRef.current = { recovered: false, bytes: originalBytes, parseError: parseErr?.message };
        return null;
      }
    }
  }, []);

  /** Read-only accessor for the most recent parsePartialJSON outcome. */
  const getLastParseRecovery = useCallback(() => lastParseRecoveryRef.current, []);

  /**
   * Stream directly from an AI provider API (no server proxy needed).
   * @param {string} provider - 'openai' | 'anthropic' | 'google'
   * @param {string} apiKey
   * @param {string} modelId
   * @param {string} systemPrompt
   * @param {string} userPrompt
   * @param {object} opts - { onChunk, onRetry, maxRetries, existingText, signal }
   * @returns {{ fullText: string }}
   */
  const streamProvider = useCallback(async (provider, apiKey, modelId, systemPrompt, userPrompt, opts = {}) => {
    const {
      onChunk,
      onRetry,
      maxRetries = 3,
      existingText = '',
      signal: externalSignal,
      maxOutputTokens,
      modelCapabilities,
      generationPlan,
      featureId,
      task,
      schema,
      temperature: temperatureOverride,
      onApiCallEvent,
      allowProviderFallback = true,
    } = opts;
    const recordApiCallEvent = (event) => {
      if (typeof onApiCallEvent === 'function') onApiCallEvent(event);
    };
    const retryLimit = maxRetries;
    const recordUsage = (reportedUsage, outputText, label = 'API usage') => {
      const usageEvent = buildApiUsageEvent({
        provider,
        modelId,
        featureId,
        task,
        label,
        systemPrompt,
        userPrompt,
        outputText,
        reportedUsage,
      });
      if (usageEvent) recordApiCallEvent(usageEvent);
    };
    const buildProviderTraceBase = () => ({
      provider,
      modelId,
      featureId: featureId || task || '',
      task: task || featureId || '',
      maxOutputTokens: Number(maxOutputTokens) || undefined,
      approxInputTokens: estimateCharsAsTokens(systemPrompt, userPrompt),
      hasSchema: Boolean(schema),
    });

    // Scion: pinned Gemma 4 GGUF inference in this browser. This branch must
    // remain before buildProviderTextRequest so a saved `public` provider can
    // never fall through to a remote prompt endpoint.
    if (provider === PUBLIC_SCION_PROVIDER_ID) {
      const { runScionLocalCompletion } = await import('../lib/scionLocalProvider');
      let lastProgressKey = '';
      try {
        const result = await runScionLocalCompletion({
          systemPrompt,
          userPrompt,
          task,
          schema,
          maxOutputTokens,
          maxRetries,
          temperature: temperatureOverride ?? generationPlan?.temperature ?? 0,
          signal: externalSignal,
          onProgress: (runtimeStatus) => {
            const progress = Math.max(0, Math.min(1, Number(runtimeStatus?.progress) || 0));
            const bucket = Math.floor(progress * 10);
            const key = `${runtimeStatus?.phase || 'loading'}:${bucket}`;
            if (key === lastProgressKey) return;
            lastProgressKey = key;
            recordApiCallEvent({
              type: 'localModelProgress',
              label: runtimeStatus?.message || 'Preparing Scion on this device',
              detail: `${Math.floor(progress * 100)}%`,
              stage: 'local-model',
              ...buildProviderTraceBase(),
              progress,
              runtimePhase: runtimeStatus?.phase || '',
            });
          },
          onAdapterRoute: (route) => {
            recordApiCallEvent({
              type: 'scionAdapterRoute',
              label: route?.mode === 'adapter' ? 'Scion adapter used' : 'Scion base used',
              detail: `${route?.taskFamily || 'unclassified'} · ${route?.reason || 'unknown route'}`,
              stage: 'local-model-route',
              ...buildProviderTraceBase(),
              routeProtocol: route?.protocol || '',
              routeMode: route?.mode || 'base-only',
              taskFamily: route?.taskFamily || 'unclassified',
              routeReason: route?.reason || '',
              adapterId: route?.adapterId || null,
              adapterManifestSha256: route?.manifestSha256 || null,
              adapterScopeIdentitySha256: route?.scopeIdentitySha256 || null,
              nativeAdapterActive: route?.nativeAdapterActive === true,
              execution: 'browser-local',
            });
          },
          onAttemptStart: ({ attempt, maxAttempts, temperature }) => {
            recordApiCallEvent({
              type: 'providerRequestStart',
              label: 'Scion local generation start',
              detail: `${task || featureId || 'generation'} attempt ${attempt}/${maxAttempts}`,
              stage: 'provider-request',
              ...buildProviderTraceBase(),
              attempt,
              maxRetries: Math.max(0, maxAttempts - 1),
              temperature,
              execution: 'browser-local',
            });
          },
          onToken: (currentText, tokenCount) => {
            if (onChunk) onChunk(existingText + currentText, tokenCount);
          },
          onRetry: (attempt, limit, delay, error) => {
            if (onRetry) onRetry(attempt, limit, delay);
            recordApiCallEvent({
              type: 'streamRetryCall',
              label: 'Retry Scion local generation',
              detail: error?.message || 'Incomplete local response',
              stage: 'stream-retry',
              ...buildProviderTraceBase(),
              attempt,
              maxRetries: limit,
              delayMs: delay,
              admissionIssues: error?.admissionIssues || [],
              kernelShape: error?.kernelShape || [],
              execution: 'browser-local',
            });
          },
        });
        const fullText = existingText + result.fullText;
        if (onChunk) onChunk(fullText, result.tokenCount + 1);
        for (const repair of result.repairs || []) {
          recordApiCallEvent({
            type: 'scionCompilerRepair',
            label:
              repair.pass === 'incompleteExplanationTail'
                ? 'Scion retained a complete explanation'
                : 'Scion aligned an answer key',
            detail: `${repair.lessonId || 'lesson'} · item ${Number(repair.item) + 1}`,
            stage: 'local-compiler',
            ...buildProviderTraceBase(),
            repairPass: repair.pass,
            repairAction: repair.action,
            trainingEligible: repair.trainingEligible === true,
            retainedCharacters: repair.recoveryEvidence?.retainedCharacters,
            removedCharacters: repair.recoveryEvidence?.removedCharacters,
            removedTail: repair.recoveryEvidence?.removedTail,
            execution: 'browser-local',
          });
        }
        if (result.contractIncomplete) {
          recordApiCallEvent({
            type: 'pipelineDecision',
            label: 'Scion semantic admission deferred',
            detail: `${(result.admissionIssues || []).length} unresolved contract issue${
              (result.admissionIssues || []).length === 1 ? '' : 's'
            } forwarded to per-atom admission`,
            stage: 'local-compiler',
            ...buildProviderTraceBase(),
            admissionIssues: result.admissionIssues || [],
            kernelShape: result.kernelShape || [],
            execution: 'browser-local',
          });
        }
        recordApiCallEvent({
          type: 'providerResponseDone',
          label: 'Scion local response complete',
          detail: `${result.fullText.length} chars on device`,
          stage: 'provider-response',
          ...buildProviderTraceBase(),
          attempt: result.attempt,
          maxRetries: result.maxRetries,
          outputChars: result.fullText.length,
          streamChunkCount: result.tokenCount,
          finishReason: 'stop',
          execution: 'browser-local',
        });
        const compactPrompt = result.messages.map((message) => message.content).join('\n');
        recordUsage(
          {
            inputTokens: estimateCharsAsTokens(compactPrompt),
            outputTokens: estimateCharsAsTokens(result.fullText),
            source: 'local-estimate',
          },
          result.fullText,
          'Scion local usage',
        );
        return { fullText, finishReason: 'stop' };
      } catch (rawError) {
        if (rawError?.name === 'AbortError') throw rawError;
        const error = toClassifiedError(rawError, { provider, modelId, task });
        recordApiCallEvent({
          type: 'failedCall',
          label: 'Scion local generation failed',
          detail: error.message,
          stage: 'local-model',
          ...buildProviderTraceBase(),
          ...failureEventFields(error, { provider, modelId }),
          admissionIssues: rawError?.admissionIssues || [],
          kernelShape: rawError?.kernelShape || [],
          execution: 'browser-local',
        });
        error.apiCallBudgetRecorded = true;
        throw error;
      }
    }

    // WebLLM: run locally in browser, no network needed
    if (provider === 'webllm') {
      const { streamLocalChat } = await import('../lib/webllm');
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];
      return streamLocalChat(modelId, messages, {
        temperature: 0.3,
        max_tokens: maxOutputTokens || 4096,
        onChunk: (text, count) => {
          if (onChunk) onChunk(existingText + text, count);
        },
        signal: externalSignal,
      }).then((result) => {
        recordUsage(
          { inputTokens: 0, outputTokens: 0, totalTokens: 0, source: 'local' },
          result.fullText || '',
          'Local model usage',
        );
        return { fullText: existingText + result.fullText };
      });
    }

    let skipTemp =
      _noTempModels.has(modelId) ||
      !supportsCustomTemperature(modelId) ||
      modelCapabilities?.supportsTemperature === false ||
      generationPlan?.useTemperature === false;
    let requestTemperature = temperatureOverride;
    let { url, headers, body, parseChunk, parseTextResponse, parseJsonResponse } = buildProviderTextRequest({
      provider,
      apiKey,
      modelId,
      systemPrompt,
      userPrompt,
      maxOutputTokens,
      skipTemperature: skipTemp,
      modelCapabilities,
      generationPlan,
      task,
      schema,
      temperatureOverride: requestTemperature,
    });

    let fullText = existingText;
    let attempt = 0;

    const runGoogleNonStreamingFallback = async () => {
      const fallbackController = new AbortController();
      abortControllerRef.current = fallbackController;
      if (externalSignal) {
        if (externalSignal.aborted) throw new DOMException('Aborted', 'AbortError');
        externalSignal.addEventListener('abort', () => fallbackController.abort(), { once: true });
      }
      recordApiCallEvent({
        type: 'providerFallbackCall',
        label: 'Google non-streaming fallback',
        detail: modelId,
        stage: 'provider-fallback',
        ...buildProviderTraceBase(),
      });
      const response = await fetch(googleGenerateUrlFromStreamUrl(url), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: fallbackController.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const msg = data.error?.message || data.error || `API error: ${response.status}`;
        const error = toClassifiedError(
          Object.assign(new Error(`${msg} [${response.status}]`), { status: response.status }),
          {
            provider,
            modelId,
            task,
            status: response.status,
          },
        );
        recordApiCallEvent({
          type: 'failedCall',
          label: 'Google non-streaming fallback failed',
          detail: error.message,
          stage: 'provider-fallback',
          ...buildProviderTraceBase(),
          ...failureEventFields(error, { provider, modelId }),
        });
        error.apiCallBudgetRecorded = true;
        throw error;
      }
      const text = extractGoogleText(data);
      if (!text) throw new Error('Google fallback returned an empty response.');
      fullText = existingText + text;
      if (onChunk) onChunk(fullText, 1);
      recordApiCallEvent({
        type: 'providerResponseDone',
        label: 'Google fallback response',
        detail: `${text.length} chars`,
        stage: 'provider-response',
        ...buildProviderTraceBase(),
        outputChars: text.length,
        streamChunkCount: 1,
      });
      recordUsage(normalizeApiUsage(data.usageMetadata || {}), text, 'Google fallback usage');
      return { fullText };
    };

    while (attempt <= retryLimit) {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Link external abort signal (from useDeliverables) to internal controller
      // so Stop button actually cancels the fetch
      if (externalSignal) {
        if (externalSignal.aborted) throw new DOMException('Aborted', 'AbortError');
        externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
      }

      // v0.15.186: a stalled stream used to cost the 6-8 minute feature
      // watchdog — and the course-map phase has no watchdog at all, so a
      // hung stream there waited for a manual Stop. If no bytes arrive for
      // the inactivity window, abort THIS attempt and let the normal retry
      // path resend; the flag distinguishes a stall from a user Stop.
      const STREAM_INACTIVITY_TIMEOUT_MS = 120000;
      let inactivityAborted = false;
      let inactivityTimer = null;
      const armInactivityTimer = () => {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
          inactivityAborted = true;
          controller.abort();
        }, STREAM_INACTIVITY_TIMEOUT_MS);
      };

      try {
        recordApiCallEvent({
          type: 'providerRequestStart',
          label: 'Provider request start',
          detail: `${task || featureId || 'generation'} attempt ${attempt + 1}/${retryLimit + 1}`,
          stage: 'provider-request',
          ...buildProviderTraceBase(),
          attempt: attempt + 1,
          maxRetries: retryLimit,
        });
        armInactivityTimer();
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const msg = errData.error?.message || errData.error || `API error: ${response.status}`;
          console.error(`[CM] API ${response.status} error:`, JSON.stringify(errData).slice(0, 500));

          // If the model doesn't support custom temperature, retry without it
          if (response.status === 400 && !skipTemp && /temperature/i.test(msg)) {
            console.log('[CM] Model does not support custom temperature, retrying without it');
            skipTemp = true;
            _noTempModels.add(modelId); // Remember for parallel & future calls
            recordApiCallEvent({
              type: 'providerFallbackCall',
              label: 'Retry without temperature',
              detail: modelId,
              stage: 'provider-fallback',
              ...buildProviderTraceBase(),
              attempt: attempt + 1,
              maxRetries: retryLimit,
            });
            ({ url, headers, body, parseChunk, parseTextResponse, parseJsonResponse } = buildProviderTextRequest({
              provider,
              apiKey,
              modelId,
              systemPrompt,
              userPrompt,
              maxOutputTokens,
              skipTemperature: true,
              modelCapabilities,
              generationPlan,
              task,
              schema,
              temperatureOverride: requestTemperature,
            }));
            continue;
          }

          const error = toClassifiedError(
            Object.assign(new Error(`${msg} [${response.status}]`), {
              status: response.status,
              provider,
              modelId,
              responseBody: errData,
            }),
            { provider, modelId, task, status: response.status, url },
          );
          recordApiCallEvent({
            type: 'failedCall',
            label: 'Provider API error',
            detail: error.message,
            stage: 'provider-response',
            ...buildProviderTraceBase(),
            attempt: attempt + 1,
            maxRetries: retryLimit,
            ...failureEventFields(error, { provider, modelId }),
          });
          error.apiCallBudgetRecorded = true;
          throw error;
        }

        if (typeof parseTextResponse === 'function') {
          const text = parseTextResponse(await response.text(), response);
          fullText += text;
          if (onChunk) onChunk(fullText, 1);
          if (inactivityTimer) clearTimeout(inactivityTimer);
          const usage = normalizeApiUsage(
            {
              prompt_tokens: response.headers.get('x-usage-prompt-text-tokens'),
              completion_tokens: response.headers.get('x-usage-completion-text-tokens'),
              total_tokens: response.headers.get('x-usage-total-tokens'),
              source: 'response-headers',
            },
            { source: 'response-headers' },
          );
          const outputText = fullText.slice(String(existingText || '').length);
          recordApiCallEvent({
            type: 'providerResponseDone',
            label: 'Provider response complete',
            detail: `plain text, ${outputText.length} chars`,
            stage: 'provider-response',
            ...buildProviderTraceBase(),
            attempt: attempt + 1,
            maxRetries: retryLimit,
            outputChars: outputText.length,
            streamChunkCount: 1,
            finishReason: 'stop',
          });
          recordUsage(usage, outputText, 'API usage');
          return { fullText, finishReason: 'stop' };
        }

        if (typeof parseJsonResponse === 'function') {
          const data = await response.json().catch(() => ({}));
          const text = parseJsonResponse(data, response);
          fullText += text;
          if (onChunk) onChunk(fullText, 1);
          if (inactivityTimer) clearTimeout(inactivityTimer);
          const headerUsage = normalizeApiUsage(
            {
              prompt_tokens: response.headers.get('x-usage-prompt-text-tokens'),
              completion_tokens: response.headers.get('x-usage-completion-text-tokens'),
              total_tokens: response.headers.get('x-usage-total-tokens'),
              source: 'response-headers',
            },
            { source: 'response-headers' },
          );
          const reportedUsage = data?.usage ? normalizeApiUsage(data.usage, { source: 'reported' }) : null;
          const usage = reportedUsage || headerUsage;
          const outputText = fullText.slice(String(existingText || '').length);
          recordApiCallEvent({
            type: 'providerResponseDone',
            label: 'Provider response complete',
            detail: `non-streaming JSON, ${outputText.length} chars`,
            stage: 'provider-response',
            ...buildProviderTraceBase(),
            attempt: attempt + 1,
            maxRetries: retryLimit,
            outputChars: outputText.length,
            streamChunkCount: 1,
            finishReason: data?.choices?.[0]?.finish_reason || 'stop',
          });
          recordUsage(usage, outputText, 'API usage');
          return { fullText, finishReason: data?.choices?.[0]?.finish_reason || 'stop' };
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let chunkCount = 0;
        let reportedUsage = null;

        while (true) {
          armInactivityTimer();
          const { done, value } = await reader.read();
          if (!done) {
            buffer += decoder.decode(value, { stream: true });
          } else {
            buffer += decoder.decode();
          }

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') break;

            try {
              const parsed = JSON.parse(data);
              const chunkUsage = extractUsageFromProviderChunk(provider, parsed);
              if (chunkUsage) reportedUsage = mergeReportedUsage(reportedUsage, chunkUsage);
              const text = parseChunk(parsed);
              if (text) {
                fullText += text;
                chunkCount++;
                if (onChunk) onChunk(fullText, chunkCount);
              }
            } catch (e) {
              if (e.message && !e.message.includes('JSON')) throw e;
            }
          }

          if (done) break;
        }
        if (inactivityTimer) clearTimeout(inactivityTimer);

        const outputText = fullText.slice(String(existingText || '').length);
        recordApiCallEvent({
          type: 'providerResponseDone',
          label: 'Provider response complete',
          detail: `${chunkCount} stream chunk${chunkCount === 1 ? '' : 's'}, ${outputText.length} chars`,
          stage: 'provider-response',
          ...buildProviderTraceBase(),
          attempt: attempt + 1,
          maxRetries: retryLimit,
          outputChars: outputText.length,
          streamChunkCount: chunkCount,
        });
        recordUsage(reportedUsage, outputText, 'API usage');
        return { fullText };
      } catch (rawErr) {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        let err = rawErr;
        if (err.name === 'AbortError') {
          if (!inactivityAborted) throw err;
          // A stall-triggered abort is a network failure, not a user Stop —
          // convert it to a retryable error so the backoff path resends.
          err = new Error(
            `Stream stalled: no data received for ${STREAM_INACTIVITY_TIMEOUT_MS / 1000}s (network timeout)`,
          );
          err.retryable = true;
        }
        const classifiedError = toClassifiedError(err, { provider, modelId, task });

        if (attempt < retryLimit && isRetryableError(classifiedError)) {
          attempt++;
          fullText = existingText;
          // Rebuild request with current skipTemp state so temperature fix persists across retries
          ({ url, headers, body, parseChunk, parseTextResponse, parseJsonResponse } = buildProviderTextRequest({
            provider,
            apiKey,
            modelId,
            systemPrompt,
            userPrompt,
            maxOutputTokens,
            skipTemperature: skipTemp,
            modelCapabilities,
            generationPlan,
            task,
            schema,
            temperatureOverride: requestTemperature,
          }));
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
          if (onRetry) onRetry(attempt, retryLimit, delay);
          await sleep(delay);
          continue;
        }

        if (attempt < retryLimit && !isRetryableError(classifiedError)) {
          recordApiCallEvent({
            type: 'retrySuppressed',
            label: 'Retry suppressed',
            detail: classifiedError.userMessage || classifiedError.message,
            stage: 'stream-retry',
            ...buildProviderTraceBase(),
            attempt: attempt + 1,
            maxRetries: retryLimit,
            ...failureEventFields(classifiedError, { provider, modelId }),
          });
        }

        if (allowProviderFallback && provider === 'google' && isRetryableError(classifiedError)) {
          try {
            return await runGoogleNonStreamingFallback();
          } catch (fallbackError) {
            if (fallbackError.name === 'AbortError') throw fallbackError;
          }
        }

        throw classifiedError;
      }
    }

    throw new Error('Max retries exceeded.');
  }, []);

  return { streamProvider, parsePartialJSON, getLastParseRecovery, abort, abortControllerRef };
}

// Exclude non-chat models that don't work for structured JSON generation.
// Keep preview/snapshot text models: provider catalogs are the source of truth,
// and users expect newly released generation-capable models to appear.
const OPENAI_EXCLUDE =
  /sora|image|dall-e|whisper|tts|transcribe|realtime|audio|search|deep-research|embedding|moderation|babbage|davinci|computer-use/i;
const OPENAI_INCLUDE = /^(gpt-|o\d|chatgpt-)/i;
// Exclude non-text Google Gemini variants (image generation, TTS, live streaming, embeddings)
const GOOGLE_EXCLUDE = /imagen|image|veo|tts|live|embedding|aqa|native-audio/i;

const GOOGLE_VERTEX_EXPRESS_TEXT_MODEL_FALLBACKS = [
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    maxOutputTokens: 65536,
    endpointFamily: GOOGLE_ENDPOINT_FAMILIES.VERTEX_EXPRESS,
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    maxOutputTokens: 65536,
    endpointFamily: GOOGLE_ENDPOINT_FAMILIES.VERTEX_EXPRESS,
  },
  {
    id: 'gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash Lite',
    maxOutputTokens: 65536,
    endpointFamily: GOOGLE_ENDPOINT_FAMILIES.VERTEX_EXPRESS,
  },
  {
    id: 'gemini-2.0-flash-001',
    name: 'Gemini 2.0 Flash 001',
    maxOutputTokens: 8192,
    endpointFamily: GOOGLE_ENDPOINT_FAMILIES.VERTEX_EXPRESS,
  },
  {
    id: 'gemini-2.0-flash-lite-001',
    name: 'Gemini 2.0 Flash Lite 001',
    maxOutputTokens: 8192,
    endpointFamily: GOOGLE_ENDPOINT_FAMILIES.VERTEX_EXPRESS,
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    maxOutputTokens: 8192,
    endpointFamily: GOOGLE_ENDPOINT_FAMILIES.VERTEX_EXPRESS,
  },
  {
    id: 'gemini-2.0-flash-lite',
    name: 'Gemini 2.0 Flash Lite',
    maxOutputTokens: 65536,
    endpointFamily: GOOGLE_ENDPOINT_FAMILIES.VERTEX_EXPRESS,
  },
];

const GOOGLE_DEPRECATED_TEXT_MODEL_IDS = new Set(['gemini-3-pro-preview']);

function cleanOpenAIName(id) {
  return id
    .replace(/^gpt-/i, 'GPT-')
    .replace(/^chatgpt-/i, 'ChatGPT-')
    .replace(/^o(\d)/i, 'O$1');
}

function cleanDeepSeekName(id) {
  if (id === 'deepseek-chat') return 'DeepSeek V3';
  if (id === 'deepseek-reasoner') return 'DeepSeek R1';
  return id
    .split(/[-_]/)
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function cleanGoogleName(id, displayName) {
  if (displayName) return displayName;
  return id
    .replace(/^gemini-/i, 'Gemini ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bLite\b/g, 'Lite');
}

function googleModelIdFromResourceName(name = '') {
  return name.replace(/^models\//, '').replace(/^publishers\/google\/models\//, '');
}

function modelVersionScore(id = '') {
  const direct = id.match(/(?:gpt-|gemini-|^o)(\d+)(?:\.(\d+))?/i);
  const fallback = direct || id.match(/(\d+)(?:\.(\d+))?/);
  if (!fallback) return 0;
  const major = Number(fallback[1]) || 0;
  const minor = Number(fallback[2]) || 0;
  return major * 1000 + minor;
}

function modelQualityScore(id = '') {
  const value = id.toLowerCase();
  if (value.includes('pro') || value.includes('opus')) return 60;
  if (value.includes('sonnet') || value.includes('reasoner') || /^o\d/.test(value)) return 50;
  if (value.includes('flash') || value.includes('mini')) return 40;
  if (value.includes('haiku') || value.includes('nano') || value.includes('lite')) return 30;
  return 20;
}

function createdScore(created) {
  if (!created) return 0;
  if (typeof created === 'number') return created;
  const parsed = Date.parse(created);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortModelOptions(a, b) {
  const versionDelta = modelVersionScore(b.id) - modelVersionScore(a.id);
  if (versionDelta) return versionDelta;
  const qualityDelta = modelQualityScore(b.id) - modelQualityScore(a.id);
  if (qualityDelta) return qualityDelta;
  const createdDelta = createdScore(b.created) - createdScore(a.created);
  if (createdDelta) return createdDelta;
  return a.id.localeCompare(b.id);
}

function dedupeModelsById(models) {
  const seen = new Set();
  return models.filter((model) => {
    const key = String(model.id || '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function googleCandidateModel(id, overrides = {}) {
  return {
    id,
    name: cleanGoogleName(id, overrides.name),
    maxOutputTokens: overrides.maxOutputTokens || 65536,
    maxInputTokens: overrides.maxInputTokens || null,
    endpointFamily: overrides.endpointFamily || GOOGLE_ENDPOINT_FAMILIES.GEMINI_API,
    source: overrides.source || 'probe',
    supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
    capabilities: {
      streaming: true,
      jsonMode: true,
      toolCalling: true,
    },
  };
}

function normalizeGoogleModelCatalog(models, endpointFamily = GOOGLE_ENDPOINT_FAMILIES.GEMINI_API) {
  return dedupeModelsById(
    (models || [])
      .filter((model) => {
        const id = googleModelIdFromResourceName(model.name || model.id || '');
        const methods = model.supportedGenerationMethods || model.supportedActions || [];
        const supportsText =
          methods.length === 0 ||
          methods.includes('generateContent') ||
          methods.includes('streamGenerateContent') ||
          methods.includes('predict');
        return (
          id.includes('gemini') &&
          supportsText &&
          !GOOGLE_DEPRECATED_TEXT_MODEL_IDS.has(id) &&
          !GOOGLE_EXCLUDE.test(id) &&
          !GOOGLE_EXCLUDE.test(model.displayName || '')
        );
      })
      .map((model) => {
        const id = googleModelIdFromResourceName(model.name || model.id || '');
        return {
          id,
          name: cleanGoogleName(id, model.displayName),
          maxOutputTokens: model.outputTokenLimit || model.output_token_limit || 65536,
          maxInputTokens: model.inputTokenLimit || model.input_token_limit || null,
          endpointFamily,
          source: endpointFamily === GOOGLE_ENDPOINT_FAMILIES.VERTEX_EXPRESS ? 'vertex-express' : 'gemini-api',
          supportedGenerationMethods: model.supportedGenerationMethods || model.supportedActions || [],
          capabilities: {
            streaming: (model.supportedGenerationMethods || []).includes('streamGenerateContent'),
            jsonMode: true,
            toolCalling: true,
          },
        };
      }),
  ).sort(sortModelOptions);
}

async function fetchGeminiApiModels(apiKey, onApiCallEvent, options = {}) {
  const allModels = [];
  let pageToken = '';
  do {
    const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('pageSize', '1000');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    if (typeof onApiCallEvent === 'function') {
      onApiCallEvent({
        type: 'modelDiscoveryCall',
        label: 'Fetch Gemini model catalog',
        detail: pageToken ? 'next page' : 'first page',
      });
    }
    const response = await fetchWithTimeout(
      url.toString(),
      { signal: options.signal },
      options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS,
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Invalid API key');
    }
    const data = await response.json();
    allModels.push(...(data.models || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return normalizeGoogleModelCatalog(allModels);
}

/**
 * Lookup max output tokens for OpenAI models (not returned by /v1/models API).
 */
function openaiMaxOutput(id) {
  if (/^gpt-[5-9]/.test(id)) return 128000; // current/future GPT-5+ families
  if (/^o\d/.test(id)) return 100000; // o-series reasoning models
  if (id.startsWith('gpt-4.1')) return 32768; // gpt-4.1, gpt-4.1-mini, gpt-4.1-nano
  return 16384; // gpt-4o, gpt-4o-mini, and others
}

/**
 * Lookup max output tokens for Anthropic models (not reliably in /v1/models).
 */
function anthropicMaxOutput(id) {
  if (/claude-opus-[4-9]/.test(id)) return 128000; // current/future Opus families
  if (/claude-(sonnet|haiku)-[4-9]/.test(id)) return 64000; // current/future Sonnet/Haiku families
  if (id.includes('claude-3-7')) return 16384;
  if (id.includes('claude-3-5')) return 8192;
  if (id.includes('claude-3-opus')) return 4096;
  return 8192; // safe default
}

function deepseekMaxOutput(id) {
  if (/deepseek-v4|deepseek-.*pro/i.test(id)) return 384000;
  if (/reasoner|r1/i.test(id)) return 32768;
  return 8192;
}

function deepseekMaxInput(id) {
  if (/deepseek-v4|deepseek-.*pro|deepseek-.*flash/i.test(id)) return 1000000;
  return null;
}

/**
 * Fetch models dynamically from provider API, filtered to only chat/text models
 * that support streaming + JSON output.
 */
export async function fetchModelsFromProvider(provider, apiKey, options = {}) {
  const onApiCallEvent = options?.onApiCallEvent;
  const requestOptions = { signal: options?.signal };
  const timeoutMs = options?.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  if (provider === 'webllm') {
    // Models are handled directly in ModelConfig — return empty to avoid errors
    return [];
  }

  if (provider === 'openai') {
    if (typeof onApiCallEvent === 'function') {
      onApiCallEvent({ type: 'modelDiscoveryCall', label: 'Fetch OpenAI model catalog', detail: 'openai' });
    }
    const response = await fetchWithTimeout(
      'https://api.openai.com/v1/models',
      {
        ...requestOptions,
        headers: { Authorization: `Bearer ${apiKey}` },
      },
      timeoutMs,
    );
    if (!response.ok) throw new Error('Invalid API key');
    const data = await response.json();
    const models = dedupeModelsById(
      (data.data || [])
        .filter((m) => OPENAI_INCLUDE.test(m.id) && !OPENAI_EXCLUDE.test(m.id))
        .map((m) => ({
          id: m.id,
          name: cleanOpenAIName(m.id),
          created: m.created || 0,
          maxOutputTokens: openaiMaxOutput(m.id),
          capabilities: {
            jsonMode: true,
            toolCalling: true,
            streaming: true,
          },
        })),
    ).sort(sortModelOptions);
    if (models.length === 0) throw new Error('No OpenAI text-generation models available');
    return models;
  }

  if (provider === 'anthropic') {
    if (typeof onApiCallEvent === 'function') {
      onApiCallEvent({ type: 'modelDiscoveryCall', label: 'Fetch Anthropic model catalog', detail: 'anthropic' });
    }
    const response = await fetchWithTimeout(
      'https://api.anthropic.com/v1/models',
      {
        ...requestOptions,
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      },
      timeoutMs,
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      if (err.error?.type === 'authentication_error') throw new Error('Invalid API key');
      throw new Error(err.error?.message || 'Failed to fetch models');
    }
    const data = await response.json();
    const models = dedupeModelsById(
      (data.data || [])
        .filter((m) => m.id.includes('claude'))
        .map((m) => ({
          id: m.id,
          name: m.display_name || m.id,
          created: m.created_at || '',
          maxInputTokens: m.input_token_limit || null,
          maxOutputTokens: anthropicMaxOutput(m.id),
          capabilities: {
            jsonMode: false,
            toolCalling: true,
            streaming: true,
          },
        })),
    ).sort(sortModelOptions);
    if (models.length === 0) throw new Error('No models available');
    return models;
  }

  if (provider === 'google') {
    if (isVertexKey(apiKey)) {
      // Vertex AI Express browser keys do not expose a browser-safe model
      // catalog. Return conservative stable fallbacks and validate the selected
      // model once, instead of probing guessed models and polluting the console
      // with 404s for unsupported preview IDs.
      return GOOGLE_VERTEX_EXPRESS_TEXT_MODEL_FALLBACKS.map((model) =>
        googleCandidateModel(model.id, { ...model, source: 'vertex-express-fallback' }),
      ).sort(sortModelOptions);
    }

    const models = await fetchGeminiApiModels(apiKey, onApiCallEvent, { signal: options?.signal, timeoutMs });
    if (models.length === 0) throw new Error('No Gemini models available');
    return models;
  }

  if (provider === 'local') {
    // Keyless: "Connected" = the local server answering /v1/models. The
    // static option is the source of truth for capabilities (no live probes
    // against an on-device model); the server reply confirms liveness and
    // can carry a display_name override.
    if (typeof onApiCallEvent === 'function') {
      onApiCallEvent({ type: 'modelDiscoveryCall', label: 'Check local model server', detail: 'local' });
    }
    const response = await fetchWithTimeout(`${getLocalEndpoint()}/v1/models`, requestOptions, timeoutMs);
    if (!response.ok) throw new Error('Local model server is not responding — start it with: npm run local-model');
    const data = await response.json().catch(() => ({}));
    const served = Array.isArray(data?.data) ? data.data[0] : null;
    const option = localModelOption();
    if (served?.display_name) option.name = served.display_name;
    if (served?.id) option.id = served.id;
    return [option];
  }

  if (provider === PUBLIC_SCION_PROVIDER_ID) {
    if (typeof onApiCallEvent === 'function') {
      onApiCallEvent({ type: 'modelDiscoveryCall', label: 'Resolve Scion local model', detail: 'browser-local' });
    }
    return [publicScionModelOption()];
  }

  if (provider === 'deepseek') {
    if (typeof onApiCallEvent === 'function') {
      onApiCallEvent({ type: 'modelDiscoveryCall', label: 'Fetch DeepSeek model catalog', detail: 'deepseek' });
    }
    const response = await fetchWithTimeout(
      'https://api.deepseek.com/v1/models',
      {
        ...requestOptions,
        headers: { Authorization: `Bearer ${apiKey}` },
      },
      timeoutMs,
    );
    if (!response.ok) throw new Error('Invalid API key');
    const data = await response.json();
    const models = dedupeModelsById(
      (data.data || [])
        .filter((m) => m.id)
        .map((m) => ({
          id: m.id,
          name: cleanDeepSeekName(m.id),
          created: m.created || 0,
          // DeepSeek /v1/models doesn't return token limits; infer from the public model family contract.
          maxInputTokens: deepseekMaxInput(m.id),
          maxOutputTokens: deepseekMaxOutput(m.id),
          capabilities: {
            jsonMode: true,
            toolCalling: true,
            streaming: true,
          },
        })),
    ).sort(sortModelOptions);
    if (models.length === 0) throw new Error('No DeepSeek models available');
    return models;
  }

  throw new Error('Invalid provider.');
}

function isRetryableError(err) {
  if (typeof err?.retryable === 'boolean') return err.retryable;
  if (err?.classification && typeof err.classification.retryable === 'boolean') {
    return err.classification.retryable;
  }
  const msg = (err.message || '').toLowerCase();
  return (
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('socket hang up') ||
    msg.includes('429') ||
    msg.includes('rate') ||
    msg.includes('overloaded') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('529')
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
