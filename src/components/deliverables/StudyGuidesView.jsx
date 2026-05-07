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
  CollapsibleCard,
  Badge,
  BloomsTag,
  SectionHeading,
  FEATURE_META,
  TierToggle,
} from './shared/SharedComponents';

// ─── Study Guides ───
export default function StudyGuidesView({
  data,
  isStreaming,
  onEdit,
  regeneratingIndex,
  onRegenerateLesson,
  activeTier,
  freshLessonIndices,
  proposals,
  onAcceptProposal,
  onDismissProposal,
  onRegenerateProposal,
}) {
  const [localTiers, setLocalTiers] = useState({});
  if (!data) return isStreaming ? <StreamingBanner /> : <EmptyState />;
  const key = data.guides ? 'guides' : 'studyGuides';
  const guides = data[key] || [];
  if (guides.length === 0 && !isStreaming) return <EmptyState />;
  return (
    <div className="space-y-3 p-4">
      {guides.map((baseG, i) => {
        // Feature 4.1 — select tier variant
        const currentTier = localTiers[i] || 'standard';
        const g =
          currentTier !== 'standard' && baseG.tiers?.[currentTier] ? { ...baseG, ...baseG.tiers[currentTier] } : baseG;
        const subtitle = g.examScope || '';
        return (
          <React.Fragment key={i}>
            {proposals?.[i] && (
              <EditProposalPanel
                proposal={proposals[i]}
                featureId="studyGuides"
                onInsert={() => onAcceptProposal?.(i)}
                onDismiss={() => onDismissProposal?.(i)}
                onRegenerate={() => onRegenerateProposal?.(i)}
              />
            )}
            <CollapsibleCard
              title={g.lessonTitle || `Guide ${i + 1}`}
              subtitle={subtitle}
              defaultOpen={i < 3}
              accent="teal"
              streaming={isStreaming && i === guides.length - 1}
              regenerating={regeneratingIndex === i}
              fresh={!!freshLessonIndices?.has(i)}
              onRegenerate={onRegenerateLesson && !isStreaming ? () => onRegenerateLesson(i) : undefined}
              onTitleEdit={onEdit ? (newTitle) => onEdit([key, i, 'lessonTitle'], newTitle) : undefined}
            >
              <div className="pt-3 space-y-4">
                {/* Summary */}
                {g.summary && (
                  <div>
                    <SectionHeading>Concept Summary</SectionHeading>
                    <p className="text-xs text-slate-700 leading-relaxed">
                      <E value={g.summary} path={[key, i, 'summary']} onEdit={onEdit} multiline />
                    </p>
                  </div>
                )}

                {/* Key Terms */}
                {g.keyTerms?.length > 0 && (
                  <div>
                    <SectionHeading>Key Terms &amp; Definitions</SectionHeading>
                    <div className="space-y-2">
                      {g.keyTerms.map((t, j) => (
                        <div key={j} className="bg-teal-50/40 rounded-lg px-3 py-2 border border-teal-100/50">
                          <div className="flex flex-wrap items-baseline gap-1">
                            <span className="text-xs font-bold text-teal-800">
                              <E value={t.term} path={[key, i, 'keyTerms', j, 'term']} onEdit={onEdit} />
                            </span>
                            <span className="text-[11px] text-slate-600">
                              — <E value={t.definition} path={[key, i, 'keyTerms', j, 'definition']} onEdit={onEdit} />
                            </span>
                          </div>
                          {t.example && (
                            <p className="text-[10px] text-teal-600 mt-0.5 italic">
                              <span className="font-semibold not-italic">Ex:</span>{' '}
                              <E value={t.example} path={[key, i, 'keyTerms', j, 'example']} onEdit={onEdit} />
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Concept connections */}
                {g.conceptConnections?.length > 0 && (
                  <div>
                    <SectionHeading>Concept Connections</SectionHeading>
                    <ul className="space-y-1.5">
                      {g.conceptConnections.map((c, j) => (
                        <li key={j} className="text-xs text-slate-700 flex gap-2 leading-relaxed">
                          <span className="text-teal-400 flex-shrink-0">🔗</span>
                          <E value={c} path={[key, i, 'conceptConnections', j]} onEdit={onEdit} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Common misconceptions */}
                {g.commonMisconceptions?.length > 0 && (
                  <div className="bg-red-50/30 rounded-lg p-3 border border-red-100/40">
                    <SectionHeading>Common Misconceptions</SectionHeading>
                    <div className="space-y-2.5">
                      {g.commonMisconceptions.map((m, j) => (
                        <div key={j}>
                          <p className="text-xs text-red-700 font-medium flex gap-1.5">
                            <span>✗</span>
                            <E
                              value={m.misconception}
                              path={[key, i, 'commonMisconceptions', j, 'misconception']}
                              onEdit={onEdit}
                            />
                          </p>
                          {m.correction && (
                            <p className="text-xs text-emerald-700 flex gap-1.5 mt-0.5 ml-4">
                              <span>✓</span>
                              <E
                                value={m.correction}
                                path={[key, i, 'commonMisconceptions', j, 'correction']}
                                onEdit={onEdit}
                              />
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Review Questions */}
                {g.reviewQuestions?.length > 0 && (
                  <div>
                    <SectionHeading>Review Questions</SectionHeading>
                    <ol className="space-y-2">
                      {g.reviewQuestions.map((q, j) => {
                        const isObj = typeof q === 'object' && q !== null;
                        const qText = isObj ? q.question : q;
                        const bloomsLevel = isObj ? q.bloomsLevel : null;
                        const hint = isObj ? q.hint : null;
                        return (
                          <li key={j} className="text-xs text-slate-700">
                            <div className="flex items-start gap-2">
                              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-[10px] font-bold flex items-center justify-center mt-0.5">
                                {j + 1}
                              </span>
                              <div className="flex-1">
                                <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                                  {bloomsLevel && <BloomsTag level={bloomsLevel} />}
                                </div>
                                <E
                                  value={qText}
                                  path={[key, i, 'reviewQuestions', j, ...(isObj ? ['question'] : [])]}
                                  onEdit={onEdit}
                                />
                                {hint && (
                                  <p className="text-[10px] text-slate-400 mt-0.5 italic">
                                    💡{' '}
                                    <E
                                      value={hint}
                                      path={[key, i, 'reviewQuestions', j, 'hint']}
                                      onEdit={onEdit}
                                      className="text-[10px] text-slate-400 italic"
                                    />
                                  </p>
                                )}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}

                {/* Practice Activities */}
                {g.practiceActivities?.length > 0 && (
                  <div>
                    <SectionHeading>Practice Activities</SectionHeading>
                    <ul className="space-y-1.5">
                      {g.practiceActivities.map((a, j) => (
                        <li key={j} className="text-xs text-slate-700 flex gap-2 leading-relaxed">
                          <span className="text-teal-400 flex-shrink-0 mt-0.5">▸</span>
                          <E value={a} path={[key, i, 'practiceActivities', j]} onEdit={onEdit} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Exam Prep */}
                {g.examPrep && (
                  <div className="bg-amber-50/40 rounded-lg p-3 border border-amber-100/50 space-y-2">
                    <h4 className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">📝 Exam Prep</h4>
                    {g.examPrep.keyTopicsToKnow?.length > 0 && (
                      <div>
                        <span className="text-[10px] font-bold text-amber-700 uppercase">High-Probability Topics</span>
                        <ul className="mt-1 space-y-0.5">
                          {g.examPrep.keyTopicsToKnow.map((t, j) => (
                            <li key={j} className="text-xs text-slate-700 flex gap-1.5">
                              <span className="text-amber-400 flex-shrink-0">★</span>
                              <E value={t} path={[key, i, 'examPrep', 'keyTopicsToKnow', j]} onEdit={onEdit} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {g.examPrep.commonErrors && (
                      <div>
                        <span className="text-[10px] font-bold text-red-600 uppercase">Common Errors to Avoid</span>
                        <p className="text-xs text-slate-700 mt-0.5 leading-relaxed">
                          <E
                            value={g.examPrep.commonErrors}
                            path={[key, i, 'examPrep', 'commonErrors']}
                            onEdit={onEdit}
                            multiline
                          />
                        </p>
                      </div>
                    )}
                    {g.examPrep.reviewStrategy && (
                      <div>
                        <span className="text-[10px] font-bold text-teal-700 uppercase">
                          Recommended Study Strategy
                        </span>
                        <p className="text-xs text-slate-700 mt-0.5 leading-relaxed">
                          <E
                            value={g.examPrep.reviewStrategy}
                            path={[key, i, 'examPrep', 'reviewStrategy']}
                            onEdit={onEdit}
                            multiline
                          />
                        </p>
                      </div>
                    )}
                    {g.examPrep.timeManagement && (
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Time Management</span>
                        <p className="text-xs text-slate-700 mt-0.5 leading-relaxed">
                          <E
                            value={g.examPrep.timeManagement}
                            path={[key, i, 'examPrep', 'timeManagement']}
                            onEdit={onEdit}
                          />
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Legacy examTips field */}
                {!g.examPrep && g.examTips && (
                  <div className="bg-amber-50/40 rounded-lg p-3 border border-amber-100/50">
                    <h4 className="text-[11px] font-bold text-amber-700 mb-1">💡 Exam Tips</h4>
                    <p className="text-xs text-slate-700">
                      <E value={g.examTips} path={[key, i, 'examTips']} onEdit={onEdit} multiline />
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
