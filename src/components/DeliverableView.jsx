import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import FocusTrap from 'focus-trap-react';
import GenericDeliverableView from './GenericDeliverableView';
import {
  QualityBadge,
  updatePath,
  StreamingBanner,
  ErrorState,
  WaitingState,
  EmptyState,
  ViewportContext,
} from './deliverables/shared/SharedComponents';
import LessonPlansView from './deliverables/LessonPlansView';
import RubricsView from './deliverables/RubricsView';
import SlideDecksView from './deliverables/SlideDecksView';
import QuizBankView from './deliverables/QuizBankView';
import DiscussionsView from './deliverables/DiscussionsView';
import AssignmentsView from './deliverables/AssignmentsView';
import StudyGuidesView from './deliverables/StudyGuidesView';
import SyllabusView from './deliverables/SyllabusView';
import CourseFaqView from './deliverables/CourseFaqView';
import { normalizeRubricCoverage, normalizeRubricSupport } from '../lib/deliverablePostProcess';
import { classifyAssessmentKind } from '../lib/courseGraph/deriveFromCourseMap';
import { renderedDeliverableCollection } from '../lib/renderedDeliverableRoot.js';

// ── v0.14.1 (3.5): assessment focus helpers ─────────────────────────────────
// "Lesson 7" / "Week 7" mentions on a deliverable item resolve its lesson
// number (compiled items also carry an explicit lessonNumber).
export function parseItemLessonNumber(item) {
  if (Number.isInteger(item?.lessonNumber) && item.lessonNumber > 0) return item.lessonNumber;
  const probes = [
    item?.lessonTitle,
    item?.lt,
    item?.dueWeek,
    item?.lesson,
    item?.title,
    ...(Array.isArray(item?.relatedLessons) ? item.relatedLessons : []),
  ];
  for (const probe of probes) {
    const match = String(probe || '').match(/(?:Lesson|Week)\s*(\d+)/i);
    if (match) return Number(match[1]);
  }
  return null;
}

const FOCUS_HIGHLIGHT_CLASSES = ['ring-2', 'ring-amber-400', 'ring-inset', 'rounded-squircle-xs'];

function courseMapAssessmentAtoms(courseMap) {
  return (courseMap?.lessons || []).flatMap((lesson, lessonIndex) =>
    (lesson?.sections || []).flatMap((section) => {
      const value = section?.weeklyAssessments;
      const atoms = Array.isArray(value) ? value : String(value || '').split(/\n|;/);
      return atoms
        .map((title) => String(title || '').trim())
        .filter(Boolean)
        .map((title) => ({ lessonNumber: lessonIndex + 1, title }));
    }),
  );
}

export function getCoverageGap(featureId, data, courseMap) {
  if (!data || !courseMap) return null;

  if (featureId === 'rubrics') {
    const coverage = normalizeRubricCoverage(data, courseMap);
    if (!coverage?.addedRubrics) return null;
    return {
      missing: coverage.missingLessonNumbers || [],
      repairedData: normalizeRubricSupport(coverage.data).data,
      autoRepairable: true,
    };
  }

  if (featureId !== 'assignments') return null;

  const arr = data?.assignments;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const totalLessons = courseMap?.lessons?.length || 0;
  if (totalLessons < 2) return null;

  const coveredNums = new Set();
  arr.forEach((item) => {
    const titleStr = item?.lessonTitle || item?.title || item?.lesson || '';
    const m = String(titleStr).match(/(?:Lesson|Week)\s*(\d+)/i);
    if (m) coveredNums.add(parseInt(m[1], 10));
    const related = item?.relatedLessons;
    if (Array.isArray(related)) {
      related.forEach((r) => {
        const rm = String(r).match(/(?:Lesson|Week)\s*(\d+)/i);
        if (rm) coveredNums.add(parseInt(rm[1], 10));
      });
    }
  });
  if (coveredNums.size === 0) return null;

  const scheduledGradedLessons = new Set(
    courseMapAssessmentAtoms(courseMap)
      .filter((entry) => classifyAssessmentKind(entry.title) !== 'in-class')
      .map((entry) => entry.lessonNumber),
  );
  if (scheduledGradedLessons.size === 0) return null;
  const missing = [...scheduledGradedLessons].filter((lessonNumber) => !coveredNums.has(lessonNumber));
  return missing.length > 0 ? { missing, autoRepairable: false } : null;
}

