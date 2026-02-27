// ─── Deliverable Export Utilities ───
// Exports deliverable data (lesson plans, rubrics, etc.) as PDF, DOCX, CSV,
// Google Docs, or Google Sheets.

import { getCustomDeliverable } from './customDeliverableLibrary';

let _jsPDF, _autoTable, _docx, _saveAs;

async function loadPdfLibs() {
  if (!_jsPDF) {
    const jsMod = await import('jspdf');
    _jsPDF = jsMod.jsPDF;
    const atMod = await import('jspdf-autotable');
    _autoTable = atMod.default || atMod.autoTable || atMod;
  }
  return { jsPDF: _jsPDF, autoTable: _autoTable };
}
async function getDocx() {
  if (!_docx) _docx = await import('docx');
  return _docx;
}
async function getSaveAs() {
  if (!_saveAs) _saveAs = (await import('file-saver')).saveAs;
  return _saveAs;
}

const FEATURE_LABELS = {
  courseMap: 'Course Map',
  lessonPlans: 'Lesson Plans',
  rubrics: 'Rubrics',
  slideDecks: 'Slide Decks',
  quizBank: 'Quiz & Exam Bank',
  discussions: 'Discussion Prompts',
  assignments: 'Assignment Briefs',
  studyGuides: 'Study Guides',
  syllabus: 'Syllabus',
  courseFaq: 'Course FAQ',
};

/** Resolve featureId to label — supports custom deliverables */
function resolveFeatureLabel(id) {
  if (FEATURE_LABELS[id]) return FEATURE_LABELS[id];
  if (id?.startsWith('custom_')) {
    const custom = getCustomDeliverable(id);
    return custom?.name || 'Custom Deliverable';
  }
  return id;
}

// ════════════════════════════════════════════════════════════════
// CSV EXPORT
// ════════════════════════════════════════════════════════════════

