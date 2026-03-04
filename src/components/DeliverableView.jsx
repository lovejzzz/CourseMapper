import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import GenericDeliverableView from './GenericDeliverableView';
import { QualityBadge, updatePath, StreamingBanner, ErrorState, WaitingState, EmptyState } from './deliverables/shared/SharedComponents';
import LessonPlansView from './deliverables/LessonPlansView';
import RubricsView from './deliverables/RubricsView';
import SlideDecksView from './deliverables/SlideDecksView';
import QuizBankView from './deliverables/QuizBankView';
import DiscussionsView from './deliverables/DiscussionsView';
import AssignmentsView from './deliverables/AssignmentsView';
import StudyGuidesView from './deliverables/StudyGuidesView';
import SyllabusView from './deliverables/SyllabusView';

export default function DeliverableView({ featureId, data, status, error, regeneratingIndex, courseMapStatus, isDelivGenerating, currentDelivFeatures, onDataChange, onRegenerateLesson, onRetry, onAddLessons, courseMap, lessonScope, isStudentView, onSaveToBank, qualityScore, freshLessonIndices, proposals, onAcceptProposal, onDismissProposal, onRegenerateProposal, isStale, staleConfidence, onSyncNow, slideTheme, onSlideThemeChange }) {
  // ── All hooks MUST come before any early returns (Rules of Hooks) ──
  // Feature 4.1 — Tier detection + toggle state
  const [activeTier, setActiveTier] = useState('standard'); // 'scaffolded' | 'standard' | 'extension'
  const hasTiers = useMemo(() => {
    if (!data) return false;
    const TIERED_DELIVERABLES = ['lessonPlans', 'quizBank', 'discussions', 'assignments', 'studyGuides'];
    if (!TIERED_DELIVERABLES.includes(featureId)) return false;
    const arrays = {
      lessonPlans: data.lessonPlans,
      quizBank: data.quizzes || data.quizBank,
      discussions: data.discussions,
      assignments: data.assignments,
      studyGuides: data.studyGuides || data.guides,
    };
    const arr = arrays[featureId];
    return Array.isArray(arr) && arr.length > 0 && arr[0]?.tiers != null;
  }, [data, featureId]);

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

  const isStreaming = status === 'streaming';
  const editable = status === 'done' && !!onDataChange;

  function onEdit(path, value) {
    if (!onDataChange) return;
    // Pass the edit path as 2nd argument so App can route it to the reactive sync engine
    onDataChange(updatePath(data, path, value), path);
  }

  const editProps = editable ? { onEdit } : {};

  const viewProps = { data, isStreaming, regeneratingIndex: regeneratingIndex ?? null, onRegenerateLesson, isStudentView, onSaveToBank, activeTier: hasTiers ? activeTier : 'standard', freshLessonIndices: freshLessonIndices ?? null, proposals: proposals ?? {}, onAcceptProposal, onDismissProposal, onRegenerateProposal, slideTheme, onSlideThemeChange, ...editProps };

  const isSlides = featureId === 'slideDecks';

  // Determine if there are un-generated lessons the user could add
  const allLessonCount = courseMap?.lessons?.length || 0;
  const generatedCount = Array.isArray(lessonScope)
    ? lessonScope.length
    : (lessonScope === 'all' || !lessonScope ? allLessonCount : allLessonCount);
  const hasMissingLessons = onAddLessons && status === 'done' && Array.isArray(lessonScope) && lessonScope.length < allLessonCount;

  return (
    <div className={isSlides ? 'relative h-[calc(100vh-8rem)]' : 'relative'}>
      {/* Feature 6.3 — Quality badge (shown when done and score available) */}
      {status === 'done' && qualityScore && (
        <div className="flex justify-end px-4 pt-2 pb-0">
          <QualityBadge quality={qualityScore} />
        </div>
      )}
      {/* Stale banner — shown when this deliverable is out of sync with recent edits */}
      {/* Change #3: Confidence-aware banner coloring and messaging */}
      {isStale && !isStreaming && (
        <div className={`mx-4 mt-2 mb-1 flex items-center gap-2.5 px-4 py-2.5 rounded-squircle-xs backdrop-blur-sm ${staleConfidence?.level === 'high' ? 'bg-amber-50/80 border border-amber-200/50' :
          staleConfidence?.level === 'medium' ? 'bg-yellow-50/80 border border-yellow-200/50' :
            'bg-slate-50/80 border border-slate-200/50'
          }`}>
          <svg className={`w-4 h-4 flex-shrink-0 ${staleConfidence?.level === 'high' ? 'text-amber-500' :
            staleConfidence?.level === 'medium' ? 'text-yellow-500' :
              'text-slate-400'
            }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className={`text-[11px] font-medium flex-1 ${staleConfidence?.level === 'high' ? 'text-amber-700' :
            staleConfidence?.level === 'medium' ? 'text-yellow-700' :
              'text-slate-500'
            }`}>
            {staleConfidence?.level === 'high'
              ? 'This deliverable is likely out of sync — a core field was changed.'
              : staleConfidence?.level === 'medium'
                ? 'This deliverable may be slightly out of sync with recent edits.'
                : 'A minor change was detected — this deliverable may not need updating.'}
          </p>
          {onSyncNow && (
            <button
              onClick={onSyncNow}
              className={`flex-shrink-0 text-[10px] font-bold underline underline-offset-2 transition-colors ${staleConfidence?.level === 'high' ? 'text-amber-600 hover:text-amber-800' :
                staleConfidence?.level === 'medium' ? 'text-yellow-600 hover:text-yellow-800' :
                  'text-slate-500 hover:text-slate-700'
                }`}
            >
              Sync now →
            </button>
          )}
        </div>
      )}
      {isStreaming && !isSlides && <StreamingBanner />}
      {/* Coverage gap banner — shown for rubrics/assignments when specific lessons are missing */}
      {status === 'done' && !isStreaming && (featureId === 'rubrics' || featureId === 'assignments') && (() => {
        // Only fire when lesson numbers are actually present in the output (coverage is trackable)
        const arr = featureId === 'rubrics' ? data?.rubrics : data?.assignments;
        if (!Array.isArray(arr) || arr.length === 0) return null;
        const totalLessons = courseMap?.lessons?.length || 0;
        if (totalLessons < 2) return null;

        const coveredNums = new Set();
        arr.forEach(item => {
          const titleStr = item?.lessonTitle || item?.title || item?.lesson || '';
          const m = titleStr.match(/(?:Lesson|Week)\s*(\d+)/i);
          if (m) coveredNums.add(parseInt(m[1], 10));
          // assignments: also check relatedLessons
          const related = item?.relatedLessons;
          if (Array.isArray(related)) {
            related.forEach(r => {
              const rm = String(r).match(/(?:Lesson|Week)\s*(\d+)/i);
              if (rm) coveredNums.add(parseInt(rm[1], 10));
            });
          }
        });
        // Only show banner when we have trackable lesson numbers AND there are gaps
        if (coveredNums.size === 0) return null;
        const missing = Array.from({ length: totalLessons }, (_, i) => i + 1).filter(n => !coveredNums.has(n));
        if (missing.length === 0) return null;

        return (
          <div className="mx-4 mt-2 mb-1 flex items-start gap-2.5 px-4 py-2.5 rounded-squircle-xs bg-orange-50/80 border border-orange-200/60 backdrop-blur-sm">
            <svg className="w-4 h-4 flex-shrink-0 text-orange-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {error && error.includes('budget') ? (
              <p className="text-[11px] font-medium text-orange-700 flex-1">
                <span className="font-bold">Missing coverage:</span> Lesson{missing.length !== 1 ? 's' : ''} {missing.join(', ')} {missing.length !== 1 ? 'have' : 'has'} no {featureId === 'rubrics' ? 'rubric' : 'assignment'} in the output. The automatic retry was cancelled because your API budget was exhausted.
              </p>
            ) : (
              <p className="text-[11px] font-medium text-orange-700 flex-1">
                <span className="font-bold">Missing coverage:</span> Lesson{missing.length !== 1 ? 's' : ''} {missing.join(', ')} {missing.length !== 1 ? 'have' : 'has'} no {featureId === 'rubrics' ? 'rubric' : 'assignment'} in the output. Regenerate to fill the gap{missing.length !== 1 ? 's' : ''}.
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
                className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all border ${activeTier === key ? color + ' shadow-sm' : 'text-slate-400 bg-transparent border-transparent hover:text-slate-600'
                  }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {(() => {
        switch (featureId) {
          case 'lessonPlans': return <LessonPlansView {...viewProps} />;
          case 'rubrics': return <RubricsView {...viewProps} />;
          case 'slideDecks': return <SlideDecksView {...viewProps} />;
          case 'quizBank': return <QuizBankView {...viewProps} />;
          case 'discussions': return <DiscussionsView {...viewProps} />;
          case 'assignments': return <AssignmentsView {...viewProps} />;
          case 'studyGuides': return <StudyGuidesView {...viewProps} />;
          case 'syllabus': return <SyllabusView {...viewProps} />;
          default: return (featureId?.startsWith('custom_') || data)
            ? <GenericDeliverableView featureId={featureId} data={data} isStreaming={isStreaming} regeneratingIndex={regeneratingIndex} onRegenerateLesson={onRegenerateLesson} onEdit={editable ? onEdit : undefined} />
            : <EmptyState featureId={featureId} onGenerate={onRetry} />;
        }
      })()}
      {/* ── Add More Lessons button — shown at bottom when scope was limited ── */}
      {onAddLessons && status === 'done' && !isSlides && hasMissingLessons && (
        <div className="flex justify-center pb-8 pt-2">
          <button
            onClick={() => {
              // Compute the missing lesson indices (those not in current scope)
              const currentScopeSet = new Set(Array.isArray(lessonScope) ? lessonScope : []);
              const missingIndices = Array.from({ length: allLessonCount }, (_, i) => i).filter(i => !currentScopeSet.has(i));
              onAddLessons(missingIndices);
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-[12px] font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/60 shadow-sm hover:shadow transition-all duration-200"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {`Add ${allLessonCount - (Array.isArray(lessonScope) ? lessonScope.length : allLessonCount)} more lesson${allLessonCount - (Array.isArray(lessonScope) ? lessonScope.length : allLessonCount) !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}
    </div>
  );
}

