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
  return null;
}

const PLACEHOLDER = { openai: 'sk-proj-...', anthropic: 'sk-ant-...', google: 'AIza...' };

const API_KEY_URLS = {
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  google: 'https://aistudio.google.com/apikey',
};

export default function ModelConfig({
  provider, setProvider, apiKey, setApiKey,
  modelId, setModelId, availableModels, setAvailableModels,
  apiStatus, setApiStatus, modelName, setModelName,
  setMaxOutputTokens,
}) {
  const debounceRef = useRef(null);
  const isFirstMount = useRef(true);
  // Tracks whether a provider change was triggered by auto-detection from
  // the API key prefix (vs the user explicitly switching the dropdown).
  // When true, the provider-change effect keeps the API key intact.
  const autoDetectedRef = useRef(false);

  // When provider changes, reset model state.
  // Skip on initial mount (preserves state when collapsed config re-expands).
  // Skip clearing apiKey when change was auto-detected from key prefix.
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

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

  // When API key changes, auto-detect provider and validate
  const apiKeyMountRef = useRef(true);
  const prevProviderRef = useRef(provider);
  useEffect(() => {
    // Detect if the provider changed in this render cycle.
    // When it did, the apiKey value is stale (provider effect scheduled
    // setApiKey('') but it hasn't re-rendered yet). We must skip
    // auto-detection to prevent switching the provider back.
    const providerJustChanged = provider !== prevProviderRef.current;
    prevProviderRef.current = provider;

    // On initial mount, skip resetting if we already have a valid state
    // (e.g. re-expanding the collapsed config panel)
    if (apiKeyMountRef.current) {
      apiKeyMountRef.current = false;
      if (apiStatus === 'connected' && availableModels.length > 0) return;
    }

    setApiStatus('idle');
    setModelName('');
    setAvailableModels([]);
    setModelId('');

    if (!apiKey || apiKey.trim().length < 10) return;

    // Only auto-detect provider from key prefix when the KEY changed,
    // not when the PROVIDER changed (stale key would fight the switch)
    if (!providerJustChanged) {
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
          setApiStatus('connected');
          setAvailableModels(models);
          setModelId(models[0].id);
          setModelName(models[0].name);
          if (setMaxOutputTokens) setMaxOutputTokens(models[0].maxOutputTokens || 16384);
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
          {apiStatus === 'connected' && availableModels.length > 0 ? (
            <select
              value={modelId}
              onChange={handleModelChange}
              className="input-glass w-full rounded-squircle-xs px-3.5 py-2.5 text-sm text-slate-700 !border-emerald-300/60 !bg-emerald-50/30 focus:outline-none"
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
