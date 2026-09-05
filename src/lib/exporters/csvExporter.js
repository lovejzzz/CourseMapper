import { loadPdfLibs, getDocx, getSaveAs, isInternalExportMetadataKey, resolveFeatureLabel } from './exporterUtils.js';
import { expandKeys } from '../keyMaps.js';
import { renderedDeliverableCollection } from '../renderedDeliverableRoot.js';
import { buildSyllabusCsvRows } from './syllabusExportUtils.js';
import { assertCsvRowsHaveNoInternalExportLanguage } from '../exportTextInspector.js';

// CSV EXPORT
// ════════════════════════════════════════════════════════════════

function esc(val) {
  const str = String(val || '').replace(/"/g, '""');
  return str.includes(',') || str.includes('\n') || str.includes('"') ? `"${str}"` : str;
}

function formatSourceArtifacts(artifacts) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) return '';
  return artifacts
    .map((artifact) => {
      if (typeof artifact === 'string') return artifact;
      return [artifact.title || artifact.name || artifact.label, artifact.locator, artifact.use || artifact.purpose]
        .filter(Boolean)
        .join(' — ');
    })
    .filter(Boolean)
    .join('; ');
}

export function deliverableToCsvRows(featureId, data) {
  if (!data) return { headers: [], rows: [] };

  switch (featureId) {
    case 'lessonPlans': {
      const expanded = expandKeys('lessonPlans', data);
      const plans = renderedDeliverableCollection('lessonPlans', expanded);
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
      const expanded = expandKeys('rubrics', data);
      const rubrics = renderedDeliverableCollection('rubrics', expanded);
      const headers = [
        'Rubric',
        'Lesson',
        'Graded Student Work',
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
            r.lessonTitle || '',
            r.gradedWork || r.assignmentTitle || r.title || '',
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
      const expanded = expandKeys('slideDecks', data);
      const decks = renderedDeliverableCollection('slideDecks', expanded);
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
            s.speakerNotes || s.notes || '',
          ]);
        }
      }
      return { headers, rows };
    }
    case 'quizBank': {
      const expanded = expandKeys('quizBank', data);
      const quizzes = renderedDeliverableCollection('quizBank', expanded);
      const headers = [
        'Lesson',
        'Assigned Readings',
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
            (quiz.assignedReadings || []).join('; '),
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
      const expanded = expandKeys('discussions', data);
      const discussions = renderedDeliverableCollection('discussions', expanded);
      const headers = [
        'Lesson',
        "Bloom's",
        'Format',
        'Prompt',
        'Context',
        'Evidence Requirement',
        'Source Artifacts',
        'Follow-Up Probes',
        'Response Starters',
        'Evaluation Criteria',
        'Facilitation Tips',
        'Equity Considerations',
        'Guidelines',
      ];
      const rows = discussions.map((d) => [
        d.lessonTitle || '',
        d.bloomsLevel || '',
        d.format || '',
        d.prompt || '',
        d.context || '',
        d.evidenceRequirement || '',
        formatSourceArtifacts(d.sourceArtifacts),
        (d.followUpProbes || []).join('; '),
        (d.responseStarters || []).join('; '),
        (d.evaluationCriteria || []).join('; '),
        d.facilitationTips
          ? [
              d.facilitationTips.opening,
              d.facilitationTips.ifStalls,
              d.facilitationTips.ifDominates,
              d.facilitationTips.closure,
            ]
              .filter(Boolean)
              .join('; ')
          : '',
        d.equityConsiderations || '',
        d.guidelines || '',
      ]);
      return { headers, rows };
    }
    case 'assignments': {
      const expanded = expandKeys('assignments', data);
      const assignments = renderedDeliverableCollection('assignments', expanded);
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
      const expanded = expandKeys('studyGuides', data);
      const guides = renderedDeliverableCollection('studyGuides', expanded);
      const headers = [
        'Lesson',
        'Assigned Readings',
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
              g.examPrep.timeManagement && `Time: ${g.examPrep.timeManagement}`,
              g.examPrep.commonErrors && `Errors: ${g.examPrep.commonErrors}`,
              g.examPrep.reviewStrategy && `Strategy: ${g.examPrep.reviewStrategy}`,
            ]
              .filter(Boolean)
              .join('; ')
          : g.examTips || '';
        return [
          g.lessonTitle || '',
          (g.assignedReadings || []).join('; '),
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
    case 'courseFaq': {
      const expanded = expandKeys('courseFaq', data);
      const faqs = renderedDeliverableCollection('courseFaq', expanded);
      const headers = ['Lesson', 'Category', 'Question', 'Answer', 'Related Concepts', 'Difficulty'];
      const rows = [];
      for (const lesson of faqs) {
        for (const q of lesson.questions || []) {
          rows.push([
            lesson.lessonTitle || lesson.title || '',
            q.category || '',
            q.question || '',
            q.answer || '',
            (q.relatedConcepts || []).join('; '),
            q.difficulty || '',
          ]);
        }
      }
      return { headers, rows };
    }
    case 'syllabus': {
      return buildSyllabusCsvRows(data);
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
          if (isInternalExportMetadataKey(k)) continue;
          if (!seen.has(k)) {
            seen.add(k);
            allKeys.push(k);
          }
        }
      }
      const headers = allKeys.map((k) => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (s) => s.toUpperCase()));
      const rows = items.map((item) =>
        allKeys.map((k) => {
          if (isInternalExportMetadataKey(k)) return '';
          const v = item[k];
          if (v == null) return '';
          if (typeof v === 'string') return v;
          if (Array.isArray(v)) {
            return v
              .map((x) => {
                if (typeof x === 'string') return x;
                if (x && typeof x === 'object') {
                  return JSON.stringify(
                    Object.fromEntries(
                      Object.entries(x).filter(([nestedKey]) => !isInternalExportMetadataKey(nestedKey)),
                    ),
                  );
                }
                return JSON.stringify(x);
              })
              .join('; ');
          }
          if (typeof v === 'object') {
            return JSON.stringify(
              Object.fromEntries(Object.entries(v).filter(([nestedKey]) => !isInternalExportMetadataKey(nestedKey))),
            );
          }
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
  assertCsvRowsHaveNoInternalExportLanguage({ headers, rows }, resolveFeatureLabel(featureId));
  const csv = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
  const saveAs = await getSaveAs();
  const fileName = `${courseName || 'Course'} - ${resolveFeatureLabel(featureId)}.csv`;
  saveAs(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }), fileName);
  return fileName;
}

// ════════════════════════════════════════════════════════════════
