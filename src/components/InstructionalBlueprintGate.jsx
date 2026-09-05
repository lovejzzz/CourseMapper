import { useEffect, useRef } from 'react';
import SetupProgress from './SetupProgress.jsx';

function lessonReviewStatus(lesson) {
  if (lesson.questions?.some((question) => question.priority === 'essential')) {
    return { label: 'Needs review', tone: 'amber' };
  }
  if (lesson.evidence?.status !== 'admitted' || lesson.questions?.length || lesson.assumptions?.length) {
    return { label: 'Inferred', tone: 'indigo' };
  }
  return { label: 'Confirmed', tone: 'emerald' };
}

function StatusBadge({ status }) {
  const tone = {
    emerald:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/35 dark:text-emerald-300',
    amber:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/35 dark:text-amber-200',
    indigo:
      'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/70 dark:bg-indigo-950/35 dark:text-indigo-200',
  }[status.tone];

  return (
    <span className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${tone}`}>
      {status.label}
    </span>
  );
}

function LessonIntentRow({ lesson }) {
  const status = lessonReviewStatus(lesson);
  const title = lesson.title.replace(/^Lesson\s+\d+\s*[:.\-–—]?\s*/i, '') || lesson.title;

  return (
    <details
      data-testid={`blueprint-lesson-${lesson.lessonNumber}`}
      className="group min-w-0 max-w-full rounded-xl border border-slate-200/80 bg-white dark:border-slate-700/80 dark:bg-slate-900/70"
    >
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-3 py-3 sm:px-4 [&::-webkit-details-marker]:hidden">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {lesson.lessonNumber}
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block break-words text-xs font-semibold leading-5 text-slate-900 dark:text-slate-100">
            {title}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-slate-500 dark:text-slate-400">
            {lesson.expectedEvidence.artifact || 'Learning evidence planned'}
          </span>
        </span>
        <StatusBadge status={status} />
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
      <div className="grid min-w-0 gap-4 border-t border-slate-100 px-3 py-4 text-xs leading-5 text-slate-600 sm:grid-cols-2 sm:px-4 dark:border-slate-800 dark:text-slate-300">
        {lesson.purpose && (
          <div className="min-w-0 break-words sm:col-span-2">
            <p className="font-semibold text-slate-900 dark:text-slate-100">Why this lesson exists</p>
            <p>{lesson.purpose}</p>
          </div>
        )}
        <div className="min-w-0 break-words">
          <p className="font-semibold text-slate-900 dark:text-slate-100">What learners will do</p>
          <p>{lesson.learnerAction}</p>
        </div>
        <div className="min-w-0 break-words">
          <p className="font-semibold text-slate-900 dark:text-slate-100">How they will demonstrate learning</p>
          <p>{lesson.expectedEvidence.artifact || lesson.expectedEvidence.evidenceRequirement}</p>
        </div>
        {lesson.expectedEvidence.successCriteria.length > 0 && (
          <div className="min-w-0 break-words sm:col-span-2">
            <p className="font-semibold text-slate-900 dark:text-slate-100">What success looks like</p>
            <p>{lesson.expectedEvidence.successCriteria.join(' · ')}</p>
          </div>
        )}
        <div className="min-w-0 break-words sm:col-span-2">
          <p className="font-semibold text-slate-900 dark:text-slate-100">Sources and assumptions</p>
          <p>{lesson.evidence.publicationBoundary || 'Scion will verify evidence before factual drafting.'}</p>
        </div>
      </div>
    </details>
  );
}

function AttentionItem({ eyebrow, title, detail }) {
  return (
    <li className="min-w-0 rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-3 dark:border-amber-900/70 dark:bg-amber-950/20">
      <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">{eyebrow}</p>
      <p className="mt-0.5 break-words text-xs font-semibold leading-5 text-slate-900 dark:text-slate-100">{title}</p>
      {detail && <p className="mt-1 break-words text-[11px] leading-4 text-slate-600 dark:text-slate-300">{detail}</p>}
    </li>
  );
}

export default function InstructionalBlueprintGate({ review, busy = false, error = '', onApprove, onEditMap }) {
  const titleRef = useRef(null);

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [review?.planReceiptSha256]);

  if (!review) return null;
  const researchCount = Math.max(0, Number(review.researchRequiredCount) || 0);
  const questions = Array.isArray(review.questions) ? review.questions : [];
  const assumptions = Array.isArray(review.assumptions) ? review.assumptions : [];
  const assumptionGroups = Object.values(
    assumptions.reduce((groups, assumption) => {
      const key = assumption.lessonId || `lesson-${assumption.lessonNumber || 'course'}`;
      const current = groups[key] || {
        lessonId: assumption.lessonId,
        lessonNumber: assumption.lessonNumber,
        policies: [],
        signals: [],
      };
      if (assumption.policy && !current.policies.includes(assumption.policy)) current.policies.push(assumption.policy);
      if (assumption.signal && !current.signals.includes(assumption.signal)) current.signals.push(assumption.signal);
      groups[key] = current;
      return groups;
    }, {}),
  );
  const attentionCount = questions.length + assumptionGroups.length;
  const throughlineConcepts = Array.isArray(review.course?.throughlineConcepts)
    ? review.course.throughlineConcepts
    : [];

  return (
    <section
      data-testid="instructional-blueprint-gate"
      aria-labelledby="instructional-blueprint-title"
      className="mx-auto min-w-0 max-w-5xl overflow-visible pb-28 sm:pb-8"
    >
      <SetupProgress current="review" />

      <div className="mx-auto mt-8 max-w-3xl text-center sm:mt-10">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-300">
          Course plan ready
        </p>
        <h2
          id="instructional-blueprint-title"
          className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl dark:text-white"
        >
          Review the course plan
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
          Confirm what learners will do and how they will demonstrate learning before Scion creates the complete course
          package.
        </p>
      </div>

      <p ref={titleRef} tabIndex={-1} className="sr-only focus-visible:!outline-none" aria-live="polite">
        {attentionCount > 0
          ? `${attentionCount} item${attentionCount === 1 ? '' : 's'} need your attention.`
          : 'The course plan has no unresolved decisions.'}
      </p>

      <div className="mt-7 grid min-w-0 gap-4 rounded-2xl border border-slate-200/80 bg-white/85 p-4 shadow-sm sm:grid-cols-3 sm:p-5 dark:border-slate-700/80 dark:bg-slate-950/65">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Course structure</p>
          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
            {review.course.lessonCount} lesson{review.course.lessonCount === 1 ? '' : 's'}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {researchCount > 0
              ? `${researchCount} lesson${researchCount === 1 ? '' : 's'} will receive source research`
              : 'Evidence is ready for the planned lessons'}
          </p>
        </div>
        <div className="min-w-0 sm:border-l sm:border-slate-100 sm:pl-5 dark:sm:border-slate-800">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Course throughline</p>
          <p className="mt-1 break-words text-xs font-medium leading-5 text-slate-700 dark:text-slate-200">
            {throughlineConcepts.length > 0
              ? throughlineConcepts.join(' · ')
              : 'Progression follows the supplied course sequence.'}
          </p>
        </div>
        <div className="min-w-0 sm:border-l sm:border-slate-100 sm:pl-5 dark:sm:border-slate-800">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Culminating evidence</p>
          <p className="mt-1 break-words text-xs font-medium leading-5 text-slate-700 dark:text-slate-200">
            {review.course.culminatingEvidence || 'The final evidence will be aligned to the course sequence.'}
          </p>
        </div>
      </div>

      {attentionCount > 0 ? (
        <section aria-labelledby="blueprint-attention-title" className="mt-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 id="blueprint-attention-title" className="text-sm font-bold text-slate-950 dark:text-white">
                Needs your attention
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Review the decisions and assumptions Scion will keep visible in the generated package.
              </p>
            </div>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
              {attentionCount} item{attentionCount === 1 ? '' : 's'}
            </span>
          </div>
          <ul className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2">
            {questions.map((question) => (
              <AttentionItem
                key={`${question.lessonId}-${question.id}`}
                eyebrow={`Lesson ${question.lessonNumber || ''} · Decision`}
                title={question.prompt}
                detail={
                  question.priority === 'essential'
                    ? 'Scion will preserve this limitation until source evidence is admitted.'
                    : ''
                }
              />
            ))}
            {assumptionGroups.map((assumption) => (
              <AttentionItem
                key={assumption.lessonId || assumption.lessonNumber}
                eyebrow={`Lesson ${assumption.lessonNumber || ''} · Assumption`}
                title={assumption.policies.join(' ') || 'Scion made a bounded instructional assumption.'}
                detail={assumption.signals.join(' · ')}
              />
            ))}
          </ul>
        </section>
      ) : (
        <div className="mt-6 rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-4 py-3 dark:border-emerald-900/70 dark:bg-emerald-950/20">
          <p className="text-xs font-bold text-emerald-800 dark:text-emerald-200">No unresolved decisions</p>
          <p className="mt-0.5 text-xs text-emerald-800/80 dark:text-emerald-200/80">
            The supplied course information supports this plan. You can still inspect any lesson below.
          </p>
        </div>
      )}

      <section aria-labelledby="blueprint-lessons-title" className="mt-7">
        <div>
          <h3 id="blueprint-lessons-title" className="text-sm font-bold text-slate-950 dark:text-white">
            Lesson plan
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Open a lesson to inspect its purpose, learner action, evidence, and success criteria.
          </p>
        </div>
        <div className="mt-3 grid min-w-0 max-w-full gap-2">
          {review.lessonIntents.map((lesson) => (
            <LessonIntentRow key={lesson.id || lesson.lessonNumber} lesson={lesson} />
          ))}
        </div>
      </section>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-950/30 dark:text-red-200"
        >
          {error}
        </p>
      )}

      <details className="mt-5 rounded-xl border border-slate-200/80 bg-white/65 px-3 py-2.5 dark:border-slate-700/80 dark:bg-slate-900/45">
        <summary className="cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-300">
          What this approval means
        </summary>
        <p className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">{review.claimBoundary}</p>
      </details>

      <div className="fixed inset-x-3 bottom-3 z-20 mx-auto flex max-w-5xl flex-col-reverse gap-2 rounded-2xl border border-slate-200/80 bg-white/95 p-3 shadow-xl shadow-slate-950/10 backdrop-blur-xl sm:sticky sm:inset-x-auto sm:bottom-3 sm:mt-6 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700 dark:bg-slate-950/95">
        <button
          type="button"
          onClick={onEditMap}
          disabled={busy}
          className="tactile min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:border-indigo-200 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          Edit Course Map
        </button>
        <div className="flex min-w-0 flex-col sm:items-end">
          <button
            type="button"
            onClick={onApprove}
            disabled={busy || review.canApprove !== true}
            className="tactile min-h-11 rounded-xl bg-slate-950 px-5 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-400 dark:text-slate-950 dark:hover:bg-indigo-300"
          >
            {busy ? 'Starting generation…' : 'Approve plan and generate'}
          </button>
          <p className="mt-1.5 hidden text-[10px] text-slate-500 sm:block dark:text-slate-400">
            Creates the selected materials from this exact plan.
          </p>
        </div>
      </div>
    </section>
  );
}
