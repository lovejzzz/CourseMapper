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

// ─── Discussion Prompts ───
export default function DiscussionsView({
  data,
  isStreaming,
  onEdit,
  regeneratingIndex,
  onRegenerateLesson,
  isStudentView,
  onSaveToBank,
  activeTier,
  freshLessonIndices,
  proposals,
  onAcceptProposal,
  onDismissProposal,
  onRegenerateProposal,
}) {
  const [localTiers, setLocalTiers] = useState({});
  if (!data) return isStreaming ? <StreamingBanner /> : <EmptyState />;
  const discussions = data.discussions || [];
  if (discussions.length === 0 && !isStreaming) return <EmptyState />;
  return (
    <div className="space-y-3 p-4">
      {discussions.map((baseD, i) => {
        // Feature 4.1 — select tier variant
        const currentTier = localTiers[i] || 'standard';
        const d =
          currentTier !== 'standard' && baseD.tiers?.[currentTier] ? { ...baseD, ...baseD.tiers[currentTier] } : baseD;
        const subtitle = [d.bloomsLevel, d.format, d.estimatedDuration].filter(Boolean).join(' · ');
        const sourceArtifacts = d.sourceArtifacts || d.af || d.artifacts || [];
        const sourceArtifactKey = d.sourceArtifacts ? 'sourceArtifacts' : d.af ? 'af' : 'artifacts';
        return (
          <React.Fragment key={i}>
            {proposals?.[i] && (
              <EditProposalPanel
                proposal={proposals[i]}
                featureId="discussions"
                onInsert={() => onAcceptProposal?.(i)}
                onDismiss={() => onDismissProposal?.(i)}
                onRegenerate={() => onRegenerateProposal?.(i)}
              />
            )}
            <CollapsibleCard
              viewportIndex={i}
              title={d.lessonTitle || `Discussion ${i + 1}`}
              subtitle={subtitle}
              defaultOpen={i < 3}
              accent="rose"
              streaming={isStreaming && i === discussions.length - 1}
              regenerating={regeneratingIndex === i}
              fresh={!!freshLessonIndices?.has(i)}
              onRegenerate={onRegenerateLesson && !isStreaming ? () => onRegenerateLesson(i) : undefined}
              onTitleEdit={onEdit ? (newTitle) => onEdit(['discussions', i, 'lessonTitle'], newTitle) : undefined}
            >
              <div className="pt-3 space-y-3">
                {/* Save to Bank button */}
                {onSaveToBank && d.prompt && (
                  <SaveToBankButton
                    onClick={() =>
                      onSaveToBank({ type: 'discussion', text: d.prompt, bloomsLevel: d.bloomsLevel || '' })
                    }
                  />
                )}

                {/* Meta row: Bloom's + format + time */}
                <div className="flex flex-wrap gap-1.5">
                  {d.bloomsLevel && <BloomsTag level={d.bloomsLevel} />}
                  {d.format && <Badge color="rose">{d.format}</Badge>}
                  {d.estimatedDuration && (
                    <span className="text-xs text-slate-400 self-center">⏱ {d.estimatedDuration}</span>
                  )}
                </div>

                {/* Context */}
                {d.context && (
                  <div>
                    <SectionHeading>Context</SectionHeading>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      <E value={d.context} path={['discussions', i, 'context']} onEdit={onEdit} multiline />
                    </p>
                  </div>
                )}

                {/* Main prompt */}
                <div className="bg-rose-50/40 rounded-lg p-3.5 border border-rose-100/50">
                  <SectionHeading>Discussion Prompt</SectionHeading>
                  <p className="text-sm text-slate-800 leading-relaxed font-medium">
                    <E value={d.prompt} path={['discussions', i, 'prompt']} onEdit={onEdit} multiline />
                  </p>
                  {d.evidenceRequirement && (
                    <p className="text-xs text-rose-600 mt-2 italic">
                      📚{' '}
                      <E
                        value={d.evidenceRequirement}
                        path={['discussions', i, 'evidenceRequirement']}
                        onEdit={onEdit}
                      />
                    </p>
                  )}
                </div>

                {sourceArtifacts.length > 0 && (
                  <div>
                    <SectionHeading>Source Artifacts</SectionHeading>
                    <div className="space-y-1.5">
                      {sourceArtifacts.map((artifact, j) => {
                        const isText = typeof artifact === 'string';
                        const title = isText
                          ? artifact
                          : artifact.title || artifact.at || artifact.name || artifact.label;
                        const locator = isText ? '' : artifact.locator || artifact.lo;
                        const artifactUse = isText ? '' : artifact.use || artifact.ut || artifact.purpose;
                        const titleKey =
                          artifact?.title !== undefined ? 'title' : artifact?.at !== undefined ? 'at' : 'title';
                        const locatorKey =
                          artifact?.locator !== undefined ? 'locator' : artifact?.lo !== undefined ? 'lo' : 'locator';
                        const useKey = artifact?.use !== undefined ? 'use' : artifact?.ut !== undefined ? 'ut' : 'use';
                        return (
                          <div key={j} className="rounded-lg border border-rose-100 bg-white/70 px-3 py-2">
                            <p className="text-xs font-semibold text-slate-800">
                              <E
                                value={title || `Source artifact ${j + 1}`}
                                path={
                                  isText
                                    ? ['discussions', i, sourceArtifactKey, j]
                                    : ['discussions', i, sourceArtifactKey, j, titleKey]
                                }
                                onEdit={onEdit}
                              />
                            </p>
                            {locator && (
                              <p className="mt-1 text-xs text-slate-500">
                                <span className="font-semibold text-slate-600">Locator: </span>
                                <E
                                  value={locator}
                                  path={['discussions', i, sourceArtifactKey, j, locatorKey]}
                                  onEdit={onEdit}
                                />
                              </p>
                            )}
                            {artifactUse && (
                              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                                <E
                                  value={artifactUse}
                                  path={['discussions', i, sourceArtifactKey, j, useKey]}
                                  onEdit={onEdit}
                                />
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Follow-up probes */}
                {d.followUpProbes?.length > 0 && (
                  <div>
                    <SectionHeading>Follow-Up Probes</SectionHeading>
                    <ul className="space-y-1.5">
                      {d.followUpProbes.map((probe, j) => (
                        <li key={j} className="text-xs text-slate-700 flex gap-2 leading-relaxed">
                          <span className="text-rose-400 flex-shrink-0">→</span>
                          <E value={probe} path={['discussions', i, 'followUpProbes', j]} onEdit={onEdit} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {/* Legacy single followUp field */}
                {!d.followUpProbes?.length && d.followUp && (
                  <div>
                    <SectionHeading>Follow-Up</SectionHeading>
                    <p className="text-xs text-slate-600">
                      <E value={d.followUp} path={['discussions', i, 'followUp']} onEdit={onEdit} multiline />
                    </p>
                  </div>
                )}

                {/* Facilitation tips — instructor-only, hidden in student view */}
                {d.facilitationTips && !isStudentView && (
                  <div className="bg-amber-50/40 rounded-lg p-3 border border-amber-100/50">
                    <SectionHeading>Facilitation Tips</SectionHeading>
                    {d.facilitationTips.opening && (
                      <div className="mb-1.5">
                        <span className="text-xs font-semibold text-slate-500">Opening</span>
                        <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                          <E
                            value={d.facilitationTips.opening}
                            path={['discussions', i, 'facilitationTips', 'opening']}
                            onEdit={onEdit}
                          />
                        </p>
                      </div>
                    )}
                    {d.facilitationTips.ifStalls && (
                      <div className="mb-1.5">
                        <span className="text-xs font-semibold text-slate-500">If Discussion Stalls</span>
                        <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                          <E
                            value={d.facilitationTips.ifStalls}
                            path={['discussions', i, 'facilitationTips', 'ifStalls']}
                            onEdit={onEdit}
                          />
                        </p>
                      </div>
                    )}
                    {d.facilitationTips.ifDominates && (
                      <div className="mb-1.5">
                        <span className="text-xs font-semibold text-slate-500">If One Student Dominates</span>
                        <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                          <E
                            value={d.facilitationTips.ifDominates}
                            path={['discussions', i, 'facilitationTips', 'ifDominates']}
                            onEdit={onEdit}
                          />
                        </p>
                      </div>
                    )}
                    {d.facilitationTips.closure && (
                      <div>
                        <span className="text-xs font-semibold text-slate-500">Closing the Discussion</span>
                        <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                          <E
                            value={d.facilitationTips.closure}
                            path={['discussions', i, 'facilitationTips', 'closure']}
                            onEdit={onEdit}
                          />
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Response starters */}
                {d.responseStarters?.length > 0 && (
                  <div>
                    <SectionHeading>Response Starters for Students</SectionHeading>
                    <div className="space-y-1">
                      {d.responseStarters.map((s, j) => (
                        <div
                          key={j}
                          className="text-xs text-slate-600 bg-white/60 rounded px-2.5 py-1.5 border border-slate-100 italic"
                        >
                          "<E value={s} path={['discussions', i, 'responseStarters', j]} onEdit={onEdit} />"
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Evaluation criteria — instructor-only, hidden in student view */}
                {d.evaluationCriteria?.length > 0 && !isStudentView && (
                  <div>
                    <SectionHeading>Evaluation Criteria</SectionHeading>
                    <ul className="space-y-1">
                      {d.evaluationCriteria.map((c, j) => (
                        <li key={j} className="text-xs text-slate-700 flex gap-2">
                          <span className="text-emerald-400 flex-shrink-0">✓</span>
                          <E value={c} path={['discussions', i, 'evaluationCriteria', j]} onEdit={onEdit} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Equity considerations */}
                {d.equityConsiderations && (
                  <div className="bg-teal-50/40 rounded-lg p-3 border border-teal-100/50">
                    <h4 className="text-xs font-semibold text-slate-500 mb-1">♿ Equity &amp; Inclusion</h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      <E
                        value={d.equityConsiderations}
                        path={['discussions', i, 'equityConsiderations']}
                        onEdit={onEdit}
                        multiline
                      />
                    </p>
                  </div>
                )}

                {/* Student-facing guidelines */}
                {d.guidelines && (
                  <div>
                    <SectionHeading>Student Guidelines</SectionHeading>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      <E value={d.guidelines} path={['discussions', i, 'guidelines']} onEdit={onEdit} multiline />
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
