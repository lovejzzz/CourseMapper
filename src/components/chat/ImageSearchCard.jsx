import React, { useState, useEffect } from 'react';
import { generateImages } from '../../lib/imageSearch';
import { useAIConfig } from '../../contexts/AIConfigContext';

/**
 * ImageSearchCard — Shows AI-generated images in a grid.
 * Uses the user's configured provider (OpenAI DALL-E 3 or Google Imagen 3).
 */
export default function ImageSearchCard({ imageSearch, status, provider }) {
  const { provider: configuredProvider, apiKey } = useAIConfig();
  const effectiveProvider = provider || configuredProvider;
  const effectiveApiKey = configuredProvider === effectiveProvider ? apiKey : '';
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!imageSearch?.query || status !== 'complete') return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    if (!effectiveApiKey) {
      setLoading(false);
      setError(
        provider && configuredProvider !== provider
          ? `Switch back to the ${provider} provider to retry this image generation.`
          : 'Configure an AI provider key to generate images.',
      );
      return () => { cancelled = true; };
    }

    generateImages(imageSearch.query, { provider: effectiveProvider, apiKey: effectiveApiKey })
      .then(result => {
        if (cancelled) return;
        if (result.error) setError(result.error);
        setImages(result.images || []);
      })
      .catch(err => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [imageSearch?.query, status, provider, configuredProvider, effectiveProvider, effectiveApiKey]);

  if (status === 'searching') {
    return (
      <div className="mx-2 my-1 rounded-xl bg-rose-50/60 border border-rose-200/30 shadow-glass animate-spring-in p-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-rose-500 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-[13px] font-semibold text-rose-700">Generating images…</span>
        </div>
      </div>
    );
  }

  if (!imageSearch) return null;

  const selectedImage = images.find(i => i.id === selected);

  const handleCopyUrl = (url) => {
    navigator.clipboard?.writeText(url);
  };

  return (
    <div className="mx-2 my-1 rounded-xl bg-rose-50/60 border border-rose-200/30 shadow-glass animate-spring-in overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full px-3.5 py-2 flex items-center gap-2 hover:bg-rose-50/80 transition-colors"
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand generated images' : 'Collapse generated images'}
      >
        <div className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-3 h-3 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <span className="text-[13px] font-semibold text-rose-700 flex-1 text-left">
          Generated Images: {imageSearch.query}
        </span>
        <svg
          className={`w-3 h-3 text-rose-400 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Body */}
      {!collapsed && (
        <div className="px-3.5 pb-3 space-y-2 border-t border-rose-100/50 pt-2">
          {loading && (
            <p className="text-[12px] text-rose-600 animate-pulse">Generating images…</p>
          )}
          {error && (
            <div className="flex items-center gap-2">
              <p className="text-[12px] text-red-500 flex-1">
                {error.includes('server had an error') || error.includes('500')
                  ? 'Image generation failed — the AI provider had a temporary issue.'
                  : error.length > 120 ? error.slice(0, 120) + '…' : error}
              </p>
              <button
                onClick={() => {
                  setError(null);
                  setLoading(true);
                  generateImages(imageSearch.query, { provider: effectiveProvider, apiKey: effectiveApiKey })
                    .then(result => {
                      if (result.error) setError(result.error);
                      setImages(result.images || []);
                    })
                    .catch(err => setError(err.message))
                    .finally(() => setLoading(false));
                }}
                className="tactile flex-shrink-0 px-2 py-0.5 rounded-md text-[11px] font-semibold text-rose-600 bg-rose-100/80 hover:bg-rose-200/80 transition-colors"
              >
                Retry
              </button>
            </div>
          )}
          {!loading && images.length === 0 && !error && (
            <p className="text-[12px] text-rose-500">No images generated.</p>
          )}
          {images.length > 0 && (
            <div className="grid grid-cols-2 gap-1.5">
              {images.map(img => (
                <button
                  key={img.id}
                  onClick={() => setSelected(selected === img.id ? null : img.id)}
                  className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                    selected === img.id ? 'border-rose-500 ring-2 ring-rose-300' : 'border-transparent hover:border-rose-200'
                  }`}
                  aria-label={`${selected === img.id ? 'Deselect' : 'Select'} generated image`}
                  aria-pressed={selected === img.id}
                >
                  <img
                    src={img.url}
                    alt={imageSearch.query}
                    className="w-full h-32 object-cover"
                    loading="lazy"
                  />
                  {selected === img.id && (
                    <div className="absolute inset-0 bg-rose-500/20 flex items-center justify-center">
                      <svg className="w-5 h-5 text-white drop-shadow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
          {selected && selectedImage && (
            <div className="flex items-center gap-2 pt-1">
              {selectedImage.url?.startsWith('data:') ? (
                <a
                  href={selectedImage.url}
                  download={`generated-image-${selectedImage.id}.png`}
                  className="tactile px-3 py-1 rounded-lg text-[12px] font-semibold text-white bg-rose-500 hover:bg-rose-600 shadow-sm transition-colors"
                >
                  Download Image
                </a>
              ) : (
                <button
                  onClick={() => handleCopyUrl(selectedImage.url)}
                  className="tactile px-3 py-1 rounded-lg text-[12px] font-semibold text-white bg-rose-500 hover:bg-rose-600 shadow-sm transition-colors"
                >
                  Copy Image URL
                </button>
              )}
              <span className="text-[11px] text-rose-400">
                Generated by {selectedImage.provider || 'AI'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
