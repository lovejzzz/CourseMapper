import React, { useState, useMemo } from 'react';
import { buildChartUrl } from '../../lib/chartGenerator';

/**
 * ChartCard — Renders a chart image in chat from a QuickChart URL.
 * Shows the generated chart with download and copy buttons.
 */
export default function ChartCard({ chart, status }) {
  const [collapsed, setCollapsed] = useState(false);
  const [imgError, setImgError] = useState(false);

  const chartUrl = useMemo(() => {
    if (!chart) return null;
    try {
      return buildChartUrl(chart);
    } catch {
      return null;
    }
  }, [chart]);

  if (status === 'searching') {
    return (
      <div className="mx-2 my-1 rounded-xl bg-violet-50/60 border border-violet-200/30 shadow-glass animate-spring-in p-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-violet-500 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-[13px] font-semibold text-violet-700">Generating chart...</span>
        </div>
      </div>
    );
  }

  if (!chart || !chartUrl) return null;

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = chartUrl;
    a.download = `${(chart.title || 'chart').replace(/[^a-zA-Z0-9]/g, '_')}.png`;
    a.target = '_blank';
    a.click();
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(chartUrl);
  };

  return (
    <div className="mx-2 my-1 rounded-xl bg-violet-50/60 border border-violet-200/30 shadow-glass animate-spring-in overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full px-3.5 py-2 flex items-center gap-2 hover:bg-violet-50/80 transition-colors"
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand chart card' : 'Collapse chart card'}
      >
        <div className="w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-3 h-3 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <span className="text-[13px] font-semibold text-violet-700 flex-1 text-left">
          {chart.title || 'Chart'}
        </span>
        <svg
          className={`w-3 h-3 text-violet-400 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Body */}
      {!collapsed && (
        <div className="px-3.5 pb-3 space-y-2 border-t border-violet-100/50">
          {chart.description && (
            <p className="text-[12px] text-violet-800 pt-2">{chart.description}</p>
          )}

          {/* Chart image */}
          <div className="bg-white rounded-lg border border-violet-100 p-2 flex items-center justify-center">
            {imgError ? (
              <p className="text-[12px] text-red-500 py-4">Failed to load chart. Try again.</p>
            ) : (
              <img
                src={chartUrl}
                alt={chart.title || 'Chart'}
                className="max-w-full h-auto rounded"
                onError={() => setImgError(true)}
                loading="lazy"
              />
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="tactile px-3 py-1 rounded-lg text-[12px] font-semibold text-white bg-violet-500 hover:bg-violet-600 shadow-sm transition-colors"
            >
              Download PNG
            </button>
            <button
              onClick={handleCopyUrl}
              className="tactile px-3 py-1 rounded-lg text-[12px] font-medium text-violet-600 hover:bg-violet-100/60 transition-colors"
            >
              Copy URL
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
