// src/contexts/AIConfigContext.jsx — AI provider/model configuration state
import React, { createContext, useContext, useState, useEffect } from 'react';
import { getSecure, setSecure, removeSecure } from '../lib/secureStorage';

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
