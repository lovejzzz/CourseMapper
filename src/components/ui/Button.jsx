/**
 * Design-system button (docs/DESIGN_SYSTEM.md).
 *
 * One place for the interactive-control look the app previously reinvented
 * per file (~15 hand-rolled variants across ExportBar, ExportSidePanel,
 * Header, FeatureSelect…). Every variant carries a visible focus-visible
 * ring and the shared control radius/type scale.
 *
 *   <Button>Continue</Button>
 *   <Button variant="secondary" size="sm" icon={<SunIcon />}>Theme</Button>
 *   <Button variant="ghost" aria-label="Close" icon={<XIcon />} />
 */
const VARIANT_CLASSES = {
  primary:
    'bg-accent-strong text-white border border-transparent hover:bg-accent shadow-btn disabled:bg-surface-alt2 disabled:text-ink-faint disabled:shadow-none',
  secondary:
    'bg-surface text-ink-tertiary border border-line-strong hover:bg-surface-alt hover:text-ink-secondary disabled:text-ink-faint',
  accent:
    'bg-accent-soft text-accent-text border border-accent/20 hover:bg-accent-soft hover:border-accent/40 disabled:text-ink-faint',
  ghost:
    'bg-transparent text-ink-muted border border-transparent hover:bg-surface-dim hover:text-ink-secondary disabled:text-ink-faint',
  danger:
    'bg-status-danger-soft text-status-danger border border-transparent hover:border-status-danger/30 disabled:text-ink-faint',
};

const SIZE_CLASSES = {
  sm: 'text-label px-2.5 py-1.5 gap-1.5 rounded-ctl',
  md: 'text-body font-medium px-3.5 py-2 gap-2 rounded-ctl',
  lg: 'text-body-lg font-medium px-5 py-2.5 gap-2 rounded-card',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  icon = null,
  className = '',
  type = 'button',
  children,
  ...rest
}) {
  return (
    <button
      type={type}
      className={[
        'inline-flex items-center justify-center font-medium transition-colors duration-150 select-none',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'disabled:cursor-not-allowed',
        VARIANT_CLASSES[variant] || VARIANT_CLASSES.primary,
        SIZE_CLASSES[size] || SIZE_CLASSES.md,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {icon ? <span className="inline-flex shrink-0 items-center">{icon}</span> : null}
      {children}
    </button>
  );
}
