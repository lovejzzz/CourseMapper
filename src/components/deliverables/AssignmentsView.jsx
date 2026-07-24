import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import EditProposalPanel from '../EditProposalPanel';
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
  NotApplicableState,
  CollapsibleCard,
  Badge,
  BloomsTag,
  SectionHeading,
  FEATURE_META,
  TierToggle,
  LessonJumpRail,
  LessonGroupHeader,
} from './shared/SharedComponents';
import { groupItemsByLesson, lessonTitleForNumber, resolveLessonNumber } from './shared/lessonGrouping';

const ExperientialActivityPanel = React.lazy(() => import('./ExperientialActivityPanel'));

// v0.14.1 (3.5): the lesson number an assignment belongs to — compiled briefs
// carry lessonNumber; AI-authored ones mention "Week N"/"Lesson N" in their
// dueWeek/relatedLessons text. v0.14.4 (D1): shared tolerant resolver (adds
// the title probe so "Week 3 Reflection Memo" still groups).
function assignmentLessonNumber(assignment) {
  return resolveLessonNumber(assignment);
}

// v0.14.4 (D1): registry identity — id · kind · weight (the courseMapRef
// stamp follows when the compiler wrote one).
function assignmentIdentityLine(assignment) {
  const identity = [
    assignment?.assessmentId,
    assignment?.assignmentType || assignment?.assessmentRole,
    assignment?.percentOfGrade || (Number.isFinite(assignment?.weightPercent) ? `${assignment.weightPercent}%` : null),
  ]
    .filter(Boolean)
    .join(' · ');
  if (!identity && !assignment?.courseMapRef) return null;
  return (
    <>
      {identity && <span className="font-medium">{identity}</span>}
      {assignment?.courseMapRef && (
        <span className="text-slate-400 dark:text-slate-500">
          {identity ? ' — ' : ''}
          {assignment.courseMapRef}
        </span>
      )}
    </>
  );
}