function esc(val) {
  const str = String(val || '').replace(/"/g, '""');
  return str.includes(',') || str.includes('\n') || str.includes('"') ? `"${str}"` : str;
}

function deliverableToCsvRows(featureId, data) {
  if (!data) return { headers: [], rows: [] };

  switch (featureId) {
    case 'lessonPlans': {
      const key = data.plans ? 'plans' : 'lessonPlans';
      const plans = data[key] || [];
      const headers = ['Lesson', 'Duration', 'Bloom\'s Levels', 'Objectives', 'Warm-Up', 'Materials', 'Outline', 'Formative Assessment', 'UDL Notes', 'Homework', 'Closing Activity'];
      const rows = plans.map(p => {
        const warmUp = p.warmUp ? [p.warmUp.type, p.warmUp.prompt, p.warmUp.purpose].filter(Boolean).join(' — ') : '';
        const formative = p.formativeCheck ? [p.formativeCheck.type, p.formativeCheck.prompt, p.formativeCheck.objectiveAligned].filter(Boolean).join(' — ') : '';
        const udl = p.udlNotes ? ['Repr: ' + (p.udlNotes.representation || ''), 'Engage: ' + (p.udlNotes.engagement || ''), 'Expr: ' + (p.udlNotes.expression || '')].filter(v => !v.endsWith(': ')).join('; ') : '';
        const hw = typeof p.homework === 'object' ? [p.homework.title, p.homework.description, p.homework.estimatedTime].filter(Boolean).join(' — ') : (p.homework || '');
        return [
          p.lessonTitle || p.title || '',
          p.duration || '',
          (p.bloomsLevels || []).join(', '),
          (p.objectives || []).join('; '),
          warmUp,
          (p.materials || []).join('; '),
          (p.outline || []).map(o => `${o.time || ''} - ${o.activity || ''}: ${o.description || ''}${o.instructorNotes ? ' [Note: ' + o.instructorNotes + ']' : ''}`).join('\n'),
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
      const headers = ['Rubric', 'Points', 'Type', 'Criterion', 'Weight', 'Excellent', 'Proficient', 'Developing', 'Beginning'];
      const rows = [];
      for (const r of rubrics) {
        for (const c of (r.criteria || [])) {
          rows.push([
            r.title || '', String(r.totalPoints || ''), r.assessmentType || '',
            c.criterion || c.name || '', String(c.weight || ''),
            c.excellent || c.exemplary || '', c.proficient || '', c.developing || '', c.beginning || '',
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
            d.lessonTitle || '', String(j + 1), s.title || '',
            (s.bullets || []).join('; '), s.speakerNotes || '',
          ]);
        }
      }
      return { headers, rows };
    }
    case 'quizBank': {
      const key = data.quizzes ? 'quizzes' : 'quizBank';
      const quizzes = data[key] || [];
      const headers = ['Lesson', 'Type', 'Bloom\'s', 'Difficulty', 'Question', 'Options', 'Answer', 'Explanation', 'Points', 'Sample Answer'];
      const rows = [];
      for (const quiz of quizzes) {
        for (const q of (quiz.questions || [])) {
          rows.push([
            quiz.lessonTitle || '', q.type || '', q.bloomsLevel || '', q.difficulty || '',
            q.question || '',
            (q.options || []).join('; '), q.answer || '', q.explanation || '',
            String(q.points || ''),
            q.sampleAnswer || '',
          ]);
        }
      }
      return { headers, rows };
    }
    case 'discussions': {
      const discussions = data.discussions || [];
      const headers = ['Lesson', 'Bloom\'s', 'Format', 'Prompt', 'Context', 'Follow-Up Probes', 'Response Starters', 'Evaluation Criteria', 'Facilitation Tips', 'Guidelines'];
      const rows = discussions.map(d => [
        d.lessonTitle || '', d.bloomsLevel || '', d.format || '',
        d.prompt || '', d.context || '',
        (d.followUpProbes || []).join('; '),
        (d.responseStarters || []).join('; '),
        (d.evaluationCriteria || []).join('; '),
        d.facilitationTips ? [d.facilitationTips.opening, d.facilitationTips.ifStalls, d.facilitationTips.closure].filter(Boolean).join('; ') : '',
        d.guidelines || '',
      ]);
      return { headers, rows };
    }
    case 'assignments': {
      const assignments = data.assignments || [];
      const headers = ['Title', 'Type', 'Bloom\'s', 'Due', 'Est. Time', 'Points', 'Overview', 'Objectives', 'Instructions', 'Deliverables', 'Format Requirements', 'Grading Criteria', 'Milestones'];
      const rows = assignments.map(a => {
        const fmt = a.formatRequirements ? [a.formatRequirements.length, a.formatRequirements.format, a.formatRequirements.citationStyle].filter(Boolean).join('; ') : '';
        const milestones = (a.scaffoldingMilestones || []).map(m => `${m.milestone || m.name || ''}: ${m.description || ''}`).join('; ');
        return [
          a.title || '', a.assignmentType || '', a.bloomsLevel || '',
          a.dueWeek || a.dueDate || '', a.estimatedTime || '',
          a.totalPoints ? String(a.totalPoints) : '',
          a.overview || a.description || '',
          (a.objectives || []).join('; '),
          (a.instructions || []).map(inst => typeof inst === 'string' ? inst : inst.step || '').join('; '),
          (a.deliverables || []).map(d => typeof d === 'string' ? d : d.name || '').join('; '),
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
      const headers = ['Lesson', 'Summary', 'Key Terms', 'Concept Connections', 'Common Misconceptions', 'Review Questions', 'Practice Activities', 'Exam Prep'];
      const rows = guides.map(g => {
        const misconceptions = (g.commonMisconceptions || []).map(m => typeof m === 'string' ? m : `${m.misconception || ''} → ${m.correction || ''}`).join('; ');
        const reviewQs = (g.reviewQuestions || []).map(q => typeof q === 'string' ? q : (q.question || q)).join('; ');
        const examPrep = g.examPrep ? [
          g.examPrep.keyTopicsToKnow?.length && `Topics: ${g.examPrep.keyTopicsToKnow.join(', ')}`,
          g.examPrep.reviewStrategy && `Strategy: ${g.examPrep.reviewStrategy}`,
        ].filter(Boolean).join('; ') : (g.examTips || '');
        return [
          g.lessonTitle || '', g.summary || '',
          (g.keyTerms || []).map(t => `${t.term}: ${t.definition}${t.example ? ' (e.g., ' + t.example + ')' : ''}`).join('; '),
          (g.conceptConnections || []).map(c => typeof c === 'string' ? c : `${c.from || ''} ↔ ${c.to || ''}`).join('; '),
          misconceptions,
          reviewQs,
          (g.practiceActivities || []).map(a => typeof a === 'string' ? a : a.activity || '').join('; '),
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
      if (syl.requiredTexts?.length) rows.push(['Required Texts', syl.requiredTexts.map(t => typeof t === 'string' ? t : [t.author, t.title, t.edition].filter(Boolean).join('. ')).join('; ')]);
      const reqs = syl.courseRequirements || syl.gradingPolicy || [];
      if (reqs.length) rows.push(['Course Requirements', reqs.map(g => `${g.name || g.component}: ${g.weight}`).join('; ')]);
      if (syl.gradingScale?.length) rows.push(['Grading Scale', syl.gradingScale.map(g => `${g.grade}: ${g.range}`).join('; ')]);
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
      const arrKey = Object.keys(data).find(k => Array.isArray(data[k]) && data[k].length > 0);
      if (!arrKey) return { headers: [], rows: [] };
      const items = data[arrKey];
      // Collect all unique keys across items
      const allKeys = [];
      const seen = new Set();
      for (const item of items) {
        for (const k of Object.keys(item)) {
          if (!seen.has(k)) { seen.add(k); allKeys.push(k); }
        }
      }
      const headers = allKeys.map(k => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, s => s.toUpperCase()));
      const rows = items.map(item => allKeys.map(k => {
        const v = item[k];
        if (v == null) return '';
        if (typeof v === 'string') return v;
        if (Array.isArray(v)) return v.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join('; ');
        if (typeof v === 'object') return JSON.stringify(v);
        return String(v);
      }));
      return { headers, rows };
    }
  }
}

export async function exportDeliverableCsv(featureId, data, courseName) {
  const { headers, rows } = deliverableToCsvRows(featureId, data);
  if (rows.length === 0) throw new Error('No data to export');
  const csv = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
  const saveAs = await getSaveAs();
  const fileName = `${courseName || 'Course'} - ${resolveFeatureLabel(featureId)}.csv`;
  saveAs(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }), fileName);
  return fileName;
}

// ════════════════════════════════════════════════════════════════
// PDF EXPORT
// ════════════════════════════════════════════════════════════════

export async function exportDeliverablePdf(featureId, data, courseName) {
  const { jsPDF, autoTable } = await loadPdfLibs();
  const label = resolveFeatureLabel(featureId);
  const title = `${courseName || 'Course'} — ${label}`;

  // Syllabus gets a specially formatted multi-section PDF
  if (featureId === 'syllabus') {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const syl = data.syllabus || data;
    let y = 15;
    const lm = 14, rm = 196, pageH = 280;

    const checkPage = (needed = 10) => {
      if (y + needed > pageH) { doc.addPage(); y = 15; }
    };

    const drawSectionHeading = (text) => {
      checkPage(12);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(43, 87, 154);
      doc.text(text, lm, y);
      doc.setDrawColor(43, 87, 154);
      doc.setLineWidth(0.4);
      doc.line(lm, y + 1.5, rm, y + 1.5);
      y += 7;
      doc.setTextColor(0, 0, 0);
    };

    const drawBodyText = (text, indent = 0) => {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(text || '', rm - lm - indent);
      lines.forEach(line => {
        checkPage(5);
        doc.text(line, lm + indent, y);
        y += 5;
      });
    };

    const drawBoldLabel = (label, value) => {
      checkPage(6);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(label + ': ', lm, y);
      doc.setFont('helvetica', 'normal');
      const lw = doc.getTextWidth(label + ': ');
      const lines = doc.splitTextToSize(value || '', rm - lm - lw);
      doc.text(lines[0] || '', lm + lw, y);
      y += 5;
      for (let i = 1; i < lines.length; i++) {
        checkPage(5);
        doc.text(lines[i], lm + lw, y);
        y += 5;
      }
    };

    const drawPolicySection = (heading, text) => {
      if (!text) return;
      drawSectionHeading(heading);
      drawBodyText(text);
      y += 3;
    };

    // ── Title block ──
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(43, 87, 154);
    const titleLines = doc.splitTextToSize(syl.courseTitle || courseName || 'Course Syllabus', rm - lm);
    titleLines.forEach(line => { doc.text(line, lm, y); y += 7; });
    y += 1;
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    if (syl.semester) { doc.text(syl.semester, lm, y); y += 5; }
    const metaLines = [
      syl.credits && `Credits: ${syl.credits}`,
      syl.meetingPattern && `Meeting: ${syl.meetingPattern}`,
      syl.location && `Location: ${syl.location}`,
      syl.deliveryMode && `Delivery: ${syl.deliveryMode}`,
      syl.prerequisites && `Prerequisites: ${syl.prerequisites}`,
    ].filter(Boolean);
    doc.setFontSize(9);
    metaLines.forEach(l => { doc.text(l, lm, y); y += 4.5; });
    doc.setTextColor(0, 0, 0);
    y += 3;

    // ── Instructor Information ──
    const instrLines = [
      syl.instructor && `Instructor: ${syl.instructor}`,
      syl.instructorEmail && `Email: ${syl.instructorEmail}`,
      syl.officeHours && `Office Hours: ${syl.officeHours}`,
      syl.officeLocation && `Office: ${syl.officeLocation}`,
    ].filter(Boolean);
    if (instrLines.length) {
      drawSectionHeading('Instructor Information');
      instrLines.forEach(l => drawBoldLabel(l.split(': ')[0], l.split(': ').slice(1).join(': ')));
      y += 3;
    }

    // ── Course Description ──
    if (syl.courseDescription) {
      drawSectionHeading('Course Description');
      drawBodyText(syl.courseDescription);
      y += 3;
    }

    // ── Learning Outcomes ──
    if (syl.learningOutcomes?.length) {
      drawSectionHeading('Student Learning Outcomes');
      drawBodyText('Upon successful completion of this course, students will be able to:');
      syl.learningOutcomes.forEach((o, i) => drawBodyText(`${i + 1}. ${o}`, 4));
      y += 3;
    }

    // ── Required Texts ──
    if (syl.requiredTexts?.length) {
      drawSectionHeading('Required Texts & Materials');
      syl.requiredTexts.forEach(t => {
        if (typeof t === 'string') { drawBodyText(`• ${t}`, 4); return; }
        const parts = [t.author, t.title, t.edition && `(${t.edition})`, t.isbn && `ISBN: ${t.isbn}`, t.note].filter(Boolean);
        drawBodyText(`• ${parts.join('. ')}`, 4);
      });
      y += 3;
    }

    // ── Course Requirements & Grading ──
    const reqs = syl.courseRequirements || syl.gradingPolicy || [];
    if (reqs.length) {
      drawSectionHeading('Course Requirements & Grading');
      checkPage(20);
      const hasDesc = reqs.some(r => r.description);
      if (hasDesc) {
        autoTable(doc, {
          head: [['Component', 'Weight', 'Description']],
          body: reqs.map(g => [g.name || g.component || '', g.weight || '', g.description || '']),
          startY: y,
          styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak', valign: 'top' },
          headStyles: { fillColor: [68, 114, 196], textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [245, 247, 252] },
          columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 22 }, 2: { cellWidth: 'auto' } },
          margin: { left: lm, right: 14 },
        });
      } else {
        autoTable(doc, {
          head: [['Component', 'Weight']],
          body: reqs.map(g => [g.name || g.component || '', g.weight || '']),
          startY: y,
          styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak', valign: 'top' },
          headStyles: { fillColor: [68, 114, 196], textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [245, 247, 252] },
          columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 30 } },
          margin: { left: lm, right: 14 },
        });
      }
      y = doc.lastAutoTable.finalY + 5;
    }

    // ── Grading Scale ──
    if (syl.gradingScale?.length) {
      drawSectionHeading('Grading Scale');
      const scaleText = syl.gradingScale.map(g => `${g.grade}: ${g.range}`).join('   |   ');
      drawBodyText(scaleText);
      y += 3;
    }

    // ── Course Schedule ──
    if (syl.weeklySchedule?.length) {
      drawSectionHeading('Course Schedule');
      checkPage(20);
      const hasDates = syl.weeklySchedule.some(w => w.dates);
      if (hasDates) {
        autoTable(doc, {
          head: [['Week', 'Dates', 'Topic', 'Readings', 'Assignments']],
          body: syl.weeklySchedule.map(w => [w.week || '', w.dates || '', w.topic || '', w.readings || '', w.assignments || '']),
          startY: y,
          styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak', valign: 'top' },
          headStyles: { fillColor: [68, 114, 196], textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [245, 247, 252] },
          columnStyles: { 0: { cellWidth: 13 }, 1: { cellWidth: 22 }, 2: { cellWidth: 45 }, 3: { cellWidth: 48 }, 4: { cellWidth: 48 } },
          margin: { left: lm, right: 14 },
        });
      } else {
        autoTable(doc, {
          head: [['Week', 'Topic', 'Readings', 'Assignments']],
          body: syl.weeklySchedule.map(w => [w.week || '', w.topic || '', w.readings || '', w.assignments || '']),
          startY: y,
          styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak', valign: 'top' },
          headStyles: { fillColor: [68, 114, 196], textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [245, 247, 252] },
          columnStyles: { 0: { cellWidth: 15 }, 1: { cellWidth: 50 }, 2: { cellWidth: 55 }, 3: { cellWidth: 55 } },
          margin: { left: lm, right: 14 },
        });
      }
      y = doc.lastAutoTable.finalY + 5;
    }

    // ── Course Policies ──
    drawPolicySection('Attendance & Participation', syl.attendancePolicy);
    drawPolicySection('Late Work Policy', syl.latePolicy);
    drawPolicySection('Communication Policy', syl.communicationPolicy);
    drawPolicySection('Technology & Device Policy', syl.technologyPolicy);
    drawPolicySection('Generative AI Policy', syl.aiPolicy);

    // ── University Policies & Resources ──
    drawPolicySection('Academic Integrity', syl.academicIntegrity);
    drawPolicySection('Disability & Accessibility Accommodations', syl.accommodations);
    drawPolicySection('Mental Health & Wellness Resources', syl.mentalHealth);
    drawPolicySection('Title IX / Non-Discrimination', syl.titleIX);
    drawPolicySection('Student Support Services', syl.supportServices);

    // ── Important Dates ──
    if (syl.importantDates?.length) {
      drawSectionHeading('Important Dates');
      syl.importantDates.forEach(d => drawBoldLabel(d.date || '', d.event || ''));
    }

    const fileName = `${courseName || 'Course'} - Syllabus.pdf`;
    doc.save(fileName);
    return fileName;
  }

  // All other deliverables: generic table-based PDF
  const { headers, rows } = deliverableToCsvRows(featureId, data);
  if (rows.length === 0) throw new Error('No data to export');

  const landscape = headers.length > 5;
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, 15);

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 22,
    styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak', lineWidth: 0.1, lineColor: [180, 198, 231], valign: 'top' },
    headStyles: { fillColor: [68, 114, 196], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: [245, 247, 252] },
    margin: { top: 22, left: 8, right: 8 },
    tableWidth: 'auto',
  });

  const fileName = `${courseName || 'Course'} - ${label}.pdf`;
  doc.save(fileName);
  return fileName;
}

