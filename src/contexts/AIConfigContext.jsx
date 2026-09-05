// src/contexts/AIConfigContext.jsx — AI provider/model configuration state
import React, { createContext, useContext, useState, useEffect } from 'react';
import { getSecure, setSecure, removeSecure } from '../lib/secureStorage';
import { createBaseModelCapabilities, createGenerationPlan } from '../lib/modelCapabilities';
import {
  PUBLIC_SCION_MODEL_ID,
  PUBLIC_SCION_PROVIDER_ID,
  publicScionModelOption,
  publicScionModelOptionById,
  publicScionProviderModelOptions,
} from '../lib/publicScionIdentity';
import { isLocalProviderOptInEnabled } from '../lib/localProvider';

const AIConfigContext = createContext(null);
const ACTIVE_API_KEY_STORAGE_KEY = 'coursemapper-apikey';
const PROVIDER_API_KEY_STORAGE_PREFIX = 'coursemapper-apikey-provider:';

function isKeylessProvider(provider) {
  return provider === 'local' || provider === PUBLIC_SCION_PROVIDER_ID;
}

function normalizeStoredProvider(provider) {
  if (provider === 'local' && isLocalProviderOptInEnabled()) return 'local';
  if (provider === 'webllm' || provider === 'free' || provider === 'local') return PUBLIC_SCION_PROVIDER_ID;
  return provider || PUBLIC_SCION_PROVIDER_ID;
}

export function normalizeProjectProvider(provider) {
  return provider === 'free' || provider === 'webllm' ? PUBLIC_SCION_PROVIDER_ID : provider;
}

export function restorePublicScionAIConfig(
  setProvider,
  setApiKey,
  setModelId,
  setModelName,
  setApiStatus,
  requestedModelId = PUBLIC_SCION_MODEL_ID,
) {
  const selected = publicScionModelOptionById(requestedModelId);
  try {
    localStorage.setItem('coursemapper-provider', PUBLIC_SCION_PROVIDER_ID);
    localStorage.setItem('coursemapper-modelid', selected.id);
    localStorage.setItem('coursemapper-modelname', selected.name);
  } catch {}
  setProvider(PUBLIC_SCION_PROVIDER_ID);
  setApiKey('');
  setModelId(selected.id);
  setModelName(selected.name);
  setApiStatus('connected');
}

export function getProviderApiKeyStorageKey(provider) {
  return `${PROVIDER_API_KEY_STORAGE_PREFIX}${provider || 'unknown'}`;
}

export function getSavedApiKeyForProvider(provider, { includeLegacy = false } = {}) {
  if (isKeylessProvider(provider)) return '';
  try {
    const saved = provider ? getSecure(getProviderApiKeyStorageKey(provider)) : '';
    if (saved) return saved;
    return includeLegacy ? getSecure(ACTIVE_API_KEY_STORAGE_KEY) || '' : '';
  } catch {
    return '';
  }
}

export function saveApiKeyForProvider(provider, apiKey) {
  const trimmedKey = String(apiKey || '').trim();
  if (!provider || provider === 'webllm' || isKeylessProvider(provider) || !trimmedKey) return;
  try {
    setSecure(getProviderApiKeyStorageKey(provider), trimmedKey);
  } catch {}
}

