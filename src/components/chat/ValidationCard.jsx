import React, { useState } from 'react';

/**
 * ValidationCard — Displays course health validation results in the chat timeline.
 *
 * Shows pedagogical issues (Bloom's mismatches, alignment gaps, cognitive overload,
 * difficulty regression) with severity badges and "Fix" buttons that send
 * suggested prompts to the agent.
 */

const CATEGORY_LABELS = {
  blooms: "Bloom's Alignment",
  alignment: 'Objective Coverage',
  cognitiveLoad: 'Cognitive Load',
  difficulty: 'Difficulty Progression',
};

const SEVERITY_COLORS = {
  error: { dot: 'bg-red-500', text: 'text-red-700' },
  warning: { dot: 'bg-amber-500', text: 'text-amber-700' },
  info: { dot: 'bg-blue-400', text: 'text-blue-600' },
};

function SeverityDot({ severity }) {
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${SEVERITY_COLORS[severity]?.dot || 'bg-slate-400'} flex-shrink-0 mt-1.5`} />;
}

function FindingRow({ finding, onFixClick }) {
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-slate-100/50 last:border-0">
      <SeverityDot severity={finding.severity} />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-slate-700 leading-snug">
          {finding.message}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {finding.lessonIndex != null && (
            <span className="text-[10px] font-medium text-slate-400 bg-slate-100/60 rounded px-1.5 py-0.5">
              Lesson {finding.lessonIndex + 1}
            </span>
          )}
          {finding.suggestedPrompt && (
            <button
              onClick={() => onFixClick(finding.suggestedPrompt)}
              className="text-[10px] font-medium text-indigo-600 bg-indigo-50/70 hover:bg-indigo-100 rounded px-1.5 py-0.5 transition-colors"
            >
              Fix
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ValidationCard({ report, onFixClick }) {
  const [expanded, setExpanded] = useState(true);

  if (!report || report.findings.length === 0) return null;

  const { findings, errorCount, warningCount, infoCount } = report;

  // Header color by worst severity
  const headerBg = errorCount > 0
    ? 'bg-red-50/60 border-red-200/30'
    : warningCount > 0
      ? 'bg-amber-50/60 border-amber-200/30'
      : 'bg-blue-50/60 border-blue-200/30';

  const headerIcon = errorCount > 0
    ? 'text-red-500'
    : warningCount > 0
      ? 'text-amber-500'
      : 'text-blue-400';

  // Group findings by category
  const grouped = {};
  for (const f of findings) {
    const cat = f.category || 'other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(f);
  }

  // Summary text
  const parts = [];
  if (errorCount > 0) parts.push(`${errorCount} error${errorCount !== 1 ? 's' : ''}`);
  if (warningCount > 0) parts.push(`${warningCount} warning${warningCount !== 1 ? 's' : ''}`);
  if (infoCount > 0) parts.push(`${infoCount} note${infoCount !== 1 ? 's' : ''}`);

  return (
    <div className="mx-2 my-1 rounded-xl bg-white/60 border border-slate-200/30 shadow-glass animate-spring-in overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className={`w-full px-4 py-2.5 flex items-center gap-2.5 hover:bg-slate-50/50 transition-colors rounded-t-xl ${headerBg}`}
      >
        {/* Shield icon */}
        <svg className={`w-4 h-4 ${headerIcon} flex-shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <span className="text-[13px] font-semibold text-slate-700 flex-1 text-left">
          Course Health: {parts.join(', ')}
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
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-2 mb-1">
                {CATEGORY_LABELS[cat] || cat}
              </p>
              {items.map((f, i) => (
                <FindingRow key={i} finding={f} onFixClick={onFixClick} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