// ════════════════════════════════════════════════════════════════
// DOCX EXPORT
// ════════════════════════════════════════════════════════════════

const FONT = 'Calibri';
const ACCENT = '2B579A';
const BODY_SIZE = 22;
const H1_SIZE = 28;
const H2_SIZE = 24;
const H3_SIZE = 22;
const LINE_SP = 276;
const SINGLE_SP = 240;

/**
 * Shared DOCX content builder — used by both exportDeliverableDocx and buildDeliverableDocxBlob.
 * Generates comprehensive content matching ALL fields shown in the UI.
 */
function _buildDocxContentShared(featureId, data, children, docx) {
  const { Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType, TableLayoutType, BorderStyle, THIN_BORDER } = docx;

  const makeHeading = (text) => new Paragraph({
    heading: HeadingLevel.HEADING_2,
    keepNext: true,
    spacing: { line: LINE_SP, before: 300, after: 120 },
    children: [new TextRun({ text, bold: true, size: H2_SIZE, font: FONT, color: ACCENT })],
  });
  const makeSubHeading = (text) => new Paragraph({
    keepNext: true,
    spacing: { line: SINGLE_SP, before: 160, after: 60 },
    children: [new TextRun({ text, bold: true, size: H3_SIZE, font: FONT, color: '444444' })],
  });
  const makeText = (text) => new Paragraph({
    spacing: { line: SINGLE_SP, before: 40, after: 40 },
    children: [new TextRun({ text: text || '', size: BODY_SIZE, font: FONT })],
  });
  const makeBold = (label, text) => new Paragraph({
    spacing: { line: SINGLE_SP, before: 40, after: 40 },
    children: [
      new TextRun({ text: label + ': ', bold: true, size: BODY_SIZE, font: FONT, color: '333333' }),
      new TextRun({ text: text || '', size: BODY_SIZE, font: FONT }),
    ],
  });
  const makeBullet = (text) => new Paragraph({
    spacing: { line: SINGLE_SP, before: 20, after: 20 },
    indent: { left: 360 },
    children: [new TextRun({ text: `• ${text || ''}`, size: BODY_SIZE, font: FONT })],
  });
  const makeItalic = (text) => new Paragraph({
    spacing: { line: SINGLE_SP, before: 20, after: 20 },
    indent: { left: 360 },
    children: [new TextRun({ text: text || '', italics: true, size: BODY_SIZE, font: FONT, color: '666666' })],
  });
  const makeNumbered = (num, text) => new Paragraph({
    spacing: { line: SINGLE_SP, before: 20, after: 20 },
    indent: { left: 360 },
    children: [
      new TextRun({ text: `${num}. `, bold: true, size: BODY_SIZE, font: FONT }),
      new TextRun({ text: text || '', size: BODY_SIZE, font: FONT }),
    ],
  });
  const makeTableFn = (colDXA, headerTexts, dataRows) => {
    const hdr = new TableRow({
      children: headerTexts.map((h, idx) =>
        new TableCell({ width: { size: colDXA[idx], type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: 'D6E4F0' }, children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: BODY_SIZE, font: FONT })] })] })
      ),
    });
    const rows = dataRows.map(row =>
      new TableRow({
        children: row.map((v, idx) =>
          new TableCell({ width: { size: colDXA[idx], type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: String(v || ''), size: BODY_SIZE, font: FONT })] })] })
        ),
      })
    );
    return new Table({ layout: TableLayoutType.FIXED, width: { size: 9360, type: WidthType.DXA }, columnWidths: colDXA, borders: { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER, insideHorizontal: THIN_BORDER, insideVertical: THIN_BORDER }, rows: [hdr, ...rows] });
  };

  switch (featureId) {
    // ─── LESSON PLANS ───────────────────────────────────────────
    case 'lessonPlans': {
      const key = data.plans ? 'plans' : 'lessonPlans';
      for (const p of (data[key] || [])) {
        children.push(makeHeading(p.lessonTitle || p.title || 'Lesson'));
        // Meta line
        const meta = [p.duration, p.weekNumber].filter(Boolean);
        if (meta.length) children.push(makeText(meta.join(' · ')));
        // Bloom's levels
        if (p.bloomsLevels?.length) children.push(makeBold('Bloom\'s Levels', p.bloomsLevels.join(', ')));
        // Objectives
        if (p.objectives?.length) {
          children.push(makeSubHeading('Learning Objectives'));
          p.objectives.forEach(o => children.push(makeBullet(o)));
        }
        // Warm-Up
        if (p.warmUp) {
          children.push(makeSubHeading('Warm-Up'));
          const wuMeta = [p.warmUp.type, p.warmUp.duration].filter(Boolean);
          if (wuMeta.length) children.push(makeText(wuMeta.join(' · ')));
          if (p.warmUp.prompt) children.push(makeItalic(`"${p.warmUp.prompt}"`));
          if (p.warmUp.purpose) children.push(makeBold('Purpose', p.warmUp.purpose));
          if (p.warmUp.facilitation) children.push(makeItalic(`Facilitation: ${p.warmUp.facilitation}`));
        }
        // Materials
        if (p.materials?.length) {
          children.push(makeSubHeading('Materials & Resources'));
          p.materials.forEach(m => children.push(makeBullet(m)));
        }
        // Session Outline — as a table
        if (p.outline?.length) {
          children.push(makeSubHeading('Session Outline'));
          const colDXA = [1100, 2000, 6260]; // Time, Activity, Description
          const outlineRows = p.outline.map(row => {
            let desc = row.description || '';
            if (row.grouping) desc += ` [${row.grouping}]`;
            if (row.instructorNotes || row.notes) desc += `\nInstructor Notes: ${row.instructorNotes || row.notes}`;
            const actParts = [row.activity || ''];
            if (row.type) actParts.push(`(${row.type})`);
            if (row.bloomsLevel) actParts.push(`[${row.bloomsLevel}]`);
            return [row.time || '', actParts.join(' '), desc];
          });
          children.push(makeTableFn(colDXA, ['Time', 'Activity', 'Description & Notes'], outlineRows));
        }
        // Formative Assessment
        if (p.formativeCheck) {
          children.push(makeSubHeading('Formative Assessment'));
          if (p.formativeCheck.type) children.push(makeBold('Type', p.formativeCheck.type));
          if (p.formativeCheck.prompt) children.push(makeItalic(`"${p.formativeCheck.prompt}"`));
          if (p.formativeCheck.objectiveAligned) children.push(makeBold('Aligns to', p.formativeCheck.objectiveAligned));
          if (p.formativeCheck.instructorAction) children.push(makeItalic(`Instructor Action: ${p.formativeCheck.instructorAction}`));
        }
        // UDL Notes
        if (p.udlNotes && (p.udlNotes.representation || p.udlNotes.engagement || p.udlNotes.expression)) {
          children.push(makeSubHeading('UDL Notes'));
          if (p.udlNotes.representation) children.push(makeBold('Representation', p.udlNotes.representation));
          if (p.udlNotes.engagement) children.push(makeBold('Engagement', p.udlNotes.engagement));
          if (p.udlNotes.expression) children.push(makeBold('Expression', p.udlNotes.expression));
        }
        // Homework
        if (p.homework) {
          children.push(makeSubHeading('Homework'));
          if (typeof p.homework === 'object') {
            if (p.homework.title) children.push(makeBold('Title', p.homework.title));
            if (p.homework.description) children.push(makeText(p.homework.description));
            if (p.homework.estimatedTime) children.push(makeBold('Estimated Time', p.homework.estimatedTime));
            if (p.homework.connectionToNext) children.push(makeBold('Connection to Next Lesson', p.homework.connectionToNext));
          } else {
            children.push(makeText(String(p.homework)));
          }
        }
        // Closing Activity
        if (p.closingActivity) {
          children.push(makeSubHeading('Closing & Wrap-Up'));
          children.push(makeText(p.closingActivity));
        }
        // Spacer between lessons
        children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }));
      }
      break;
    }

    // ─── RUBRICS ────────────────────────────────────────────────
    case 'rubrics': {
      const COL_DXA = [2060, 750, 1640, 1640, 1640, 1630];
      for (const r of (data.rubrics || [])) {
        children.push(makeHeading(r.lessonTitle || r.title || 'Rubric'));
        if (r.title && r.lessonTitle) children.push(makeBold('Assessment', r.title));
        const rMeta = [r.totalPoints && `${r.totalPoints} points`, r.assessmentType, r.bloomsLevel].filter(Boolean);
        if (rMeta.length) children.push(makeText(rMeta.join(' · ')));
        const criteria = r.criteria || [];
        if (criteria.length > 0) {
          children.push(makeTableFn(COL_DXA, ['Criterion', 'Weight', 'Excellent', 'Proficient', 'Developing', 'Beginning'],
            criteria.map(c => [c.criterion || c.name || '', String(c.weight || ''), c.excellent || c.exemplary || '', c.proficient || '', c.developing || '', c.beginning || ''])));
        }
        children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }));
      }
      break;
    }

    // ─── SLIDE DECKS ────────────────────────────────────────────
    case 'slideDecks': {
      const key = data.decks ? 'decks' : 'slideDecks';
      for (const d of (data[key] || [])) {
        children.push(makeHeading(d.lessonTitle || 'Deck'));
        for (let j = 0; j < (d.slides || []).length; j++) {
          const s = d.slides[j];
          children.push(makeBold(`Slide ${j + 1}`, s.title || ''));
          (s.bullets || []).forEach(b => children.push(makeBullet(b)));
          if (s.speakerNotes) children.push(makeItalic(`Speaker Notes: ${s.speakerNotes}`));
        }
        children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }));
      }
      break;
    }

    // ─── QUIZ BANK ──────────────────────────────────────────────
    case 'quizBank': {
      const key = data.quizzes ? 'quizzes' : 'quizBank';
      for (const quiz of (data[key] || [])) {
        children.push(makeHeading(quiz.lessonTitle || 'Quiz'));
        if (quiz.bloomsCoverage?.length) children.push(makeBold('Bloom\'s Coverage', quiz.bloomsCoverage.join(', ')));
        for (let j = 0; j < (quiz.questions || []).length; j++) {
          const q = quiz.questions[j];
          const qMeta = [q.type, q.bloomsLevel, q.difficulty, q.points && `${q.points} pts`, q.estimatedMinutes && `~${q.estimatedMinutes} min`].filter(Boolean);
          children.push(makeBold(`Q${j + 1}` + (qMeta.length ? ` (${qMeta.join(', ')})` : ''), q.question || ''));
          if (q.options) q.options.forEach(o => children.push(makeBullet(o)));
          if (q.answer) children.push(makeBold('Answer', q.answer));
          if (q.explanation) children.push(makeBold('Explanation', q.explanation));
          if (q.objectiveAligned) children.push(makeItalic(`Aligns to: ${q.objectiveAligned}`));
          if (q.distractorRationale) children.push(makeItalic(`Distractor Rationale: ${q.distractorRationale}`));
          if (q.sampleAnswer) children.push(makeBold('Sample Answer', q.sampleAnswer));
          if (q.rubricHints) children.push(makeBold('Rubric Hints', q.rubricHints));
          if (q.feedback) children.push(makeItalic(`Feedback: ${q.feedback}`));
        }
        children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }));
      }
      break;
    }

    // ─── DISCUSSIONS ────────────────────────────────────────────
    case 'discussions': {
      for (const d of (data.discussions || [])) {
        children.push(makeHeading(d.lessonTitle || 'Discussion'));
        const dMeta = [d.bloomsLevel, d.format, d.estimatedDuration].filter(Boolean);
        if (dMeta.length) children.push(makeText(dMeta.join(' · ')));
        if (d.prompt) children.push(makeBold('Prompt', d.prompt));
        if (d.context) children.push(makeBold('Context', d.context));
        if (d.evidenceRequirement) children.push(makeBold('Evidence Requirement', d.evidenceRequirement));
        // Follow-up probes
        if (d.followUpProbes?.length) {
          children.push(makeSubHeading('Follow-Up Probes'));
          d.followUpProbes.forEach(p => children.push(makeBullet(p)));
        }
        // Facilitation tips
        if (d.facilitationTips) {
          children.push(makeSubHeading('Facilitation Tips'));
          if (d.facilitationTips.opening) children.push(makeBold('Opening', d.facilitationTips.opening));
          if (d.facilitationTips.ifStalls) children.push(makeBold('If Stalls', d.facilitationTips.ifStalls));
          if (d.facilitationTips.ifDominates) children.push(makeBold('If Dominates', d.facilitationTips.ifDominates));
          if (d.facilitationTips.closure) children.push(makeBold('Closure', d.facilitationTips.closure));
        }
        // Response starters
        if (d.responseStarters?.length) {
          children.push(makeSubHeading('Response Starters'));
          d.responseStarters.forEach(s => children.push(makeBullet(s)));
        }
        // Evaluation criteria
        if (d.evaluationCriteria?.length) {
          children.push(makeSubHeading('Evaluation Criteria'));
          d.evaluationCriteria.forEach(c => children.push(makeBullet(c)));
        }
        if (d.equityConsiderations) children.push(makeBold('Equity Considerations', d.equityConsiderations));
        if (d.guidelines) children.push(makeBold('Guidelines', d.guidelines));
        if (d.followUp) children.push(makeBold('Follow-up', d.followUp));
        children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }));
      }
      break;
    }

    // ─── ASSIGNMENTS ────────────────────────────────────────────
    case 'assignments': {
      for (const a of (data.assignments || [])) {
        children.push(makeHeading(a.title || 'Assignment'));
        const aMeta = [a.assignmentType, a.bloomsLevel, a.dueWeek || a.dueDate, a.estimatedTime, a.totalPoints && `${a.totalPoints} pts`, a.percentOfGrade].filter(Boolean);
        if (aMeta.length) children.push(makeText(aMeta.join(' · ')));
        if (a.relatedLessons?.length) children.push(makeBold('Related Lessons', a.relatedLessons.join(', ')));
        if (a.overview) children.push(makeBold('Overview', a.overview));
        if (a.description) children.push(makeBold('Description', a.description));
        if (a.objectives?.length) {
          children.push(makeSubHeading('Learning Objectives'));
          a.objectives.forEach(o => children.push(makeBullet(o)));
        }
        if (a.instructions?.length) {
          children.push(makeSubHeading('Instructions'));
          a.instructions.forEach((inst, j) => {
            const raw = typeof inst === 'string' ? inst : inst.step || '';
            // Strip leading "1. " prefix that AI sometimes includes (prevents "1. 1." double-numbering)
            const stripped = raw.replace(/^\d+\.\s*/, '');
            children.push(makeNumbered(j + 1, stripped));
          });
        }
        // Format requirements
        if (a.formatRequirements) {
          children.push(makeSubHeading('Format Requirements'));
          const fr = a.formatRequirements;
          if (fr.length) children.push(makeBold('Length', fr.length));
          if (fr.format) children.push(makeBold('Format', fr.format));
          if (fr.citationStyle) children.push(makeBold('Citation Style', fr.citationStyle));
          if (fr.submissionPlatform) children.push(makeBold('Submission', fr.submissionPlatform));
          if (fr.latePolicy) children.push(makeBold('Late Policy', fr.latePolicy));
        }
        if (a.deliverables?.length) {
          children.push(makeSubHeading('Deliverables'));
          a.deliverables.forEach(d => children.push(makeBullet(typeof d === 'string' ? d : d.name || '')));
        }
        if (a.submissionFormat) children.push(makeBold('Submission Format', a.submissionFormat));
        if (a.gradingCriteria) children.push(makeBold('Grading Criteria', a.gradingCriteria));
        // Scaffolding milestones
        if (a.scaffoldingMilestones?.length) {
          children.push(makeSubHeading('Scaffolding Milestones'));
          a.scaffoldingMilestones.forEach(m => {
            const parts = [m.milestone || m.name || '', m.dueDate ? `(${m.dueDate})` : ''].filter(Boolean);
            children.push(makeBold(parts.join(' '), m.description || ''));
          });
        }
        // Support resources
        if (a.supportResources?.length) {
          children.push(makeSubHeading('Support Resources'));
          a.supportResources.forEach(r => children.push(makeBullet(typeof r === 'string' ? r : r.name || '')));
        }
        if (a.academicIntegrityStatement) children.push(makeBold('Academic Integrity', a.academicIntegrityStatement));
        children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }));
      }
      break;
    }

    // ─── STUDY GUIDES ───────────────────────────────────────────
    case 'studyGuides': {
      const key = data.guides ? 'guides' : 'studyGuides';
      for (const g of (data[key] || [])) {
        children.push(makeHeading(g.lessonTitle || 'Study Guide'));
        if (g.examScope) children.push(makeText(g.examScope));
        if (g.summary) {
          children.push(makeSubHeading('Concept Summary'));
          children.push(makeText(g.summary));
        }
        if (g.keyTerms?.length) {
          children.push(makeSubHeading('Key Terms'));
          g.keyTerms.forEach(t => {
            const parts = [t.definition || ''];
            if (t.example) parts.push(`Example: ${t.example}`);
            children.push(makeBold(t.term || '', parts.join(' — ')));
          });
        }
        // Concept connections
        if (g.conceptConnections?.length) {
          children.push(makeSubHeading('Concept Connections'));
          g.conceptConnections.forEach(c => children.push(makeBullet(typeof c === 'string' ? c : `${c.from || ''} ↔ ${c.to || ''}: ${c.relationship || ''}`)));
        }
        // Common misconceptions
        if (g.commonMisconceptions?.length) {
          children.push(makeSubHeading('Common Misconceptions'));
          g.commonMisconceptions.forEach(m => {
            if (typeof m === 'string') { children.push(makeBullet(m)); return; }
            children.push(makeBold('Misconception', m.misconception || ''));
            if (m.correction) children.push(makeItalic(`Correction: ${m.correction}`));
          });
        }
        // Review questions
        if (g.reviewQuestions?.length) {
          children.push(makeSubHeading('Review Questions'));
          g.reviewQuestions.forEach((q, j) => {
            if (typeof q === 'string') { children.push(makeNumbered(j + 1, q)); return; }
            const qMeta = [q.bloomsLevel].filter(Boolean);
            children.push(makeNumbered(j + 1, (q.question || q) + (qMeta.length ? ` [${qMeta.join(', ')}]` : '')));
            if (q.hint) children.push(makeItalic(`Hint: ${q.hint}`));
          });
        }
        // Practice activities
        if (g.practiceActivities?.length) {
          children.push(makeSubHeading('Practice Activities'));
          g.practiceActivities.forEach(a => children.push(makeBullet(typeof a === 'string' ? a : a.activity || '')));
        }
        // Exam prep
        if (g.examPrep) {
          children.push(makeSubHeading('Exam Preparation'));
          if (Array.isArray(g.examPrep.keyTopicsToKnow) && g.examPrep.keyTopicsToKnow.length) {
            children.push(makeBold('Key Topics', ''));
            g.examPrep.keyTopicsToKnow.forEach(t => children.push(makeBullet(typeof t === 'string' ? t : JSON.stringify(t))));
          }
          if (Array.isArray(g.examPrep.commonErrors) && g.examPrep.commonErrors.length) {
            children.push(makeBold('Common Errors', ''));
            g.examPrep.commonErrors.forEach(e => children.push(makeBullet(typeof e === 'string' ? e : JSON.stringify(e))));
          } else if (typeof g.examPrep.commonErrors === 'string') {
            children.push(makeBold('Common Errors', g.examPrep.commonErrors));
          }
          if (g.examPrep.reviewStrategy) children.push(makeBold('Review Strategy', typeof g.examPrep.reviewStrategy === 'string' ? g.examPrep.reviewStrategy : JSON.stringify(g.examPrep.reviewStrategy)));
          if (g.examPrep.timeManagement) children.push(makeBold('Time Management', typeof g.examPrep.timeManagement === 'string' ? g.examPrep.timeManagement : JSON.stringify(g.examPrep.timeManagement)));
        }
        // Legacy examTips
        if (g.examTips && !g.examPrep) children.push(makeBold('Exam Tips', g.examTips));
        // Connection to next
        if (g.connectionToNext) children.push(makeBold('Connection to Next Lesson', g.connectionToNext));
        children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }));
      }
      break;
    }

    // ─── SYLLABUS ───────────────────────────────────────────────
    case 'syllabus': {
      const syl = data.syllabus || data;
      // Course info
      const infoLines = [syl.semester && `Semester: ${syl.semester}`, syl.credits && `Credits: ${syl.credits}`, syl.meetingPattern && `Meeting: ${syl.meetingPattern}`, syl.location && `Location: ${syl.location}`, syl.deliveryMode && `Delivery: ${syl.deliveryMode}`, syl.prerequisites && `Prerequisites: ${syl.prerequisites}`].filter(Boolean);
      if (infoLines.length) infoLines.forEach(l => children.push(makeText(l)));
      // Instructor info
      const instrLines = [syl.instructor && `Instructor: ${syl.instructor}`, syl.instructorEmail && `Email: ${syl.instructorEmail}`, syl.officeHours && `Office Hours: ${syl.officeHours}`, syl.officeLocation && `Office: ${syl.officeLocation}`].filter(Boolean);
      if (instrLines.length) { children.push(makeHeading('Instructor Information')); instrLines.forEach(l => children.push(makeText(l))); }
      if (syl.courseDescription) { children.push(makeHeading('Course Description')); children.push(makeText(syl.courseDescription)); }
      if (syl.learningOutcomes?.length) { children.push(makeHeading('Student Learning Outcomes')); children.push(makeText('Upon successful completion of this course, students will be able to:')); syl.learningOutcomes.forEach((o, i) => children.push(makeBullet(`${i + 1}. ${o}`))); }
      if (syl.requiredTexts?.length) { children.push(makeHeading('Required Texts & Materials')); syl.requiredTexts.forEach(t => { if (typeof t === 'string') { children.push(makeBullet(t)); return; } const parts = [t.author, t.title, t.edition && `(${t.edition})`, t.isbn && `ISBN: ${t.isbn}`, t.note].filter(Boolean); children.push(makeBullet(parts.join('. '))); }); }
      // Course Requirements
      const reqs = syl.courseRequirements || syl.gradingPolicy || [];
      if (reqs.length) {
        children.push(makeHeading('Course Requirements & Grading'));
        const hasDesc = reqs.some(r => r.description);
        if (hasDesc) {
          children.push(makeTableFn([2810, 1120, 5430], ['Component', 'Weight', 'Description'], reqs.map(g => [g.name || g.component || '', g.weight || '', g.description || ''])));
        } else {
          children.push(makeTableFn([7020, 2340], ['Component', 'Weight'], reqs.map(g => [g.name || g.component || '', g.weight || ''])));
        }
      }
      if (syl.gradingScale?.length) { children.push(makeHeading('Grading Scale')); children.push(makeText(syl.gradingScale.map(g => `${g.grade}: ${g.range}`).join('   |   '))); }
      // Course Schedule
      if (syl.weeklySchedule?.length) {
        children.push(makeHeading('Course Schedule'));
        const hasDates = syl.weeklySchedule.some(w => w.dates);
        const headers = hasDates ? ['Week', 'Dates', 'Topic', 'Readings', 'Assignments'] : ['Week', 'Topic', 'Readings', 'Assignments'];
        const wsDXA = hasDates ? [780, 1200, 2500, 2440, 2440] : [936, 2995, 2810, 2619];
        children.push(makeTableFn(wsDXA, headers, syl.weeklySchedule.map(w => hasDates ? [w.week || '', w.dates || '', w.topic || '', w.readings || '', w.assignments || ''] : [w.week || '', w.topic || '', w.readings || '', w.assignments || ''])));
      }
      // Policies
      const policySection = (heading, text) => { if (text) { children.push(makeHeading(heading)); children.push(makeText(text)); } };
      policySection('Attendance & Participation', syl.attendancePolicy);
      policySection('Late Work Policy', syl.latePolicy);
      policySection('Communication Policy', syl.communicationPolicy);
      policySection('Technology & Device Policy', syl.technologyPolicy);
      policySection('Generative AI Policy', syl.aiPolicy);
      policySection('Academic Integrity', syl.academicIntegrity);
      policySection('Disability & Accessibility Accommodations', syl.accommodations);
      policySection('Mental Health & Wellness Resources', syl.mentalHealth);
      policySection('Title IX / Non-Discrimination', syl.titleIX);
      policySection('Student Support Services', syl.supportServices);
      if (syl.importantDates?.length) { children.push(makeHeading('Important Dates')); syl.importantDates.forEach(d => children.push(makeBold(d.date || '', d.event || ''))); }
      break;
    }

    // ─── COURSE FAQ ───────────────────────────────────────────────
    case 'courseFaq': {
      const faqs = data.faqs || data.courseFaq || [];
      for (const lesson of faqs) {
        const title = lesson.lessonTitle || lesson.title || 'FAQ';
        children.push(makeHeading(title));

        const questions = lesson.questions || [];
        for (let qi = 0; qi < questions.length; qi++) {
          const q = questions[qi];
          // Bold question
          children.push(makeBold(`Q${qi + 1}`, q.question || ''));
          // Answer text
          children.push(makeText(q.answer || ''));
          // Related concepts as comma-separated text (not raw JSON)
          if (Array.isArray(q.relatedConcepts) && q.relatedConcepts.length > 0) {
            children.push(makeItalic(`Related: ${q.relatedConcepts.join(', ')}`));
          }
        }

        // Tags as a subtle line at the end of each lesson
        if (Array.isArray(lesson.tags) && lesson.tags.length > 0) {
          children.push(makeItalic(`Tags: ${lesson.tags.join(', ')}`));
        }
      }
      break;
    }

    // ─── CUSTOM DELIVERABLES (generic) ───────────────────────────
    default: {
      const arrKey = Object.keys(data).find(k => Array.isArray(data[k]) && data[k].length > 0);
      const items = arrKey ? data[arrKey] : [data];
      const headerKeys = new Set(['lessonTitle', 'title', 'name', 'weekNumber', 'week', 'tiers']);
      const toLabel = (k) => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, s => s.toUpperCase());

      for (const item of items) {
        const title = item.lessonTitle || item.title || item.name || 'Item';
        const subtitle = item.weekNumber || item.week || '';
        children.push(makeHeading(subtitle ? `${title} — ${subtitle}` : title));

        for (const [k, v] of Object.entries(item)) {
          if (headerKeys.has(k) || v == null || v === '') continue;
          const label = toLabel(k);
          if (typeof v === 'string') {
            if (v.length < 100) {
              children.push(makeBold(label, v));
            } else {
              children.push(makeSubHeading(label));
              children.push(makeText(v));
            }
          } else if (Array.isArray(v)) {
            children.push(makeSubHeading(label));
            v.forEach(el => {
              if (typeof el === 'string') {
                children.push(makeBullet(el));
              } else if (typeof el === 'object' && el !== null) {
                const parts = Object.entries(el).filter(([, val]) => val != null && val !== '').map(([ek, ev]) => `${toLabel(ek)}: ${typeof ev === 'string' ? ev : JSON.stringify(ev)}`);
                children.push(makeBullet(parts.join(' · ')));
              }
            });
          } else if (typeof v === 'object') {
            children.push(makeSubHeading(label));
            for (const [sk, sv] of Object.entries(v)) {
              if (sv != null && sv !== '') children.push(makeBold(toLabel(sk), typeof sv === 'string' ? sv : JSON.stringify(sv)));
            }
          } else {
            children.push(makeBold(label, String(v)));
          }
        }
      }
      break;
    }
  }
}

