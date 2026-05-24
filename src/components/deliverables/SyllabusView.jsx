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
} from './shared/SharedComponents';
import { normalizeCourseRequirements } from '../../lib/exporters/syllabusExportUtils';

// ─── Syllabus ───
// Helper: render a policy block (heading + editable text)
function SylPolicyBlock({ label, value, path, onEdit }) {
  if (!value) return null;
  return (
    <div>
      <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">{label}</h4>
      <p className="text-xs text-slate-600 leading-relaxed">
        <E value={value} path={path} onEdit={onEdit} multiline />
      </p>
    </div>
  );
}
// Helper: format requiredTexts (supports both string[] and object[] for backward compat)
function formatTextEntry(t) {
  if (typeof t === 'string') return t;
  const parts = [];
  if (t.author) parts.push(t.author);
  if (t.title) parts.push(`*${t.title}*`);
  if (t.edition) parts.push(`(${t.edition})`);
  if (t.isbn) parts.push(`ISBN: ${t.isbn}`);
  if (t.note) parts.push(`— ${t.note}`);
  return parts.join('. ') || JSON.stringify(t);
}

export default function SyllabusView({ data, isStreaming, onEdit }) {
  const syl = data?.syllabus || data || {};
  const hasDates = syl.weeklySchedule?.[0]?.dates;
  const defaultSchedWidths = useMemo(() => (hasDates ? [60, 70, 180, 200, 200] : [60, 200, 220, 220]), [hasDates]);
  const [schedColWidths, setSchedColWidths] = useState(null);
  const activeSchedColWidths =
    schedColWidths?.length === defaultSchedWidths.length ? schedColWidths : defaultSchedWidths;
  const updateSchedCol = useCallback(
    (idx, w) => {
      setSchedColWidths((prev) => {
        const base = prev?.length === defaultSchedWidths.length ? prev : defaultSchedWidths;
        return base.map((v, i) => (i === idx ? w : v));
      });
    },
    [defaultSchedWidths],
  );

  if (!data) return isStreaming ? <StreamingBanner /> : <EmptyState />;
  if (!syl.courseTitle && !syl.courseDescription) return <EmptyState />;

  // Backward compat: old schema had gradingPolicy, new has courseRequirements
  const requirements = normalizeCourseRequirements(syl.courseRequirements, syl.gradingPolicy);
  const hasDescription = requirements.some((r) => r.description);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* ── Course Header Block ─────────────────────────────────── */}
      <div className="text-center border-b-2 border-slate-300/60 pb-5">
        <h2 className="text-lg font-bold text-slate-800">
          <E value={syl.courseTitle || ''} path={['syllabus', 'courseTitle']} onEdit={onEdit} />
        </h2>
        {syl.semester && (
          <p className="text-sm text-slate-500 mt-1">
            <E value={syl.semester} path={['syllabus', 'semester']} onEdit={onEdit} />
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-0.5 mt-2 text-xs text-slate-500">
          {syl.credits && (
            <span>
              <E value={syl.credits} path={['syllabus', 'credits']} onEdit={onEdit} />
            </span>
          )}
          {syl.meetingPattern && (
            <span>
              <E value={syl.meetingPattern} path={['syllabus', 'meetingPattern']} onEdit={onEdit} />
            </span>
          )}
          {syl.location && (
            <span>
              <E value={syl.location} path={['syllabus', 'location']} onEdit={onEdit} />
            </span>
          )}
          {syl.deliveryMode && (
            <span>
              <E value={syl.deliveryMode} path={['syllabus', 'deliveryMode']} onEdit={onEdit} />
            </span>
          )}
        </div>
        {syl.prerequisites && (
          <p className="text-xs text-slate-400 mt-1">
            Prerequisites: <E value={syl.prerequisites} path={['syllabus', 'prerequisites']} onEdit={onEdit} />
          </p>
        )}
      </div>

      {/* ── Instructor Information ──────────────────────────────── */}
      <div className="bg-slate-50/60 rounded-lg p-4 border border-slate-100">
        <h3 className="text-sm font-bold text-slate-700 mb-2">Instructor Information</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
          {syl.instructor && (
            <div>
              <span className="font-semibold text-slate-500">Instructor: </span>
              <E value={syl.instructor} path={['syllabus', 'instructor']} onEdit={onEdit} />
            </div>
          )}
          {syl.instructorEmail && (
            <div>
              <span className="font-semibold text-slate-500">Email: </span>
              <E value={syl.instructorEmail} path={['syllabus', 'instructorEmail']} onEdit={onEdit} />
            </div>
          )}
          {syl.officeHours && (
            <div>
              <span className="font-semibold text-slate-500">Office Hours: </span>
              <E value={syl.officeHours} path={['syllabus', 'officeHours']} onEdit={onEdit} />
            </div>
          )}
          {syl.officeLocation && (
            <div>
              <span className="font-semibold text-slate-500">Office: </span>
              <E value={syl.officeLocation} path={['syllabus', 'officeLocation']} onEdit={onEdit} />
            </div>
          )}
        </div>
      </div>

      {/* ── Course Description ──────────────────────────────────── */}
      {syl.courseDescription && (
        <div>
          <h3 className="text-sm font-bold text-slate-700 mb-1">Course Description</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            <E value={syl.courseDescription} path={['syllabus', 'courseDescription']} onEdit={onEdit} multiline />
          </p>
        </div>
      )}

      {/* ── Learning Outcomes ──────────────────────────────────── */}
      {syl.learningOutcomes?.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-700 mb-1.5">Student Learning Outcomes</h3>
          <p className="text-[10px] text-slate-400 mb-2">
            Upon successful completion of this course, students will be able to:
          </p>
          <ol className="space-y-1.5 list-decimal list-inside">
            {syl.learningOutcomes.map((o, i) => (
              <li key={i} className="text-xs text-slate-600 leading-relaxed">
                <E value={o} path={['syllabus', 'learningOutcomes', i]} onEdit={onEdit} />
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ── Outcome ↔ Assessment Alignment Matrix ──────────────────
          Accreditation artifact: every LO should be both practiced in
          at least one lesson AND assessed by at least one graded
          requirement. Missing either side reads as a red flag an
          instructor should fix before the course starts. */}
      {Array.isArray(syl.outcomeAlignmentMatrix) && syl.outcomeAlignmentMatrix.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-700 mb-1.5">Outcome ↔ Assessment Alignment</h3>
          <p className="text-[10px] text-slate-400 mb-2">
            Every listed outcome is mapped to the graded artifacts that measure it and the lessons where students
            practice before being assessed.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="border-b border-slate-200/60 bg-slate-50/40">
                  <th className="text-left px-2 py-1.5 font-semibold text-slate-500 w-[40%]">Learning outcome</th>
                  <th className="text-left px-2 py-1.5 font-semibold text-slate-500 w-16">Bloom's</th>
                  <th className="text-left px-2 py-1.5 font-semibold text-slate-500">Practiced in</th>
                  <th className="text-left px-2 py-1.5 font-semibold text-slate-500">Assessed by</th>
                </tr>
              </thead>
              <tbody>
                {syl.outcomeAlignmentMatrix.map((row, i) => {
                  const assessedBy = Array.isArray(row.assessedBy) ? row.assessedBy : [];
                  const practicedIn = Array.isArray(row.practicedIn) ? row.practicedIn : [];
                  const hasGap = assessedBy.length === 0 || practicedIn.length === 0;
                  return (
                    <tr key={i} className={`border-b border-slate-100 ${hasGap ? 'bg-amber-50/40' : ''}`}>
                      <td className="px-2 py-1.5 text-slate-700 leading-relaxed">
                        <E
                          value={row.outcome}
                          path={['syllabus', 'outcomeAlignmentMatrix', i, 'outcome']}
                          onEdit={onEdit}
                        />
                      </td>
                      <td className="px-2 py-1.5">{row.bloomsLevel && <BloomsTag level={row.bloomsLevel} />}</td>
                      <td className="px-2 py-1.5 text-slate-600 leading-relaxed">
                        {practicedIn.length > 0 ? (
                          practicedIn.map((p, k) => <div key={k}>• {p}</div>)
                        ) : (
                          <span className="text-amber-600 italic">⚠ Not practiced in any lesson</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-slate-600 leading-relaxed">
                        {assessedBy.length > 0 ? (
                          assessedBy.map((a, k) => <div key={k}>• {a}</div>)
                        ) : (
                          <span className="text-amber-600 italic">⚠ Not assessed</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Required Texts & Materials ─────────────────────────── */}
      {syl.requiredTexts?.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-700 mb-1.5">Required Texts & Materials</h3>
          <ul className="space-y-1.5">
            {syl.requiredTexts.map((t, i) => (
              <li key={i} className="text-xs text-slate-600 flex gap-2 leading-relaxed">
                <span className="text-slate-400 flex-shrink-0">•</span>
                {typeof t === 'string' ? (
                  <E value={t} path={['syllabus', 'requiredTexts', i]} onEdit={onEdit} />
                ) : (
                  <span>{formatTextEntry(t)}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Course Requirements & Grading ──────────────────────── */}
      {requirements.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-700 mb-1.5">Course Requirements & Grading</h3>
          <div className="rounded-lg border border-slate-200/60 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Component</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-600 w-16">Weight</th>
                  {hasDescription && <th className="text-left px-3 py-2 font-semibold text-slate-600">Description</th>}
                </tr>
              </thead>
              <tbody>
                {requirements.map((g, i) => {
                  const basePath = syl.courseRequirements ? 'courseRequirements' : 'gradingPolicy';
                  return (
                    <tr key={i} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-1.5 text-slate-700 font-medium">
                        <E
                          value={g.name || g.component || ''}
                          path={['syllabus', basePath, i, g.name ? 'name' : 'component']}
                          onEdit={onEdit}
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right text-slate-600 whitespace-nowrap">
                        <E value={g.weight || ''} path={['syllabus', basePath, i, 'weight']} onEdit={onEdit} />
                      </td>
                      {hasDescription && (
                        <td className="px-3 py-1.5 text-slate-500 leading-relaxed">
                          <E
                            value={g.description || ''}
                            path={['syllabus', basePath, i, 'description']}
                            onEdit={onEdit}
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Grading Scale ──────────────────────────────────────── */}
      {syl.gradingScale?.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-700 mb-1.5">Grading Scale</h3>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-600">
            {syl.gradingScale.map((g, i) => (
              <span key={i} className="whitespace-nowrap">
                <span className="font-semibold text-slate-700">{g.grade}</span> = {g.range}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Course Schedule (resizable columns) ─────────────── */}
      {syl.weeklySchedule?.length > 0 &&
        (() => {
          const headers = hasDates
            ? ['Week', 'Dates', 'Topic', 'Readings', 'Assignments']
            : ['Week', 'Topic', 'Readings', 'Assignments'];
          return (
            <div>
              <h3 className="text-sm font-bold text-slate-700 mb-1.5">Course Schedule</h3>
              <div className="rounded-lg border border-slate-200/60 overflow-x-auto">
                <table
                  className="text-xs"
                  style={{ tableLayout: 'fixed', width: activeSchedColWidths.reduce((a, b) => a + b, 0) + 'px' }}
                >
                  <thead>
                    <tr className="bg-slate-50">
                      {headers.map((h, idx) => (
                        <ResizableTh
                          key={h}
                          width={activeSchedColWidths[idx]}
                          onResize={(w) => updateSchedCol(idx, w)}
                          className="text-left px-3 py-2 font-semibold text-slate-600"
                        >
                          {h}
                        </ResizableTh>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {syl.weeklySchedule.map((w, i) => {
                      const cells = hasDates
                        ? [
                            { val: w.week, key: 'week', cls: 'text-slate-500 font-medium' },
                            { val: w.dates || '', key: 'dates', cls: 'text-slate-400' },
                            { val: w.topic, key: 'topic', cls: 'text-slate-700' },
                            { val: w.readings || '', key: 'readings', cls: 'text-slate-600' },
                            { val: w.assignments || '', key: 'assignments', cls: 'text-slate-600' },
                          ]
                        : [
                            { val: w.week, key: 'week', cls: 'text-slate-500 font-medium' },
                            { val: w.topic, key: 'topic', cls: 'text-slate-700' },
                            { val: w.readings || '', key: 'readings', cls: 'text-slate-600' },
                            { val: w.assignments || '', key: 'assignments', cls: 'text-slate-600' },
                          ];
                      return (
                        <tr key={i} className="border-t border-slate-100 align-top">
                          {cells.map((c, ci) => (
                            <td
                              key={c.key}
                              className={`px-3 py-1.5 ${c.cls}`}
                              style={{ width: activeSchedColWidths[ci] + 'px', wordBreak: 'break-word' }}
                            >
                              <E
                                value={c.val}
                                path={['syllabus', 'weeklySchedule', i, c.key]}
                                onEdit={onEdit}
                                multiline
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

      {/* ── Course Policies ────────────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-700">Course Policies</h3>
        <SylPolicyBlock
          label="Attendance & Participation"
          value={syl.attendancePolicy}
          path={['syllabus', 'attendancePolicy']}
          onEdit={onEdit}
        />
        <SylPolicyBlock
          label="Late Work Policy"
          value={syl.latePolicy}
          path={['syllabus', 'latePolicy']}
          onEdit={onEdit}
        />
        <SylPolicyBlock
          label="Communication"
          value={syl.communicationPolicy}
          path={['syllabus', 'communicationPolicy']}
          onEdit={onEdit}
        />
        <SylPolicyBlock
          label="Technology & Devices"
          value={syl.technologyPolicy}
          path={['syllabus', 'technologyPolicy']}
          onEdit={onEdit}
        />
        <SylPolicyBlock
          label="Generative AI Policy"
          value={syl.aiPolicy}
          path={['syllabus', 'aiPolicy']}
          onEdit={onEdit}
        />
      </div>

      {/* ── University Policies & Resources ────────────────────── */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-700">University Policies & Resources</h3>
        <SylPolicyBlock
          label="Academic Integrity"
          value={syl.academicIntegrity}
          path={['syllabus', 'academicIntegrity']}
          onEdit={onEdit}
        />
        <SylPolicyBlock
          label="Disability & Accessibility"
          value={syl.accommodations}
          path={['syllabus', 'accommodations']}
          onEdit={onEdit}
        />
        <SylPolicyBlock
          label="Mental Health & Wellness"
          value={syl.mentalHealth}
          path={['syllabus', 'mentalHealth']}
          onEdit={onEdit}
        />
        <SylPolicyBlock
          label="Title IX / Non-Discrimination"
          value={syl.titleIX}
          path={['syllabus', 'titleIX']}
          onEdit={onEdit}
        />
        <SylPolicyBlock
          label="Student Support Services"
          value={syl.supportServices}
          path={['syllabus', 'supportServices']}
          onEdit={onEdit}
        />
      </div>

      {/* ── Important Dates ────────────────────────────────────── */}
      {syl.importantDates?.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-700 mb-1.5">Important Dates</h3>
          <div className="rounded-lg border border-slate-200/60 overflow-hidden">
            <table className="w-full text-xs">
              <tbody>
                {syl.importantDates.map((d, i) => (
                  <tr key={i} className={i > 0 ? 'border-t border-slate-100' : ''}>
                    <td className="px-3 py-1.5 font-medium text-slate-500 whitespace-nowrap w-32">
                      <E value={d.date} path={['syllabus', 'importantDates', i, 'date']} onEdit={onEdit} />
                    </td>
                    <td className="px-3 py-1.5 text-slate-700">
                      <E value={d.event} path={['syllabus', 'importantDates', i, 'event']} onEdit={onEdit} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
