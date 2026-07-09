// src/contexts/AIConfigContext.jsx — AI provider/model configuration state
import React, { createContext, useContext, useState, useEffect } from 'react';
import { getSecure, setSecure, removeSecure } from '../lib/secureStorage';
import { LOCAL_MODEL_ID, LOCAL_MODEL_NAME, LOCAL_PROVIDER_ID } from '../lib/localProvider';
import { createBaseModelCapabilities, createGenerationPlan } from '../lib/modelCapabilities';

const AIConfigContext = createContext(null);
const ACTIVE_API_KEY_STORAGE_KEY = 'coursemapper-apikey';
const PROVIDER_API_KEY_STORAGE_PREFIX = 'coursemapper-apikey-provider:';

function normalizeStoredProvider(provider) {
  if (provider === 'webllm' || provider === 'free') return 'anthropic';
  return provider || 'anthropic';
}

export function normalizeStoredModelId(provider, modelId) {
  if (provider !== LOCAL_PROVIDER_ID) return modelId || '';
  const value = String(modelId || '').trim();
  if (!value || value === 'scion-1' || value === 'scion-1.1') return LOCAL_MODEL_ID;
  return value;
}

export function normalizeStoredModelName(provider, modelName, modelId) {
  if (provider !== LOCAL_PROVIDER_ID) return modelName || '';
  const value = String(modelName || '').trim();
  if (!value || value === 'Scion-1' || value === 'Scion-1.1' || modelId === LOCAL_MODEL_ID) return LOCAL_MODEL_NAME;
  return value;
}

export function getProviderApiKeyStorageKey(provider) {
  return `${PROVIDER_API_KEY_STORAGE_PREFIX}${provider || 'unknown'}`;
}

export function getSavedApiKeyForProvider(provider, { includeLegacy = false } = {}) {
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
  if (!provider || provider === 'webllm' || !trimmedKey) return;
  try {
    setSecure(getProviderApiKeyStorageKey(provider), trimmedKey);
  } catch {}
}

export function AIConfigProvider({ children }) {
  const [provider, setProvider] = useState(() => {
    try {
      return normalizeStoredProvider(localStorage.getItem('coursemapper-provider'));
    } catch {
      return 'anthropic';
    }
  });
  const [apiKey, setApiKey] = useState(() => {
    return getSavedApiKeyForProvider(provider, { includeLegacy: true });
  });
  const [apiStatus, setApiStatus] = useState('idle');
  const [modelName, setModelName] = useState(() => {
    try {
      const storedProvider = localStorage.getItem('coursemapper-provider');
      const normalizedProvider = normalizeStoredProvider(storedProvider);
      if (storedProvider === 'webllm' || storedProvider === 'free') return '';
      return normalizeStoredModelName(
        normalizedProvider,
        localStorage.getItem('coursemapper-modelname'),
        localStorage.getItem('coursemapper-modelid'),
      );
    } catch {
      return '';
    }
  });
  const [modelId, setModelId] = useState(() => {
    try {
      const storedProvider = localStorage.getItem('coursemapper-provider');
      const normalizedProvider = normalizeStoredProvider(storedProvider);
      if (storedProvider === 'webllm' || storedProvider === 'free') return '';
      return normalizeStoredModelId(normalizedProvider, localStorage.getItem('coursemapper-modelid'));
    } catch {
      return '';
    }
  });
  const [availableModels, setAvailableModels] = useState([]);
  const [maxOutputTokens, setMaxOutputTokens] = useState(16384);
  const [modelCapabilities, setModelCapabilities] = useState(() => {
    try {
      const raw = localStorage.getItem('coursemapper-model-capabilities-current');
      return raw ? JSON.parse(raw) : null;
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
      if (apiKey) setSecure(ACTIVE_API_KEY_STORAGE_KEY, apiKey);
      else removeSecure(ACTIVE_API_KEY_STORAGE_KEY);
    } catch {}
  }, [apiKey]);

  useEffect(() => {
    try {
      localStorage.setItem('coursemapper-provider', provider);
    } catch {}
  }, [provider]);

  useEffect(() => {
    const nextModelId = normalizeStoredModelId(provider, modelId);
    const nextModelName = normalizeStoredModelName(provider, modelName, nextModelId);
    if (nextModelId !== modelId) setModelId(nextModelId);
    if (nextModelName !== modelName) setModelName(nextModelName);
  }, [provider, modelId, modelName]);

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