export async function exportDeliverableDocx(featureId, data, courseName) {
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
    Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, TableLayoutType,
  } = await getDocx();
  const saveAs = await getSaveAs();

  const label = resolveFeatureLabel(featureId);
  const THIN_BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'D0D0D0' };
  const children = [];

  // Title
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { line: LINE_SP, after: 120 },
    children: [new TextRun({ text: `${courseName || 'Course'} — ${label}`, bold: true, size: H1_SIZE, font: FONT, color: ACCENT })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC', space: 8 } },
    children: [],
  }));

  // Build content using shared helper
  _buildDocxContentShared(featureId, data, children, { Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType, TableLayoutType, BorderStyle, THIN_BORDER });

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: BODY_SIZE } } } },
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  const fileName = `${courseName || 'Course'} - ${label}.docx`;
  saveAs(blob, fileName);
  return fileName;
}

// ════════════════════════════════════════════════════════════════
// GOOGLE DOCS / SHEETS
// ════════════════════════════════════════════════════════════════

export async function exportDeliverableToGoogleDocs(featureId, data, courseName, preOpenedTab = null) {
  // Build a rich DOCX blob (identical formatting to the local download) and upload to Google Drive.
  // Google Drive automatically converts the .docx to a Google Doc, preserving tables, headings,
  // bullets, and all rich formatting — as good as the local preview.
  //
  // preOpenedTab: caller should open a tab synchronously BEFORE any await, then pass it here
  // so the popup-blocker doesn't kill it.
  const label = resolveFeatureLabel(featureId);
  const { updateTabStatus } = await import('./googleDrive.js');
  updateTabStatus(preOpenedTab, 'build');
  const blob = await buildDeliverableDocxBlob(featureId, data, courseName);
  const { saveToGoogleDocsBlob } = await import('./googleDrive.js');
  const stamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const fileName = `${courseName || 'Course'} - ${label} (${stamp})`;
  return await saveToGoogleDocsBlob(blob, fileName, courseName, preOpenedTab);
}

