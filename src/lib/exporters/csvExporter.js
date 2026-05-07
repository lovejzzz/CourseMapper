import { loadPdfLibs, getDocx, getSaveAs, resolveFeatureLabel } from './exporterUtils.js';

// CSV EXPORT
// ════════════════════════════════════════════════════════════════

function esc(val) {
  const str = String(val || '').replace(/"/g, '""');
  return str.includes(',') || str.includes('\n') || str.includes('"') ? `"${str}"` : str;
}

export function deliverableToCsvRows(featureId, data) {
  if (!data) return { headers: [], rows: [] };

  switch (featureId) {
    case 'lessonPlans': {
      const key = data.plans ? 'plans' : 'lessonPlans';
      const plans = data[key] || [];
      const headers = [
        'Lesson',
        'Duration',
        "Bloom's Levels",
        'Objectives',
        'Warm-Up',
        'Materials',
        'Outline',
        'Formative Assessment',
        'UDL Notes',
        'Homework',
        'Closing Activity',
      ];
      const rows = plans.map((p) => {
        const warmUp = p.warmUp ? [p.warmUp.type, p.warmUp.prompt, p.warmUp.purpose].filter(Boolean).join(' — ') : '';
        const formative = p.formativeCheck
          ? [p.formativeCheck.type, p.formativeCheck.prompt, p.formativeCheck.objectiveAligned]
              .filter(Boolean)
              .join(' — ')
          : '';
        const udl = p.udlNotes
          ? [
              'Repr: ' + (p.udlNotes.representation || ''),
              'Engage: ' + (p.udlNotes.engagement || ''),
              'Expr: ' + (p.udlNotes.expression || ''),
            ]
              .filter((v) => !v.endsWith(': '))
              .join('; ')
          : '';
        const hw =
          typeof p.homework === 'object'
            ? [p.homework.title, p.homework.description, p.homework.estimatedTime].filter(Boolean).join(' — ')
            : p.homework || '';
        return [
          p.lessonTitle || p.title || '',
          p.duration || '',
          (p.bloomsLevels || []).join(', '),
          (p.objectives || []).join('; '),
          warmUp,
          (p.materials || []).join('; '),
          (p.outline || [])
            .map(
              (o) =>
                `${o.time || ''} - ${o.activity || ''}: ${o.description || ''}${o.instructorNotes ? ' [Note: ' + o.instructorNotes + ']' : ''}`,
            )
            .join('\n'),
          formative,
          udl,
          hw,
          p.closingActivity || '',
        ];
      });
      return { headers, rows };
    }
    case 'rubrics': {
      const rubrics = data.rubrics || [];
      const headers = [
        'Rubric',
        'Points',
        'Type',
        'Criterion',
        'Weight',
        'Excellent',
        'Proficient',
        'Developing',
        'Beginning',
      ];
      const rows = [];
      for (const r of rubrics) {
        for (const c of r.criteria || []) {
          rows.push([
            r.title || '',
            String(r.totalPoints || ''),
            r.assessmentType || '',
            c.criterion || c.name || '',
            String(c.weight || ''),
            c.excellent || c.exemplary || '',
            c.proficient || '',
            c.developing || '',
            c.beginning || '',
          ]);
        }
      }
      return { headers, rows };
    }
    case 'slideDecks': {
      const key = data.decks ? 'decks' : 'slideDecks';
      const decks = data[key] || [];
      const headers = ['Lesson', 'Slide #', 'Title', 'Bullets', 'Speaker Notes'];
      const rows = [];
      for (const d of decks) {
        for (let j = 0; j < (d.slides || []).length; j++) {
          const s = d.slides[j];
          rows.push([
            d.lessonTitle || '',
            String(j + 1),
            s.title || '',
            (s.bullets || []).join('; '),
            s.speakerNotes || '',
          ]);
        }
      }
      return { headers, rows };
    }
    case 'quizBank': {
      const key = data.quizzes ? 'quizzes' : 'quizBank';
      const quizzes = data[key] || [];
      const headers = [
        'Lesson',
        'Type',
        "Bloom's",
        'Difficulty',
        'Question',
        'Options',
        'Answer',
        'Explanation',
        'Points',
        'Sample Answer',
      ];
      const rows = [];
      for (const quiz of quizzes) {
        for (const q of quiz.questions || []) {
          rows.push([
            quiz.lessonTitle || '',
            q.type || '',
            q.bloomsLevel || '',
            q.difficulty || '',
            q.question || '',
            (q.options || []).join('; '),
            q.answer || '',
            q.explanation || '',
            String(q.points || ''),
            q.sampleAnswer || '',
          ]);
        }
      }
      return { headers, rows };
    }
    case 'discussions': {
      const discussions = data.discussions || [];
      const headers = [
        'Lesson',
        "Bloom's",
        'Format',
        'Prompt',
        'Context',
        'Follow-Up Probes',
        'Response Starters',
        'Evaluation Criteria',
        'Facilitation Tips',
        'Guidelines',
      ];
      const rows = discussions.map((d) => [
        d.lessonTitle || '',
        d.bloomsLevel || '',
        d.format || '',
        d.prompt || '',
        d.context || '',
        (d.followUpProbes || []).join('; '),
        (d.responseStarters || []).join('; '),
        (d.evaluationCriteria || []).join('; '),
        d.facilitationTips
          ? [d.facilitationTips.opening, d.facilitationTips.ifStalls, d.facilitationTips.closure]
              .filter(Boolean)
              .join('; ')
          : '',
        d.guidelines || '',
      ]);
      return { headers, rows };
    }
    case 'assignments': {
      const assignments = data.assignments || [];
      const headers = [
        'Title',
        'Type',
        "Bloom's",
        'Due',
        'Est. Time',
        'Points',
        'Overview',
        'Objectives',
        'Instructions',
        'Deliverables',
        'Format Requirements',
        'Grading Criteria',
        'Milestones',
      ];
      const rows = assignments.map((a) => {
        const fmt = a.formatRequirements
          ? [a.formatRequirements.length, a.formatRequirements.format, a.formatRequirements.citationStyle]
              .filter(Boolean)
              .join('; ')
          : '';
        const milestones = (a.scaffoldingMilestones || [])
          .map((m) => `${m.milestone || m.name || ''}: ${m.description || ''}`)
          .join('; ');
        return [
          a.title || '',
          a.assignmentType || '',
          a.bloomsLevel || '',
          a.dueWeek || a.dueDate || '',
          a.estimatedTime || '',
          a.totalPoints ? String(a.totalPoints) : '',
          a.overview || a.description || '',
          (a.objectives || []).join('; '),
          (a.instructions || []).map((inst) => (typeof inst === 'string' ? inst : inst.step || '')).join('; '),
          (a.deliverables || []).map((d) => (typeof d === 'string' ? d : d.name || '')).join('; '),
          fmt,
          a.gradingCriteria || '',
          milestones,
        ];
      });
      return { headers, rows };
    }
    case 'studyGuides': {
      const key = data.guides ? 'guides' : 'studyGuides';
      const guides = data[key] || [];
      const headers = [
        'Lesson',
        'Summary',
        'Key Terms',
        'Concept Connections',
        'Common Misconceptions',
        'Review Questions',
        'Practice Activities',
        'Exam Prep',
      ];
      const rows = guides.map((g) => {
        const misconceptions = (g.commonMisconceptions || [])
          .map((m) => (typeof m === 'string' ? m : `${m.misconception || ''} → ${m.correction || ''}`))
          .join('; ');
        const reviewQs = (g.reviewQuestions || []).map((q) => (typeof q === 'string' ? q : q.question || q)).join('; ');
        const examPrep = g.examPrep
          ? [
              g.examPrep.keyTopicsToKnow?.length && `Topics: ${g.examPrep.keyTopicsToKnow.join(', ')}`,
              g.examPrep.reviewStrategy && `Strategy: ${g.examPrep.reviewStrategy}`,
            ]
              .filter(Boolean)
              .join('; ')
          : g.examTips || '';
        return [
          g.lessonTitle || '',
          g.summary || '',
          (g.keyTerms || [])
            .map((t) => `${t.term}: ${t.definition}${t.example ? ' (e.g., ' + t.example + ')' : ''}`)
            .join('; '),
          (g.conceptConnections || [])
            .map((c) => (typeof c === 'string' ? c : `${c.from || ''} ↔ ${c.to || ''}`))
            .join('; '),
          misconceptions,
          reviewQs,
          (g.practiceActivities || []).map((a) => (typeof a === 'string' ? a : a.activity || '')).join('; '),
          examPrep,
        ];
      });
      return { headers, rows };
    }
    case 'syllabus': {
      const syl = data.syllabus || data;
      const headers = ['Section', 'Content'];
      const rows = [];
      if (syl.courseTitle) rows.push(['Course Title', syl.courseTitle]);
      if (syl.semester) rows.push(['Semester', syl.semester]);
      if (syl.credits) rows.push(['Credits', syl.credits]);
      if (syl.meetingPattern) rows.push(['Meeting', syl.meetingPattern]);
      if (syl.location) rows.push(['Location', syl.location]);
      if (syl.deliveryMode) rows.push(['Delivery Mode', syl.deliveryMode]);
      if (syl.prerequisites) rows.push(['Prerequisites', syl.prerequisites]);
      if (syl.instructor) rows.push(['Instructor', syl.instructor]);
      if (syl.instructorEmail) rows.push(['Email', syl.instructorEmail]);
      if (syl.officeHours) rows.push(['Office Hours', syl.officeHours]);
      if (syl.officeLocation) rows.push(['Office Location', syl.officeLocation]);
      if (syl.courseDescription) rows.push(['Course Description', syl.courseDescription]);
      if (syl.learningOutcomes?.length) rows.push(['Learning Outcomes', syl.learningOutcomes.join('; ')]);
      if (syl.requiredTexts?.length)
        rows.push([
          'Required Texts',
          syl.requiredTexts
            .map((t) => (typeof t === 'string' ? t : [t.author, t.title, t.edition].filter(Boolean).join('. ')))
            .join('; '),
        ]);
      const reqs = syl.courseRequirements || syl.gradingPolicy || [];
      if (reqs.length)
        rows.push(['Course Requirements', reqs.map((g) => `${g.name || g.component}: ${g.weight}`).join('; ')]);
      if (syl.gradingScale?.length)
        rows.push(['Grading Scale', syl.gradingScale.map((g) => `${g.grade}: ${g.range}`).join('; ')]);
      if (syl.attendancePolicy) rows.push(['Attendance & Participation', syl.attendancePolicy]);
      if (syl.latePolicy) rows.push(['Late Work Policy', syl.latePolicy]);
      if (syl.communicationPolicy) rows.push(['Communication Policy', syl.communicationPolicy]);
      if (syl.technologyPolicy) rows.push(['Technology Policy', syl.technologyPolicy]);
      if (syl.aiPolicy) rows.push(['AI Policy', syl.aiPolicy]);
      if (syl.academicIntegrity) rows.push(['Academic Integrity', syl.academicIntegrity]);
      if (syl.accommodations) rows.push(['Accommodations', syl.accommodations]);
      if (syl.mentalHealth) rows.push(['Mental Health', syl.mentalHealth]);
      if (syl.titleIX) rows.push(['Title IX', syl.titleIX]);
      if (syl.supportServices) rows.push(['Support Services', syl.supportServices]);
      if (syl.weeklySchedule?.length) {
        for (const w of syl.weeklySchedule) {
          rows.push([w.week || '', `${w.topic || ''} | ${w.readings || ''} | ${w.assignments || ''}`]);
        }
      }
      if (syl.importantDates?.length) {
        for (const d of syl.importantDates) {
          rows.push([d.date || '', d.event || '']);
        }
      }
      return { headers, rows };
    }
    default: {
      // Generic handler for custom deliverables
      const arrKey = Object.keys(data).find((k) => Array.isArray(data[k]) && data[k].length > 0);
      if (!arrKey) return { headers: [], rows: [] };
      const items = data[arrKey];
      // Collect all unique keys across items
      const allKeys = [];
      const seen = new Set();
      for (const item of items) {
        for (const k of Object.keys(item)) {
          if (!seen.has(k)) {
            seen.add(k);
            allKeys.push(k);
          }
        }
      }
      const headers = allKeys.map((k) => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (s) => s.toUpperCase()));
      const rows = items.map((item) =>
        allKeys.map((k) => {
          const v = item[k];
          if (v == null) return '';
          if (typeof v === 'string') return v;
          if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('; ');
          if (typeof v === 'object') return JSON.stringify(v);
          return String(v);
        }),
      );
      return { headers, rows };
    }
  }
}

export async function exportDeliverableCsv(featureId, data, courseName) {
  const { headers, rows } = deliverableToCsvRows(featureId, data);
  if (rows.length === 0) throw new Error('No data to export');
  const csv = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
  const saveAs = await getSaveAs();
  const fileName = `${courseName || 'Course'} - ${resolveFeatureLabel(featureId)}.csv`;
  saveAs(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }), fileName);
  return fileName;
}

// ════════════════════════════════════════════════════════════════
