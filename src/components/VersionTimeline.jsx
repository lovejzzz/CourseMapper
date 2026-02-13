import React, { useState } from 'react';

export default function VersionTimeline({ versions, activeVersion, onJump }) {
  const [expanded, setExpanded] = useState(false);
  const visibleVersions = expanded ? versions : versions.slice(-8);
  const offset = expanded ? 0 : Math.max(0, versions.length - 8);

  return (
    <div className="glass panel-glow rounded-squircle-sm shadow-glass p-4 animate-spring-in">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          History
          <span className="text-[9px] font-normal text-slate-300">({versions.length})</span>
        </h3>
        {versions.length > 8 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] font-medium text-indigo-400 hover:text-indigo-600 transition-colors duration-300"
          >
            {expanded ? 'Less' : 'All'}
          </button>
        )}
      </div>
      <div className="space-y-1 max-h-[320px] overflow-y-auto pr-1">
        {visibleVersions.map((v, i) => {
          const realIdx = offset + i;
          const isActive = realIdx === activeVersion;
          const time = new Date(v.timestamp);
          const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          return (
            <button
              key={realIdx}
              onClick={() => onJump(realIdx)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-squircle-xs transition-all duration-200 text-left ${
                isActive
                  ? 'bg-indigo-100/80 border border-indigo-300/50 shadow-sm'
                  : 'hover:bg-slate-50/60 border border-transparent'
              }`}
              title={v.label}
            >
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                isActive ? 'bg-indigo-500' : realIdx < activeVersion ? 'bg-emerald-400' : 'bg-slate-300'
              }`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-[11px] font-semibold ${isActive ? 'text-indigo-700' : 'text-slate-500'}`}>
                    v{realIdx + 1}
                  </span>
                  <span className="text-[9px] text-slate-300 flex-shrink-0">{timeStr}</span>
                </div>
                <span className="text-[10px] text-slate-400 truncate block">
                  {v.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