export async function exportDeliverableToGoogleSheets(featureId, data, courseName, preOpenedTab = null) {
  const { headers, rows } = deliverableToCsvRows(featureId, data);
  if (rows.length === 0) throw new Error('No data to export');

  const { updateTabStatus } = await import('./googleDrive.js');
  updateTabStatus(preOpenedTab, 'build');

  // Build a styled XLSX workbook (matching course map quality)
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Course Mapper';
  workbook.created = new Date();

  const label = resolveFeatureLabel(featureId);
  const sheet = workbook.addWorksheet(label);

  // ── Column widths — based on header text length ──
  sheet.columns = headers.map((h) => {
    const len = String(h).length;
    const width = Math.max(15, Math.min(45, len * 1.4 + 4));
    return { width };
  });

  // ── Styling constants (matching xlsxGenerator.js) ──
  const HEADER_FILL  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  const HEADER_FONT  = { name: 'Inter', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  const DATA_FONT    = { name: 'Inter', size: 10 };
  const BORDER       = { top: { style: 'thin', color: { argb: 'FFB4C6E7' } }, left: { style: 'thin', color: { argb: 'FFB4C6E7' } }, bottom: { style: 'thin', color: { argb: 'FFB4C6E7' } }, right: { style: 'thin', color: { argb: 'FFB4C6E7' } } };
  const ALT_ROW_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F6FC' } };

  // ── Header row ──
  const headerRow = sheet.addRow(headers);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    cell.border = BORDER;
  });

  // ── Data rows ──
  rows.forEach((row, idx) => {
    const r = sheet.addRow(row);
    r.eachCell((cell) => {
      cell.font = DATA_FONT;
      cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
      cell.border = BORDER;
      // Alternating row color (even data rows = light blue)
      if (idx % 2 === 1) cell.fill = ALT_ROW_FILL;
    });
  });

  // ── Freeze header row ──
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const { saveToGoogleSheets } = await import('./googleDrive.js');
  const stamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const fileName = `${courseName || 'Course'} - ${label} (${stamp}).xlsx`;
  return await saveToGoogleSheets(buffer, fileName, courseName, preOpenedTab);
}

