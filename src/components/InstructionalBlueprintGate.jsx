function EvidenceBadge({ status }) {
  const admitted = status === 'admitted';
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        admitted
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
          : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
      }`}
    >
      {admitted ? 'Evidence admitted' : 'Research after approval'}
    </span>
  );
}

function LessonIntentRow({ lesson }) {
  return (
    <details
      data-testid={`blueprint-lesson-${lesson.lessonNumber}`}
      className="group min-w-0 max-w-full rounded-lg border border-slate-200/80 bg-white/70 dark:border-slate-700/80 dark:bg-slate-900/55"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {lesson.lessonNumber}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
          {lesson.title.replace(/^Lesson\s+\d+\s*[:.\-–—]?\s*/i, '') || lesson.title}
        </span>
        <EvidenceBadge status={lesson.evidence.status} />
        <svg
          className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="grid min-w-0 gap-3 border-t border-slate-100 px-3 py-3 text-xs leading-5 text-slate-600 sm:grid-cols-2 dark:border-slate-800 dark:text-slate-300">
        <div className="min-w-0 break-words">
          <p className="font-semibold text-slate-800 dark:text-slate-100">Learners will</p>
          <p>{lesson.learnerAction}</p>
        </div>
        <div className="min-w-0 break-words">
          <p className="font-semibold text-slate-800 dark:text-slate-100">Evidence of learning</p>
          <p>{lesson.expectedEvidence.artifact || lesson.expectedEvidence.evidenceRequirement}</p>
        </div>
        {lesson.focusConcepts.length > 0 && (
          <div className="min-w-0 break-words">
            <p className="font-semibold text-slate-800 dark:text-slate-100">Focus</p>
            <p>{lesson.focusConcepts.join(' · ')}</p>
          </div>
        )}
        <div className="min-w-0 break-words">
          <p className="font-semibold text-slate-800 dark:text-slate-100">Evidence boundary</p>
          <p>{lesson.evidence.publicationBoundary || 'Evidence will be admitted before factual drafting.'}</p>
        </div>
        {lesson.expectedEvidence.successCriteria.length > 0 && (
          <div className="min-w-0 break-words sm:col-span-2">
            <p className="font-semibold text-slate-800 dark:text-slate-100">Success looks like</p>
            <p>{lesson.expectedEvidence.successCriteria.join(' · ')}</p>
          </div>
        )}
      </div>
    </details>
  );
}

export default function InstructionalBlueprintGate({ review, busy = false, error = '', onApprove, onEditMap }) {
  if (!review) return null;
  const researchCount = Math.max(0, Number(review.researchRequiredCount) || 0);
  const questionCount = Array.isArray(review.questions) ? review.questions.length : 0;
  const assumptionCount = Array.isArray(review.assumptions) ? review.assumptions.length : 0;

  return (
    <section
      data-testid="instructional-blueprint-gate"
      aria-labelledby="instructional-blueprint-title"
      className="min-w-0 max-w-full overflow-hidden rounded-xl border border-indigo-200/80 bg-gradient-to-b from-indigo-50/80 to-white p-4 shadow-sm sm:p-5 dark:border-indigo-800/70 dark:from-indigo-950/30 dark:to-slate-900"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-200">
              Drafting paused
            </span>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {review.course.lessonCount} lessons ·{' '}
              {researchCount ? `${researchCount} need research` : 'evidence ready'}
            </span>
          </div>
          <h2 id="instructional-blueprint-title" className="text-base font-bold text-slate-900 dark:text-white">
            Review the instructional blueprint
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600 dark:text-slate-300">
            Scion mapped what learners will do and what evidence should demonstrate learning. Approve this direction
            before it drafts the package.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={onEditMap}
            disabled={busy}
            className="tactile rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-indigo-200 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            Edit map
          </button>
          <button
            type="button"
            onClick={onApprove}
            disabled={busy || review.canApprove !== true}
            className="tactile rounded-lg bg-slate-950 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:text-slate-950 dark:hover:bg-indigo-400"
          >
            {busy ? 'Starting build…' : 'Approve & build package'}
          </button>
        </div>
      </div>

      {(questionCount > 0 || assumptionCount > 0) && (
        <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-medium text-slate-600 dark:text-slate-300">
          {questionCount > 0 && (
            <span className="rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900/70">
              {questionCount} open decision{questionCount === 1 ? '' : 's'}
            </span>
          )}
          {assumptionCount > 0 && (
            <span className="rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900/70">
              {assumptionCount} visible assumption{assumptionCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
      )}

      <div className="mt-4 grid min-w-0 max-w-full gap-2">
        {review.lessonIntents.map((lesson) => (
          <LessonIntentRow key={lesson.id || lesson.lessonNumber} lesson={lesson} />
        ))}
      </div>

      {questionCount > 0 && (
        <details className="mt-3 rounded-lg border border-amber-200/80 bg-amber-50/65 px-3 py-2 dark:border-amber-900/70 dark:bg-amber-950/25">
          <summary className="cursor-pointer text-xs font-semibold text-amber-900 dark:text-amber-100">
            Decisions Scion will keep visible
          </summary>
          <ul className="mt-2 space-y-1.5 pl-4 text-xs leading-5 text-amber-900/85 dark:text-amber-100/85">
            {review.questions.map((question) => (
              <li key={`${question.lessonId}-${question.id}`} className="list-disc">
                {question.prompt}
              </li>
            ))}
          </ul>
        </details>
      )}

      {error && (
        <p role="alert" className="mt-3 text-xs font-medium text-red-600 dark:text-red-300">
          {error}
        </p>
      )}
      <p className="mt-3 text-[11px] leading-4 text-slate-500 dark:text-slate-400">{review.claimBoundary}</p>
    </section>
  );
}
