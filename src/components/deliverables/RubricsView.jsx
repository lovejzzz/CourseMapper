import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import EditProposalPanel from '../EditProposalPanel';
import { exportRubricGradebook } from '../../lib/deliverableExporters';
import {
  QualityBadge,
  updatePath,
  E,
  ResizableTh,
  SaveToBankButton,
  StreamingBanner,
  ErrorState,
  WaitingState,
  EmptyState,
  CollapsibleCard,
  Badge,
  BloomsTag,
  SectionHeading,
  FEATURE_META,
  LessonJumpRail,
  LessonGroupHeader,
} from './shared/SharedComponents';
import { groupItemsByLesson, lessonTitleForNumber, resolveLessonNumber } from './shared/lessonGrouping';

// v0.14.4 (D1): the brief a rubric grades — registry rubrics are titled
// "<brief title> Rubric"; the stripped title doubles as the focus probe.
function rubricBriefTitle(rubric) {
  const stripped = String(rubric?.title || '')
    .replace(/\s*Rubric\s*$/i, '')
    .trim();
  return stripped || rubric?.gradedWork || rubric?.gw || '';
}

// v0.14.4 (D1): registry identity — id · kind · weight, 12px slate.
function rubricIdentityLine(rubric) {
  const identity = [
    rubric?.assessmentId,
    rubric?.assessmentType,
    rubric?.percentOfGrade || (Number.isFinite(rubric?.weightPercent) ? `${rubric.weightPercent}%` : null),
  ]
    .filter(Boolean)
    .join(' · ');
  return identity || null;
}

