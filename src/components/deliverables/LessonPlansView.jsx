import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import EditProposalPanel from '../EditProposalPanel';
import { renderedDeliverableCollectionKey } from '../../lib/renderedDeliverableCollection.js';
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

// ─── Lesson Plans ───
export default function LessonPlansView({
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
  const key = renderedDeliverableCollectionKey('lessonPlans', data);
  const plans = key ? data[key] : [];
  if (plans.length === 0 && !isStreaming) return <EmptyState />;
  return (
    <div className="space-y-3 p-4">
      {plans.map((basePlan, i) => {
        // Feature 4.1 — select tier variant
        const currentTier = localTiers[i] || 'standard';
        const plan =
          currentTier !== 'standard' && basePlan.tiers?.[currentTier]
            ? { ...basePlan, ...basePlan.tiers[currentTier] }
            : basePlan;
        const bloomsTags = plan.bloomsLevels || [];
        const outlineHasType = plan.outline?.some((row) => row.type || row.bloomsLevel);
        const subtitle = [plan.duration, plan.weekNumber].filter(Boolean).join(' · ');
        return (
          <React.Fragment key={i}>
            {proposals?.[i] && (
              <EditProposalPanel
                proposal={proposals[i]}
                featureId="lessonPlans"
                onInsert={() => onAcceptProposal?.(i)}
                onDismiss={() => onDismissProposal?.(i)}
                onRegenerate={() => onRegenerateProposal?.(i)}
              />
            )}
            <CollapsibleCard
              viewportIndex={i}
              title={plan.lessonTitle || plan.title || `Plan ${i + 1}`}
              subtitle={subtitle}
              defaultOpen={i < 3}
              accent="violet"
              streaming={isStreaming && i === plans.length - 1}
              regenerating={regeneratingIndex === i}
              fresh={!!freshLessonIndices?.has(i)}
              onRegenerate={onRegenerateLesson && !isStreaming ? () => onRegenerateLesson(i) : undefined}
              onTitleEdit={onEdit ? (newTitle) => onEdit([key, i, 'lessonTitle'], newTitle) : undefined}
            >
              <div className="space-y-4 pt-3">
                {/* Bloom's levels row */}
                {bloomsTags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {bloomsTags.map((b, k) => (
                      <BloomsTag key={k} level={b} />
                    ))}
                  </div>
                )}

                {/* Learning Objectives */}
                {plan.objectives?.length > 0 && (
                  <div>
                    <SectionHeading>Learning Objectives</SectionHeading>
                    <ul className="space-y-1.5">
                      {plan.objectives.map((o, j) => (
                        <li key={j} className="text-xs text-slate-700 flex gap-2 leading-relaxed">
                          <span className="text-violet-400 mt-0.5 flex-shrink-0">•</span>
                          <E value={o} path={[key, i, 'objectives', j]} onEdit={onEdit} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {plan.sourceEvidenceBrief?.claims?.length > 0 && (
                  <div className="rounded-xl border border-violet-100 bg-violet-50/45 p-3">
                    <SectionHeading>Source Evidence for This Lesson</SectionHeading>
                    <ul className="mt-1.5 space-y-1.5">
                      {plan.sourceEvidenceBrief.claims.map((claim, j) => (
                        <li key={j} className="flex gap-2 text-xs leading-relaxed text-slate-700">
                          <span className="mt-0.5 shrink-0 text-violet-400">◆</span>
                          <E value={claim} path={[key, i, 'sourceEvidenceBrief', 'claims', j]} onEdit={onEdit} />
                        </li>
                      ))}
                    </ul>
                    {plan.sourceEvidenceBrief.sources?.length > 0 && (
                      <p className="mt-2 text-xs leading-relaxed text-slate-500">
                        <span className="font-semibold text-slate-600">Retained sources:</span>{' '}
                        {plan.sourceEvidenceBrief.sources.map((source, j) => (
                          <React.Fragment key={`${source.url || source.title}-${j}`}>
                            {j > 0 ? '; ' : ''}
                            {source.url ? (
                              <a
                                href={source.url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium text-violet-600 underline decoration-violet-200 underline-offset-2"
                              >
                                {source.title}
                              </a>
                            ) : (
                              source.title
                            )}
                          </React.Fragment>
                        ))}
                      </p>
                    )}
                  </div>
                )}

                {/* Warm-up */}
                {plan.warmUp && (
                  <div className="bg-amber-50/50 rounded-lg p-3 border border-amber-100/60">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs">🔥</span>
                      <SectionHeading>Warm-Up</SectionHeading>
                      {plan.warmUp.duration && (
                        <span className="text-xs text-amber-600 font-semibold ml-auto">{plan.warmUp.duration}</span>
                      )}
                    </div>
                    {plan.warmUp.type && <Badge color="amber">{plan.warmUp.type}</Badge>}
                    {plan.warmUp.prompt && (
                      <p className="text-xs text-slate-800 mt-1.5 font-medium leading-relaxed italic">
                        "<E value={plan.warmUp.prompt} path={[key, i, 'warmUp', 'prompt']} onEdit={onEdit} />"
                      </p>
                    )}
                    {plan.warmUp.purpose && (
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        <span className="font-semibold">Purpose:</span>{' '}
                        <E value={plan.warmUp.purpose} path={[key, i, 'warmUp', 'purpose']} onEdit={onEdit} />
                      </p>
                    )}
                    {plan.warmUp.facilitation && (
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed italic">
                        💡{' '}
                        <E value={plan.warmUp.facilitation} path={[key, i, 'warmUp', 'facilitation']} onEdit={onEdit} />
                      </p>
                    )}
                  </div>
                )}

                {/* Materials */}
                {plan.materials?.length > 0 && (
                  <div>
                    <SectionHeading>Materials &amp; Resources</SectionHeading>
                    <ul className="space-y-1">
                      {plan.materials.map((m, j) => (
                        <li key={j} className="text-xs text-slate-600 flex gap-2">
                          <span className="text-violet-300 flex-shrink-0">▸</span>
                          <E value={m} path={[key, i, 'materials', j]} onEdit={onEdit} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Session Outline */}
                {plan.outline?.length > 0 && (
                  <div>
                    <SectionHeading>Session Outline</SectionHeading>
                    <div data-testid="lesson-outline-mobile" className="space-y-2 sm:hidden">
                      {plan.outline.map((row, j) => (
                        <div key={j} className="rounded-lg border border-slate-100 bg-white/50 p-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <span className="shrink-0 text-xs font-semibold text-violet-600">
                              <E value={row.time} path={[key, i, 'outline', j, 'time']} onEdit={onEdit} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs font-semibold text-slate-700">
                                  <E value={row.activity} path={[key, i, 'outline', j, 'activity']} onEdit={onEdit} />
                                </span>
                                {row.type && (
                                  <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-500">
                                    {row.type}
                                  </span>
                                )}
                                {row.bloomsLevel && <BloomsTag level={row.bloomsLevel} />}
                              </div>
                              {row.grouping && (
                                <span className="mt-0.5 block text-xs text-slate-400">{row.grouping}</span>
                              )}
                            </div>
                          </div>
                          <div className="mt-2 text-xs leading-relaxed text-slate-600">
                            <E
                              value={row.description}
                              path={[key, i, 'outline', j, 'description']}
                              onEdit={onEdit}
                              multiline
                            />
                          </div>
                          {(row.instructorNotes || row.notes) && (
                            <span className="mt-1.5 block text-xs italic text-slate-400">
                              💡{' '}
                              <E
                                value={row.instructorNotes || row.notes}
                                path={[key, i, 'outline', j, row.instructorNotes ? 'instructorNotes' : 'notes']}
                                onEdit={onEdit}
                                className="text-xs italic text-slate-400"
                              />
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    <div
                      data-testid="lesson-outline-table"
                      className="hidden overflow-hidden rounded-lg border border-slate-100 sm:block"
                    >
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50/80">
                            <th className="text-left px-3 py-2 font-semibold text-slate-500 w-20">Time</th>
                            <th className="text-left px-3 py-2 font-semibold text-slate-500 w-28">Activity</th>
                            {/* A column of nothing reads as missing data —
                                render Type only when some row has one. */}
                            {outlineHasType && (
                              <th className="text-left px-3 py-2 font-semibold text-slate-500 w-16">Type</th>
                            )}
                            <th className="text-left px-3 py-2 font-semibold text-slate-500">
                              Description &amp; Notes
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {plan.outline.map((row, j) => (
                            <tr key={j} className={j % 2 === 0 ? 'bg-white/50' : 'bg-slate-50/30'}>
                              <td className="px-3 py-2 text-violet-600 font-medium whitespace-nowrap align-top">
                                <E value={row.time} path={[key, i, 'outline', j, 'time']} onEdit={onEdit} />
                              </td>
                              <td className="px-3 py-2 font-medium text-slate-700 align-top">
                                <E value={row.activity} path={[key, i, 'outline', j, 'activity']} onEdit={onEdit} />
                                {row.grouping && (
                                  <span className="block text-xs text-slate-400 mt-0.5">{row.grouping}</span>
                                )}
                              </td>
                              {outlineHasType && (
                                <td className="px-3 py-2 align-top">
                                  {row.type && (
                                    <span className="text-xs text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded font-medium">
                                      {row.type}
                                    </span>
                                  )}
                                  {row.bloomsLevel && <BloomsTag level={row.bloomsLevel} />}
                                </td>
                              )}
                              <td className="px-3 py-2 text-slate-600 align-top">
                                <E
                                  value={row.description}
                                  path={[key, i, 'outline', j, 'description']}
                                  onEdit={onEdit}
                                  multiline
                                />
                                {(row.instructorNotes || row.notes) && (
                                  <span className="block mt-1 text-xs text-slate-400 italic">
                                    💡{' '}
                                    <E
                                      value={row.instructorNotes || row.notes}
                                      path={[key, i, 'outline', j, row.instructorNotes ? 'instructorNotes' : 'notes']}
                                      onEdit={onEdit}
                                      className="text-xs text-slate-400 italic"
                                    />
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Sky-observation courses promise work outside the classroom.
                    Keep the executable protocol visible in the workspace—not
                    only inside the downloaded DOCX—so users can verify the
                    weekly target, log fields, safety basics, and cloudy-night
                    fallback before export. */}
                {plan.observationProtocol && (
                  <div className="rounded-xl border border-cyan-100 bg-cyan-50/45 p-3.5">
                    <div className="mb-2 flex items-center gap-2">
                      <span aria-hidden="true" className="text-sm">
                        ✦
                      </span>
                      <SectionHeading>Evening Observation</SectionHeading>
                      <span className="ml-auto rounded-full bg-white/80 px-2 py-0.5 text-xs font-semibold text-cyan-700">
                        Field protocol
                      </span>
                    </div>
                    {plan.observationProtocol.weeklyFocus && (
                      <div className="rounded-lg border border-cyan-100/80 bg-white/70 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">This week</p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-700">
                          <E
                            value={plan.observationProtocol.weeklyFocus}
                            path={[key, i, 'observationProtocol', 'weeklyFocus']}
                            onEdit={onEdit}
                            multiline
                          />
                        </p>
                      </div>
                    )}
                    {plan.observationProtocol.logFields?.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold text-slate-600">Record in the observing log</p>
                        <ul className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                          {plan.observationProtocol.logFields.map((field, fieldIndex) => (
                            <li
                              key={fieldIndex}
                              className="flex gap-2 rounded-md bg-white/45 px-2.5 py-2 text-xs leading-relaxed text-slate-600"
                            >
                              <span aria-hidden="true" className="mt-0.5 text-cyan-500">
                                ✓
                              </span>
                              <E
                                value={field}
                                path={[key, i, 'observationProtocol', 'logFields', fieldIndex]}
                                onEdit={onEdit}
                              />
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {plan.observationProtocol.cloudyAlternative && (
                      <div className="mt-3 rounded-lg border border-slate-200/70 bg-white/65 p-3">
                        <p className="text-xs font-semibold text-slate-700">If the sky is cloudy</p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-600">
                          <E
                            value={plan.observationProtocol.cloudyAlternative}
                            path={[key, i, 'observationProtocol', 'cloudyAlternative']}
                            onEdit={onEdit}
                            multiline
                          />
                        </p>
                      </div>
                    )}
                    {plan.observationProtocol.observingBasics && (
                      <p className="mt-2.5 text-xs leading-relaxed text-slate-500">
                        <span className="font-semibold text-slate-600">Observe safely:</span>{' '}
                        <E
                          value={plan.observationProtocol.observingBasics}
                          path={[key, i, 'observationProtocol', 'observingBasics']}
                          onEdit={onEdit}
                          multiline
                        />
                      </p>
                    )}
                  </div>
                )}

                {/* Formative Assessment */}
                {plan.formativeCheck && (
                  <div className="bg-sky-50/50 rounded-lg p-3 border border-sky-100/60">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs">📋</span>
                      <SectionHeading>Formative Assessment</SectionHeading>
                    </div>
                    {plan.formativeCheck.type && <Badge color="sky">{plan.formativeCheck.type}</Badge>}
                    {plan.formativeCheck.prompt && (
                      <p className="text-xs text-slate-800 mt-1.5 leading-relaxed italic">
                        "
                        <E
                          value={plan.formativeCheck.prompt}
                          path={[key, i, 'formativeCheck', 'prompt']}
                          onEdit={onEdit}
                        />
                        "
                      </p>
                    )}
                    {plan.formativeCheck.objectiveAligned && (
                      <p className="text-xs text-slate-500 mt-1">
                        <span className="font-semibold">Aligns to:</span>{' '}
                        <E
                          value={plan.formativeCheck.objectiveAligned}
                          path={[key, i, 'formativeCheck', 'objectiveAligned']}
                          onEdit={onEdit}
                        />
                      </p>
                    )}
                    {plan.formativeCheck.instructorAction && (
                      <p className="text-xs text-slate-400 mt-1 italic">
                        💡{' '}
                        <E
                          value={plan.formativeCheck.instructorAction}
                          path={[key, i, 'formativeCheck', 'instructorAction']}
                          onEdit={onEdit}
                        />
                      </p>
                    )}
                  </div>
                )}

                {/* UDL Notes */}
                {plan.udlNotes &&
                  (plan.udlNotes.representation || plan.udlNotes.engagement || plan.udlNotes.expression) && (
                    <div className="bg-teal-50/40 rounded-lg p-3 border border-teal-100/50">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs">♿</span>
                        <SectionHeading>UDL Notes</SectionHeading>
                      </div>
                      {plan.udlNotes.representation && (
                        <div className="mb-1.5">
                          <span className="text-xs font-semibold text-slate-500">Representation</span>
                          <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                            <E
                              value={plan.udlNotes.representation}
                              path={[key, i, 'udlNotes', 'representation']}
                              onEdit={onEdit}
                            />
                          </p>
                        </div>
                      )}
                      {plan.udlNotes.engagement && (
                        <div className="mb-1.5">
                          <span className="text-xs font-semibold text-slate-500">Engagement</span>
                          <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                            <E
                              value={plan.udlNotes.engagement}
                              path={[key, i, 'udlNotes', 'engagement']}
                              onEdit={onEdit}
                            />
                          </p>
                        </div>
                      )}
                      {plan.udlNotes.expression && (
                        <div>
                          <span className="text-xs font-semibold text-slate-500">Expression</span>
                          <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                            <E
                              value={plan.udlNotes.expression}
                              path={[key, i, 'udlNotes', 'expression']}
                              onEdit={onEdit}
                            />
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                {/* Homework */}
                {(plan.homework || (typeof plan.homework === 'object' && plan.homework?.title)) && (
                  <div>
                    <SectionHeading>Homework</SectionHeading>
                    {typeof plan.homework === 'object' ? (
                      <div className="bg-slate-50/60 rounded-lg p-3 border border-slate-100">
                        {plan.homework.title && (
                          <p className="text-xs font-semibold text-slate-700 mb-1">
                            <E value={plan.homework.title} path={[key, i, 'homework', 'title']} onEdit={onEdit} />
                          </p>
                        )}
                        {plan.homework.description && (
                          <p className="text-xs text-slate-600 leading-relaxed">
                            <E
                              value={plan.homework.description}
                              path={[key, i, 'homework', 'description']}
                              onEdit={onEdit}
                              multiline
                            />
                          </p>
                        )}
                        <div className="flex gap-3 mt-1.5">
                          {plan.homework.estimatedTime && (
                            <span className="text-xs text-slate-400">⏱ {plan.homework.estimatedTime}</span>
                          )}
                          {plan.homework.connectionToNext && (
                            <span className="text-xs text-indigo-400">→ {plan.homework.connectionToNext}</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-700">
                        <E value={plan.homework} path={[key, i, 'homework']} onEdit={onEdit} multiline />
                      </p>
                    )}
                  </div>
                )}

                {/* Closing Activity */}
                {plan.closingActivity && (
                  <div>
                    <SectionHeading>Closing &amp; Wrap-Up</SectionHeading>
                    <p className="text-xs text-slate-700 leading-relaxed">
                      <E value={plan.closingActivity} path={[key, i, 'closingActivity']} onEdit={onEdit} multiline />
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
