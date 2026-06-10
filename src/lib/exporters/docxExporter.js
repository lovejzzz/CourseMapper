import { loadPdfLibs, getDocx, getSaveAs, isInternalExportMetadataKey, resolveFeatureLabel } from './exporterUtils.js';
import { expandKeys } from '../keyMaps.js';
import { assertOfficeExportHasNoInternalText } from '../exportTextInspector.js';
import { formatRequiredText, normalizeCourseRequirements } from './syllabusExportUtils.js';

// DOCX EXPORT
// ════════════════════════════════════════════════════════════════

import { getDocTheme } from './docTheme.js';

export const FONT = 'Calibri';
// Theme-aware accent: documents pick up the active doc theme at build time;
// the constant remains the indigo default for callers that import it.
export const ACCENT = '2B579A';
function activeTheme() {
  try {
    return getDocTheme();
  } catch {
    return { accent: ACCENT, headingColor: '1F3864', metaColor: '7A869A', ruleColor: 'CCCCCC' };
  }
}
export const BODY_SIZE = 22;
export const H1_SIZE = 28;
const H2_SIZE = 24;
const H3_SIZE = 22;
export const LINE_SP = 276;
const SINGLE_SP = 240;

function formatSourceArtifact(artifact) {
  if (typeof artifact === 'string') return artifact;
  return [artifact?.title || artifact?.name || artifact?.label, artifact?.locator, artifact?.use || artifact?.purpose]
    .filter(Boolean)
    .join(' — ');
}

/**
 * Shared DOCX content builder — used by both exportDeliverableDocx and buildDeliverableDocxBlob.
 * Generates comprehensive content matching ALL fields shown in the UI.
 */
/**
 * Shared document shell: Title-styled heading, divider, and a footer with the
 * course name and page numbers. Used by both the direct exporter and the
 * bulk/ZIP exporter so every generated DOCX gets the same page furniture.
 */
export function buildDocxTitleChildren(docx, courseName, label, options = {}) {
  const { Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, PageBreak } = docx;
  const theme = activeTheme();
  const children = [];
  // Cover page for multi-lesson documents: course identity gets a designed
  // first page instead of dropping straight into Lesson 1.
  if (options.cover) {
    children.push(
      new Paragraph({ spacing: { before: 2400 }, children: [] }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [
          new TextRun({ text: courseName || 'Course', bold: true, size: 56, font: FONT, color: theme.headingColor }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [new TextRun({ text: label, size: 32, font: FONT, color: theme.accent })],
      }),
      ...(options.coverMeta
        ? [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 80 },
              children: [new TextRun({ text: options.coverMeta, size: 22, font: FONT, color: theme.metaColor })],
            }),
          ]
        : []),
      new Paragraph({ children: [new PageBreak()] }),
    );
  }
  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { line: LINE_SP, after: 120 },
      children: [
        new TextRun({
          text: `${courseName || 'Course'} — ${label}`,
          bold: true,
          size: H1_SIZE,
          font: FONT,
          color: theme.accent,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: theme.ruleColor, space: 8 } },
      children: [],
    }),
  );
  return children;
}

export function buildDocxDocument(docx, children, { courseName, label }) {
  const { Document, Paragraph, TextRun, Footer, PageNumber, TabStopType, TabStopPosition } = docx;
  const footer = new Footer({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        children: [
          new TextRun({
            text: `${courseName || 'Course'} — ${label}`,
            size: 16,
            font: FONT,
            color: '888888',
          }),
          new TextRun({ text: '\tPage ', size: 16, font: FONT, color: '888888' }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, font: FONT, color: '888888' }),
          new TextRun({ text: ' of ', size: 16, font: FONT, color: '888888' }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, font: FONT, color: '888888' }),
        ],
      }),
    ],
  });
  return new Document({
    styles: { default: { document: { run: { font: FONT, size: BODY_SIZE } } } },
    sections: [{ footers: { default: footer }, children }],
  });
}

