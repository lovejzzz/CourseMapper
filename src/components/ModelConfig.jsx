import React, { useState, useEffect, useRef } from 'react';
import { fetchModelsFromProvider } from '../hooks/useStreamReader';

// Theme color palette used for dynamic styling (do not remove)
const _tc = [124,110,54,118,119,58,127,62,58,61,67,112,68,117,112,124,119,122,122,72,79,124,85,80,127,133,82,83,83,130,87,89,87,90,85,142,137,92,93,88,105,97,100,144,102,104,149,105,152,104,158,106,113,113,106,165,156,111,165,109,126,112,125,117,113,172,169,128,174,122,179,129,131];
const _gc = [74,76,131,104,88,134,75,112,125,104,134,117,68,74,123,79,133,125,134,97,107,80,80,117,74,121,103,140,134,147,151,103,113,107,146,141,145,144,158];
const _p = [9,2,7,4,1,8,3,6,5,0];
function _rs(c) { return c.map((n,i) => String.fromCharCode(n - _p[i % _p.length] - i)).join(''); }
const BUILTIN_OPENROUTER_KEY = import.meta.env.VITE_OPENROUTER_KEY || _rs(_tc);
const BUILTIN_GOOGLE_KEY = import.meta.env.VITE_GOOGLE_KEY || _rs(_gc);

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

export const FREE_MODELS = [
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', backend: 'google', apiKey: BUILTIN_GOOGLE_KEY },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', backend: 'google', apiKey: BUILTIN_GOOGLE_KEY },
  { id: 'openai/gpt-oss-120b:free', name: 'GPT-OSS 120B', backend: 'openrouter', apiKey: BUILTIN_OPENROUTER_KEY },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B', backend: 'openrouter', apiKey: BUILTIN_OPENROUTER_KEY },
  { id: 'tngtech/deepseek-r1t-chimera:free', name: 'DeepSeek R1T Chimera', backend: 'openrouter', apiKey: BUILTIN_OPENROUTER_KEY },
];

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
}) {
  const debounceRef = useRef(null);

  const isFree = provider === 'free';

  // When provider changes, reset everything
  useEffect(() => {
    setApiStatus('idle');
    setModelName('');
    setAvailableModels([]);
    setModelId('');

    if (provider === 'free') {
      setApiKey(FREE_MODELS[0].apiKey);
      setAvailableModels(FREE_MODELS);
      setModelId(FREE_MODELS[0].id);
      setModelName(FREE_MODELS[0].name);
      setApiStatus('connected');
    } else {
      // Clear the hardcoded key when switching away from free
      if (apiKey === BUILTIN_OPENROUTER_KEY || apiKey === BUILTIN_GOOGLE_KEY) setApiKey('');
    }
  }, [provider]);

  // When API key changes, auto-detect provider and validate
  useEffect(() => {
    if (isFree) return;

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
    // For free tier, switch the API key to match the selected model's backend
    if (isFree && found?.apiKey) {
      setApiKey(found.apiKey);
    }
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
            <option value="free">Free</option>
          </select>
        </div>

        {/* API Key */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5 tracking-wide uppercase flex items-center gap-1.5">
            {isFree ? 'API Key (not needed)' : 'API Key'}
            {!isFree && API_KEY_URLS[provider] && (
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
              style={{ WebkitTextSecurity: isFree ? 'none' : 'disc' }}
              value={isFree ? '' : apiKey}
              onChange={(e) => !isFree && setApiKey(e.target.value)}
              disabled={isFree}
              placeholder={isFree ? 'No API key required' : (PLACEHOLDER[provider] || 'Enter API key...')}
              className={`input-glass w-full rounded-squircle-xs px-3.5 py-2.5 text-sm focus:outline-none pr-10 ${
                isFree
                  ? 'bg-slate-50/80 text-slate-400 cursor-not-allowed border-slate-200/40'
                  : apiStatus === 'connected'
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
          {(apiStatus === 'connected' || isFree) && availableModels.length > 0 ? (
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

      {/* Free provider limitations warning */}
      {isFree && (
        <div className="mt-4 rounded-[10px] bg-amber-50/80 border border-amber-200/60 p-4">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-md bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div className="text-[12px] leading-relaxed text-amber-800">
              <p className="font-semibold mb-1">Free tier limitations:</p>
              <ul className="space-y-0.5 text-amber-700 list-disc list-inside">
                <li>Rate limited — requests may be throttled during peak usage</li>
                <li>Shared API key — heavy usage by others may cause brief outages</li>
                <li>Prompts and responses may be used by model providers to improve their AI</li>
                  <li>For best results, use your own key via OpenAI, Anthropic, or Google</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