// ─── Rubrics ───
export default function RubricsView({
  data,
  isStreaming,
  onEdit,
  regeneratingIndex,
  onRegenerateLesson,
  onSaveToBank,
  isStudentView,
  freshLessonIndices,
  proposals,
  onAcceptProposal,
  onDismissProposal,
  onRegenerateProposal,
  onShowInCourseMap,
  courseMap,
}) {
  // v0.14.4 (D1): group headers register here for the jump rail.
  const groupRefs = useRef({});
  const jumpToGroup = useCallback((key) => {
    groupRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  if (!data) return isStreaming ? <StreamingBanner /> : <EmptyState />;
  const rubrics = data.rubrics || [];
  if (rubrics.length === 0 && !isStreaming) return <EmptyState />;
  const groups = groupItemsByLesson(rubrics, resolveLessonNumber);

  // D1: rubric → brief round-trip; the focus router switches the tab and
  // DeliverableView's listener scrolls to the matching brief anchor.
  const viewBrief = (rubric) => {
    const lessonNumber = resolveLessonNumber(rubric);
    window.dispatchEvent(
      new CustomEvent('coursemapper:focus-deliverable', {
        detail: {
          featureId: 'assignments',
          ...(rubric.assessmentId ? { assessmentId: rubric.assessmentId } : {}),
          ...(Number.isInteger(lessonNumber) ? { lessonNumber } : {}),
          title: rubricBriefTitle(rubric),
        },
      }),
    );
  };

  const renderRubric = (rubric, i) => {
    const gradedWork = rubric.gradedWork || rubric.gw || rubric.assignmentTitle || rubric.title || '';
    const subtitle = [
      rubric.lessonTitle,
      rubric.totalPoints ? `${rubric.totalPoints} pts` : null,
      rubric.assessmentType,
      rubric.bloomsLevel,
    ]
      .filter(Boolean)
      .join(' · ');
    return (
      <React.Fragment key={i}>
        {proposals?.[i] && (
          <EditProposalPanel
            proposal={proposals[i]}
            featureId="rubrics"
            onInsert={() => onAcceptProposal?.(i)}
            onDismiss={() => onDismissProposal?.(i)}
            onRegenerate={() => onRegenerateProposal?.(i)}
          />
        )}
        {/* v0.14.4 (D1/D3): focus anchor — rubric cards are addressable by
                assessmentId/title/lesson just like briefs and exam entries. */}
        <div
          data-assessment-anchor="true"
          data-assessment-id={rubric.assessmentId || ''}
          data-assessment-title={rubric.title || gradedWork || ''}
          data-lesson-number={resolveLessonNumber(rubric) ?? ''}
          className="rounded-squircle-xs transition-shadow duration-300"
        >
          <CollapsibleCard
            viewportIndex={i}
            title={gradedWork || rubric.lessonTitle || `Rubric ${i + 1}`}
            subtitle={subtitle}
            metaLine={rubricIdentityLine(rubric)}
            defaultOpen={i < 3}
            accent="emerald"
            streaming={isStreaming && i === rubrics.length - 1}
            regenerating={regeneratingIndex === i}
            fresh={!!freshLessonIndices?.has(i)}
            onRegenerate={onRegenerateLesson && !isStreaming ? () => onRegenerateLesson(i) : undefined}
            onTitleEdit={
              onEdit
                ? (newTitle) =>
                    onEdit(
                      [
                        'rubrics',
                        i,
                        rubric.gradedWork !== undefined || rubric.gw !== undefined ? 'gradedWork' : 'title',
                      ],
                      newTitle,
                    )
                : undefined
            }
          >
            <div className="pt-3 space-y-3">
              {/* v0.14.4 (D1/D3): round-trip chips — the rubric links to its
                    brief, and back to the owning course-map cell. */}
              {(rubricBriefTitle(rubric) || rubric.assessmentId) && !isStudentView && (
                <div className="flex flex-wrap gap-1.5 items-center">
                  <button
                    type="button"
                    data-view-brief="true"
                    onClick={() => viewBrief(rubric)}
                    className="tactile inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-0.5 rounded-full text-slate-500 dark:text-slate-400 bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:border-indigo-200/60 dark:hover:border-indigo-800/60 transition-all duration-150"
                    title="Open the assignment brief this rubric grades"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.6}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    View brief
                  </button>
                  {onShowInCourseMap && (
                    <button
                      type="button"
                      data-show-in-coursemap="true"
                      onClick={() => onShowInCourseMap({ ...rubric, title: rubricBriefTitle(rubric) })}
                      className="tactile inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-0.5 rounded-full text-slate-500 dark:text-slate-400 bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:border-indigo-200/60 dark:hover:border-indigo-800/60 transition-all duration-150"
                      title="Show this assessment's row in the course map"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth={1.6} />
                        <path
                          d="M3 9h18M3 15h18M9 3v18"
                          stroke="currentColor"
                          strokeWidth={1.6}
                          strokeLinecap="round"
                        />
                      </svg>
                      Show in course map
                    </button>
                  )}
                </div>
              )}
              {gradedWork && (
                <div className="text-xs text-slate-600 bg-emerald-50/70 border border-emerald-100 rounded-lg px-3 py-2">
                  <span className="font-semibold text-emerald-700">Graded student work:</span> {gradedWork}
                </div>
              )}
              {/* Save rubric to bank */}
              {onSaveToBank && rubric.criteria?.length > 0 && (
                <SaveToBankButton
                  onClick={() =>
                    onSaveToBank({
                      type: 'rubric',
                      text: (rubric.criteria || [])
                        .map((c) => `${c.criterion || c.name}: ${c.excellent || c.exemplary || ''}`)
                        .join('\n'),
                      bloomsLevel: rubric.bloomsLevel || '',
                    })
                  }
                />
              )}

              {/* Grading scale chips */}
              {rubric.gradingScale && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(rubric.gradingScale).map(([level, range]) => {
                    const colors = {
                      exemplary: 'bg-emerald-50 text-emerald-700',
                      proficient: 'bg-sky-50 text-sky-700',
                      developing: 'bg-amber-50 text-amber-700',
                      beginning: 'bg-red-50 text-red-600',
                    };
                    return (
                      <span
                        key={level}
                        className={`text-xs font-semibold px-2 py-1 rounded-md capitalize ${colors[level] || 'bg-slate-50 text-slate-600'}`}
                      >
                        {level}: {range}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Rubric table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs border border-slate-100 rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-emerald-50/60">
                      <th className="text-left px-3 py-2 font-semibold text-slate-600 min-w-[120px]">Criterion</th>
                      <th className="text-center px-2 py-2 font-semibold text-slate-600 w-12">Wt %</th>
                      <th className="text-center px-2 py-2 font-semibold text-slate-600 w-10">Pts</th>
                      <th className="text-left px-3 py-2 font-semibold text-emerald-700 min-w-[140px]">Exemplary</th>
                      <th className="text-left px-3 py-2 font-semibold text-sky-700 min-w-[140px]">Proficient</th>
                      <th className="text-left px-3 py-2 font-semibold text-amber-700 min-w-[140px]">Developing</th>
                      <th className="text-left px-3 py-2 font-semibold text-red-700 min-w-[140px]">Beginning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(rubric.criteria || []).length === 0 && isStreaming && (
                      <tr>
                        <td colSpan={7} className="px-3 py-4 text-center text-xs text-slate-400 italic">
                          Generating criteria...
                        </td>
                      </tr>
                    )}
                    {(rubric.criteria || []).map((c, j) => (
                      <tr key={j} className={j % 2 === 0 ? 'bg-white/50' : 'bg-slate-50/30'}>
                        <td className="px-3 py-2 align-top">
                          <span className="font-semibold text-slate-800 block">
                            <E
                              value={c.criterion || c.name}
                              path={['rubrics', i, 'criteria', j, 'criterion']}
                              onEdit={onEdit}
                            />
                          </span>
                          {c.objectiveAligned && (
                            <span className="text-xs text-indigo-400 block mt-0.5 leading-tight">
                              ↳{' '}
                              <E
                                value={c.objectiveAligned}
                                path={['rubrics', i, 'criteria', j, 'objectiveAligned']}
                                onEdit={onEdit}
                                className="text-xs text-indigo-400"
                              />
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center font-bold text-slate-500 align-top">
                          <E
                            value={String(c.weight ?? '')}
                            path={['rubrics', i, 'criteria', j, 'weight']}
                            onEdit={onEdit}
                          />
                          %
                        </td>
                        <td className="px-2 py-2 text-center font-semibold text-emerald-600 align-top">
                          {c.points ?? ''}
                        </td>
                        <td className="px-3 py-2 text-slate-600 align-top leading-relaxed">
                          <E
                            value={c.excellent || c.exemplary}
                            path={['rubrics', i, 'criteria', j, c.excellent ? 'excellent' : 'exemplary']}
                            onEdit={onEdit}
                            multiline
                          />
                        </td>
                        <td className="px-3 py-2 text-slate-600 align-top leading-relaxed">
                          <E
                            value={c.proficient}
                            path={['rubrics', i, 'criteria', j, 'proficient']}
                            onEdit={onEdit}
                            multiline
                          />
                        </td>
                        <td className="px-3 py-2 text-slate-600 align-top leading-relaxed">
                          <E
                            value={c.developing}
                            path={['rubrics', i, 'criteria', j, 'developing']}
                            onEdit={onEdit}
                            multiline
                          />
                        </td>
                        <td className="px-3 py-2 text-slate-600 align-top leading-relaxed">
                          <E
                            value={c.beginning}
                            path={['rubrics', i, 'criteria', j, 'beginning']}
                            onEdit={onEdit}
                            multiline
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Teacher notes */}
              {rubric.teacherNotes && (
                <div className="bg-amber-50/40 rounded-lg p-3 border border-amber-100/50">
                  <h4 className="text-xs font-semibold text-amber-700 mb-1">📋 Calibration &amp; Grader Notes</h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    <E value={rubric.teacherNotes} path={['rubrics', i, 'teacherNotes']} onEdit={onEdit} multiline />
                  </p>
                </div>
              )}
            </div>
          </CollapsibleCard>
        </div>
      </React.Fragment>
    );
  };

  // v0.14.4 (D1): lesson-grouped render — sticky group headers + jump rail.
  // Items keep their ORIGINAL array index (edit paths, proposals, export).
  return (
    <div className="space-y-3 p-4">
      <LessonJumpRail groups={groups} onJump={jumpToGroup} />
      {/* Feature 7.4 — Export Gradebook CSV */}
      {rubrics.length > 0 && !isStreaming && (
        <div className="flex justify-end">
          <button
            onClick={() => exportRubricGradebook(data)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all"
          >
            <span>📊</span>
            <span>Export Gradebook CSV</span>
          </button>
        </div>
      )}
      {groups.map((group) => (
        <section key={group.key} data-lesson-group={group.key} className="space-y-3">
          <LessonGroupHeader
            groupKey={group.key}
            lessonNumber={group.lessonNumber}
            lessonTitle={lessonTitleForNumber(courseMap, group.lessonNumber)}
            count={group.items.length}
            headerRef={(node) => {
              groupRefs.current[group.key] = node;
            }}
          />
          {group.items.map(({ item, index }) => renderRubric(item, index))}
        </section>
      ))}
    </div>
  );
}
