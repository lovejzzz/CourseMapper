import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import EditProposalPanel from '../EditProposalPanel';
import {
  QualityBadge, updatePath, E, ResizableTh, SaveToBankButton,
  StreamingBanner, ErrorState, WaitingState, EmptyState,
  CollapsibleCard, Badge, BloomsTag, SectionHeading,
  FEATURE_META
, TierToggle } from './shared/SharedComponents';

// ─── Assignment Briefs ───
export default function AssignmentsView({ data, isStreaming, onEdit, regeneratingIndex, onRegenerateLesson, isStudentView, activeTier, freshLessonIndices, proposals, onAcceptProposal, onDismissProposal, onRegenerateProposal }) {
  const [localTiers, setLocalTiers] = useState({});
  if (!data) return isStreaming ? <StreamingBanner /> : <EmptyState />;
  const assignments = data.assignments || [];
  if (assignments.length === 0 && !isStreaming) return <EmptyState />;
  return (
    <div className="space-y-3 p-4">
      {assignments.map((baseA, i) => {
        // Feature 4.1 — select tier variant
        const currentTier = localTiers[i] || 'standard';
        const a = (currentTier !== 'standard' && baseA.tiers?.[currentTier]) ? { ...baseA, ...baseA.tiers[currentTier] } : baseA;
        const subtitle = [
          a.dueWeek || a.dueDate,
          a.estimatedTime,
          a.totalPoints ? `${a.totalPoints} pts` : null,
          a.percentOfGrade,
        ].filter(Boolean).join(' · ');
        return (
          <React.Fragment key={i}>
            {proposals?.[i] && (
              <EditProposalPanel proposal={proposals[i]} featureId="assignments" onInsert={() => onAcceptProposal?.(i)} onDismiss={() => onDismissProposal?.(i)} onRegenerate={() => onRegenerateProposal?.(i)} />
            )}
          <CollapsibleCard title={a.title || `Assignment ${i + 1}`} subtitle={subtitle} defaultOpen={i < 3} accent="orange" streaming={isStreaming && i === assignments.length - 1} regenerating={regeneratingIndex === i} fresh={!!(freshLessonIndices?.has(i))} onRegenerate={onRegenerateLesson && !isStreaming ? () => onRegenerateLesson(i) : undefined} onTitleEdit={onEdit ? (newTitle) => onEdit(['assignments', i, 'title'], newTitle) : undefined}>
            <div className="pt-3 space-y-4">

              {/* Meta chips */}
              <div className="flex flex-wrap gap-1.5">
                {a.assignmentType && <Badge color="orange">{a.assignmentType}</Badge>}
                {a.bloomsLevel && <BloomsTag level={a.bloomsLevel} />}
                {a.relatedLessons?.map((l, j) => <Badge key={j} color="slate">{l}</Badge>)}
              </div>

              {/* Overview */}
              {a.overview && (
                <div>
                  <SectionHeading>Overview &amp; Purpose</SectionHeading>
                  <p className="text-xs text-slate-700 leading-relaxed"><E value={a.overview} path={['assignments', i, 'overview']} onEdit={onEdit} multiline /></p>
                </div>
              )}
              {/* Legacy description */}
              {!a.overview && a.description && (
                <div>
                  <SectionHeading>Description</SectionHeading>
                  <p className="text-xs text-slate-700 leading-relaxed"><E value={a.description} path={['assignments', i, 'description']} onEdit={onEdit} multiline /></p>
                </div>
              )}

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
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold flex items-center justify-center">{j + 1}</span>
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
                    <div><span className="text-[10px] font-bold text-slate-500">Length:</span><p className="text-[11px] text-slate-700"><E value={a.formatRequirements.length} path={['assignments', i, 'formatRequirements', 'length']} onEdit={onEdit} /></p></div>
                  )}
                  {a.formatRequirements.format && (
                    <div><span className="text-[10px] font-bold text-slate-500">Format:</span><p className="text-[11px] text-slate-700"><E value={a.formatRequirements.format} path={['assignments', i, 'formatRequirements', 'format']} onEdit={onEdit} /></p></div>
                  )}
                  {a.formatRequirements.citationStyle && (
                    <div><span className="text-[10px] font-bold text-slate-500">Citation:</span><p className="text-[11px] text-slate-700"><E value={a.formatRequirements.citationStyle} path={['assignments', i, 'formatRequirements', 'citationStyle']} onEdit={onEdit} /></p></div>
                  )}
                  {a.formatRequirements.submissionPlatform && (
                    <div><span className="text-[10px] font-bold text-slate-500">Submit to:</span><p className="text-[11px] text-slate-700"><E value={a.formatRequirements.submissionPlatform} path={['assignments', i, 'formatRequirements', 'submissionPlatform']} onEdit={onEdit} /></p></div>
                  )}
                  {a.formatRequirements.latePolicy && (
                    <div className="col-span-2 bg-red-50/40 rounded p-1.5">
                      <span className="text-[10px] font-bold text-red-600">Late Policy:</span>
                      <p className="text-[11px] text-slate-700"><E value={a.formatRequirements.latePolicy} path={['assignments', i, 'formatRequirements', 'latePolicy']} onEdit={onEdit} /></p>
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

              {/* Scaffolding milestones */}
              {a.scaffoldingMilestones?.length > 0 && (
                <div>
                  <SectionHeading>Scaffolding Milestones</SectionHeading>
                  <div className="space-y-2">
                    {a.scaffoldingMilestones.map((m, j) => (
                      <div key={j} className="flex gap-3 items-start bg-indigo-50/30 rounded-lg px-3 py-2 border border-indigo-100/40">
                        <div className="flex-shrink-0 text-center">
                          <span className="text-[9px] font-bold text-indigo-600 block">{m.dueDate}</span>
                        </div>
                        <div className="flex-1">
                          <span className="text-xs font-semibold text-indigo-800 block"><E value={m.milestone} path={['assignments', i, 'scaffoldingMilestones', j, 'milestone']} onEdit={onEdit} /></span>
                          {m.description && <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed"><E value={m.description} path={['assignments', i, 'scaffoldingMilestones', j, 'description']} onEdit={onEdit} /></p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Grading criteria — internal, hidden in student view */}
              {a.gradingCriteria && !isStudentView && (
                <div>
                  <SectionHeading>Grading Criteria Summary</SectionHeading>
                  <p className="text-xs text-slate-600 leading-relaxed"><E value={a.gradingCriteria} path={['assignments', i, 'gradingCriteria']} onEdit={onEdit} multiline /></p>
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
                  <h4 className="text-[10px] font-bold text-slate-600 uppercase tracking-wide mb-1">⚖️ Academic Integrity</h4>
                  <p className="text-[11px] text-slate-600 leading-relaxed"><E value={a.academicIntegrityStatement} path={['assignments', i, 'academicIntegrityStatement']} onEdit={onEdit} multiline /></p>
                </div>
              )}
            </div>
          </CollapsibleCard>
          </React.Fragment>
        );
      })}
    </div>
  );
}

