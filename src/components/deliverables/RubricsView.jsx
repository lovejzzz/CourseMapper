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
} from './shared/SharedComponents';

// ─── Rubrics ───
export default function RubricsView({
  data,
  isStreaming,
  onEdit,
  regeneratingIndex,
  onRegenerateLesson,
  onSaveToBank,
  freshLessonIndices,
  proposals,
  onAcceptProposal,
  onDismissProposal,
  onRegenerateProposal,
}) {
  if (!data) return isStreaming ? <StreamingBanner /> : <EmptyState />;
  const rubrics = data.rubrics || [];
  if (rubrics.length === 0 && !isStreaming) return <EmptyState />;
  return (
    <div className="space-y-3 p-4">
      {/* Feature 7.4 — Export Gradebook CSV */}
      {rubrics.length > 0 && !isStreaming && (
        <div className="flex justify-end">
          <button
            onClick={() => exportRubricGradebook(data)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all"
          >
            <span>📊</span>
            <span>Export Gradebook CSV</span>
          </button>
        </div>
      )}
      {rubrics.map((rubric, i) => {
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
            <CollapsibleCard
              viewportIndex={i}
              title={gradedWork || rubric.lessonTitle || `Rubric ${i + 1}`}
              subtitle={subtitle}
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
                {gradedWork && (
                  <div className="text-[11px] text-slate-600 bg-emerald-50/70 border border-emerald-100 rounded-lg px-3 py-2">
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
                          className={`text-[10px] font-semibold px-2 py-1 rounded-md capitalize ${colors[level] || 'bg-slate-50 text-slate-600'}`}
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
                              <span className="text-[9px] text-indigo-400 block mt-0.5 leading-tight">
                                ↳{' '}
                                <E
                                  value={c.objectiveAligned}
                                  path={['rubrics', i, 'criteria', j, 'objectiveAligned']}
                                  onEdit={onEdit}
                                  className="text-[9px] text-indigo-400"
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
                    <h4 className="text-[10px] font-bold text-amber-700 uppercase tracking-wide mb-1">
                      📋 Calibration &amp; Grader Notes
                    </h4>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      <E value={rubric.teacherNotes} path={['rubrics', i, 'teacherNotes']} onEdit={onEdit} multiline />
                    </p>
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
