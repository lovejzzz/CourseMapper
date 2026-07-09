import React, { useState, useEffect, useRef, useCallback } from 'react';
import { fetchModelsFromProvider } from '../hooks/useStreamReader';
import {
  LOCAL_PROVIDER_OPT_IN_STORAGE_KEY,
  getSavedApiKeyForProvider,
  saveApiKeyForProvider,
  useAIConfig,
} from '../contexts/AIConfigContext';
import { WEBLLM_MODELS } from '../lib/webllmConstants';
import { getGoogleModelBaseUrl } from '../lib/googleProvider';
import { recordPendingApiCallEvent } from '../lib/apiCallPendingEvents';
import { fetchWithTimeout, isTimeoutError } from '../lib/fetchWithTimeout';
import {
  createBaseModelCapabilities,
  createGenerationPlan,
  getModelCapabilityBadges,
  getModelFitBadges,
  getPrimaryModelFitLabel,
  resolveModelCapabilities,
} from '../lib/modelCapabilities';
import { buildOpenAIResponsesBody, prefersOpenAIResponsesApi } from '../lib/openaiProvider';
import {
  describeEnrichmentResolution,
  readEnrichmentPreference,
  saveEnrichmentPreference,
} from '../lib/enrichmentPreference';
import { PUBLIC_SCION_PROVIDER_ID } from '../lib/publicScionProvider';

/**
 * Detect provider from API key prefix and auto-switch if mismatched.
 */
function detectProvider(key) {
  if (!key) return null;
  if (key.startsWith('sk-ant-api03-') || key.startsWith('sk-ant-')) return 'anthropic';
  if (key.startsWith('sk-proj-') || /^sk-[a-zA-Z0-9]{48}$/.test(key)) return 'openai';
  if (key.startsWith('AIza') && key.length === 39) return 'google';
  if (key.length > 39 && /^[A-Z]/.test(key)) return 'google'; // Vertex AI express keys
  return null;
}

const PLACEHOLDER = {
  openai: 'sk-proj-...',
  anthropic: 'sk-ant-...',
  google: 'AIza... or Vertex AI key',
  deepseek: 'sk-...',
};

const API_KEY_URLS = {
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  google: 'https://aistudio.google.com/apikey',
  deepseek: 'https://platform.deepseek.com/api_keys',
};

const BILLING_URLS = {
  openai: 'https://platform.openai.com/settings/organization/billing/overview',
  anthropic: 'https://console.anthropic.com/settings/plans',
  google: 'https://aistudio.google.com/apikey',
  deepseek: 'https://platform.deepseek.com/top_up',
};

const MODEL_DISCOVERY_TIMEOUT_MS = 12000;
const CREDIT_CHECK_TIMEOUT_MS = 10000;

function isKeylessProvider(provider) {
  return provider === 'local' || provider === PUBLIC_SCION_PROVIDER_ID;
}

/**
 * Make a tiny test completion to verify the key has credits.
 * Returns true if the key works, false if insufficient funds.
 */
