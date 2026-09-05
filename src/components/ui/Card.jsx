/**
 * Design-system card (docs/DESIGN_SYSTEM.md).
 *
 * The standard content container: surface + hairline border + card radius.
 * Padding presets replace the six ad-hoc paddings (p-3 / p-4 / px-6 py-5 /
 * …) audit found across card-shaped divs.
 *
 *   <Card>…</Card>
 *   <Card padding="lg" elevated>…</Card>
 *   <Card as="section" padding="none">…</Card>
 */
const PADDING_CLASSES = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'px-6 py-5',
};

export default function Card({ as: Tag = 'div', padding = 'md', elevated = false, className = '', children, ...rest }) {
  return (
    <Tag
      className={[
        'bg-surface border border-line rounded-card',
        elevated ? 'shadow-glass' : '',
        PADDING_CLASSES[padding] ?? PADDING_CLASSES.md,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </Tag>
  );
}
