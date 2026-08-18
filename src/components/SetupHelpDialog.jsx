import FocusTrap from 'focus-trap-react';

const STEPS = [
  {
    number: '1',
    title: 'Give Scion a clear brief',
    detail: 'Describe the course, learners, length, and outcomes—or attach the syllabus you already use.',
  },
  {
    number: '2',
    title: 'Choose only useful materials',
    detail: 'Course structure is included. Add only the instructor and student materials you need.',
  },
  {
    number: '3',
    title: 'Review the course plan',
    detail: 'Check learner actions, evidence, assumptions, and any decisions that need your judgment.',
  },
  {
    number: '4',
    title: 'Approve and generate',
    detail: 'Keep this tab open while Scion creates and verifies the selected course materials from the approved plan.',
  },
];

export default function SetupHelpDialog({ onClose }) {
  return (
    <FocusTrap
      focusTrapOptions={{
        clickOutsideDeactivates: false,
        // React StrictMode intentionally mounts, unmounts, then remounts the
        // trap in development. Closing from `onDeactivate` made the dialog
        // disappear during that rehearsal before a user could see it.
        escapeDeactivates: false,
      }}
    >
      <div
        className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/55 px-4 py-4 backdrop-blur-sm sm:items-center sm:py-6"
        role="presentation"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <section
          data-testid="setup-help-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="setup-help-title"
          className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:max-h-[calc(100dvh-3rem)] sm:p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-500 dark:text-indigo-300">
                Course setup
              </p>
              <h2 id="setup-help-title" className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">
                From brief to teachable package
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close setup help"
              className="tactile flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <ol className="mt-4 space-y-2.5 sm:mt-5 sm:space-y-3">
            {STEPS.map((step) => (
              <li
                key={step.number}
                className="flex gap-3 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800/70 sm:py-3"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-bold text-white dark:bg-white dark:text-slate-950">
                  {step.number}
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{step.title}</h3>
                  <p className="mt-0.5 text-xs leading-5 text-slate-600 dark:text-slate-300">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>

          <p className="mt-4 text-xs leading-5 text-slate-500 dark:text-slate-400">
            Scion is EduTool’s customized course system: a private evidence compiler plus local public Gemma weights
            when the device supports them. Your course stays in this browser unless you explicitly enable source
            research, export, or save it.
          </p>

          <button
            type="button"
            onClick={onClose}
            className="tactile mt-5 min-h-11 w-full rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            Got it
          </button>
        </section>
      </div>
    </FocusTrap>
  );
}
