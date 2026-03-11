import React, { useState, useEffect, useRef } from 'react';
import { fetchModelsFromProvider } from '../hooks/useStreamReader';

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

const PLACEHOLDER = { openai: 'sk-proj-...', anthropic: 'sk-ant-...', google: 'AIza... or Vertex AI key', deepseek: 'sk-...' };

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

/**
 * Make a tiny test completion to verify the key has credits.
 * Returns true if the key works, false if insufficient funds.
 */
async function checkCredits(provider, apiKey, modelId) {
  try {
    let res;
    if (provider === 'openai' || provider === 'deepseek') {
      const base = provider === 'deepseek' ? 'https://api.deepseek.com/v1' : 'https://api.openai.com/v1';
      res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 1 }),
      });
    } else if (provider === 'anthropic') {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey, 'content-type': 'application/json',
          'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model: modelId, max_tokens: 1, messages: [{ role: 'user', content: 'Hi' }] }),
      });
    } else if (provider === 'google') {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Hi' }] }], generationConfig: { maxOutputTokens: 1 } }),
        }
      );
    } else {
      return true;
    }
    if (res.ok) return true;
    // Check for billing/quota errors
    const err = await res.json().catch(() => ({}));
    const msg = JSON.stringify(err).toLowerCase();
    if (res.status === 402 || res.status === 429 || msg.includes('insufficient') || msg.includes('quota') || msg.includes('billing') || msg.includes('exceeded') || msg.includes('balance')) {
      return false;
    }
    // Other errors (e.g. 400 for temperature) — key likely has credits
    return true;
  } catch {
    return true; // Network error — don't block, assume credits OK
  }
}

export default function ModelConfig({
  provider, setProvider, apiKey, setApiKey,
  modelId, setModelId, availableModels, setAvailableModels,
  apiStatus, setApiStatus, modelName, setModelName,
  setMaxOutputTokens,
}) {
  const debounceRef = useRef(null);
  // Track the previous provider value to distinguish real changes from mount/remount.
  // This is more robust than an isFirstMount flag because it survives React 18
  // StrictMode double-effects and conditional rendering unmount/remount cycles.
  const prevProviderValueRef = useRef(provider);
  // Tracks whether a provider change was triggered by auto-detection from
  // the API key prefix (vs the user explicitly switching the dropdown).
  // When true, the provider-change effect keeps the API key intact.
  const autoDetectedRef = useRef(false);

  // When provider changes, reset model state.
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

    if (autoDetectedRef.current) {
      // Provider was auto-switched because user typed a key with a different
      // prefix — keep the key so validation can proceed
      autoDetectedRef.current = false;
    } else {
      // User explicitly changed the dropdown — clear the old key
      setApiKey('');
    }
  }, [provider]);

  // When API key or provider changes, auto-detect provider and validate.
  // Track previous values to distinguish real changes from mount/remount/StrictMode.
  const prevApiKeyRef = useRef(apiKey);
  const prevProviderRef = useRef(provider);
  const hasRunOnceRef = useRef(false);
  useEffect(() => {
    const apiKeyChanged = apiKey !== prevApiKeyRef.current;
    const providerChanged = provider !== prevProviderRef.current;
    prevApiKeyRef.current = apiKey;
    prevProviderRef.current = provider;

    // On mount/remount: if nothing changed AND we already have a valid state,
    // skip re-validation entirely. This prevents StrictMode double-effects
    // from resetting apiStatus and triggering a re-collapse.
    if (!apiKeyChanged && !providerChanged) {
      if ((apiStatus === 'connected' || apiStatus === 'no_funds') && availableModels.length > 0) return;
      // First time ever (initial page load): allow validation to proceed
      if (hasRunOnceRef.current) return;
    }
    hasRunOnceRef.current = true;

    setApiStatus('idle');
    setModelName('');
    setAvailableModels([]);
    setModelId('');

    if (!apiKey || apiKey.trim().length < 10) return;

    // Only auto-detect provider from key prefix when the KEY changed,
    // not when the PROVIDER changed (stale key would fight the switch)
    if (!providerChanged) {
      const detected = detectProvider(apiKey.trim());
      if (detected && detected !== provider) {
        autoDetectedRef.current = true; // signal: don't clear apiKey
        setProvider(detected);
        return; // provider change will re-trigger this effect
      }
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setApiStatus('validating');
      try {
        const models = await fetchModelsFromProvider(provider, apiKey.trim());
        if (models && models.length > 0) {
          setAvailableModels(models);
          // Prefer previously saved model if it exists in the list
          let saved;
          try { saved = localStorage.getItem('coursemapper-modelid'); } catch { }
          const match = saved ? models.find(m => m.id === saved) : null;
          const selected = match || models[0];
          setModelId(selected.id);
          setModelName(selected.name);
          if (setMaxOutputTokens) setMaxOutputTokens(selected.maxOutputTokens || 16384);
          // Verify the key has credits with a tiny test call
          const hasCredits = await checkCredits(provider, apiKey.trim(), selected.id);
          setApiStatus(hasCredits ? 'connected' : 'no_funds');
        } else {
          setApiStatus('error');
        }
      } catch {
        setApiStatus('error');
      }
    }, 800);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [apiKey, provider]);

  function handleModelChange(e) {
    const id = e.target.value;
    setModelId(id);
    const found = availableModels.find((m) => m.id === id);
    setModelName(found?.name || id);
    if (setMaxOutputTokens) setMaxOutputTokens(found?.maxOutputTokens || 16384);
  }

  return (
    <div className="glass panel-glow rounded-squircle shadow-glass p-7 animate-stagger-1">
      <h2 className="text-[15px] font-bold text-slate-800 mb-5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-sm shadow-indigo-500/20">
          <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none">
            <path d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.364-6.364l-1.414 1.414M7.05 16.95l-1.414 1.414m12.728 0l-1.414-1.414M7.05 7.05L5.636 5.636" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round"/>
            <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth={1.6}/>
            <circle cx="12" cy="12" r="1.5" fill="currentColor" opacity="0.5"/>
          </svg>
        </div>
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}
        {apiStatus === 'error' && (
          <span className="ml-auto flex items-center gap-1.5 text-[10px] font-semibold text-red-500 bg-red-50/60 px-2.5 py-1 rounded-pill border border-red-100/50">
            <span className="inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            Invalid Key
          </span>
        )}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Provider */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5 tracking-wide uppercase">
            Provider
          </label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="input-glass w-full rounded-xl px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none appearance-none cursor-pointer"
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="google">Google</option>
            <option value="deepseek">DeepSeek</option>
          </select>
        </div>

        {/* API Key */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5 tracking-wide uppercase flex items-center gap-1.5">
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
                </svg>
              </a>
            )}
          </label>
          <div className="relative">
            <input
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
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
        </div>

        {/* Model dropdown */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5 tracking-wide uppercase">
            Model
          </label>
          {(apiStatus === 'connected' || apiStatus === 'no_funds') && availableModels.length > 0 ? (
            <select
              value={modelId}
              onChange={handleModelChange}
              className={`input-glass w-full rounded-squircle-xs px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none ${
                apiStatus === 'connected' ? '!border-emerald-300/60 !bg-emerald-50/30' : '!border-amber-300/60 !bg-amber-50/30'
              }`}
            >
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="w-full rounded-squircle-xs bg-slate-50/60 border border-slate-200/40 px-3.5 py-2.5 text-sm text-slate-400">
              {apiStatus === 'validating' ? 'Loading models...' : 'Enter API key first'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
