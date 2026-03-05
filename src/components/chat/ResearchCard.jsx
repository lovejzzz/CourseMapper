import React, { useState } from 'react';

/**
 * ResearchCard — Shows academic search results inline in the chat timeline.
 *
 * States:
 *   - searching: animated spinner with query text
 *   - complete: collapsible result cards grouped by source
 *   - error: red error banner
 */

function ResultItem({ item, source }) {
  const isWiki = source === 'Wikipedia';
  return (
    <div className="flex gap-2 py-1.5 border-b border-slate-100/50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-slate-700 leading-snug line-clamp-2">
          {item.url ? (
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600 hover:underline">
              {item.title}
            </a>
          ) : item.title}
        </p>
        {!isWiki && item.authors && (
          <p className="text-[11px] text-slate-500 truncate">{item.authors}</p>
        )}
        {isWiki && item.snippet && (
          <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{item.snippet}</p>
        )}
        <div className="flex items-center gap-2 mt-0.5">
          {item.year && (
            <span className="text-[10px] text-slate-400 font-medium">{item.year}</span>
          )}
          {!isWiki && item.citationCount > 0 && (
            <span className="text-[10px] text-indigo-500 font-medium">
              {item.citationCount} citations
            </span>
          )}
          {item.doi && (
            <a
              href={item.doi.startsWith('http') ? item.doi : `https://doi.org/${item.doi}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-indigo-500 hover:text-indigo-700 font-medium"
            >
              DOI
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResearchCard({ research, status }) {
  const [expanded, setExpanded] = useState(status === 'searching');

  if (!research) return null;

  const totalCount = (research.results || []).reduce(
    (sum, g) => sum + (g.items?.length || 0), 0
  );

  // ── Searching state ──
  if (status === 'searching') {
    return (
      <div className="mx-2 my-1 px-4 py-3 rounded-xl bg-violet-50/60 border border-violet-200/30 animate-spring-in">
        <div className="flex items-center gap-2.5">
          <svg className="animate-spin w-4 h-4 text-violet-500 flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <div>
            <p className="text-[13px] font-medium text-violet-700">
              Researching: &ldquo;{research.query}&rdquo;
            </p>
            {research.reason && (
              <p className="text-[11px] text-violet-500 mt-0.5">{research.reason}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (status === 'error') {
    return (
      <div className="mx-2 my-1 px-4 py-3 rounded-xl bg-red-50/60 border border-red-200/30 animate-spring-in">
        <div className="flex items-center gap-2.5">
          <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div>
            <p className="text-[13px] font-medium text-red-700">
              Search failed for &ldquo;{research.query}&rdquo;
            </p>
            {research.error && (
              <p className="text-[11px] text-red-500 mt-0.5">{research.error}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Complete state ──
  return (
    <div className="mx-2 my-1 rounded-xl bg-white/60 border border-slate-200/30 shadow-glass animate-spring-in overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full px-4 py-2.5 flex items-center gap-2.5 hover:bg-slate-50/50 transition-colors"
      >
        <svg className="w-4 h-4 text-violet-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="text-[13px] font-semibold text-slate-700 flex-1 text-left">
          Found {totalCount} result{totalCount !== 1 ? 's' : ''} for &ldquo;{research.query}&rdquo;
        </span>
        <svg
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Collapsible body */}
      {expanded && (
        <div className="px-4 pb-3 space-y-2 border-t border-slate-100/50">
          {(research.results || []).map((group, gi) => {
            if (!group.items || group.items.length === 0) return null;
            return (
              <div key={gi}>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-2 mb-1">
                  {group.source}
                </p>
                {group.items.map((item, ii) => (
                  <ResultItem key={ii} item={item} source={group.source} />
                ))}
              </div>
            );
          })}
          {totalCount === 0 && (
            <p className="text-[12px] text-slate-400 py-2">No results found.</p>
          )}
        </div>
      )}
    </div>
  );
}
