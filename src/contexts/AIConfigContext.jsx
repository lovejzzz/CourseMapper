// src/contexts/AIConfigContext.jsx — AI provider/model configuration state
import React, { createContext, useContext, useState, useEffect } from 'react';
import { getSecure, setSecure, removeSecure } from '../lib/secureStorage';
import { createGenerationPlan } from '../lib/modelCapabilities';

const AIConfigContext = createContext(null);

export function AIConfigProvider({ children }) {
  const [provider, setProvider] = useState(() => {
    try {
      return localStorage.getItem('coursemapper-provider') || 'anthropic';
    } catch {
      return 'anthropic';
    }
  });
  const [apiKey, setApiKey] = useState(() => {
    try {
      return getSecure('coursemapper-apikey') || '';
    } catch {
      return '';
    }
  });
  const [apiStatus, setApiStatus] = useState('idle');
  const [modelName, setModelName] = useState(() => {
    try {
      return localStorage.getItem('coursemapper-modelname') || '';
    } catch {
      return '';
    }
  });
  const [modelId, setModelId] = useState(() => {
    try {
      return localStorage.getItem('coursemapper-modelid') || '';
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
  const [generationPlan, setGenerationPlan] = useState(() => createGenerationPlan(modelCapabilities || {}));

  // ── Persist API key, provider & model to localStorage ──
  useEffect(() => {
    try {
      if (apiKey) setSecure('coursemapper-apikey', apiKey);
      else removeSecure('coursemapper-apikey');
    } catch {}
  }, [apiKey]);

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
      setGenerationPlan(createGenerationPlan({ provider, modelId, maxOutputTokens }));
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
