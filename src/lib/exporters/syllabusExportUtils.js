export function unwrapSyllabus(data) {
  return data?.syllabus || data || {};
}

function humanizeExportKey(key) {
  return String(key || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (s) => s.toUpperCase());
}

export function formatPlainValue(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(formatPlainValue).filter(Boolean).join('; ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([, nested]) => nested != null && nested !== '')
      .map(([key, nested]) => `${humanizeExportKey(key)}: ${formatPlainValue(nested)}`)
      .filter(Boolean)
      .join(' · ');
  }
  return String(value);
}

export function formatList(value) {
  if (!Array.isArray(value)) return value || '';
  return value.map(formatPlainValue).filter(Boolean).join('; ');
}

export function formatRequiredText(text) {
  if (typeof text === 'string') return text;
  if (!text) return '';
  const formatted = [
    formatPlainValue(text.author),
    formatPlainValue(text.title),
    text.edition && `(${formatPlainValue(text.edition)})`,
    text.isbn && `ISBN: ${formatPlainValue(text.isbn)}`,
    formatPlainValue(text.note),
  ]
    .filter(Boolean)
    .join('. ');
  return formatted || formatPlainValue(text);
}

export function formatRequirement(requirement) {
  if (!requirement) return '';
  if (typeof requirement === 'string') return requirement;
  const label = formatPlainValue(requirement.name || requirement.component || 'Requirement');
  const weight = requirement.weight ? `: ${formatPlainValue(requirement.weight)}` : '';
  const description = requirement.description ? ` - ${formatPlainValue(requirement.description)}` : '';
  return `${label}${weight}${description}`;
}

export function normalizeCourseRequirements(...values) {
  for (const value of values) {
    if (!value) continue;
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === 'string') {
            const trimmed = item.trim();
            return trimmed ? { name: 'Course Requirements', weight: '', description: trimmed } : null;
          }
          return item && typeof item === 'object' ? item : null;
        })
        .filter(Boolean);
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? [{ name: 'Course Requirements', weight: '', description: trimmed }] : [];
    }
    if (typeof value === 'object') return [value];
  }
  return [];
}

export function formatOutcomeAlignment(row) {
  if (!row) return '';
  const parts = [
    row.outcome,
    row.bloomsLevel && `Bloom's: ${row.bloomsLevel}`,
    Array.isArray(row.practicedIn) && row.practicedIn.length ? `Practiced in: ${row.practicedIn.join('; ')}` : '',
    Array.isArray(row.assessedBy) && row.assessedBy.length ? `Assessed by: ${row.assessedBy.join('; ')}` : '',
  ];
  return parts.filter(Boolean).join(' | ');
}

export function buildSyllabusCsvRows(data) {
  const syl = unwrapSyllabus(data);
  const headers = ['Section', 'Content'];
  const rows = [];
  const add = (label, value) => {
    if (Array.isArray(value) ? value.length : value) rows.push([label, value]);
  };

  add('Course Title', syl.courseTitle);
  add('Semester', syl.semester);
  add('Credits', syl.credits);
  add('Meeting', syl.meetingPattern);
  add('Location', syl.location);
  add('Delivery Mode', syl.deliveryMode);
  add('Prerequisites', syl.prerequisites);
  add('Instructor', syl.instructor);
  add('Email', syl.instructorEmail);
  add('Office Hours', syl.officeHours);
  add('Office Location', syl.officeLocation);
  add('Instructor Bio', syl.instructorBio);
  add('Course Description', syl.courseDescription);
  add('Getting Started', syl.gettingStarted);
  add('Learner Introduction Activity', syl.learnerIntroActivity);
  if (syl.learningOutcomes?.length) add('Learning Outcomes', syl.learningOutcomes.join('; '));
  if (syl.outcomeAlignmentMatrix?.length) {
    for (const [index, row] of syl.outcomeAlignmentMatrix.entries()) {
      add(`Outcome Alignment ${index + 1}`, formatOutcomeAlignment(row));
    }
  }
  if (syl.requiredTexts?.length) add('Required Texts', syl.requiredTexts.map(formatRequiredText).join('; '));
  const reqs = normalizeCourseRequirements(syl.courseRequirements, syl.gradingPolicy);
  if (reqs.length) add('Course Requirements', reqs.map(formatRequirement).join('; '));
  if (syl.gradingScale?.length) add('Grading Scale', syl.gradingScale.map((g) => `${g.grade}: ${g.range}`).join('; '));
  add('Attendance & Participation', syl.attendancePolicy);
  add('Late Work Policy', syl.latePolicy);
  add('Communication Policy', syl.communicationPolicy);
  add('Technology Policy', syl.technologyPolicy);
  add('Technical Skills', syl.technicalSkills);
  add('AI Policy', syl.aiPolicy);
  add('Academic Integrity', syl.academicIntegrity);
  add('Technical Support', syl.technicalSupport);
  add('Accommodations', syl.accommodations);
  add('Mental Health', syl.mentalHealth);
  add('Title IX', syl.titleIX);
  add('Support Services', syl.supportServices);
  add('Data Privacy', syl.dataPrivacy);
  if (syl.weeklySchedule?.length) {
    for (const w of syl.weeklySchedule) {
      const label = [w.week, w.dates].filter(Boolean).join(' - ');
      add(
        label || 'Schedule',
        `${formatPlainValue(w.topic)} | ${formatPlainValue(w.readings)} | ${formatPlainValue(w.assignments)}`,
      );
    }
  }
  if (syl.importantDates?.length) {
    for (const d of syl.importantDates) add(d.date || 'Important Date', d.event || '');
  }
  if (syl.tags?.length) add('Tags', syl.tags.join('; '));
  add('Suggested Review Date', syl.suggestedReviewDate);
  add('Content Owner Group', syl.contentOwnerGroup);

  return { headers, rows };
}
