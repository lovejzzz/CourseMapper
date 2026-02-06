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

export default function ModelConfig({
  provider, setProvider, apiKey, setApiKey,
  modelId, setModelId, availableModels, setAvailableModels,
  apiStatus, setApiStatus, modelName, setModelName,
}) {
  const debounceRef = useRef(null);

  // When provider changes, reset everything
  useEffect(() => {
    setApiStatus('idle');
    setModelName('');
    setAvailableModels([]);
    setModelId('');
  }, [provider]);

  // When API key changes, auto-detect provider and validate
  useEffect(() => {
    setApiStatus('idle');
    setModelName('');
    setAvailableModels([]);
    setModelId('');

    if (!apiKey || apiKey.trim().length < 10) return;

    // Auto-detect and switch provider if key prefix doesn't match
    const detected = detectProvider(apiKey.trim());
    if (detected && detected !== provider) {
      setProvider(detected);
      return; // provider change will re-trigger this effect
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
  }

  return (
    <div className="glass rounded-squircle shadow-glass p-7 animate-stagger-1">
      <h2 className="text-base font-semibold text-slate-800 mb-5 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-squircle-xs bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        AI Configuration
        {apiStatus === 'connected' && (
          <span className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 bg-emerald-50/80 px-2.5 py-1 rounded-full">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Connected
          </span>
        )}
        {apiStatus === 'validating' && (
          <span className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 bg-amber-50/80 px-2.5 py-1 rounded-full">
            <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Validating...
          </span>
        )}
        {apiStatus === 'error' && (
          <span className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold text-red-500 bg-red-50/80 px-2.5 py-1 rounded-full">
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
            className="input-glass w-full rounded-squircle-xs px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none"
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="google">Google</option>
          </select>
        </div>

        {/* API Key */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5 tracking-wide uppercase">
            API Key
          </label>
          <div className="relative">
            <input
              type="password"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={PLACEHOLDER[provider] || 'Enter API key...'}
              className={`input-glass w-full rounded-squircle-xs px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none pr-10 ${
                apiStatus === 'connected'
                  ? '!border-emerald-300/60 !bg-emerald-50/30'
                  : apiStatus === 'error'
                  ? '!border-red-300/60 !bg-red-50/30'
                  : ''
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