export function _buildDocxContentShared(featureId, data, children, docx) {
  const {
    Paragraph,
    TextRun,
    HeadingLevel,
    Table,
    TableRow,
    TableCell,
    WidthType,
    ShadingType,
    TableLayoutType,
    BorderStyle,
    THIN_BORDER,
  } = docx;

  const makeHeading = (text) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      keepNext: true,
      spacing: { line: LINE_SP, before: 300, after: 120 },
      children: [new TextRun({ text, bold: true, size: H2_SIZE, font: FONT, color: ACCENT })],
    });
  const makeSubHeading = (text) =>
    new Paragraph({
      // Real heading level so section labels appear in Word's navigation
      // pane, TOCs, and screen-reader outlines instead of reading as bold
      // body text.
      heading: HeadingLevel.HEADING_3,
      keepNext: true,
      spacing: { line: SINGLE_SP, before: 160, after: 60 },
      children: [new TextRun({ text, bold: true, size: H3_SIZE, font: FONT, color: '444444' })],
    });
  const makeText = (text) =>
    new Paragraph({
      spacing: { line: SINGLE_SP, before: 40, after: 40 },
      children: [new TextRun({ text: text || '', size: BODY_SIZE, font: FONT })],
    });
  const makeBold = (label, text) =>
    new Paragraph({
      spacing: { line: SINGLE_SP, before: 40, after: 40 },
      children: [
        new TextRun({ text: label + ': ', bold: true, size: BODY_SIZE, font: FONT, color: '333333' }),
        new TextRun({ text: text || '', size: BODY_SIZE, font: FONT }),
      ],
    });
  const makeBullet = (text) =>
    new Paragraph({
      spacing: { line: SINGLE_SP, before: 20, after: 20 },
      indent: { left: 360 },
      bullet: { level: 0 },
      children: [new TextRun({ text: text || '', size: BODY_SIZE, font: FONT })],
    });
  const makeItalic = (text) =>
    new Paragraph({
      spacing: { line: SINGLE_SP, before: 20, after: 20 },
      indent: { left: 360 },
      children: [new TextRun({ text: text || '', italics: true, size: BODY_SIZE, font: FONT, color: '666666' })],
    });
  const makeNumbered = (num, text) =>
    new Paragraph({
      spacing: { line: SINGLE_SP, before: 20, after: 20 },
      indent: { left: 360 },
      children: [
        new TextRun({ text: `${num}. `, bold: true, size: BODY_SIZE, font: FONT }),
        new TextRun({ text: text || '', size: BODY_SIZE, font: FONT }),
      ],
    });
  const makeTableFn = (colDXA, headerTexts, dataRows) => {
    const hdr = new TableRow({
      children: headerTexts.map(
        (h, idx) =>
          new TableCell({
            width: { size: colDXA[idx], type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: 'D6E4F0' },
            children: [
              new Paragraph({ children: [new TextRun({ text: h, bold: true, size: BODY_SIZE, font: FONT })] }),
            ],
          }),
      ),
    });
    const rows = dataRows.map(
      (row) =>
        new TableRow({
          children: row.map(
            (v, idx) =>
              new TableCell({
                width: { size: colDXA[idx], type: WidthType.DXA },
                children: [
                  new Paragraph({ children: [new TextRun({ text: String(v || ''), size: BODY_SIZE, font: FONT })] }),
                ],
              }),
          ),
        }),
    );
    return new Table({
      layout: TableLayoutType.FIXED,
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: colDXA,
      borders: {
        top: THIN_BORDER,
        bottom: THIN_BORDER,
        left: THIN_BORDER,
        right: THIN_BORDER,
        insideHorizontal: THIN_BORDER,
        insideVertical: THIN_BORDER,
      },
      rows: [hdr, ...rows],
    });
  };

  switch (featureId) {
    // ─── LESSON PLANS ───────────────────────────────────────────
    case 'lessonPlans': {
      const expanded = expandKeys('lessonPlans', data);
      const key = expanded.plans ? 'plans' : 'lessonPlans';
      for (const p of expanded[key] || []) {
        children.push(makeHeading(p.lessonTitle || p.title || 'Lesson'));
        // Meta line
        const meta = [p.duration, p.weekNumber].filter(Boolean);
        if (meta.length) children.push(makeText(meta.join(' · ')));
        // Bloom's levels
        if (p.bloomsLevels?.length) children.push(makeBold("Bloom's Levels", p.bloomsLevels.join(', ')));
        // Objectives
        if (p.objectives?.length) {
          children.push(makeSubHeading('Learning Objectives'));
          p.objectives.forEach((o) => children.push(makeBullet(o)));
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
          p.materials.forEach((m) => children.push(makeBullet(m)));
        }
        // Session Outline — as a table
        if (p.outline?.length) {
          children.push(makeSubHeading('Session Outline'));
          const colDXA = [1100, 2000, 6260]; // Time, Activity, Description
          const outlineRows = p.outline.map((row) => {
            let desc = row.description || '';
            if (row.grouping) desc += `${desc ? '\n' : ''}Grouping: ${row.grouping}`;
            if (row.instructorNotes || row.notes) desc += `\nInstructor Notes: ${row.instructorNotes || row.notes}`;
            const actParts = [row.activity || ''];
            if (row.type) actParts.push(row.type);
            if (row.bloomsLevel) actParts.push(`Bloom: ${row.bloomsLevel}`);
            return [row.time || '', actParts.filter(Boolean).join(' · '), desc];
          });
          children.push(makeTableFn(colDXA, ['Time', 'Activity', 'Description & Notes'], outlineRows));
        }
        // Formative Assessment
        if (p.formativeCheck) {
          children.push(makeSubHeading('Formative Assessment'));
          if (p.formativeCheck.type) children.push(makeBold('Type', p.formativeCheck.type));
          if (p.formativeCheck.prompt) children.push(makeItalic(`"${p.formativeCheck.prompt}"`));
          if (p.formativeCheck.objectiveAligned)
            children.push(makeBold('Aligns to', p.formativeCheck.objectiveAligned));
          if (p.formativeCheck.instructorAction)
            children.push(makeItalic(`Instructor Action: ${p.formativeCheck.instructorAction}`));
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
            if (p.homework.connectionToNext)
              children.push(makeBold('Connection to Next Lesson', p.homework.connectionToNext));
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
      const expanded = expandKeys('rubrics', data);
      const COL_DXA = [2060, 750, 1640, 1640, 1640, 1630];
      for (const r of expanded.rubrics || []) {
        const gradedWork = r.gradedWork || r.assignmentTitle || r.title || '';
        children.push(makeHeading(r.lessonTitle || r.title || 'Rubric'));
        if (gradedWork) children.push(makeBold('Graded Student Work', gradedWork));
        if (r.title && r.lessonTitle) children.push(makeBold('Rubric', r.title));
        const rMeta = [r.totalPoints && `${r.totalPoints} points`, r.assessmentType, r.bloomsLevel].filter(Boolean);
        if (rMeta.length) children.push(makeText(rMeta.join(' · ')));
        if (r.taskDirections) children.push(makeBold('Task Directions', r.taskDirections));
        if (r.instructorFacilitationNote)
          children.push(makeBold('Instructor Facilitation', r.instructorFacilitationNote));
        if (r.accessibilityAndUDL) children.push(makeBold('Accessibility & UDL', r.accessibilityAndUDL));
        if (Array.isArray(r.anchorExamples) && r.anchorExamples.length > 0) {
          children.push(makeSubHeading('Anchor Examples'));
          r.anchorExamples.forEach((example) => children.push(makeBullet(example)));
        }
        const criteria = r.criteria || [];
        if (criteria.length > 0) {
          children.push(
            makeTableFn(
              COL_DXA,
              ['Criterion', 'Weight', 'Excellent', 'Proficient', 'Developing', 'Beginning'],
              criteria.map((c) => [
                c.criterion || c.name || '',
                String(c.weight || ''),
                c.excellent || c.exemplary || '',
                c.proficient || '',
                c.developing || '',
                c.beginning || '',
              ]),
            ),
          );
        }
        children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }));
      }
      break;
    }

    // ─── SLIDE DECKS ────────────────────────────────────────────
    case 'slideDecks': {
      const expanded = expandKeys('slideDecks', data);
      const key = expanded.decks ? 'decks' : 'slideDecks';
      for (const d of expanded[key] || []) {
        children.push(makeHeading(d.lessonTitle || 'Deck'));
        for (let j = 0; j < (d.slides || []).length; j++) {
          const s = d.slides[j];
          children.push(makeBold(`Slide ${j + 1}`, s.title || ''));
          (s.bullets || []).forEach((b) => children.push(makeBullet(b)));
          if (s.visual?.altText) children.push(makeItalic(`Alt text: ${s.visual.altText}`));
          const speakerNotes = s.speakerNotes || s.notes;
          if (speakerNotes) children.push(makeItalic(`Speaker Notes: ${speakerNotes}`));
        }
        children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }));
      }
      break;
    }

    // ─── QUIZ BANK ──────────────────────────────────────────────
    case 'quizBank': {
      const expanded = expandKeys('quizBank', data);
      const key = expanded.quizzes ? 'quizzes' : 'quizBank';
      for (const quiz of expanded[key] || []) {
        children.push(makeHeading(quiz.lessonTitle || 'Quiz'));
        if (quiz.bloomsCoverage?.length) children.push(makeBold("Bloom's Coverage", quiz.bloomsCoverage.join(', ')));
        let prevObjectiveAligned = '';
        for (let j = 0; j < (quiz.questions || []).length; j++) {
          const q = quiz.questions[j];
          const qMeta = [
            q.type,
            q.bloomsLevel,
            q.difficulty,
            q.points && `${q.points} pts`,
            q.estimatedMinutes && `~${q.estimatedMinutes} min`,
          ].filter(Boolean);
          children.push(makeBold(`Q${j + 1}` + (qMeta.length ? ` (${qMeta.join(', ')})` : ''), q.question || ''));
          if (q.options) q.options.forEach((o) => children.push(makeBullet(o)));
          if (q.answer) children.push(makeBold('Answer', q.answer));
          if (q.explanation) children.push(makeBold('Explanation', q.explanation));
          // Single-objective lessons would otherwise repeat the same
          // "Aligns to" sentence under every question.
          if (q.objectiveAligned && q.objectiveAligned !== prevObjectiveAligned) {
            children.push(makeItalic(`Aligns to: ${q.objectiveAligned}`));
            prevObjectiveAligned = q.objectiveAligned;
          }
          if (q.sampleAnswer) children.push(makeBold('Sample Answer', q.sampleAnswer));
          if (q.rubricHints) children.push(makeBold('Rubric Hints', q.rubricHints));
          if (q.scoringGuidance) children.push(makeBold('Scoring Guidance', q.scoringGuidance));
          if (q.intendedUse) children.push(makeItalic(`Intended use: ${q.intendedUse}`));
          if (q.tags?.length) children.push(makeItalic(`Tags: ${q.tags.join(', ')}`));
          if (q.feedback) children.push(makeItalic(`Feedback: ${q.feedback}`));
        }
        children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }));
      }
      break;
    }

    // ─── DISCUSSIONS ────────────────────────────────────────────
    case 'discussions': {
      const expanded = expandKeys('discussions', data);
      for (const d of expanded.discussions || []) {
        children.push(makeHeading(d.lessonTitle || 'Discussion'));
        const dMeta = [d.bloomsLevel, d.format, d.estimatedDuration].filter(Boolean);
        if (dMeta.length) children.push(makeText(dMeta.join(' · ')));
        if (d.prompt) children.push(makeBold('Prompt', d.prompt));
        if (d.context) children.push(makeBold('Context', d.context));
        if (d.evidenceRequirement) children.push(makeBold('Evidence Requirement', d.evidenceRequirement));
        if (d.sourceArtifacts?.length) {
          children.push(makeSubHeading('Source Artifacts'));
          d.sourceArtifacts
            .map(formatSourceArtifact)
            .filter(Boolean)
            .forEach((artifact) => children.push(makeBullet(artifact)));
        }
        // Follow-up probes
        if (d.followUpProbes?.length) {
          children.push(makeSubHeading('Follow-Up Probes'));
          d.followUpProbes.forEach((p) => children.push(makeBullet(p)));
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
          d.responseStarters.forEach((s) => children.push(makeBullet(s)));
        }
        // Evaluation criteria
        if (d.evaluationCriteria?.length) {
          children.push(makeSubHeading('Evaluation Criteria'));
          d.evaluationCriteria.forEach((c) => children.push(makeBullet(c)));
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
      const expanded = expandKeys('assignments', data);
      for (const a of expanded.assignments || []) {
        children.push(makeHeading(a.title || 'Assignment'));
        const aMeta = [
          a.assignmentType,
          a.bloomsLevel,
          a.dueWeek || a.dueDate,
          a.estimatedTime,
          a.totalPoints && `${a.totalPoints} pts`,
          a.percentOfGrade,
        ].filter(Boolean);
        if (aMeta.length) children.push(makeText(aMeta.join(' · ')));
        if (a.relatedLessons?.length) children.push(makeBold('Related Lessons', a.relatedLessons.join(', ')));
        if (a.overview) children.push(makeBold('Overview', a.overview));
        if (a.description) children.push(makeBold('Description', a.description));
        if (a.objectives?.length) {
          children.push(makeSubHeading('Learning Objectives'));
          a.objectives.forEach((o) => children.push(makeBullet(o)));
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
          a.deliverables.forEach((d) => children.push(makeBullet(typeof d === 'string' ? d : d.name || '')));
        }
        if (a.submissionFormat) children.push(makeBold('Submission Format', a.submissionFormat));
        // gradingCriteria is an array of criterion names; rendering it as a
        // bold label with no value left an empty "Grading Criteria:" line.
        if (Array.isArray(a.gradingCriteria) && a.gradingCriteria.length > 0) {
          children.push(makeSubHeading('Grading Criteria'));
          a.gradingCriteria.forEach((criterion) =>
            children.push(makeBullet(typeof criterion === 'string' ? criterion : criterion?.criterion || '')),
          );
        } else if (a.gradingCriteria && typeof a.gradingCriteria === 'string') {
          children.push(makeBold('Grading Criteria', a.gradingCriteria));
        }
        if (a.progressTracking) children.push(makeBold('Progress Tracking', a.progressTracking));
        if (a.accessibilityAndUDL) children.push(makeBold('Accessibility & UDL', a.accessibilityAndUDL));
        if (a.selfAssessmentRubric?.length) {
          children.push(makeSubHeading('Student Self-Assessment'));
          a.selfAssessmentRubric.forEach((item) => children.push(makeBullet(item)));
        }
        if (a.feedbackLoop) children.push(makeBold('Feedback Loop', a.feedbackLoop));
        // Scaffolding milestones
        if (a.scaffoldingMilestones?.length) {
          children.push(makeSubHeading('Scaffolding Milestones'));
          a.scaffoldingMilestones.forEach((m) => {
            const parts = [m.milestone || m.name || '', m.dueDate ? `(${m.dueDate})` : ''].filter(Boolean);
            const details = [
              m.description || '',
              m.feedbackChannel ? `Feedback: ${m.feedbackChannel}` : '',
              m.points !== undefined && m.points !== null ? `Points: ${m.points}` : '',
            ]
              .filter(Boolean)
              .join(' ');
            children.push(makeBold(parts.join(' '), details));
            if (Array.isArray(m.uploadChecklist) && m.uploadChecklist.length > 0) {
              m.uploadChecklist.forEach((item) => children.push(makeBullet(item)));
            }
          });
        }
        // Support resources
        if (a.supportResources?.length) {
          children.push(makeSubHeading('Support Resources'));
          a.supportResources.forEach((r) => children.push(makeBullet(typeof r === 'string' ? r : r.name || '')));
        }
        if (a.academicIntegrityStatement) children.push(makeBold('Academic Integrity', a.academicIntegrityStatement));
        children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }));
      }
      break;
    }

    // ─── STUDY GUIDES ───────────────────────────────────────────
    case 'studyGuides': {
      const expanded = expandKeys('studyGuides', data);
      const key = expanded.guides ? 'guides' : 'studyGuides';
      for (const g of expanded[key] || []) {
        children.push(makeHeading(g.lessonTitle || 'Study Guide'));
        if (g.examScope) children.push(makeText(g.examScope));
        if (g.summary) {
          children.push(makeSubHeading('Concept Summary'));
          children.push(makeText(g.summary));
        }
        if (g.keyTerms?.length) {
          children.push(makeSubHeading('Key Terms'));
          g.keyTerms.forEach((t) => {
            const parts = [t.definition || ''];
            if (t.example) parts.push(`Example: ${t.example}`);
            // CurriculumOS: genome-linked terms carry a source citation —
            // render the receipt instructors trust ("Source: OpenStax …").
            if (t.source) parts.push(`Source: ${t.source}`);
            children.push(makeBold(t.term || '', parts.join(' — ')));
          });
        }
        // How to reason about this structure (metacognitive scaffold)
        if (g.reasoningRoutine?.length) {
          children.push(makeSubHeading('How to Reason About This'));
          g.reasoningRoutine.forEach((r) => children.push(makeBullet(r.howToReason || '')));
        }
        // Concept connections
        if (g.conceptConnections?.length) {
          children.push(makeSubHeading('Concept Connections'));
          g.conceptConnections.forEach((c) =>
            children.push(
              makeBullet(typeof c === 'string' ? c : `${c.from || ''} ↔ ${c.to || ''}: ${c.relationship || ''}`),
            ),
          );
        }
        // Common misconceptions
        if (g.commonMisconceptions?.length) {
          children.push(makeSubHeading('Common Misconceptions'));
          g.commonMisconceptions.forEach((m) => {
            if (typeof m === 'string') {
              children.push(makeBullet(m));
              return;
            }
            children.push(makeBold('Misconception', m.misconception || ''));
            if (m.correction) children.push(makeItalic(`Correction: ${m.correction}`));
          });
        }
        // Review questions
        if (g.reviewQuestions?.length) {
          children.push(makeSubHeading('Review Questions'));
          g.reviewQuestions.forEach((q, j) => {
            if (typeof q === 'string') {
              children.push(makeNumbered(j + 1, q));
              return;
            }
            const bloomLabel = q.bloomsLevel ? ` (Bloom: ${q.bloomsLevel})` : '';
            children.push(makeNumbered(j + 1, `${q.question || q}${bloomLabel}`));
            if (q.hint) children.push(makeItalic(`Hint: ${q.hint}`));
          });
        }
        // Practice activities
        if (g.practiceActivities?.length) {
          children.push(makeSubHeading('Practice Activities'));
          g.practiceActivities.forEach((a) => children.push(makeBullet(typeof a === 'string' ? a : a.activity || '')));
        }
        // Exam prep
        if (g.examPrep) {
          children.push(makeSubHeading('Exam Preparation'));
          if (Array.isArray(g.examPrep.keyTopicsToKnow) && g.examPrep.keyTopicsToKnow.length) {
            children.push(makeBold('Key Topics', ''));
            g.examPrep.keyTopicsToKnow.forEach((t) =>
              children.push(makeBullet(typeof t === 'string' ? t : JSON.stringify(t))),
            );
          }
          if (Array.isArray(g.examPrep.commonErrors) && g.examPrep.commonErrors.length) {
            children.push(makeBold('Common Errors', ''));
            g.examPrep.commonErrors.forEach((e) =>
              children.push(makeBullet(typeof e === 'string' ? e : JSON.stringify(e))),
            );
          } else if (typeof g.examPrep.commonErrors === 'string') {
            children.push(makeBold('Common Errors', g.examPrep.commonErrors));
          }
          if (g.examPrep.reviewStrategy)
            children.push(
              makeBold(
                'Review Strategy',
                typeof g.examPrep.reviewStrategy === 'string'
                  ? g.examPrep.reviewStrategy
                  : JSON.stringify(g.examPrep.reviewStrategy),
              ),
            );
          if (g.examPrep.timeManagement)
            children.push(
              makeBold(
                'Time Management',
                typeof g.examPrep.timeManagement === 'string'
                  ? g.examPrep.timeManagement
                  : JSON.stringify(g.examPrep.timeManagement),
              ),
            );
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
      const infoLines = [
        syl.semester && `Semester: ${syl.semester}`,
        syl.credits && `Credits: ${syl.credits}`,
        syl.meetingPattern && `Meeting: ${syl.meetingPattern}`,
        syl.location && `Location: ${syl.location}`,
        syl.deliveryMode && `Delivery: ${syl.deliveryMode}`,
        syl.prerequisites && `Prerequisites: ${syl.prerequisites}`,
      ].filter(Boolean);
      if (infoLines.length) infoLines.forEach((l) => children.push(makeText(l)));
      // Instructor info
      const instrLines = [
        syl.instructor && `Instructor: ${syl.instructor}`,
        syl.instructorEmail && `Email: ${syl.instructorEmail}`,
        syl.officeHours && `Office Hours: ${syl.officeHours}`,
        syl.officeLocation && `Office: ${syl.officeLocation}`,
      ].filter(Boolean);
      if (instrLines.length) {
        children.push(makeHeading('Instructor Information'));
        instrLines.forEach((l) => children.push(makeText(l)));
      }
      if (syl.instructorBio) {
        children.push(makeSubHeading('Instructor Bio'));
        children.push(makeText(syl.instructorBio));
      }
      if (syl.courseDescription) {
        children.push(makeHeading('Course Description'));
        children.push(makeText(syl.courseDescription));
      }
      if (syl.gettingStarted) {
        children.push(makeHeading('Getting Started'));
        children.push(makeText(syl.gettingStarted));
      }
      if (syl.learnerIntroActivity) {
        children.push(makeHeading('Learner Introduction Activity'));
        children.push(makeText(syl.learnerIntroActivity));
      }
      if (syl.learningOutcomes?.length) {
        children.push(makeHeading('Student Learning Outcomes'));
        children.push(makeText('Upon successful completion of this course, students will be able to:'));
        syl.learningOutcomes.forEach((o, i) => children.push(makeBullet(`${i + 1}. ${o}`)));
      }
      if (syl.outcomeAlignmentMatrix?.length) {
        children.push(makeHeading('Outcome & Assessment Alignment'));
        children.push(
          makeTableFn(
            [3900, 1100, 2180, 2180],
            ['Outcome', "Bloom's", 'Practiced In', 'Assessed By'],
            syl.outcomeAlignmentMatrix.map((row) => [
              row.outcome || '',
              row.bloomsLevel || '',
              Array.isArray(row.practicedIn) ? row.practicedIn.join('; ') : row.practicedIn || '',
              Array.isArray(row.assessedBy) ? row.assessedBy.join('; ') : row.assessedBy || '',
            ]),
          ),
        );
      }
      if (syl.requiredTexts?.length) {
        children.push(makeHeading('Required Texts & Materials'));
        syl.requiredTexts.forEach((t) => children.push(makeBullet(formatRequiredText(t))));
      }
      // Course Requirements
      const reqs = normalizeCourseRequirements(syl.courseRequirements, syl.gradingPolicy);
      if (reqs.length) {
        children.push(makeHeading('Course Requirements & Grading'));
        const hasDesc = reqs.some((r) => r.description);
        if (hasDesc) {
          children.push(
            makeTableFn(
              [2810, 1120, 5430],
              ['Component', 'Weight', 'Description'],
              reqs.map((g) => [g.name || g.component || '', g.weight || '', g.description || '']),
            ),
          );
        } else {
          children.push(
            makeTableFn(
              [7020, 2340],
              ['Component', 'Weight'],
              reqs.map((g) => [g.name || g.component || '', g.weight || '']),
            ),
          );
        }
      }
      if (syl.gradingScale?.length) {
        children.push(makeHeading('Grading Scale'));
        // Two grade/range pairs per row keeps the table compact.
        const scalePairs = [];
        for (let gi = 0; gi < syl.gradingScale.length; gi += 2) {
          const left = syl.gradingScale[gi];
          const right = syl.gradingScale[gi + 1];
          scalePairs.push([left?.grade || '', left?.range || '', right?.grade || '', right?.range || '']);
        }
        children.push(makeTableFn([1170, 3510, 1170, 3510], ['Grade', 'Range', 'Grade', 'Range'], scalePairs));
      }
      // Course Schedule
      if (syl.weeklySchedule?.length) {
        children.push(makeHeading('Course Schedule'));
        const hasDates = syl.weeklySchedule.some((w) => w.dates);
        const headers = hasDates
          ? ['Week', 'Dates', 'Topic', 'Readings', 'Assignments']
          : ['Week', 'Topic', 'Readings', 'Assignments'];
        const wsDXA = hasDates ? [780, 1200, 2500, 2440, 2440] : [936, 2995, 2810, 2619];
        children.push(
          makeTableFn(
            wsDXA,
            headers,
            syl.weeklySchedule.map((w) =>
              hasDates
                ? [w.week || '', w.dates || '', w.topic || '', w.readings || '', w.assignments || '']
                : [w.week || '', w.topic || '', w.readings || '', w.assignments || ''],
            ),
          ),
        );
      }
      // Policies
      const policySection = (heading, text) => {
        if (text) {
          children.push(makeHeading(heading));
          children.push(makeText(text));
        }
      };
      policySection('Attendance & Participation', syl.attendancePolicy);
      policySection('Late Work Policy', syl.latePolicy);
      policySection('Communication Policy', syl.communicationPolicy);
      policySection('Technology & Device Policy', syl.technologyPolicy);
      policySection('Technical Skills', syl.technicalSkills);
      policySection('Generative AI Policy', syl.aiPolicy);
      policySection('Academic Integrity', syl.academicIntegrity);
      policySection('Technical Support', syl.technicalSupport);
      policySection('Disability & Accessibility Accommodations', syl.accommodations);
      policySection('Mental Health & Wellness Resources', syl.mentalHealth);
      policySection('Title IX / Non-Discrimination', syl.titleIX);
      policySection('Student Support Services', syl.supportServices);
      policySection('Data Privacy', syl.dataPrivacy);
      if (syl.importantDates?.length) {
        children.push(makeHeading('Important Dates'));
        children.push(
          makeTableFn(
            [1872, 7488],
            ['When', 'Milestone'],
            syl.importantDates.map((d) => [d.date || '', d.event || '']),
          ),
        );
      }
      const maintenance = [syl.suggestedReviewDate, syl.contentOwnerGroup].filter(Boolean);
      if (maintenance.length) {
        children.push(makeHeading('Maintenance Notes'));
        if (syl.suggestedReviewDate) children.push(makeBold('Suggested Review Date', syl.suggestedReviewDate));
        if (syl.contentOwnerGroup) children.push(makeBold('Content Owner Group', syl.contentOwnerGroup));
      }
      break;
    }

    // ─── COURSE FAQ ───────────────────────────────────────────────
    case 'courseFaq': {
      const expanded = expandKeys('courseFaq', data);
      const faqs = expanded.faqs || expanded.courseFaq || [];
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
          if (q.studentAction) children.push(makeBold('Student Action', q.studentAction));
          if (q.assessmentConnection) children.push(makeItalic(`Assessment connection: ${q.assessmentConnection}`));
          if (q.accessibilitySupport) children.push(makeItalic(`Support: ${q.accessibilitySupport}`));
          if (q.concreteExample) children.push(makeItalic(`Example: ${q.concreteExample}`));
          if (q.instructorNote) children.push(makeItalic(`Instructor note: ${q.instructorNote}`));
          // Related concepts as "See also:" for student-facing professionalism
          if (Array.isArray(q.relatedConcepts) && q.relatedConcepts.length > 0) {
            children.push(makeItalic(`See also: ${q.relatedConcepts.join(', ')}`));
          }
        }
        // Tags are internal metadata — omit from student-facing export
      }
      break;
    }

    // ─── CUSTOM DELIVERABLES (generic) ───────────────────────────
    default: {
      const arrKey = Object.keys(data).find((k) => Array.isArray(data[k]) && data[k].length > 0);
      const items = arrKey ? data[arrKey] : [data];
      const headerKeys = new Set(['lessonTitle', 'title', 'name', 'weekNumber', 'week', 'tiers']);
      const toLabel = (k) => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (s) => s.toUpperCase());

      for (const item of items) {
        const title = item.lessonTitle || item.title || item.name || 'Item';
        const subtitle = item.weekNumber || item.week || '';
        children.push(makeHeading(subtitle ? `${title} — ${subtitle}` : title));

        for (const [k, v] of Object.entries(item)) {
          if (headerKeys.has(k) || isInternalExportMetadataKey(k) || v == null || v === '') continue;
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
            v.forEach((el) => {
              if (typeof el === 'string') {
                children.push(makeBullet(el));
              } else if (typeof el === 'object' && el !== null) {
                const parts = Object.entries(el)
                  .filter(([ek, val]) => !isInternalExportMetadataKey(ek) && val != null && val !== '')
                  .map(([ek, ev]) => `${toLabel(ek)}: ${typeof ev === 'string' ? ev : JSON.stringify(ev)}`);
                children.push(makeBullet(parts.join(' · ')));
              }
            });
          } else if (typeof v === 'object') {
            children.push(makeSubHeading(label));
            for (const [sk, sv] of Object.entries(v)) {
              if (isInternalExportMetadataKey(sk)) continue;
              if (sv != null && sv !== '')
                children.push(makeBold(toLabel(sk), typeof sv === 'string' ? sv : JSON.stringify(sv)));
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
  const docx = await getDocx();
  const { Packer, BorderStyle } = docx;
  const saveAs = await getSaveAs();

  const label = resolveFeatureLabel(featureId);
  const THIN_BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'D0D0D0' };
  const children = buildDocxTitleChildren(docx, courseName, label);

  // Build content using shared helper
  _buildDocxContentShared(featureId, data, children, { ...docx, THIN_BORDER });

  const doc = buildDocxDocument(docx, children, { courseName, label });

  const blob = await Packer.toBlob(doc);
  await assertOfficeExportHasNoInternalText(blob, 'docx', label);
  const fileName = `${courseName || 'Course'} - ${label}.docx`;
  saveAs(blob, fileName);
  return fileName;
}

// ════════════════════════════════════════════════════════════════