// ─── Assignment Briefs ───
export default function AssignmentsView({
  data,
  isStreaming,
  onEdit,
  regeneratingIndex,
  onRegenerateLesson,
  isStudentView,
  activeTier,
  freshLessonIndices,
  proposals,
  onAcceptProposal,
  onDismissProposal,
  onRegenerateProposal,
  onShowInCourseMap,
  courseMap,
}) {
  const [localTiers, setLocalTiers] = useState({});
  // v0.14.4 (D1): group headers register here so the jump rail can scroll to
  // them inside the view's own scroll container.
  const groupRefs = useRef({});
  const jumpToGroup = useCallback((key) => {
    groupRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  if (!data) return isStreaming ? <StreamingBanner /> : <EmptyState />;
  if (data.deliverableDisposition?.status === 'not-applicable') {
    return <NotApplicableState disposition={data.deliverableDisposition} />;
  }
  const assignments = data.assignments || [];
  if (assignments.length === 0 && !isStreaming) return <EmptyState />;
  const groups = groupItemsByLesson(assignments, assignmentLessonNumber);

  const renderAssignment = (baseA, i) => {
    // Feature 4.1 — select tier variant
    const currentTier = localTiers[i] || 'standard';
    const a =
      currentTier !== 'standard' && baseA.tiers?.[currentTier] ? { ...baseA, ...baseA.tiers[currentTier] } : baseA;
    const gradingCriteriaEntries = Array.isArray(a.gradingCriteria)
      ? a.gradingCriteria.filter((criterion) => criterion != null && String(criterion).trim())
      : a.gradingCriteria
        ? [a.gradingCriteria]
        : [];
    const subtitle = [
      a.dueWeek || a.dueDate,
      a.estimatedTime,
      a.totalPoints ? `${a.totalPoints} pts` : null,
      a.percentOfGrade,
    ]
      .filter(Boolean)
      .join(' · ');
    return (
      <React.Fragment key={i}>
        {proposals?.[i] && (
          <EditProposalPanel
            proposal={proposals[i]}
            featureId="assignments"
            onInsert={() => onAcceptProposal?.(i)}
            onDismiss={() => onDismissProposal?.(i)}
            onRegenerate={() => onRegenerateProposal?.(i)}
          />
        )}
        {/* v0.14.1 (3.5): focus anchor — the course-map chip flow scrolls
                to and highlights this wrapper (DeliverableView's listener). */}
        <div
          data-assessment-anchor="true"
          data-assessment-id={baseA.assessmentId || ''}
          data-assessment-title={baseA.title || ''}
          data-lesson-number={assignmentLessonNumber(baseA) ?? ''}
          className="rounded-squircle-xs transition-shadow duration-300"
        >
          <CollapsibleCard
            viewportIndex={i}
            title={a.title || `Assignment ${i + 1}`}
            subtitle={subtitle}
            metaLine={assignmentIdentityLine(baseA)}
            defaultOpen={i < 3}
            accent="orange"
            streaming={isStreaming && i === assignments.length - 1}
            regenerating={regeneratingIndex === i}
            fresh={!!freshLessonIndices?.has(i)}
            onRegenerate={onRegenerateLesson && !isStreaming ? () => onRegenerateLesson(i) : undefined}
            onTitleEdit={onEdit ? (newTitle) => onEdit(['assignments', i, 'title'], newTitle) : undefined}
          >
            <div className="pt-3 space-y-4">
              {/* Meta chips */}
              <div className="flex flex-wrap gap-1.5 items-center">
                {a.assignmentType && <Badge color="orange">{a.assignmentType}</Badge>}
                {a.bloomsLevel && <BloomsTag level={a.bloomsLevel} />}
                {a.relatedLessons?.map((l, j) => (
                  <Badge key={j} color="slate">
                    {l}
                  </Badge>
                ))}
                {/* v0.14.1 (3.5): reverse of the map's assessment chips —
                      jump to this assessment's Weekly Assessments cell. */}
                {onShowInCourseMap && !isStudentView && (
                  <button
                    type="button"
                    data-show-in-coursemap="true"
                    onClick={() => onShowInCourseMap(baseA)}
                    className="tactile inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full text-slate-500 bg-slate-100/80 border border-slate-200/60 hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200/60 transition-all duration-150"
                    title="Show this assessment's row in the course map"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth={1.6} />
                      <path d="M3 9h18M3 15h18M9 3v18" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
                    </svg>
                    Show in course map
                  </button>
                )}
              </div>

              {/* Overview */}
              {a.overview && (
                <div>
                  <SectionHeading>Overview &amp; Purpose</SectionHeading>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    <E value={a.overview} path={['assignments', i, 'overview']} onEdit={onEdit} multiline />
                  </p>
                </div>
              )}
              {/* Legacy description */}
              {!a.overview && a.description && (
                <div>
                  <SectionHeading>Description</SectionHeading>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    <E value={a.description} path={['assignments', i, 'description']} onEdit={onEdit} multiline />
                  </p>
                </div>
              )}

              <React.Suspense
                fallback={
                  <div
                    aria-label="Loading activity briefing"
                    className="h-28 animate-pulse rounded-xl border border-indigo-200/70 bg-indigo-50/60 dark:border-indigo-400/20 dark:bg-indigo-950/20"
                  />
                }
              >
                <ExperientialActivityPanel packet={a.activityPacket} assignmentIndex={i} onEdit={onEdit} />
              </React.Suspense>

              {/* Learning objectives */}
              {a.objectives?.length > 0 && (
                <div>
                  <SectionHeading>Learning Objectives Assessed</SectionHeading>
                  <ul className="space-y-1">
                    {a.objectives.map((o, j) => (
                      <li key={j} className="text-xs text-slate-700 flex gap-2">
                        <span className="text-orange-400 flex-shrink-0">•</span>
                        <E value={o} path={['assignments', i, 'objectives', j]} onEdit={onEdit} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Instructions */}
              {a.instructions?.length > 0 && (
                <div>
                  <SectionHeading>Instructions</SectionHeading>
                  <ol className="space-y-1.5 list-none">
                    {a.instructions.map((step, j) => (
                      <li key={j} className="text-xs text-slate-700 flex gap-2.5">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-orange-100 text-orange-700 text-xs font-bold flex items-center justify-center">
                          {j + 1}
                        </span>
                        <E value={step} path={['assignments', i, 'instructions', j]} onEdit={onEdit} multiline />
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Format requirements */}
              {a.formatRequirements && (
                <div className="bg-slate-50/60 rounded-lg p-3 border border-slate-100 grid grid-cols-2 gap-x-4 gap-y-1.5">
                  <SectionHeading>Format &amp; Submission</SectionHeading>
                  <div className="col-span-2" />
                  {a.formatRequirements.length && (
                    <div>
                      <span className="text-xs font-bold text-slate-500">Length:</span>
                      <p className="text-xs text-slate-700">
                        <E
                          value={a.formatRequirements.length}
                          path={['assignments', i, 'formatRequirements', 'length']}
                          onEdit={onEdit}
                        />
                      </p>
                    </div>
                  )}
                  {a.formatRequirements.format && (
                    <div>
                      <span className="text-xs font-bold text-slate-500">Format:</span>
                      <p className="text-xs text-slate-700">
                        <E
                          value={a.formatRequirements.format}
                          path={['assignments', i, 'formatRequirements', 'format']}
                          onEdit={onEdit}
                        />
                      </p>
                    </div>
                  )}
                  {a.formatRequirements.citationStyle && (
                    <div>
                      <span className="text-xs font-bold text-slate-500">Citation:</span>
                      <p className="text-xs text-slate-700">
                        <E
                          value={a.formatRequirements.citationStyle}
                          path={['assignments', i, 'formatRequirements', 'citationStyle']}
                          onEdit={onEdit}
                        />
                      </p>
                    </div>
                  )}
                  {a.formatRequirements.submissionPlatform && (
                    <div>
                      <span className="text-xs font-bold text-slate-500">Submit to:</span>
                      <p className="text-xs text-slate-700">
                        <E
                          value={a.formatRequirements.submissionPlatform}
                          path={['assignments', i, 'formatRequirements', 'submissionPlatform']}
                          onEdit={onEdit}
                        />
                      </p>
                    </div>
                  )}
                  {a.formatRequirements.latePolicy && (
                    <div className="col-span-2 bg-red-50/40 rounded p-1.5">
                      <span className="text-xs font-bold text-red-600">Late Policy:</span>
                      <p className="text-xs text-slate-700">
                        <E
                          value={a.formatRequirements.latePolicy}
                          path={['assignments', i, 'formatRequirements', 'latePolicy']}
                          onEdit={onEdit}
                        />
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Deliverables checklist */}
              {a.deliverables?.length > 0 && (
                <div>
                  <SectionHeading>Submission Checklist</SectionHeading>
                  <ul className="space-y-1">
                    {a.deliverables.map((d, j) => (
                      <li key={j} className="text-xs text-slate-700 flex gap-2 items-start">
                        <span className="text-orange-400 flex-shrink-0 mt-0.5">☐</span>
                        <E value={d} path={['assignments', i, 'deliverables', j]} onEdit={onEdit} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Scaffolding milestones — now includes feedback channel,
                  point value, and optional upload checklist per milestone.
                  The feedback + points chips make the scaffolding read as a
                  coaching timeline, not just a list of dates. */}
              {a.scaffoldingMilestones?.length > 0 && (
                <div>
                  <SectionHeading>Scaffolding Milestones</SectionHeading>
                  <div className="space-y-2">
                    {a.scaffoldingMilestones.map((m, j) => (
                      <div
                        key={j}
                        className="flex gap-3 items-start bg-indigo-50/30 rounded-lg px-3 py-2 border border-indigo-100/40"
                      >
                        <div className="flex-shrink-0 text-center">
                          <span className="text-xs font-bold text-indigo-600 block">{m.dueDate}</span>
                          {typeof m.points === 'number' && (
                            <span className="text-xs text-indigo-400 block mt-0.5 font-mono">{m.points} pt</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-semibold text-indigo-800 block">
                            <E
                              value={m.milestone}
                              path={['assignments', i, 'scaffoldingMilestones', j, 'milestone']}
                              onEdit={onEdit}
                            />
                          </span>
                          {m.description && (
                            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                              <E
                                value={m.description}
                                path={['assignments', i, 'scaffoldingMilestones', j, 'description']}
                                onEdit={onEdit}
                              />
                            </p>
                          )}
                          {m.feedback && (
                            <div className="mt-1 inline-flex items-center gap-1 text-xs text-violet-600/80 bg-violet-50/60 rounded px-1.5 py-0.5">
                              <svg
                                className="w-2.5 h-2.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                                />
                              </svg>
                              <span>{m.feedback}</span>
                            </div>
                          )}
                          {Array.isArray(m.uploadChecklist) && m.uploadChecklist.length > 0 && (
                            <ul className="mt-1.5 space-y-0.5 text-xs text-slate-500">
                              {m.uploadChecklist.map((item, k) => (
                                <li key={k} className="flex items-start gap-1">
                                  <span className="text-slate-300 flex-shrink-0 mt-0.5">☐</span>
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Grading criteria — internal, hidden in student view */}
              {gradingCriteriaEntries.length > 0 && !isStudentView && (
                <div>
                  <SectionHeading>Grading Criteria Summary</SectionHeading>
                  {Array.isArray(a.gradingCriteria) ? (
                    <ul className="space-y-1 text-xs text-slate-600">
                      {gradingCriteriaEntries.map((criterion, criterionIndex) => (
                        <li key={criterionIndex} className="flex items-start gap-2">
                          <span className="text-amber-400 flex-shrink-0">•</span>
                          <E
                            value={criterion}
                            path={['assignments', i, 'gradingCriteria', criterionIndex]}
                            onEdit={onEdit}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-600 leading-relaxed">
                      <E
                        value={a.gradingCriteria}
                        path={['assignments', i, 'gradingCriteria']}
                        onEdit={onEdit}
                        multiline
                      />
                    </p>
                  )}
                </div>
              )}

              {/* Support resources */}
              {a.supportResources?.length > 0 && (
                <div>
                  <SectionHeading>Support Resources</SectionHeading>
                  <ul className="space-y-1">
                    {a.supportResources.map((r, j) => (
                      <li key={j} className="text-xs text-slate-600 flex gap-2">
                        <span className="text-teal-400 flex-shrink-0">▸</span>
                        <E value={r} path={['assignments', i, 'supportResources', j]} onEdit={onEdit} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Academic integrity */}
              {a.academicIntegrityStatement && (
                <div className="bg-slate-50/80 rounded-lg p-3 border border-slate-200/60">
                  <h4 className="text-xs font-semibold text-slate-600 mb-1">⚖️ Academic Integrity</h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    <E
                      value={a.academicIntegrityStatement}
                      path={['assignments', i, 'academicIntegrityStatement']}
                      onEdit={onEdit}
                      multiline
                    />
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
  // Items keep their ORIGINAL array index (edit paths, proposals, tiers).
  return (
    <div className="space-y-3 p-4">
      <LessonJumpRail groups={groups} onJump={jumpToGroup} />
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
          {group.items.map(({ item, index }) => renderAssignment(item, index))}
        </section>
      ))}
    </div>
  );
}
