const STEPS = [
  { id: 'brief', label: 'Brief' },
  { id: 'materials', label: 'Materials' },
  { id: 'generate', label: 'Generate' },
];

export default function SetupProgress({ current }) {
  const currentIndex = Math.max(
    0,
    STEPS.findIndex((step) => step.id === current),
  );

  return (
    <nav aria-label="Course setup progress" className="mx-auto w-full max-w-sm">
      <ol className="grid grid-cols-3 gap-2" data-testid="setup-progress">
        {STEPS.map((step, index) => {
          const complete = index < currentIndex;
          const active = index === currentIndex;
          return (
            <li key={step.id} className="min-w-0" aria-current={active ? 'step' : undefined}>
              <span className="flex min-w-0 items-center justify-center gap-1.5">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-label font-bold ${
                    complete
                      ? 'border-status-success bg-status-success-soft text-status-success'
                      : active
                        ? 'border-accent bg-accent-soft text-accent-text'
                        : 'border-line-strong bg-surface text-ink-faint'
                  }`}
                  aria-hidden="true"
                >
                  {complete ? '✓' : index + 1}
                </span>
                <span className={`text-label font-semibold ${active ? 'text-ink' : 'text-ink-muted'}`}>
                  {step.label}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
