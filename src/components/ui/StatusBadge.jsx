/**
 * Design-system status badge (docs/DESIGN_SYSTEM.md).
 *
 * One status → one look. Replaces the four parallel systems that rendered
 * the same semantics differently (ribbon-chip classes, DELIV_LOG_STYLES,
 * SYNC_TYPE_STYLES, ad-hoc chip markup).
 *
 *   <StatusBadge status="done">Ready</StatusBadge>
 *   <StatusBadge status="error" size="sm">Failed</StatusBadge>
 */
const STATUS_CLASSES = {
  done: 'bg-status-success-soft text-status-success',
  success: 'bg-status-success-soft text-status-success',
  streaming: 'bg-accent-soft text-accent-text',
  info: 'bg-status-info-soft text-status-info',
  warning: 'bg-status-warning-soft text-status-warning',
  stale: 'bg-status-warning-soft text-status-warning',
  error: 'bg-status-danger-soft text-status-danger',
  danger: 'bg-status-danger-soft text-status-danger',
  neutral: 'bg-status-neutral-soft text-status-neutral',
  pending: 'bg-status-neutral-soft text-status-neutral',
};

const SIZE_CLASSES = {
  sm: 'text-2xs px-1.5 py-0.5 gap-1',
  md: 'text-caption px-2 py-0.5 gap-1.5',
};

export default function StatusBadge({
  status = 'neutral',
  size = 'md',
  icon = null,
  className = '',
  children,
  ...rest
}) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-pill font-semibold whitespace-nowrap',
        STATUS_CLASSES[status] || STATUS_CLASSES.neutral,
        SIZE_CLASSES[size] || SIZE_CLASSES.md,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {icon ? <span className="inline-flex shrink-0 items-center">{icon}</span> : null}
      {children}
    </span>
  );
}
