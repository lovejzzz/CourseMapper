import React from 'react';

/**
 * NoticeBanner — v0.14.4 WS-E2: the ONE attention-banner shell.
 *
 * The workspace previously carried two hand-rolled amber attention
 * components — the agent panel's "Worth a look" digest card shell and the
 * export panel's amber notice strip. Both now render through this banner so
 * the attention treatment changes in exactly one place.
 *
 * Severity follows the accent rule (slate carries structure, amber/green/red
 * mean status):
 *   - 'info'    → slate shell: a neutral structural notice.
 *   - 'warning' → amber shell: needs human eyes.
 *
 * The banner owns the shell (radius-scale card, border, tint, title row);
 * consumers own the body — pass children for the content and `headerAction`
 * for a right-aligned control (e.g. Dismiss).
 */
const TONES = {
  info: {
    wrap: 'border-slate-200/70 bg-slate-50/60',
    title: 'text-slate-600',
  },
  warning: {
    wrap: 'border-amber-200/60 bg-amber-50/50',
    title: 'text-amber-700 dark:text-amber-300',
  },
};

export default function NoticeBanner({
  severity = 'info',
  title = '',
  headerAction = null,
  children = null,
  className = '',
  dataTestId = 'notice-banner',
}) {
  const tone = TONES[severity] || TONES.info;
  return (
    <div
      data-testid={dataTestId}
      data-severity={severity}
      className={`rounded-lg border px-3 py-2.5 ${tone.wrap} ${className}`}
    >
      {(title || headerAction) && (
        <div className={`flex items-center justify-between gap-2 ${children ? 'mb-2' : ''}`}>
          {title ? <p className={`text-xs font-semibold ${tone.title}`}>{title}</p> : <span />}
          {headerAction}
        </div>
      )}
      {children}
    </div>
  );
}
