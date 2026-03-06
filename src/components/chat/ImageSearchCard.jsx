import React, { useState, useEffect } from 'react';
import { searchImages } from '../../lib/imageSearch';

/**
 * ImageSearchCard — Shows Pixabay image search results in a grid.
 * Users can select images for slide illustration.
 */
export default function ImageSearchCard({ imageSearch, status }) {
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
    searchImages(imageSearch.query, { category: imageSearch.category })
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
  }, [imageSearch?.query, status]);

  if (status === 'searching') {
    return (
      <div className="mx-2 my-1 rounded-xl bg-rose-50/60 border border-rose-200/30 shadow-glass animate-spring-in p-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-rose-500 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-[13px] font-semibold text-rose-700">Searching images…</span>
        </div>
      </div>
    );
  }

  if (!imageSearch) return null;

  const handleCopyUrl = (url) => {
    navigator.clipboard.writeText(url);
  };

  return (
    <div className="mx-2 my-1 rounded-xl bg-rose-50/60 border border-rose-200/30 shadow-glass animate-spring-in overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full px-3.5 py-2 flex items-center gap-2 hover:bg-rose-50/80 transition-colors"
      >
        <div className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-3 h-3 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <span className="text-[13px] font-semibold text-rose-700 flex-1 text-left">
          Images: {imageSearch.query}
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
            <p className="text-[12px] text-rose-600 animate-pulse">Loading images…</p>
          )}
          {error && (
            <p className="text-[12px] text-red-500">{error}</p>
          )}
          {!loading && images.length === 0 && !error && (
            <p className="text-[12px] text-rose-500">No images found.</p>
          )}
          {images.length > 0 && (
            <div className="grid grid-cols-3 gap-1.5">
              {images.map(img => (
                <button
                  key={img.id}
                  onClick={() => setSelected(selected === img.id ? null : img.id)}
                  className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                    selected === img.id ? 'border-rose-500 ring-2 ring-rose-300' : 'border-transparent hover:border-rose-200'
                  }`}
                >
                  <img
                    src={img.previewUrl}
                    alt={img.tags}
                    className="w-full h-20 object-cover"
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
          {selected && (
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => handleCopyUrl(images.find(i => i.id === selected)?.largeUrl)}
                className="tactile px-3 py-1 rounded-lg text-[12px] font-semibold text-white bg-rose-500 hover:bg-rose-600 shadow-sm transition-colors"
              >
                Copy Image URL
              </button>
              <span className="text-[11px] text-rose-400">
                by {images.find(i => i.id === selected)?.user} • Pixabay
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
