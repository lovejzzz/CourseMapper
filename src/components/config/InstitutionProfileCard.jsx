import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getInstitutionProfileCompleteness, getProfile, saveProfile } from '../../lib/professorProfile';

const IDENTITY_FIELDS = [
  { key: 'institution', label: 'Institution', placeholder: 'NYU Silver School of Social Work' },
  { key: 'department', label: 'Department', placeholder: 'Social Sciences' },
  { key: 'name', label: 'Instructor', placeholder: 'Course instructor' },
  { key: 'email', label: 'Contact', placeholder: 'Use course site contact method' },
  { key: 'meetingPattern', label: 'Meeting Pattern', placeholder: 'Weekly seminar + lab' },
  { key: 'courseLocation', label: 'Location', placeholder: 'Official classroom or course site' },
  { key: 'deliveryMode', label: 'Delivery Mode', placeholder: 'In person, hybrid, or online' },
  { key: 'officeHours', label: 'Office Hours', placeholder: 'By appointment or weekly hours' },
];

const POLICY_FIELDS = [
  {
    key: 'lateWorkPolicy',
    label: 'Late Work',
    placeholder: 'Reusable late-work policy for syllabi, assignments, and FAQ answers.',
  },
  {
    key: 'aiPolicy',
    label: 'AI Use',
    placeholder: 'How students may or may not use generative AI in coursework.',
  },
  {
    key: 'academicIntegrityStatement',
    label: 'Academic Integrity',
    placeholder: 'Institutional academic honesty language.',
  },
  {
    key: 'accommodationStatement',
    label: 'Accommodations',
    placeholder: 'Accessibility and accommodation statement.',
  },
  {
    key: 'attendancePolicy',
    label: 'Attendance',
    placeholder: 'Attendance, participation, and absence expectations.',
  },
  {
    key: 'communicationPolicy',
    label: 'Communication',
    placeholder: 'Expected response time and official communication channel.',
  },
  {
    key: 'policyGradeScale',
    label: 'Grade Scale',
    placeholder: 'A 93-100, A- 90-92, B+ 87-89...',
  },
  {
    key: 'accessibilityDefaults',
    label: 'Accessible Defaults',
    placeholder: 'Default UDL options to weave into assignments and lesson activities.',
  },
  {
    key: 'technologyPolicy',
    label: 'Technology',
    placeholder: 'Required devices, LMS use, recording policy, or classroom tech norms.',
  },
  {
    key: 'supportServices',
    label: 'Student Support',
    placeholder: 'Generic support services language or institution-approved wording.',
  },
];

function Field({ field, value, onChange, multiline = false }) {
  const baseClass =
    'w-full rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2 text-[12px] font-medium text-slate-700 shadow-sm outline-none transition-all duration-150 placeholder:text-slate-400/80 focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100/70';

  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{field.label}</span>
      {multiline ? (
        <textarea
          value={value || ''}
          onChange={(event) => onChange(field.key, event.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className={`${baseClass} min-h-[5.75rem] resize-y leading-relaxed`}
        />
      ) : (
        <input
          type="text"
          value={value || ''}
          onChange={(event) => onChange(field.key, event.target.value)}
          placeholder={field.placeholder}
          className={baseClass}
        />
      )}
    </label>
  );
}

export default function InstitutionProfileCard({ uid = null }) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(() => getProfile());
  const [saveState, setSaveState] = useState('saved');
  const saveTimer = useRef(null);
  const statusTimer = useRef(null);
  const didMount = useRef(false);

  const completeness = useMemo(() => getInstitutionProfileCompleteness(profile), [profile]);
  const summary = useMemo(() => {
    if (profile.institution && profile.department) return `${profile.department} at ${profile.institution}`;
    if (profile.institution) return profile.institution;
    if (profile.department) return profile.department;
    return 'Reusable classroom policies and logistics';
  }, [profile.department, profile.institution]);

  useEffect(() => {
    return () => {
      window.clearTimeout(saveTimer.current);
      window.clearTimeout(statusTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return undefined;
    }

    setSaveState('saving');
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveProfile(profile, uid);
      setSaveState('saved');
      window.clearTimeout(statusTimer.current);
      statusTimer.current = window.setTimeout(() => setSaveState('idle'), 1600);
    }, 350);

    return () => window.clearTimeout(saveTimer.current);
  }, [profile, uid]);

  function updateField(key, value) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  const statusText = saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Saved' : 'Autosaved locally';

  return (
    <section
      className={`rounded-squircle-xs border bg-white/45 shadow-sm transition-all duration-200 ${
        open ? 'border-cyan-200/80 shadow-cyan-100/50' : 'border-slate-200/60'
      }`}
      data-testid="institution-profile-card"
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
        aria-expanded={open}
        aria-controls="institution-profile-settings"
      >
        <div className="w-9 h-9 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.7}
              d="M3 21h18M5 21V7l7-4 7 4v14M8 21v-7h8v7M8 10h.01M12 10h.01M16 10h.01"
            />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xs font-bold text-slate-700">Institution profile</h2>
            <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-bold text-cyan-700">
              {completeness.completed}/{completeness.total} set
            </span>
          </div>
          <p className="mt-0.5 text-[11px] font-medium leading-4 text-slate-500 sm:truncate sm:leading-normal">
            {summary}
          </p>
        </div>
        <div className="hidden sm:block text-[10px] font-semibold text-slate-400">{statusText}</div>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          id="institution-profile-settings"
          className="border-t border-slate-100/70 px-4 pb-4 pt-4 animate-spring-in"
        >
          <div className="mb-4 rounded-2xl border border-cyan-100/80 bg-cyan-50/45 px-3 py-2.5">
            <p className="text-[11px] font-semibold leading-relaxed text-slate-600">
              These defaults quietly prefill syllabus policies, assignment expectations, FAQ answers, and agent repairs.
              Leave anything blank that should stay course-specific.
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Course Logistics</h3>
                <span className="text-[10px] font-semibold text-slate-400 sm:hidden">{statusText}</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {IDENTITY_FIELDS.map((field) => (
                  <Field key={field.key} field={field} value={profile[field.key]} onChange={updateField} />
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                Policies and Defaults
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {POLICY_FIELDS.map((field) => (
                  <Field key={field.key} field={field} value={profile[field.key]} onChange={updateField} multiline />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