// ════════════════════════════════════════════════════════════════
// EXPORT ALL
// ════════════════════════════════════════════════════════════════

export async function exportAllDeliverables(format, deliverables, courseName, courseMap, columns) {
  const results = [];
  // Include course map if available
  if (courseMap && format !== 'gsheets' && format !== 'gdocs') {
    try {
      if (format === 'csv') {
        const { generateCsv } = await import('./exporters.js');
        results.push(await generateCsv(courseMap, columns));
      } else if (format === 'pdf') {
        const { generatePdf } = await import('./exporters.js');
        results.push(await generatePdf(courseMap, columns));
      } else if (format === 'docx') {
        const { generateDocx } = await import('./docxGenerator.js');
        results.push(await generateDocx(courseMap, columns));
      }
    } catch (e) { console.warn('Course map export failed:', e); }
  }

  for (const [featureId, entry] of Object.entries(deliverables)) {
    if (!entry?.data || entry.status !== 'done') continue;
    try {
      if (format === 'csv') results.push(await exportDeliverableCsv(featureId, entry.data, courseName));
      else if (format === 'pdf') results.push(await exportDeliverablePdf(featureId, entry.data, courseName));
      else if (format === 'docx') results.push(await exportDeliverableDocx(featureId, entry.data, courseName));
      else if (format === 'gdocs') results.push(await exportDeliverableToGoogleDocs(featureId, entry.data, courseName));
      else if (format === 'gsheets') results.push(await exportDeliverableToGoogleSheets(featureId, entry.data, courseName));
    } catch (e) { console.warn(`Export ${featureId} failed:`, e); }
  }
  return results;
}