export async function checkCredits(provider, apiKey, modelId, onApiCallEvent, options = {}) {
  // The local provider has no billing surface — liveness was already proven
  // by the /v1/models fetch, and every call is $0.
  if (isKeylessProvider(provider)) return true;
  try {
    let res;
    const timeoutMs = options.timeoutMs ?? CREDIT_CHECK_TIMEOUT_MS;
    const signal = options.signal;
    if (provider === 'openai') {
      if (typeof onApiCallEvent === 'function') {
        onApiCallEvent({ type: 'creditCheckCall', label: 'Validate API credits', detail: modelId });
      }
      if (prefersOpenAIResponsesApi(modelId)) {
        res = await fetchWithTimeout(
          'https://api.openai.com/v1/responses',
          {
            method: 'POST',
            signal,
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(
              buildOpenAIResponsesBody({
                model: modelId,
                userPrompt: 'Hi',
                maxOutputTokens: 16,
                stream: false,
              }),
            ),
          },
          timeoutMs,
        );
      } else {
        res = await fetchWithTimeout(
          'https://api.openai.com/v1/chat/completions',
          {
            method: 'POST',
            signal,
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: modelId,
              messages: [{ role: 'user', content: 'Hi' }],
              max_completion_tokens: 16,
            }),
          },
          timeoutMs,
        );
      }
    } else if (provider === 'deepseek') {
      if (typeof onApiCallEvent === 'function') {
        onApiCallEvent({ type: 'creditCheckCall', label: 'Validate API credits', detail: modelId });
      }
      res = await fetchWithTimeout(
        'https://api.deepseek.com/v1/chat/completions',
        {
          method: 'POST',
          signal,
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelId,
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 1,
          }),
        },
        timeoutMs,
      );
    } else if (provider === 'anthropic') {
      if (typeof onApiCallEvent === 'function') {
        onApiCallEvent({ type: 'creditCheckCall', label: 'Validate API credits', detail: modelId });
      }
      res = await fetchWithTimeout(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          signal,
          headers: {
            'x-api-key': apiKey,
            'content-type': 'application/json',
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({ model: modelId, max_tokens: 1, messages: [{ role: 'user', content: 'Hi' }] }),
        },
        timeoutMs,
      );
    } else if (provider === 'google') {
      const baseUrl = getGoogleModelBaseUrl(apiKey, modelId, options.endpointFamily);
      if (typeof onApiCallEvent === 'function') {
        onApiCallEvent({ type: 'creditCheckCall', label: 'Validate API credits', detail: modelId });
      }
      res = await fetchWithTimeout(
        `${baseUrl}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Hi' }] }], generationConfig: { maxOutputTokens: 1 } }),
        },
        timeoutMs,
      );
    } else {
      return true;
    }
    if (res.ok) return true;
    // Check for billing/quota errors
    const err = await res.json().catch(() => ({}));
    const msg = JSON.stringify(err).toLowerCase();
    if (
      res.status === 402 ||
      res.status === 429 ||
      msg.includes('insufficient') ||
      msg.includes('quota') ||
      msg.includes('billing') ||
      msg.includes('exceeded') ||
      msg.includes('balance')
    ) {
      return false;
    }
    if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) {
      const modelError = new Error(err.error?.message || 'The selected model is not available for this API key.');
      modelError.isConfigurationError = true;
      throw modelError;
    }
    // Other transient/provider errors do not prove the account is out of funds.
    return true;
  } catch (error) {
    if (error?.isConfigurationError) throw error;
    return true; // Network error — don't block, assume credits OK
  }
}

export default function ModelConfig() {
  const {
    provider,
    setProvider,
    apiKey,
    setApiKey,
    modelId,
    setModelId,
    availableModels,
    setAvailableModels,
    apiStatus,
    setApiStatus,
    modelName,
    setModelName,
    maxOutputTokens,
    setMaxOutputTokens,
    modelCapabilities,
    setModelCapabilities,
    generationPlan,
    setGenerationPlan,
  } = useAIConfig();
  const debounceRef = useRef(null);
  const prevProviderValueRef = useRef(provider);
  const prevApiKeyRef = useRef(apiKey);
  const autoDetectedRef = useRef(false);
  const capabilityRunRef = useRef(0);
  const providerId = 'ai-provider-select';
  const apiKeyId = 'ai-api-key-input';
  const modelIdSelectId = 'ai-model-select';
  const [capabilityStatus, setCapabilityStatus] = useState('idle');
  const [validationMessage, setValidationMessage] = useState('');
  const [localProbeAttempt, setLocalProbeAttempt] = useState(0);
  // v0.12.1: user-facing subject-matter enrichment control (auto/on/off).
  const [enrichmentPref, setEnrichmentPref] = useState(readEnrichmentPreference);
  const handleEnrichmentPref = (mode) => {
    setEnrichmentPref(mode);
    saveEnrichmentPreference(mode);
  };
  const triggerLocalServerCheck = useCallback(() => {
    setValidationMessage('');
    setApiStatus('validating');
    setLocalProbeAttempt((attempt) => attempt + 1);
  }, [setApiStatus]);
  const latestConfigRef = useRef({ apiStatus, availableModels, modelId });

  useEffect(() => {
    latestConfigRef.current = { apiStatus, availableModels, modelId };
  }, [apiStatus, availableModels, modelId]);

  // WebLLM download state
  const [webllmProgress, setWebllmProgress] = useState(null); // { text, progress }
  const [webllmError, setWebllmError] = useState(null);
  const webllmInitRef = useRef(false);

  const handleProviderChange = useCallback(
    (nextProvider) => {
      try {
        if (nextProvider === 'local') localStorage.setItem(LOCAL_PROVIDER_OPT_IN_STORAGE_KEY, 'true');
        else if (nextProvider === PUBLIC_SCION_PROVIDER_ID) localStorage.removeItem(LOCAL_PROVIDER_OPT_IN_STORAGE_KEY);
      } catch {}
      setProvider(nextProvider);
    },
    [setProvider],
  );

  // When provider changes, reset model state and restore that provider's trusted key.
  // Skip when provider hasn't actually changed (mount/remount/StrictMode).
  // Skip clearing apiKey when change was auto-detected from key prefix.
  useEffect(() => {
    if (prevProviderValueRef.current === provider) {
      // Provider hasn't changed — this is a mount, remount, or StrictMode re-run.
      // Don't reset anything.
      return;
    }
    prevProviderValueRef.current = provider;

    // Always reset model state when provider changes
    setApiStatus('idle');
    setModelName('');
    setAvailableModels([]);
    setModelId('');
    setModelCapabilities(null);
    setGenerationPlan(createGenerationPlan(createBaseModelCapabilities(provider, {})));
    setCapabilityStatus('idle');
    setValidationMessage('');

    if (autoDetectedRef.current) {
      // Provider was auto-switched because user typed a key with a different
      // prefix — keep the key so validation can proceed
      autoDetectedRef.current = false;
    } else {
      setApiKey(getSavedApiKeyForProvider(provider));
    }
  }, [provider]);

  // Local WebLLM is no longer selectable. Redirect stale saved values before any local runtime work starts.
  useEffect(() => {
    if (provider === 'webllm' || provider === 'free') {
      setProvider(PUBLIC_SCION_PROVIDER_ID);
      return;
    }
    if (provider !== 'webllm') {
      webllmInitRef.current = false;
      return;
    }
    // Set models list immediately
    const models = WEBLLM_MODELS.map((m) => ({ id: m.id, name: m.name, maxOutputTokens: m.maxTokens, size: m.size }));
    setAvailableModels(models);

    // Prefer previously saved model or default
    let saved;
    try {
      saved = localStorage.getItem('coursemapper-modelid');
    } catch {}
    const match = saved ? models.find((m) => m.id === saved) : null;
    const selected = match || models[0];
    setModelId(selected.id);
    setModelName(selected.name);
    if (setMaxOutputTokens) setMaxOutputTokens(selected.maxOutputTokens || 4096);
    const localProfile = createBaseModelCapabilities('webllm', selected);
    setModelCapabilities(localProfile);
    setGenerationPlan(createGenerationPlan(localProfile));
    setCapabilityStatus('ready');

    // Prevent double-init from StrictMode or remount when already connected
    if (webllmInitRef.current) return;
    if (apiStatus === 'connected') return;
    webllmInitRef.current = true;

    setApiStatus('validating');
    setWebllmError(null);
    setWebllmProgress({ text: 'Initializing WebGPU...', progress: 0 });

    import('../lib/webllm')
      .then(({ getEngine, isEngineReady }) => {
        if (isEngineReady()) {
          setApiStatus('connected');
          setWebllmProgress(null);
          return;
        }
        return getEngine(selected.id, (report) => {
          setWebllmProgress({ text: report.text, progress: report.progress });
        }).then(() => {
          setApiStatus('connected');
          setWebllmProgress(null);
        });
      })
      .catch((err) => {
        setApiStatus('error');
        setWebllmError(err.message || 'Failed to load model');
        setWebllmProgress(null);
        webllmInitRef.current = false;
      });
  }, [provider, setProvider]);

  const applyBaseCapabilityProfile = useCallback(
    (selectedModel, selectedProvider = provider) => {
      if (!selectedModel?.id) return null;
      const baseProfile = createBaseModelCapabilities(selectedProvider, selectedModel);
      setModelCapabilities(baseProfile);
      setGenerationPlan(createGenerationPlan(baseProfile));
      return baseProfile;
    },
    [provider, setGenerationPlan, setModelCapabilities],
  );

  const detectCapabilitiesForModel = useCallback(
    async (selectedModel, { selectedProvider = provider, selectedApiKey = apiKey, isCancelled = () => false } = {}) => {
      if (!selectedModel?.id || selectedProvider === 'webllm') return null;
      const trimmedKey = String(selectedApiKey || '').trim();
      if (!trimmedKey) return applyBaseCapabilityProfile(selectedModel, selectedProvider);

      const runId = ++capabilityRunRef.current;
      setCapabilityStatus('detecting');
      applyBaseCapabilityProfile(selectedModel, selectedProvider);
      try {
        const profile = await resolveModelCapabilities({
          provider: selectedProvider,
          apiKey: trimmedKey,
          model: selectedModel,
          onApiCallEvent: recordPendingApiCallEvent,
        });
        if (isCancelled() || runId !== capabilityRunRef.current) return null;
        setModelCapabilities(profile);
        setGenerationPlan(createGenerationPlan(profile));
        setCapabilityStatus(profile.confidence === 'probed' ? 'ready' : 'catalog');
        return profile;
      } catch {
        if (!isCancelled() && runId === capabilityRunRef.current) setCapabilityStatus('catalog');
        return null;
      }
    },
    [apiKey, applyBaseCapabilityProfile, provider, setGenerationPlan, setModelCapabilities],
  );

  // When API key or provider changes, auto-detect provider and validate.
  const prevProviderRef = useRef(provider);
  useEffect(() => {
    let cancelled = false;
    let validationController = null;
    const providerChanged = provider !== prevProviderRef.current;
    const apiKeyChanged = apiKey !== prevApiKeyRef.current;
    prevProviderRef.current = provider;
    prevApiKeyRef.current = apiKey;
    const trimmedKey = String(apiKey || '').trim();

    // WebLLM handles its own initialization — skip API key validation
    if (provider === 'webllm') return;

    const cachedState = latestConfigRef.current;
    const hasSelectableCachedModel =
      !providerChanged &&
      !apiKeyChanged &&
      trimmedKey.length >= 10 &&
      (cachedState.apiStatus === 'connected' || cachedState.apiStatus === 'no_funds') &&
      Boolean(cachedState.modelId) &&
      cachedState.availableModels.some((model) => model.id === cachedState.modelId);
    const isRestoredLocalProvider =
      provider === 'local' && !providerChanged && !apiKeyChanged && localProbeAttempt === 0;

    if (!hasSelectableCachedModel) {
      setApiStatus('idle');
      setAvailableModels([]);
      // Keep modelId/modelName while reconnecting so the saved choice can be reselected from the refreshed catalog.
      setValidationMessage('');
    }

    // The local provider is keyless — validation is the /v1/models liveness
    // probe inside the same debounce flow, but do not auto-probe a restored
    // Local selection until the user asks. Other keyless providers can validate
    // normally through model discovery.
    if (isRestoredLocalProvider) return;
    if (!isKeylessProvider(provider) && trimmedKey.length < 10) return;

    // Only auto-detect provider from key prefix when the KEY changed,
    // not when the PROVIDER changed (stale key would fight the switch)
    if (!providerChanged && !isKeylessProvider(provider)) {
      const detected = detectProvider(trimmedKey);
      if (detected && detected !== provider) {
        autoDetectedRef.current = true; // signal: don't clear apiKey
        setProvider(detected);
        return; // provider change will re-trigger this effect
      }
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (cancelled) return;
      validationController = new AbortController();
      setValidationMessage('');
      if (!hasSelectableCachedModel) setApiStatus('validating');
      try {
        const models = await fetchModelsFromProvider(provider, trimmedKey, {
          onApiCallEvent: recordPendingApiCallEvent,
          signal: validationController.signal,
          timeoutMs: MODEL_DISCOVERY_TIMEOUT_MS,
        });
        if (cancelled) return;
        if (models && models.length > 0) {
          setAvailableModels(models);
          // Keep the current selection while refreshing, then fall back to the saved model.
          const currentModelId = latestConfigRef.current.modelId;
          const currentMatch = currentModelId ? models.find((m) => m.id === currentModelId) : null;
          let saved;
          try {
            saved = localStorage.getItem('coursemapper-modelid');
          } catch {}
          const match = saved ? models.find((m) => m.id === saved) : null;
          const selected = currentMatch || match || models[0];
          setModelId(selected.id);
          setModelName(selected.name);
          if (setMaxOutputTokens) setMaxOutputTokens(selected.maxOutputTokens || 16384);
          applyBaseCapabilityProfile(selected, provider);
          // Verify the key has credits with a tiny test call
          const hasCredits = await checkCredits(provider, trimmedKey, selected.id, recordPendingApiCallEvent, {
            endpointFamily: selected.endpointFamily,
            signal: validationController.signal,
            timeoutMs: CREDIT_CHECK_TIMEOUT_MS,
          });
          if (cancelled) return;
          if (hasCredits) saveApiKeyForProvider(provider, trimmedKey);
          setApiStatus(hasCredits ? 'connected' : 'no_funds');
          if (hasCredits) {
            await detectCapabilitiesForModel(selected, {
              selectedProvider: provider,
              selectedApiKey: trimmedKey,
              isCancelled: () => cancelled,
            });
          }
        } else {
          if (cancelled) return;
          setValidationMessage('No compatible text models found');
          setApiStatus('error');
        }
      } catch (error) {
        if (cancelled) return;
        const localUnavailable =
          provider === 'local' &&
          !isTimeoutError(error) &&
          (/failed to fetch/i.test(error?.message || '') || error instanceof TypeError);
        setValidationMessage(
          isTimeoutError(error)
            ? provider === 'local'
              ? 'Local model server timed out'
              : 'Validation timed out'
            : localUnavailable
              ? 'Local server unavailable'
              : error?.message || 'Could not validate',
        );
        setApiStatus('error');
      }
    }, 800);

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      validationController?.abort();
    };
  }, [
    apiKey,
    provider,
    setApiStatus,
    setAvailableModels,
    setGenerationPlan,
    setModelCapabilities,
    setModelId,
    setModelName,
    setMaxOutputTokens,
    setProvider,
    applyBaseCapabilityProfile,
    detectCapabilitiesForModel,
    localProbeAttempt,
  ]);

  function handleModelChange(e) {
    const id = e.target.value;
    setModelId(id);
    const found = availableModels.find((m) => m.id === id);
    setModelName(found?.name || id);
    if (setMaxOutputTokens) setMaxOutputTokens(found?.maxOutputTokens || 16384);
    if (found) detectCapabilitiesForModel(found);

    // For WebLLM, switching models requires reloading the engine
    if (provider === 'webllm') {
      setApiStatus('validating');
      setWebllmError(null);
      setWebllmProgress({ text: 'Loading model...', progress: 0 });
      webllmInitRef.current = true;
      import('../lib/webllm')
        .then(({ getEngine }) =>
          getEngine(id, (report) => {
            setWebllmProgress({ text: report.text, progress: report.progress });
          }),
        )
        .then(() => {
          setApiStatus('connected');
          setWebllmProgress(null);
        })
        .catch((err) => {
          setApiStatus('error');
          setWebllmError(err.message || 'Failed to load model');
          setWebllmProgress(null);
        });
    }
  }

  const hasSelectableModels = (apiStatus === 'connected' || apiStatus === 'no_funds') && availableModels.length > 0;
  const validationErrorLabel = validationMessage || 'Could not validate';
  const capabilityBadges =
    hasSelectableModels && modelCapabilities?.modelId === modelId
      ? getModelCapabilityBadges(modelCapabilities, generationPlan)
      : [];
  const fitBadges =
    hasSelectableModels && modelCapabilities?.modelId === modelId
      ? getModelFitBadges(modelCapabilities, generationPlan)
      : [];
  const fitBadgeLabels = new Set(fitBadges.map((badge) => badge.label));
  const technicalBadges = capabilityBadges.filter((badge) => !fitBadgeLabels.has(badge.label)).slice(0, 3);
  const describeModelOption = (model) => {
    const optionProfile =
      modelCapabilities?.modelId === model.id ? modelCapabilities : createBaseModelCapabilities(provider, model);
    const optionPlan =
      modelCapabilities?.modelId === model.id && generationPlan ? generationPlan : createGenerationPlan(optionProfile);
    const fitLabel = getPrimaryModelFitLabel(optionProfile, optionPlan);
    return `${model.name}${model.size ? ` (${model.size})` : ''} - ${fitLabel}`;
  };
  const badgeTone = {
    emerald: 'bg-emerald-50/70 text-emerald-700 border-emerald-200/60',
    indigo: 'bg-indigo-50/70 text-indigo-700 border-indigo-200/60',
    violet: 'bg-violet-50/70 text-violet-700 border-violet-200/60',
    amber: 'bg-amber-50/70 text-amber-700 border-amber-200/60',
    blue: 'bg-sky-50/70 text-sky-700 border-sky-200/60',
    slate: 'bg-slate-50/70 text-slate-600 border-slate-200/60',
  };

  return (
    <div className="glass panel-glow rounded-squircle shadow-glass p-7 animate-stagger-1">
      <h2 className="text-[15px] font-bold text-slate-800 mb-5 flex items-center gap-3">
        AI Configuration
        {apiStatus === 'connected' && (
          <span className="ml-auto flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600 bg-emerald-50/60 px-2.5 py-1 rounded-pill border border-emerald-100/50">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Connected
          </span>
        )}
        {apiStatus === 'validating' && (
          <span className="ml-auto flex items-center gap-1.5 text-[10px] font-semibold text-amber-600 bg-amber-50/60 px-2.5 py-1 rounded-pill border border-amber-100/50">
            <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Validating...
          </span>
        )}
        {apiStatus === 'no_funds' && (
          <a
            href={BILLING_URLS[provider] || '#'}
            target="_blank"
            rel="noopener noreferrer"
            title={`Add credits on ${provider.charAt(0).toUpperCase() + provider.slice(1)}`}
            className="ml-auto flex items-center gap-1.5 text-[10px] font-semibold text-amber-600 bg-amber-50/60 px-2.5 py-1 rounded-pill border border-amber-100/50 hover:bg-amber-100/60 transition-colors cursor-pointer"
          >
            <span className="inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            Insufficient Funds
            <svg className="w-3 h-3 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        )}
        {apiStatus === 'error' && provider === 'local' && (
          <span
            title={validationErrorLabel}
            className="ml-auto flex items-center gap-1.5 text-[10px] font-semibold text-amber-600 bg-amber-50/60 px-2.5 py-1 rounded-pill border border-amber-100/50"
          >
            <span className="inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            <span className="max-w-[180px] truncate">Local offline</span>
          </span>
        )}
        {apiStatus === 'error' && provider !== 'local' && (
          <span
            title={validationErrorLabel}
            className="ml-auto flex items-center gap-1.5 text-[10px] font-semibold text-red-500 bg-red-50/60 px-2.5 py-1 rounded-pill border border-red-100/50"
          >
            <span className="inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            <span className="max-w-[180px] truncate">{validationErrorLabel}</span>
          </span>
        )}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Provider */}
        <div>
          <label
            htmlFor={providerId}
            className="block text-xs font-medium text-slate-500 mb-1.5 tracking-wide uppercase"
          >
            Provider
          </label>
          <div className="relative">
            <select
              id={providerId}
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="input-glass w-full rounded-xl px-3.5 py-2.5 pr-9 text-sm text-slate-700 focus:outline-none appearance-none cursor-pointer"
            >
              <option value="public">Scion</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="google">Google</option>
              <option value="deepseek">DeepSeek</option>
              <option value="local">Scion Local (advanced)</option>
            </select>
            <svg
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* API Key / WebLLM Download Progress */}
        <div>
          {provider === 'local' ? (
            <>
              <div className="block text-xs font-medium text-slate-500 mb-1.5 tracking-wide uppercase">
                Local server
              </div>
              {apiStatus === 'connected' ? (
                <div className="w-full rounded-squircle-xs bg-emerald-50/40 border border-emerald-200/50 px-3.5 py-2.5 text-sm text-emerald-700 flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-emerald-500 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  Free
                </div>
              ) : apiStatus === 'validating' ? (
                <div className="w-full rounded-squircle-xs bg-slate-50/60 border border-slate-200/40 px-3.5 py-2.5 text-sm text-slate-500">
                  Checking local server…
                </div>
              ) : (
                <div
                  className={`w-full rounded-squircle-xs border px-3.5 py-2.5 text-sm ${
                    apiStatus === 'error'
                      ? 'bg-amber-50/40 border-amber-200/50 text-amber-700'
                      : 'bg-slate-50/60 border-slate-200/40 text-slate-600'
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      {apiStatus === 'error'
                        ? validationErrorLabel
                        : 'Advanced Scion runtime for your own local server.'}
                    </span>
                    <button
                      type="button"
                      onClick={triggerLocalServerCheck}
                      className="inline-flex w-fit items-center justify-center rounded-pill border border-slate-200/80 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
                    >
                      Check server
                    </button>
                  </div>
                  <code className="mt-2 inline-flex font-mono text-[12px] bg-amber-100/60 px-1.5 py-0.5 rounded text-amber-700">
                    npm run local-model
                  </code>
                </div>
              )}
            </>
          ) : provider === PUBLIC_SCION_PROVIDER_ID ? (
            <>
              <div className="block text-xs font-medium text-slate-500 mb-1.5 tracking-wide uppercase">Access</div>
              {apiStatus === 'connected' ? (
                <div className="w-full rounded-squircle-xs bg-emerald-50/40 border border-emerald-200/50 px-3.5 py-2.5 text-sm text-emerald-700 flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-emerald-500 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  No API key or local server needed
                </div>
              ) : apiStatus === 'validating' ? (
                <div className="w-full rounded-squircle-xs bg-slate-50/60 border border-slate-200/40 px-3.5 py-2.5 text-sm text-slate-500">
                  Preparing Scion…
                </div>
              ) : apiStatus === 'error' ? (
                <div className="w-full rounded-squircle-xs bg-red-50/40 border border-red-200/50 px-3.5 py-2.5 text-sm text-red-600">
                  {validationErrorLabel}
                </div>
              ) : (
                <div className="w-full rounded-squircle-xs bg-slate-50/60 border border-slate-200/40 px-3.5 py-2.5 text-sm text-slate-500">
                  No setup needed
                </div>
              )}
            </>
          ) : provider === 'webllm' ? (
            <>
              <div className="block text-xs font-medium text-slate-500 mb-1.5 tracking-wide uppercase">
                Local Model Status
              </div>
              {apiStatus === 'connected' ? (
                <div className="w-full rounded-squircle-xs bg-emerald-50/40 border border-emerald-200/50 px-3.5 py-2.5 text-sm text-emerald-700 flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-emerald-500 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  Installed
                </div>
              ) : apiStatus === 'error' ? (
                <div className="w-full rounded-squircle-xs bg-red-50/40 border border-red-200/50 px-3.5 py-2.5 text-sm text-red-600">
                  {webllmError || 'WebGPU not supported in this browser'}
                  <button
                    onClick={() => {
                      webllmInitRef.current = false;
                      setProvider('webllm'); // re-trigger init
                    }}
                    className="ml-2 underline text-red-500 hover:text-red-700"
                  >
                    Retry
                  </button>
                </div>
              ) : webllmProgress ? (
                <div className="space-y-1.5">
                  <div className="w-full h-9 rounded-squircle-xs bg-slate-50/60 border border-slate-200/40 overflow-hidden relative">
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-400 to-purple-500 transition-all duration-300 ease-out rounded-squircle-xs"
                      style={{ width: `${Math.max(2, (webllmProgress.progress || 0) * 100)}%` }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center text-xs font-medium">
                      <span className={webllmProgress.progress > 0.5 ? 'text-white' : 'text-slate-600'}>
                        {Math.round((webllmProgress.progress || 0) * 100)}%
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 truncate" title={webllmProgress.text}>
                    {webllmProgress.text || 'Preparing...'}
                  </p>
                </div>
              ) : (
                <div className="w-full rounded-squircle-xs bg-slate-50/60 border border-slate-200/40 px-3.5 py-2.5 text-sm text-slate-400 flex items-center gap-2">
                  <svg className="animate-spin h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Initializing...
                </div>
              )}
            </>
          ) : (
            <>
              <label
                htmlFor={apiKeyId}
                className="block text-xs font-medium text-slate-500 mb-1.5 tracking-wide uppercase flex items-center gap-1.5"
              >
                API Key
                {API_KEY_URLS[provider] && (
                  <a
                    href={API_KEY_URLS[provider]}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Get your ${provider.charAt(0).toUpperCase() + provider.slice(1)} API key`}
                    className="inline-flex items-center text-indigo-400 hover:text-indigo-600 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"
                      />
                    </svg>
                  </a>
                )}
              </label>
              <div className="relative">
                <input
                  id={apiKeyId}
                  type="text"
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  data-form-type="other"
                  style={{ WebkitTextSecurity: 'disc' }}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={PLACEHOLDER[provider] || 'Enter API key...'}
                  className={`input-glass w-full rounded-squircle-xs px-3.5 py-2.5 text-sm focus:outline-none pr-10 ${
                    apiStatus === 'connected'
                      ? '!border-emerald-300/60 !bg-emerald-50/30 text-slate-700'
                      : apiStatus === 'no_funds'
                        ? '!border-amber-300/60 !bg-amber-50/30 text-slate-700'
                        : apiStatus === 'error'
                          ? '!border-red-300/60 !bg-red-50/30 text-slate-700'
                          : 'text-slate-700'
                  }`}
                />
                {apiStatus === 'connected' && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
                {apiStatus === 'no_funds' && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                  </div>
                )}
                {apiStatus === 'error' && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Model dropdown */}
        <div>
          <label
            {...(hasSelectableModels ? { htmlFor: modelIdSelectId } : {})}
            className="block text-xs font-medium text-slate-500 mb-1.5 tracking-wide uppercase"
          >
            Model
          </label>
          {hasSelectableModels ? (
            <select
              id={modelIdSelectId}
              value={modelId}
              onChange={handleModelChange}
              className={`input-glass w-full rounded-squircle-xs px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none ${
                apiStatus === 'connected'
                  ? '!border-emerald-300/60 !bg-emerald-50/30'
                  : '!border-amber-300/60 !bg-amber-50/30'
              }`}
            >
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {describeModelOption(m)}
                </option>
              ))}
            </select>
          ) : (
            <div className="w-full rounded-squircle-xs bg-white/70 border border-slate-200/70 px-3.5 py-2.5 text-sm font-medium text-slate-600">
              {provider === 'local'
                ? apiStatus === 'validating'
                  ? 'Checking local server...'
                  : apiStatus === 'error'
                    ? validationErrorLabel
                    : 'Check local server first'
                : apiStatus === 'validating'
                  ? 'Loading models...'
                  : apiStatus === 'error'
                    ? validationErrorLabel
                    : provider === PUBLIC_SCION_PROVIDER_ID
                      ? 'Scion ready'
                      : 'Enter API key first'}
            </div>
          )}
        </div>
      </div>
      {hasSelectableModels && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {capabilityStatus === 'detecting' && (
            <span className="inline-flex items-center gap-1.5 rounded-pill border border-amber-200/60 bg-amber-50/70 px-2.5 py-1 text-[10px] font-semibold text-amber-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              Detecting model strengths
            </span>
          )}
          {fitBadges.map((badge) => (
            <span
              key={badge.label}
              className={`inline-flex items-center rounded-pill border px-2.5 py-1 text-[10px] font-semibold ${badgeTone[badge.tone] || badgeTone.slate}`}
            >
              {badge.label}
            </span>
          ))}
          {technicalBadges.map((badge) => (
            <span
              key={badge.label}
              className={`inline-flex items-center rounded-pill border px-2.5 py-1 text-[10px] font-semibold ${badgeTone[badge.tone] || badgeTone.slate}`}
            >
              {badge.label}
            </span>
          ))}
        </div>
      )}
      {hasSelectableModels && (
        <div className="mt-4" data-testid="enrichment-preference">
          <label className="block text-xs font-medium text-slate-500 mb-1.5 tracking-wide uppercase">
            Subject-matter enrichment
          </label>
          <div className="inline-flex rounded-squircle-xs border border-slate-200/70 bg-white/70 p-0.5">
            {['auto', 'on', 'off'].map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => handleEnrichmentPref(mode)}
                aria-pressed={enrichmentPref === mode}
                className={`rounded-squircle-xs px-3 py-1 text-[11px] font-semibold capitalize transition-colors ${
                  enrichmentPref === mode
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">
            {describeEnrichmentResolution(enrichmentPref, generationPlan?.blueprintEnrichment)}
          </p>
        </div>
      )}
    </div>
  );
}