export default function DeliverableView({
  viewportRef,
  featureId,
  data,
  status,
  error,
  regeneratingIndex,
  courseMapStatus,
  isDelivGenerating,
  currentDelivFeatures,
  onDataChange,
  onRegenerateLesson,
  onRetry,
  onAddLessons,
  courseMap,
  lessonScope,
  isStudentView,
  onSaveToBank,
  qualityScore,
  freshLessonIndices,
  proposals,
  onAcceptProposal,
  onDismissProposal,
  onRegenerateProposal,
  isStale,
  staleConfidence,
  onSyncNow,
  slideTheme,
  onSlideThemeChange,
}) {
  // ── All hooks MUST come before any early returns (Rules of Hooks) ──
  // Feature 4.1 — Tier detection + toggle state
  const [activeTier, setActiveTier] = useState('standard'); // 'scaffolded' | 'standard' | 'extension'

  // Shared focus: report which lesson card the instructor interacts with so
  // the chat agent's "ON SCREEN NOW" context tracks the visible artifact.
  const viewportContextValue = useMemo(
    () => ({
      report: (itemIndex) => {
        if (viewportRef) viewportRef.current = { featureId, itemIndex };
      },
    }),
    [viewportRef, featureId],
  );
  useEffect(() => {
    if (viewportRef) viewportRef.current = null;
  }, [viewportRef, featureId]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const hasTiers = useMemo(() => {
    if (!data) return false;
    const TIERED_DELIVERABLES = ['lessonPlans', 'quizBank', 'discussions', 'assignments', 'studyGuides'];
    if (!TIERED_DELIVERABLES.includes(featureId)) return false;
    const arr = renderedDeliverableCollection(featureId, data);
    return Array.isArray(arr) && arr.length > 0 && arr[0]?.tiers != null;
  }, [data, featureId]);
  const isStreaming = status === 'streaming';
  const coverageGap = useMemo(
    () =>
      status === 'done' && !isStreaming && (featureId === 'rubrics' || featureId === 'assignments')
        ? getCoverageGap(featureId, data, courseMap)
        : null,
    [courseMap, data, featureId, isStreaming, status],
  );

  useEffect(() => {
    if (
      status !== 'done' ||
      isStreaming ||
      featureId !== 'rubrics' ||
      !coverageGap?.autoRepairable ||
      !coverageGap.repairedData ||
      typeof onDataChange !== 'function'
    ) {
      return;
    }
    onDataChange(coverageGap.repairedData);
  }, [coverageGap, featureId, isStreaming, onDataChange, status]);

  // ── v0.14.1 (3.5): course-map assessment chips land here ──
  // The focus router switches the tab, then re-dispatches focus-deliverable-item;
  // scroll to the matching item anchor and transiently highlight it (mirror of
  // CourseMapPreview's focus-coursemap-cell listener: same 120ms settle, same
  // amber ring, timed clear, cleanup on unmount).
  const contentRef = useRef(null);
  const focusTimersRef = useRef([]);
  useEffect(() => {
    const clearTimers = () => {
      focusTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      focusTimersRef.current = [];
    };

    const handleFocusItem = (event) => {
      const detail = event.detail || {};
      if (detail.featureId && detail.featureId !== featureId) return;

      const settleTimer = window.setTimeout(() => {
        const anchors = Array.from(contentRef.current?.querySelectorAll('[data-assessment-anchor="true"]') || []);
        if (anchors.length === 0) return;
        const probeTitle = String(detail.title || '')
          .trim()
          .toLowerCase();
        const match =
          (detail.assessmentId &&
            anchors.find((anchor) => anchor.dataset.assessmentId === String(detail.assessmentId))) ||
          (probeTitle &&
            anchors.find((anchor) => (anchor.dataset.assessmentTitle || '').toLowerCase().includes(probeTitle))) ||
          (Number.isInteger(detail.lessonNumber) &&
            anchors.find((anchor) => Number(anchor.dataset.lessonNumber) === detail.lessonNumber)) ||
          null;
        if (!match) return;

        match.scrollIntoView({ behavior: 'smooth', block: 'center' });
        match.classList.add(...FOCUS_HIGHLIGHT_CLASSES);
        const highlightTimer = window.setTimeout(() => {
          match.classList.remove(...FOCUS_HIGHLIGHT_CLASSES);
        }, 5000);
        focusTimersRef.current.push(highlightTimer);
      }, 120);
      focusTimersRef.current.push(settleTimer);
    };

    window.addEventListener('coursemapper:focus-deliverable-item', handleFocusItem);
    return () => {
      window.removeEventListener('coursemapper:focus-deliverable-item', handleFocusItem);
      clearTimers();
    };
  }, [featureId]);

  // Reverse direction: "Show in course map" on an item header dispatches the
  // EXISTING focus-coursemap-cell event with the item's Weekly Assessments
  // cell coordinates (the preview's listener handles scroll + highlight; the
  // focus router switches the tab first when the map is hidden).
  const handleShowInCourseMap = useCallback(
    (item) => {
      const lessons = courseMap?.lessons || [];
      const lessonNumber = parseItemLessonNumber(item);
      const lessonIndex = Number.isInteger(lessonNumber)
        ? Math.min(Math.max(lessonNumber - 1, 0), Math.max(lessons.length - 1, 0))
        : 0;
      const sections = lessons[lessonIndex]?.sections || [];
      const probe = String(item?.title || item?.t || '')
        .trim()
        .toLowerCase();
      let sectionIndex = probe
        ? sections.findIndex((section) =>
            String(section?.weeklyAssessments || '')
              .toLowerCase()
              .includes(probe),
          )
        : -1;
      if (sectionIndex < 0) {
        sectionIndex = sections.findIndex((section) => String(section?.weeklyAssessments || '').trim());
      }
      window.dispatchEvent(
        new CustomEvent('coursemapper:focus-coursemap-cell', {
          detail: {
            type: 'courseMapCell',
            lessonIndex,
            sectionIndex: Math.max(sectionIndex, 0),
            field: 'weeklyAssessments',
          },
        }),
      );
    },
    [courseMap],
  );

  // ── Early returns (after all hooks) ──
  if (status === 'error') return <ErrorState error={error} onRetry={onRetry} />;

  // Show waiting state when course map is still building or deliverables are generating
  if (!data && status !== 'streaming') {
    if (courseMapStatus && courseMapStatus !== 'done' && courseMapStatus !== 'idle' && courseMapStatus !== 'error') {
      return <WaitingState stage="courseMap" />;
    }
    if (isDelivGenerating && currentDelivFeatures?.has(featureId)) {
      return <WaitingState stage="generating" />;
    }
    return <EmptyState featureId={featureId} onGenerate={onRetry} />;
  }

  const editable = status === 'done' && !!onDataChange;

  function onEdit(path, value) {
    if (!onDataChange) return;
    // Pass the edit path as 2nd argument so App can route it to the reactive sync engine
    onDataChange(updatePath(data, path, value), path);
  }

  const editProps = editable ? { onEdit } : {};

  const viewProps = {
    data,
    isStreaming,
    regeneratingIndex: regeneratingIndex ?? null,
    onRegenerateLesson,
    isStudentView,
    onSaveToBank,
    activeTier: hasTiers ? activeTier : 'standard',
    freshLessonIndices: freshLessonIndices ?? null,
    proposals: proposals ?? {},
    onAcceptProposal,
    onDismissProposal,
    onRegenerateProposal,
    slideTheme,
    onSlideThemeChange,
    onShowInCourseMap: handleShowInCourseMap,
    // v0.14.4 (D1): lesson-grouped views label their group headers with the
    // course map's lesson titles ("Lesson 7 — Sampling Distributions").
    courseMap,
    ...editProps,
  };

  const isSlides = featureId === 'slideDecks';

  // Determine if there are un-generated lessons the user could add
  const allLessonCount = courseMap?.lessons?.length || 0;
  const generatedCount = Array.isArray(lessonScope)
    ? lessonScope.length
    : lessonScope === 'all' || !lessonScope
      ? allLessonCount
      : allLessonCount;
  const hasMissingLessons =
    onAddLessons && status === 'done' && Array.isArray(lessonScope) && lessonScope.length < allLessonCount;

  const deliverableContent = (
    <>
      {/* Feature 6.3 — Quality badge + fullscreen toggle */}
      {status === 'done' && (
        <div className="flex items-center justify-end gap-2 px-4 pt-2 pb-0">
          {qualityScore && <QualityBadge quality={qualityScore} />}
          {!isSlides && (
            <button
              onClick={() => setIsFullscreen((f) => !f)}
              className="tactile hidden rounded-lg p-1.5 text-slate-400 transition-all hover:bg-white/60 hover:text-indigo-500 sm:flex"
              title={isFullscreen ? 'Exit full screen' : 'Full screen'}
              aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
            >
              {isFullscreen ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 9L4 4m0 0h4M4 4v4m11 11l5 5m0 0h-4m4 0v-4M9 15l-5 5m0 0h4m-4 0v-4m11-11l5-5m0 0h-4m4 0v4"
                  />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"
                  />
                </svg>
              )}
            </button>
          )}
        </div>
      )}
      {/* Stale banner — shown when this deliverable is out of sync with recent edits */}
      {/* Change #3: Confidence-aware banner coloring and messaging */}
      {isStale && !isStreaming && (
        <div
          className={`mx-4 mt-2 mb-1 flex items-center gap-2.5 px-4 py-2.5 rounded-squircle-xs backdrop-blur-sm ${
            staleConfidence?.level === 'high'
              ? 'bg-amber-50/80 border border-amber-200/50'
              : staleConfidence?.level === 'medium'
                ? 'bg-yellow-50/80 border border-yellow-200/50'
                : 'bg-slate-50/80 border border-slate-200/50'
          }`}
        >
          <svg
            className={`w-4 h-4 flex-shrink-0 ${
              staleConfidence?.level === 'high'
                ? 'text-amber-500'
                : staleConfidence?.level === 'medium'
                  ? 'text-yellow-500'
                  : 'text-slate-400'
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <p
            className={`text-xs font-medium flex-1 ${
              staleConfidence?.level === 'high'
                ? 'text-amber-700'
                : staleConfidence?.level === 'medium'
                  ? 'text-yellow-700'
                  : 'text-slate-500'
            }`}
          >
            {staleConfidence?.level === 'high'
              ? 'This deliverable is likely out of sync — a core field was changed.'
              : staleConfidence?.level === 'medium'
                ? 'This deliverable may be slightly out of sync with recent edits.'
                : 'A minor change was detected — this deliverable may not need updating.'}
          </p>
          {onSyncNow && (
            <button
              onClick={onSyncNow}
              className={`flex-shrink-0 text-xs font-bold underline underline-offset-2 transition-colors ${
                staleConfidence?.level === 'high'
                  ? 'text-amber-600 hover:text-amber-800'
                  : staleConfidence?.level === 'medium'
                    ? 'text-yellow-600 hover:text-yellow-800'
                    : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Sync now →
            </button>
          )}
        </div>
      )}
      {isStreaming && !isSlides && <StreamingBanner />}
      {/* Coverage gap banner — shown for rubrics/assignments when specific lessons are missing */}
      {status === 'done' &&
        !isStreaming &&
        (featureId === 'rubrics' || featureId === 'assignments') &&
        (() => {
          if (!coverageGap?.missing?.length) return null;
          if (coverageGap.autoRepairable && typeof onDataChange === 'function') return null;
          const missing = coverageGap.missing;

          return (
            <div className="mx-4 mt-2 mb-1 flex items-start gap-2.5 px-4 py-2.5 rounded-squircle-xs bg-orange-50/80 border border-orange-200/60 backdrop-blur-sm">
              <svg
                className="w-4 h-4 flex-shrink-0 text-orange-400 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              {error && error.includes('budget') ? (
                <p className="text-xs font-medium text-orange-700 flex-1">
                  <span className="font-bold">Missing coverage:</span> Lesson{missing.length !== 1 ? 's' : ''}{' '}
                  {missing.join(', ')} {missing.length !== 1 ? 'have' : 'has'} no{' '}
                  {featureId === 'rubrics' ? 'rubric' : 'assignment'} in the output. The automatic retry was cancelled
                  because your API budget was exhausted.
                </p>
              ) : (
                <p className="text-xs font-medium text-orange-700 flex-1">
                  <span className="font-bold">Missing coverage:</span> Lesson{missing.length !== 1 ? 's' : ''}{' '}
                  {missing.join(', ')} {missing.length !== 1 ? 'have' : 'has'} no{' '}
                  {featureId === 'rubrics' ? 'rubric' : 'assignment'} in the output. Regenerate to fill the gap
                  {missing.length !== 1 ? 's' : ''}.
                </p>
              )}
            </div>
          );
        })()}
      {/* Feature 4.1 — Tier toggle (only when tiered data is present) */}
      {hasTiers && !isStreaming && (
        <div className="flex items-center justify-center gap-1 py-2 px-4">
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-sm">
            {[
              { key: 'scaffolded', label: '🧩 Scaffolded', color: 'text-blue-600 bg-blue-50 border-blue-200' },
              { key: 'standard', label: '📋 Standard', color: 'text-slate-600 bg-slate-100 border-slate-200' },
              { key: 'extension', label: '🚀 Extension', color: 'text-rose-600 bg-rose-50 border-rose-200' },
            ].map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => setActiveTier(key)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all border ${
                  activeTier === key
                    ? color + ' shadow-sm'
                    : 'text-slate-400 bg-transparent border-transparent hover:text-slate-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      <ViewportContext.Provider value={viewportContextValue}>
        {(() => {
          switch (featureId) {
            case 'lessonPlans':
              return <LessonPlansView {...viewProps} />;
            case 'rubrics':
              return <RubricsView {...viewProps} />;
            case 'slideDecks':
              return <SlideDecksView {...viewProps} />;
            case 'quizBank':
              return <QuizBankView {...viewProps} />;
            case 'discussions':
              return <DiscussionsView {...viewProps} />;
            case 'assignments':
              return <AssignmentsView {...viewProps} />;
            case 'studyGuides':
              return <StudyGuidesView {...viewProps} />;
            case 'syllabus':
              return <SyllabusView {...viewProps} />;
            case 'courseFaq':
              return <CourseFaqView {...viewProps} />;
            default:
              return featureId?.startsWith('custom_') || data ? (
                <GenericDeliverableView
                  featureId={featureId}
                  data={data}
                  isStreaming={isStreaming}
                  regeneratingIndex={regeneratingIndex}
                  onRegenerateLesson={onRegenerateLesson}
                  onEdit={editable ? onEdit : undefined}
                />
              ) : (
                <EmptyState featureId={featureId} onGenerate={onRetry} />
              );
          }
        })()}
      </ViewportContext.Provider>
      {/* ── Add More Lessons button — shown at bottom when scope was limited ── */}
      {onAddLessons && status === 'done' && !isSlides && hasMissingLessons && (
        <div className="flex justify-center pb-8 pt-2">
          <button
            onClick={() => {
              // Compute the missing lesson indices (those not in current scope)
              const currentScopeSet = new Set(Array.isArray(lessonScope) ? lessonScope : []);
              const missingIndices = Array.from({ length: allLessonCount }, (_, i) => i).filter(
                (i) => !currentScopeSet.has(i),
              );
              onAddLessons(missingIndices);
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/60 shadow-sm hover:shadow transition-all duration-200"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {`Add ${allLessonCount - (Array.isArray(lessonScope) ? lessonScope.length : allLessonCount)} more lesson${allLessonCount - (Array.isArray(lessonScope) ? lessonScope.length : allLessonCount) !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}
    </>
  );

  // Fullscreen modal for non-slide deliverables
  if (isFullscreen && !isSlides) {
    return (
      <FocusTrap focusTrapOptions={{ clickOutsideDeactivates: true }}>
        <div className="fixed inset-0 z-50 bg-white/98 backdrop-blur-lg overflow-y-auto">
          <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-lg border-b border-slate-200/40 px-6 py-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">
              {featureId === 'lessonPlans'
                ? 'Lesson Plans'
                : featureId === 'rubrics'
                  ? 'Rubrics'
                  : featureId === 'quizBank'
                    ? 'Quiz & Exam Bank'
                    : featureId === 'discussions'
                      ? 'Discussion Prompts'
                      : featureId === 'assignments'
                        ? 'Assignment Briefs'
                        : featureId === 'studyGuides'
                          ? 'Study Guides'
                          : featureId === 'syllabus'
                            ? 'Syllabus'
                            : featureId === 'courseFaq'
                              ? 'Course FAQ'
                              : featureId}
            </h3>
            <button
              onClick={() => setIsFullscreen(false)}
              className="tactile flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 9L4 4m0 0h4M4 4v4m11 11l5 5m0 0h-4m4 0v-4M9 15l-5 5m0 0h4m-4 0v-4m11-11l5-5m0 0h-4m4 0v4"
                />
              </svg>
              Exit Full Screen
            </button>
          </div>
          <div ref={contentRef} className="max-w-5xl mx-auto px-6 py-4">
            {deliverableContent}
          </div>
        </div>
      </FocusTrap>
    );
  }

  return (
    <div ref={contentRef} className={isSlides ? 'relative h-[calc(100vh-8rem)]' : 'relative'}>
      {deliverableContent}
    </div>
  );
}