// ════════════════════════════════════════════════════════════════
// BLOB-ONLY DOCX (for ZIP bundling — no file-save)
// ════════════════════════════════════════════════════════════════

/**
 * Build a DOCX blob for a deliverable without triggering a browser download.
 * Used by zipExporter.js to bundle deliverables into a ZIP archive.
 */
export async function buildDeliverableDocxBlob(featureId, data, courseName) {
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
    Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, TableLayoutType,
  } = await getDocx();

  const label = resolveFeatureLabel(featureId);
  const THIN_BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'D0D0D0' };
  const children = [];

  // Title header (same as exportDeliverableDocx)
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { line: LINE_SP, after: 120 },
    children: [new TextRun({ text: `${courseName || 'Course'} — ${label}`, bold: true, size: H1_SIZE, font: FONT, color: ACCENT })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC', space: 8 } },
    children: [],
  }));

  // Build content using shared helper
  _buildDocxContentShared(featureId, data, children, { Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType, TableLayoutType, BorderStyle, THIN_BORDER });

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: BODY_SIZE } } } },
    sections: [{ children }],
  });

  return await Packer.toBlob(doc);
}

// ─── Feature 7.4: Rubric → Gradebook CSV ────────────────────────────────────

/**
 * Export rubric data as a Gradebook CSV for Canvas/Gradescope.
 * Format:
 *   Row 1: metadata header (criterion name, max points, weight)
 *   Row 2: column header (Student Name, [criterion]…, Total, Feedback)
 *   Row 3+: one row per placeholder student
 *
 * @param {object} rubricData  — { rubrics: RubricShape[] }
 * @param {number} studentCount — how many blank student rows to include (default 30)
 */
