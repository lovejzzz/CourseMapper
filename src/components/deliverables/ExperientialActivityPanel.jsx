import { E, SectionHeading } from './shared/SharedComponents';

export default function ExperientialActivityPanel({ packet, assignmentIndex, onEdit }) {
  if (!packet) return null;
  const path = (...parts) => ['assignments', assignmentIndex, 'activityPacket', ...parts];
  return (
    <section
      data-experiential-activity="true"
      className="space-y-4 rounded-xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50/70 via-white to-cyan-50/50 p-3.5 dark:border-indigo-400/20 dark:from-indigo-950/25 dark:via-slate-900/50 dark:to-cyan-950/20"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-500 dark:text-indigo-300">
            Activity briefing
          </p>
          <h4 className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white">
            <E value={packet.activityType} path={path('activityType')} onEdit={onEdit} />
          </h4>
        </div>
        <div className="rounded-full border border-indigo-200/70 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 dark:border-indigo-400/20 dark:bg-slate-900/70 dark:text-indigo-200">
          {packet.totalMinutes} minutes · {packet.timing?.length || 0} phases
        </div>
      </div>

      <div>
        <SectionHeading>Situation</SectionHeading>
        <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-200">
          <E value={packet.scenario} path={path('scenario')} onEdit={onEdit} multiline />
        </p>
      </div>

      {packet.safetyBoundary && (
        <div className="rounded-lg border border-sky-200/80 bg-sky-50/75 px-3 py-2 text-xs leading-relaxed text-sky-950 dark:border-sky-400/20 dark:bg-sky-950/25 dark:text-sky-100">
          <span className="font-bold">Safety and evidence boundary: </span>
          <E value={packet.safetyBoundary} path={path('safetyBoundary')} onEdit={onEdit} multiline />
        </div>
      )}

      {packet.evidence?.length > 0 && (
        <div>
          <SectionHeading>Inspect Before Acting</SectionHeading>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {packet.evidence.map((item, index) => (
              <div
                key={index}
                className="rounded-lg border border-slate-200/70 bg-white/80 px-2.5 py-2 text-xs leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
              >
                <span className="mr-1.5 font-bold text-indigo-500">{index + 1}</span>
                <E value={item} path={path('evidence', index)} onEdit={onEdit} multiline />
              </div>
            ))}
          </div>
        </div>
      )}

      {packet.roles?.length > 0 && (
        <div>
          <SectionHeading>Participant or Working Roles</SectionHeading>
          <div className="grid gap-2 lg:grid-cols-2">
            {packet.roles.map((role, index) => (
              <article
                key={index}
                className="rounded-xl border border-indigo-200/60 bg-white/85 p-3 shadow-sm shadow-indigo-950/5 dark:border-indigo-400/20 dark:bg-slate-900/65"
              >
                <h5 className="mb-2 text-xs font-bold text-indigo-800 dark:text-indigo-200">
                  <E value={role.name} path={path('roles', index, 'name')} onEdit={onEdit} />
                </h5>
                <p className="mb-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">Goal: </span>
                  <E value={role.goal} path={path('roles', index, 'goal')} onEdit={onEdit} multiline />
                </p>
                <p className="mb-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">Constraint: </span>
                  <E value={role.constraint} path={path('roles', index, 'constraint')} onEdit={onEdit} multiline />
                </p>
                {role.privateInformation && (
                  <div className="mt-2 rounded-lg border border-violet-200/70 bg-violet-50/80 px-2.5 py-2 text-xs leading-relaxed text-violet-900 dark:border-violet-400/20 dark:bg-violet-950/25 dark:text-violet-100">
                    <span className="font-bold">Role-only information: </span>
                    <E
                      value={role.privateInformation}
                      path={path('roles', index, 'privateInformation')}
                      onEdit={onEdit}
                      multiline
                    />
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      )}

      {packet.phases?.length > 0 && (
        <div>
          <SectionHeading>Phases and Updates</SectionHeading>
          <div className="space-y-2">
            {packet.phases.map((phase, index) => (
              <article
                key={index}
                className="grid gap-2 rounded-xl border border-cyan-200/70 bg-white/80 p-3 md:grid-cols-[9rem_1fr] dark:border-cyan-400/20 dark:bg-slate-900/60"
              >
                <h5 className="text-xs font-bold text-cyan-800 dark:text-cyan-200">
                  <E value={phase.title} path={path('phases', index, 'title')} onEdit={onEdit} />
                </h5>
                <div className="space-y-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  <p>
                    <span className="font-semibold text-slate-800 dark:text-slate-100">Information: </span>
                    <E
                      value={phase.information}
                      path={path('phases', index, 'information')}
                      onEdit={onEdit}
                      multiline
                    />
                  </p>
                  <p>
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      Required decision or action:{' '}
                    </span>
                    <E
                      value={phase.requiredDecision}
                      path={path('phases', index, 'requiredDecision')}
                      onEdit={onEdit}
                      multiline
                    />
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200/70 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/60">
          <SectionHeading>Activity Clock</SectionHeading>
          <ol className="space-y-1.5">
            {packet.timing?.map((row, index) => (
              <li
                key={index}
                className="flex items-center justify-between gap-3 text-xs text-slate-700 dark:text-slate-200"
              >
                <E value={row.phase} path={path('timing', index, 'phase')} onEdit={onEdit} />
                <span className="shrink-0 font-bold text-indigo-600 dark:text-indigo-300">{row.minutes} min</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-xl border border-slate-200/70 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/60">
          <SectionHeading>Activity Log</SectionHeading>
          <ul className="space-y-1">
            {packet.activityLogFields?.map((field, index) => (
              <li key={index} className="flex gap-2 text-xs text-slate-700 dark:text-slate-200">
                <span className="font-bold text-indigo-500">□</span>
                <E value={field} path={path('activityLogFields', index)} onEdit={onEdit} />
              </li>
            ))}
          </ul>
        </div>
      </div>

      {packet.artifact && (
        <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/55 p-3 dark:border-emerald-400/20 dark:bg-emerald-950/20">
          <SectionHeading>Student Artifact</SectionHeading>
          <h5 className="mb-2 text-xs font-bold text-emerald-900 dark:text-emerald-100">
            <E value={packet.artifact.title} path={path('artifact', 'title')} onEdit={onEdit} />
          </h5>
          <ol className="space-y-1.5">
            {packet.artifact.requirements?.map((requirement, index) => (
              <li key={index} className="flex gap-2 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                <span className="font-bold text-emerald-600">{index + 1}.</span>
                <E value={requirement} path={path('artifact', 'requirements', index)} onEdit={onEdit} multiline />
              </li>
            ))}
          </ol>
        </div>
      )}

      {packet.debriefPrompts?.length > 0 && (
        <div>
          <SectionHeading>Debrief</SectionHeading>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {packet.debriefPrompts.map((prompt, index) => (
              <li
                key={index}
                className="rounded-lg border border-slate-200/70 bg-white/75 px-2.5 py-2 text-xs leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-900/55 dark:text-slate-200"
              >
                <E value={prompt} path={path('debriefPrompts', index)} onEdit={onEdit} multiline />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