export function AIConfigProvider({ children }) {
  const [provider, setProvider] = useState(() => {
    try {
      return normalizeStoredProvider(localStorage.getItem('coursemapper-provider'));
    } catch {
      return PUBLIC_SCION_PROVIDER_ID;
    }
  });
  const [apiKey, setApiKey] = useState(() => {
    if (isKeylessProvider(provider)) return '';
    return getSavedApiKeyForProvider(provider, { includeLegacy: true });
  });
  const [apiStatus, setApiStatus] = useState(() => (provider === PUBLIC_SCION_PROVIDER_ID ? 'connected' : 'idle'));
  const [modelName, setModelName] = useState(() => {
    try {
      const storedProvider = normalizeStoredProvider(localStorage.getItem('coursemapper-provider'));
      if (storedProvider === 'webllm' || storedProvider === 'free') return '';
      if (storedProvider === PUBLIC_SCION_PROVIDER_ID) {
        return publicScionModelOptionById(localStorage.getItem('coursemapper-modelid')).name;
      }
      return localStorage.getItem('coursemapper-modelname') || '';
    } catch {
      return '';
    }
  });
  const [modelId, setModelId] = useState(() => {
    try {
      const storedProvider = normalizeStoredProvider(localStorage.getItem('coursemapper-provider'));
      if (storedProvider === 'webllm' || storedProvider === 'free') return '';
      if (storedProvider === PUBLIC_SCION_PROVIDER_ID) {
        // Scion is the sole public identity. Legacy Algi selections migrate
        // here instead of leaving a hidden model choice in restored projects.
        return publicScionModelOptionById(localStorage.getItem('coursemapper-modelid')).id;
      }
      return localStorage.getItem('coursemapper-modelid') || '';
    } catch {
      return '';
    }
  });
  const [availableModels, setAvailableModels] = useState(() =>
    provider === PUBLIC_SCION_PROVIDER_ID ? publicScionProviderModelOptions() : [],
  );
  const [maxOutputTokens, setMaxOutputTokens] = useState(() =>
    provider === PUBLIC_SCION_PROVIDER_ID ? publicScionModelOptionById(modelId).maxOutputTokens : 16384,
  );
  const [modelCapabilities, setModelCapabilities] = useState(() => {
    if (provider === PUBLIC_SCION_PROVIDER_ID) {
      return createBaseModelCapabilities(PUBLIC_SCION_PROVIDER_ID, publicScionModelOptionById(modelId));
    }
    try {
      const raw = localStorage.getItem('coursemapper-model-capabilities-current');
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed) return null;
      const matchesCurrentModel = parsed.provider === provider && (!parsed.modelId || parsed.modelId === modelId);
      return matchesCurrentModel ? parsed : null;
    } catch {
      return null;
    }
  });
  // v0.12.1: a missing/stale capability profile must never produce a bare
  // prompt_only plan for a known provider — that silently disables blueprint
  // enrichment AND lean course-map atoms (the v0.12 four-course audit shipped
  // mail-merge packages exactly this way). Fall back to the catalog baseline
  // profile, which carries provider-level structured-output metadata.
  const [generationPlan, setGenerationPlan] = useState(() =>
    createGenerationPlan(modelCapabilities || createBaseModelCapabilities(provider, { id: modelId, maxOutputTokens })),
  );

  // ── Persist API key, provider & model to localStorage ──
  useEffect(() => {
    try {
      if (isKeylessProvider(provider)) return;
      if (apiKey) setSecure(ACTIVE_API_KEY_STORAGE_KEY, apiKey);
      else removeSecure(ACTIVE_API_KEY_STORAGE_KEY);
    } catch {}
  }, [apiKey, provider]);

  useEffect(() => {
    try {
      localStorage.setItem('coursemapper-provider', provider);
    } catch {}
  }, [provider]);

  useEffect(() => {
    try {
      if (modelId) localStorage.setItem('coursemapper-modelid', modelId);
      else localStorage.removeItem('coursemapper-modelid');
      if (modelName) localStorage.setItem('coursemapper-modelname', modelName);
      else localStorage.removeItem('coursemapper-modelname');
    } catch {}
  }, [modelId, modelName]);

  useEffect(() => {
    const matchesCurrentModel =
      modelCapabilities?.provider === provider &&
      (!modelCapabilities?.modelId || modelCapabilities.modelId === modelId);
    if (!matchesCurrentModel) {
      // Same v0.12.1 rule as the initial state: resolve the catalog baseline
      // for the current provider/model instead of a bare (degraded) profile.
      setGenerationPlan(createGenerationPlan(createBaseModelCapabilities(provider, { id: modelId, maxOutputTokens })));
      return;
    }
    setGenerationPlan(createGenerationPlan(modelCapabilities));
    try {
      if (modelCapabilities)
        localStorage.setItem('coursemapper-model-capabilities-current', JSON.stringify(modelCapabilities));
      else localStorage.removeItem('coursemapper-model-capabilities-current');
    } catch {}
  }, [modelCapabilities, provider, modelId, maxOutputTokens]);

  return (
    <AIConfigContext.Provider
      value={{
        provider,
        setProvider,
        apiKey,
        setApiKey,
        apiStatus,
        setApiStatus,
        modelName,
        setModelName,
        modelId,
        setModelId,
        availableModels,
        setAvailableModels,
        maxOutputTokens,
        setMaxOutputTokens,
        modelCapabilities,
        setModelCapabilities,
        generationPlan,
        setGenerationPlan,
      }}
    >
      {children}
    </AIConfigContext.Provider>
  );
}

export function useAIConfig() {
  const ctx = useContext(AIConfigContext);
  if (!ctx) throw new Error('useAIConfig must be used within an AIConfigProvider');
  return ctx;
}