export function exportRubricGradebook(rubricData, studentCount = 30) {
  const rubrics = rubricData?.rubrics || [];
  if (rubrics.length === 0) return;

  const rows = [];

  rubrics.forEach((rubric, ri) => {
    const criteria = rubric.criteria || [];
    const title = rubric.title || `Rubric ${ri + 1}`;

    // Row 1: rubric metadata
    const metaRow = [`${title} (Metadata)`, 'Max Points', ...criteria.map(c => c.points ?? ''), '', ''];
    rows.push(metaRow);

    // Row 2: weights sub-header
    const weightRow = ['', 'Weight %', ...criteria.map(c => `${c.weight ?? ''}%`), '', ''];
    rows.push(weightRow);

    // Row 3: column headers
    const headerRow = [
      'Student Name',
      ...criteria.map(c => c.criterion || c.name || `Criterion ${criteria.indexOf(c) + 1}`),
      'Total Score',
      'Feedback',
    ];
    rows.push(headerRow);

    // Student rows
    for (let s = 0; s < studentCount; s++) {
      const studentRow = [
        `Student ${s + 1}`,
        ...criteria.map(() => ''),
        '',
        '',
      ];
      rows.push(studentRow);
    }

    // Blank separator between rubrics
    rows.push([]);
  });

  const csvContent = rows.map(row =>
    row.map(cell => {
      const s = String(cell ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(',')
  ).join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rubric_gradebook.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export { FEATURE_LABELS };
