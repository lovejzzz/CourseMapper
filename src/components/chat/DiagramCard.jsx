import React, { useState, useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { loadMermaidRuntime } from '../../lib/mermaidRuntime.js';

export default function DiagramCard({ diagram, status }) {
  const [collapsed, setCollapsed] = useState(false);
  const [svgHtml, setSvgHtml] = useState('');
  const [error, setError] = useState(null);
  const containerRef = useRef(null);
  const renderIdRef = useRef(0);

  const syntax = diagram?.syntax;
  const title = diagram?.title;
  const description = diagram?.description;

  useEffect(() => {
    if (!syntax || status === 'searching') return;
    let cancelled = false;
    renderIdRef.current += 1;
    const currentId = renderIdRef.current;

    (async () => {
      try {
        const mermaid = await loadMermaidRuntime();
        mermaid.initialize({
          startOnLoad: false,
          theme: 'neutral',
          securityLevel: 'strict',
          fontFamily: 'Inter, sans-serif',
        });
        const id = `mermaid-${Date.now()}-${currentId}`;
        const { svg } = await mermaid.render(id, syntax);
        if (!cancelled) {
          setSvgHtml(svg);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to render diagram');
          setSvgHtml('');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [syntax, status]);

  const handleCopySvg = () => {
    if (svgHtml) {
      navigator.clipboard?.writeText(svgHtml);
    }
  };

  // Guard: no diagram data yet
  if (!diagram) return null;

  // Searching state
  if (status === 'searching') {
    return (
      <div className="mx-2 my-1 rounded-xl bg-indigo-50/60 border border-indigo-200/30 shadow-glass p-3.5">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-500 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-[13px] font-semibold text-indigo-700">Generating diagram…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-2 my-1 rounded-xl bg-indigo-50/60 border border-indigo-200/30 shadow-glass animate-spring-in overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full px-3.5 py-2 flex items-center gap-2 hover:bg-indigo-50/80 transition-colors"
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand diagram card' : 'Collapse diagram card'}
      >
        <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-3 h-3 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
            />
          </svg>
        </div>
        <span className="text-[13px] font-semibold text-indigo-700 flex-1 text-left">{title || 'Concept Diagram'}</span>
        <svg
          className={`w-3 h-3 text-indigo-400 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Body */}
      {!collapsed && (
        <div className="px-3.5 pb-3 space-y-2 border-t border-indigo-100/50">
          {description && <p className="text-[12px] text-indigo-700/80 pt-2">{description}</p>}

          {/* Rendered diagram */}
          {svgHtml && (
            <div
              ref={containerRef}
              className="bg-white rounded-lg border border-indigo-100/60 p-3 overflow-x-auto"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(svgHtml, { USE_PROFILES: { svg: true, svgFilters: true } }),
              }}
            />
          )}

          {/* Error state */}
          {error && (
            <div className="bg-red-50 rounded-lg border border-red-200/40 p-2.5">
              <p className="text-[11px] text-red-600">Diagram rendering failed: {error}</p>
              <pre className="text-[10px] text-slate-500 mt-1.5 whitespace-pre-wrap font-mono bg-slate-50 p-2 rounded">
                {syntax}
              </pre>
            </div>
          )}

          {/* Actions */}
          {svgHtml && (
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleCopySvg}
                className="tactile px-2.5 py-1 rounded-lg text-[11px] font-medium text-indigo-600 hover:bg-indigo-100/60 transition-colors flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                Copy SVG
              </button>
            </div>
          )}

          {/* Raw syntax (collapsed by default) */}
          {syntax && !error && (
            <details className="text-[11px]">
              <summary className="text-indigo-400 cursor-pointer hover:text-indigo-600">View source</summary>
              <pre className="mt-1 text-[10px] text-slate-500 whitespace-pre-wrap font-mono bg-slate-50 p-2 rounded border border-slate-100">
                {syntax}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
