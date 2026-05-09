import React, { useMemo, useState } from 'react';
import { useCourse } from '../contexts/CourseContext';
import { safeImport } from '../lib/safeImport';
import {
  buildReadinessReport,
  evaluateWorkspaceReadiness,
  scopeCourseMapToLessons,
  scopeDeliverableDataToLessons,
  summarizeReadiness,
} from '../lib/deliverableReadiness';
import {
  exportDeliverableCsv,
  exportDeliverablePdf,
  exportDeliverableDocx,
  exportDeliverableToGoogleDocs,
  exportDeliverableToGoogleSheets,
  FEATURE_LABELS,
} from '../lib/deliverableExporters';
import { openTabNow, saveToGoogleSlides } from '../lib/googleDrive';
import { exportSlideDeckPptx, buildSlideDeckPptxBlob } from '../lib/exporters/pptxExporter';
import { expandKeys } from '../lib/keyMaps';
import { loadPdfRuntime } from '../lib/pdfRuntime';

// ── Which formats each deliverable supports ─────────────────────────────────
// courseMap handled separately via useExport (xlsx, csv, pdf, docx, gsheets, gdocs)
const FORMAT_SUPPORT = {
  courseMap: { xlsx: true, csv: true, pdf: true, docx: true, gdocs: true, gsheets: true, pptx: false, slidepdf: false },
  syllabus: {
    xlsx: false,
    csv: false,
    pdf: true,
    docx: true,
    gdocs: true,
    gsheets: false,
    pptx: false,
    slidepdf: false,
  },
  lessonPlans: {
    xlsx: false,
    csv: true,
    pdf: true,
    docx: true,
    gdocs: true,
    gsheets: true,
    pptx: false,
    slidepdf: false,
  },
  slideDecks: {
    xlsx: false,
    csv: false,
    pdf: false,
    docx: false,
    gdocs: false,
    gsheets: false,
    pptx: true,
    slidepdf: true,
    gslides: true,
  },
  assignments: {
    xlsx: false,
    csv: true,
    pdf: true,
    docx: true,
    gdocs: true,
    gsheets: true,
    pptx: false,
    slidepdf: false,
  },
  rubrics: { xlsx: false, csv: true, pdf: true, docx: true, gdocs: true, gsheets: true, pptx: false, slidepdf: false },
  discussions: {
    xlsx: false,
    csv: true,
    pdf: true,
    docx: true,
    gdocs: true,
    gsheets: true,
    pptx: false,
    slidepdf: false,
  },
  quizBank: { xlsx: false, csv: true, pdf: true, docx: true, gdocs: true, gsheets: true, pptx: false, slidepdf: false },
  studyGuides: {
    xlsx: false,
    csv: true,
    pdf: true,
    docx: true,
    gdocs: true,
    gsheets: true,
    pptx: false,
    slidepdf: false,
  },
  courseFaq: {
    xlsx: false,
    csv: true,
    pdf: true,
    docx: true,
    gdocs: true,
    gsheets: true,
    pptx: false,
    slidepdf: false,
  },
};

// Formats for non-slideDecks current tab
const DOWNLOAD_FORMATS = [
  { id: 'xlsx', label: '.xlsx', color: 'emerald' },
  { id: 'docx', label: '.docx', color: 'blue' },
  { id: 'pdf', label: '.pdf', color: 'red' },
  { id: 'csv', label: '.csv', color: 'slate' },
];
const CLOUD_FORMATS = [
  { id: 'gdocs', label: 'Google Docs', color: 'gdocs' },
  { id: 'gsheets', label: 'Google Sheets', color: 'gsheets' },
];

// ── Slide Deck PDF export (text-based, using jsPDF) ───────────────────────────
async function exportSlideDeckPdf(data, courseName) {
  const { jsPDF, autoTable } = await loadPdfRuntime();
  const { saveAs } = await safeImport(() => import('file-saver'));

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = 297;
  const pageH = 210;
  const margin = 12;
  const contentW = pageW - margin * 2;

  const expanded = expandKeys('slideDecks', data);
  const decks = expanded.slideDecks || expanded.decks || [];

  decks.forEach((deck, deckIdx) => {
    const slides = deck.slides || [];
    slides.forEach((slide, slideIdx) => {
      if (deckIdx > 0 || slideIdx > 0) doc.addPage();

      // Header band
      doc.setFillColor(30, 58, 138); // indigo-900
      doc.rect(0, 0, pageW, 18, 'F');

      // Lesson label
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(147, 197, 253); // blue-300
      const lessonLabel = deck.lessonTitle || deck.title || `Lesson ${deckIdx + 1}`;
      doc.text(lessonLabel, margin, 7);

      // Slide title
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      const titleText = slide.title || '';
      const titleLines = doc.splitTextToSize(titleText, contentW - 40);
      doc.text(titleLines, margin, 14);

      // Slide number badge
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(147, 197, 253);
      doc.text(`${slideIdx + 1} / ${slides.length}`, pageW - margin, 14, { align: 'right' });

      let y = 26;

      // Bullets / content
      const bullets = slide.bullets || slide.content || [];
      if (bullets.length > 0) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 30, 30);
        bullets.forEach((bullet) => {
          const lines = doc.splitTextToSize(`• ${bullet}`, contentW);
          if (y + lines.length * 5 > pageH - 28) return; // skip if overflow
          doc.text(lines, margin, y);
          y += lines.length * 5 + 1;
        });
      }

      // Speaker notes
      const speakerNotes = slide.speakerNotes || slide.notes;
      if (speakerNotes) {
        const notesY = pageH - 24;
        doc.setFillColor(248, 250, 252);
        doc.rect(0, notesY - 4, pageW, pageH - notesY + 4, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.line(0, notesY - 4, pageW, notesY - 4);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 116, 139);
        doc.text('Speaker Notes:', margin, notesY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        const noteLines = doc.splitTextToSize(speakerNotes, contentW);
        doc.text(noteLines.slice(0, 2), margin, notesY + 5);
      }
    });
  });

  const blob = doc.output('blob');
  saveAs(blob, `${courseName || 'Course'} - Slide Decks.pdf`);
}

// ── Spinner ──────────────────────────────────────────────────────────────────
function Spin() {
  return (
    <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Format button ─────────────────────────────────────────────────────────────
// All download format buttons use the same neutral ghost style for consistency.
// Cloud (Google) buttons retain their brand colors via GDriveBtn.
function FmtBtn({ fmt, label, disabled, busy, onClick }) {
  const colorMap = {
    emerald: 'text-slate-600 bg-white/60 border border-slate-200/50 hover:bg-white/80',
    blue: 'text-slate-600 bg-white/60 border border-slate-200/50 hover:bg-white/80',
    red: 'text-slate-600 bg-white/60 border border-slate-200/50 hover:bg-white/80',
    slate: 'text-slate-600 bg-white/60 border border-slate-200/50 hover:bg-white/80',
    gdocs: 'text-[#1967D2] bg-[#E8F0FE]/80 border border-[#4285F4]/20 hover:bg-[#D2E3FC]',
    gsheets: 'text-[#188038] bg-[#E6F4EA]/80 border border-[#34A853]/20 hover:bg-[#CEEAD6]',
    pptx: 'text-slate-600 bg-white/60 border border-slate-200/50 hover:bg-white/80',
    gslides: 'text-[#F4B400] bg-[#FFF8E1]/80 border border-[#FBBC04]/30 hover:bg-[#FFF0B3]',
    slidepdf: 'text-slate-600 bg-white/60 border border-slate-200/50 hover:bg-white/80',
  };
  const displayLabel = label || fmt.label;
  return (
    <button
      data-testid={`export-format-${fmt.id}`}
      onClick={onClick}
      disabled={disabled || busy}
      className={`tactile flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all duration-200 w-full
        ${disabled ? 'opacity-30 cursor-not-allowed bg-slate-100 text-slate-400 border border-slate-200/40' : colorMap[fmt.color]}
        ${busy ? 'opacity-70' : ''}`}
      title={disabled ? 'Not available for this deliverable' : ''}
    >
      {busy ? <Spin /> : null}
      {displayLabel}
    </button>
  );
}

// ── Google Drive icon buttons ─────────────────────────────────────────────────
function GDriveBtn({ fmt, label, disabled, busy, onClick }) {
  const isSheets = fmt.id === 'gsheets';
  const isSlides = fmt.id === 'gslides';
  const displayLabel = label || fmt.label;
  const btnClass = isSlides
    ? 'text-[#F4B400] bg-[#FFF8E1]/80 border border-[#FBBC04]/30 hover:bg-[#FFF0B3]'
    : isSheets
      ? 'text-[#188038] bg-[#E6F4EA]/80 border border-[#34A853]/20 hover:bg-[#CEEAD6]'
      : 'text-[#1967D2] bg-[#E8F0FE]/80 border border-[#4285F4]/20 hover:bg-[#D2E3FC]';
  return (
    <button
      data-testid={`export-format-${fmt.id}`}
      onClick={onClick}
      disabled={disabled || busy}
      className={`tactile flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all duration-200 w-full
        ${disabled ? 'opacity-30 cursor-not-allowed bg-slate-100 text-slate-400 border border-slate-200/40' : btnClass}`}
      title={disabled ? 'Not available for this deliverable' : ''}
    >
      {busy ? (
        <Spin />
      ) : isSlides ? (
        // Google Slides icon (presentation)
        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="4" width="18" height="14" rx="2" fill="#FBBC04" fillOpacity="0.25" />
          <rect x="3" y="4" width="18" height="14" rx="2" stroke="#F4B400" strokeWidth="1.2" />
          <path d="M8 8l5 4-5 4V8z" fill="#F4B400" />
        </svg>
      ) : isSheets ? (
        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
          <rect x="4" y="3" width="16" height="18" rx="2" fill="#34A853" fillOpacity="0.15" />
          <path d="M4 9h16M4 13h16M4 17h16M10 9v12M15 9v12" stroke="#34A853" strokeWidth="1" strokeLinecap="round" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
          <path d="M6 3a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6H6z" fill="#4285F4" fillOpacity="0.15" />
          <path d="M14 3l6 6h-4a2 2 0 01-2-2V3z" fill="#4285F4" fillOpacity="0.3" />
          <path d="M7 12h10M7 15h7" stroke="#4285F4" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      )}
      {displayLabel}
    </button>
  );
}

function ReadinessPanel({ readiness }) {
  if (!readiness || readiness.featureCount === 0) return null;

  const isBlocked = readiness.blockers.length > 0;
  const hasWarnings = readiness.warnings.length > 0;
  const issuesToShow = isBlocked ? readiness.blockers.slice(0, 3) : readiness.warnings.slice(0, 3);
  const tone = isBlocked
    ? {
        wrap: 'border-red-100 bg-red-50/70 text-red-700',
        icon: 'bg-red-100 text-red-600',
        title: 'Review before export',
        meta: `${readiness.blockers.length} critical issue${readiness.blockers.length === 1 ? '' : 's'}`,
      }
    : hasWarnings
      ? {
          wrap: 'border-amber-100 bg-amber-50/70 text-amber-700',
          icon: 'bg-amber-100 text-amber-600',
          title: 'Ready with warnings',
          meta: `${readiness.warnings.length} warning${readiness.warnings.length === 1 ? '' : 's'}`,
        }
      : {
          wrap: 'border-emerald-100 bg-emerald-50/70 text-emerald-700',
          icon: 'bg-emerald-100 text-emerald-600',
          title: 'Ready to export',
          meta: `${readiness.doneFeatureCount}/${readiness.featureCount} sections checked`,
        };

  return (
    <div data-testid="readiness-panel" className={`rounded-xl border px-3 py-2.5 ${tone.wrap}`}>
      <div className="flex items-start gap-2">
        <span
          className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[11px] ${tone.icon}`}
        >
          {isBlocked ? '!' : hasWarnings ? '•' : '✓'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <p data-testid="readiness-status" className="text-[11px] font-bold">
              {tone.title}
            </p>
            <span className="text-[9px] font-semibold opacity-70">{tone.meta}</span>
          </div>
          <p className="mt-0.5 text-[10px] leading-snug opacity-80">{summarizeReadiness(readiness)}</p>
          {issuesToShow.length > 0 && (
            <ul className="mt-1.5 space-y-1">
              {issuesToShow.map((issue, index) => (
                <li
                  key={`${issue.featureId}-${issue.message}-${index}`}
                  data-testid="readiness-issue"
                  className="text-[10px] leading-snug"
                >
                  <span className="font-semibold">{issue.label}:</span> {issue.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ReadinessConfirm({ pendingExport, onCancel, onConfirm }) {
  if (!pendingExport?.readiness) return null;
  const { readiness } = pendingExport;
  const isBlocked = readiness.blockers.length > 0;
  const isZipExport = pendingExport.format === 'zip';
  const issues = (isBlocked ? readiness.blockers : readiness.issues).slice(0, 5);
  const tone = isBlocked
    ? {
        wrap: 'border-red-200 bg-red-50/80 text-red-800',
        reviewButton: 'border-red-200 text-red-700',
        confirmButton: 'bg-red-500',
        title: 'Resolve critical issues before export',
        description: isZipExport
          ? 'ZIP export is blocked until the critical readiness issues below are fixed.'
          : 'This export is blocked until the critical readiness issues below are fixed.',
      }
    : {
        wrap: 'border-amber-200 bg-amber-50/80 text-amber-800',
        reviewButton: 'border-amber-200 text-amber-700',
        confirmButton: 'bg-amber-500',
        title: 'Readiness warnings found',
        description: isZipExport
          ? 'You can review the materials first, or export this draft anyway. The ZIP will include a readiness report.'
          : 'You can review the materials first, or export this draft anyway. This format will not include a readiness report.',
      };

  return (
    <div data-testid="readiness-confirm" className={`rounded-xl border px-3 py-3 ${tone.wrap}`}>
      <p className="text-[11px] font-bold">{tone.title}</p>
      <p className="mt-1 text-[10px] leading-snug">{tone.description}</p>
      <ul className="mt-2 space-y-1">
        {issues.map((issue, index) => (
          <li key={`${issue.featureId}-${issue.message}-${index}`} className="text-[10px] leading-snug">
            <span className="font-semibold">{issue.label}:</span> {issue.message}
          </li>
        ))}
      </ul>
      {readiness.issues.length > issues.length && (
        <p className="mt-1 text-[10px] font-semibold opacity-70">
          +{readiness.issues.length - issues.length} more issue
          {readiness.issues.length - issues.length === 1 ? '' : 's'}
        </p>
      )}
      <div className={`mt-2 grid gap-1.5 ${isBlocked ? 'grid-cols-1' : 'grid-cols-2'}`}>
        <button
          type="button"
          data-testid="readiness-review-materials"
          onClick={onCancel}
          className={`rounded-lg border bg-white/70 px-2 py-1.5 text-[10px] font-bold hover:bg-white ${tone.reviewButton}`}
        >
          Review materials
        </button>
        {!isBlocked && (
          <button
            type="button"
            data-testid="readiness-export-anyway"
            onClick={onConfirm}
            className={`rounded-lg px-2 py-1.5 text-[10px] font-bold text-white shadow-sm hover:brightness-105 ${tone.confirmButton}`}
          >
            Export anyway
          </button>
        )}
      </div>
    </div>
  );
}

// ── ZIP export (all deliverables) ─────────────────────────────────────────────
async function exportAllAsZip(deliverables, courseMap, columns, courseName, lessonFilter, slideTheme, readiness) {
  let JSZip;
  try {
    JSZip = (await safeImport(() => import('jszip'))).default;
  } catch {
    throw new Error('ZIP library unavailable — please export individually');
  }

  const { buildDeliverableDocxBlob } = await safeImport(() => import('../lib/deliverableExporters'));
  const { buildXlsxBuffer } = await safeImport(() => import('../lib/xlsxGenerator'));
  const { saveAs } = await safeImport(() => import('file-saver'));

  const zip = new JSZip();
  const name = courseName || 'Course';

  if (readiness?.issues?.length > 0) {
    zip.file('READINESS_REPORT.txt', buildReadinessReport(readiness, { courseName: name }));
  }

  // Apply lesson filter to courseMap if needed
  const filteredCourseMap = scopeCourseMapToLessons(courseMap, lessonFilter);

  // ── Course Map folder ──
  const cmFolder = zip.folder('Course Map');
  try {
    const buf = await buildXlsxBuffer(filteredCourseMap, columns);
    cmFolder.file(`${name} - Course Map.xlsx`, buf);
  } catch (e) {
    console.warn('CM xlsx failed', e);
  }

  // ── Each deliverable in its own folder ──
  for (const [featureId, entry] of Object.entries(deliverables)) {
    if (!entry?.data || entry.status !== 'done' || featureId === 'courseMap') continue;
    const label = FEATURE_LABELS[featureId] || featureId;
    const folder = zip.folder(label);
    const support = FORMAT_SUPPORT[featureId] || {};

    // Filter deliverable data by lesson indices if needed
    const filteredData = scopeDeliverableDataToLessons(featureId, entry.data, lessonFilter);

    // Slide Decks → PPTX
    if (featureId === 'slideDecks' && support.pptx) {
      try {
        const blob = await buildSlideDeckPptxBlob(filteredData, name, slideTheme);
        folder.file(`${name} - ${label}.pptx`, blob);
      } catch (e) {
        console.warn(`${featureId} pptx blob failed`, e);
      }
    } else {
      // DOCX for other deliverables
      if (support.docx) {
        try {
          const blob = await buildDeliverableDocxBlob(featureId, filteredData, name);
          folder.file(`${name} - ${label}.docx`, blob);
        } catch (e) {
          console.warn(`${featureId} docx blob failed`, e);
        }
      }
      // CSV (skipped in ZIP — export individually if needed)
    }
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  saveAs(blob, `${name} - Course Materials.zip`);
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ExportSidePanel({
  activeTab,
  activeTabLabel,
  deliverables,
  onCourseMapExport, // handleDownload from useExport
  onSaveProject, // save full session as .coursemapper
}) {
  const { courseMap, columns, selectedFeatures, slideTheme } = useCourse();
  const [scope, setScope] = useState('current'); // 'current' | 'all'
  const [busy, setBusy] = useState(null); // format string or 'zip'
  const [lastError, setLastError] = useState('');
  const [lastOk, setLastOk] = useState('');
  const [pendingReadinessExport, setPendingReadinessExport] = useState(null);

  // All-tab lesson filter (null = all lessons)
  const allLessons = courseMap?.lessons || [];
  const [selectedLessons, setSelectedLessons] = useState(null); // null = all

  const courseName = courseMap?.courseName || 'Course';

  // ── Determine what we're exporting ──────────────────────────────────────────
  const isCurrentCourseMap = scope === 'current' && activeTab === 'courseMap';
  const isCurrentSlideDecks = scope === 'current' && activeTab === 'slideDecks';
  const isCurrentDeliverable = scope === 'current' && activeTab !== 'courseMap';
  const currentDeliverable = deliverables?.[activeTab];
  const currentHasData = isCurrentDeliverable && currentDeliverable?.status === 'done' && currentDeliverable?.data;

  // Format support for current tab (custom deliverables get csv/pdf/docx/gdocs)
  const CUSTOM_FORMAT_SUPPORT = {
    xlsx: false,
    csv: true,
    pdf: true,
    docx: true,
    gdocs: true,
    gsheets: true,
    pptx: false,
    slidepdf: false,
  };
  const currentSupport = FORMAT_SUPPORT[activeTab] || (activeTab?.startsWith('custom_') ? CUSTOM_FORMAT_SUPPORT : {});

  // Count ready deliverables for "All" mode
  const allReadyCount =
    Object.entries(deliverables || {}).filter(([id, e]) => id !== 'courseMap' && e?.status === 'done').length +
    (courseMap ? 1 : 0);

  // Effective lesson filter for ZIP
  const effectiveLessonFilter = selectedLessons; // null means no filter (all)
  const workspaceReadiness = useMemo(
    () =>
      evaluateWorkspaceReadiness({
        courseMap,
        deliverables,
        selectedFeatures,
        columns,
        lessonFilter: effectiveLessonFilter,
      }),
    [columns, courseMap, deliverables, effectiveLessonFilter, selectedFeatures],
  );
  const currentReadiness = useMemo(
    () =>
      evaluateWorkspaceReadiness({
        courseMap,
        deliverables,
        selectedFeatures: [activeTab],
        columns,
        lessonFilter: null,
      }),
    [activeTab, columns, courseMap, deliverables],
  );
  const activeReadiness = scope === 'all' ? workspaceReadiness : currentReadiness;

  function requestReadinessConfirmation(format) {
    const readiness = scope === 'all' ? workspaceReadiness : currentReadiness;
    if (readiness.blockers.length > 0 || readiness.warnings.length > 0) {
      setPendingReadinessExport({ format, readiness, scope });
      setLastError('');
      setLastOk('');
      return true;
    }
    return false;
  }

  async function doExport(format, { skipReadinessConfirmation = false } = {}) {
    if (!skipReadinessConfirmation && requestReadinessConfirmation(format)) return;
    setPendingReadinessExport(null);
    // For Google exports we must open a tab BEFORE any await (popup blocker)
    // Course map exports open their own tab internally via useExport → saveToGoogleDocs/Sheets
    const needsTab = (format === 'gdocs' || format === 'gsheets' || format === 'gslides') && activeTab !== 'courseMap';
    const preTab = needsTab ? openTabNow() : null;

    setBusy(format);
    setLastError('');
    setLastOk('');
    try {
      if (scope === 'all') {
        // All mode: only ZIP is available
        if (format === 'zip') {
          await exportAllAsZip(
            deliverables || {},
            courseMap,
            columns,
            courseName,
            effectiveLessonFilter,
            slideTheme,
            workspaceReadiness,
          );
          setLastOk('ZIP downloaded!');
        }
      } else {
        // Current tab
        if (activeTab === 'courseMap') {
          await onCourseMapExport(format);
        } else if (activeTab === 'slideDecks') {
          // Slide decks: pptx, pdf, or google slides
          if (!currentDeliverable?.data) throw new Error('No slide data yet');
          if (format === 'pptx') {
            await exportSlideDeckPptx(currentDeliverable.data, courseName, slideTheme);
          } else if (format === 'slidepdf') {
            await exportSlideDeckPdf(currentDeliverable.data, courseName);
          } else if (format === 'gslides') {
            const blob = await buildSlideDeckPptxBlob(currentDeliverable.data, courseName, slideTheme);
            const stamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            await saveToGoogleSlides(blob, `${courseName} - Slide Decks (${stamp})`, courseName, preTab);
          }
        } else {
          if (!currentDeliverable?.data) throw new Error('No data yet');
          if (format === 'csv') await exportDeliverableCsv(activeTab, currentDeliverable.data, courseName);
          if (format === 'pdf') await exportDeliverablePdf(activeTab, currentDeliverable.data, courseName);
          if (format === 'docx') await exportDeliverableDocx(activeTab, currentDeliverable.data, courseName);
          if (format === 'gdocs')
            await exportDeliverableToGoogleDocs(activeTab, currentDeliverable.data, courseName, preTab);
          if (format === 'gsheets')
            await exportDeliverableToGoogleSheets(activeTab, currentDeliverable.data, courseName, preTab);
        }
        setLastOk('Done!');
      }
    } catch (err) {
      if (preTab && !preTab.closed) preTab.close();
      setLastError(err.message || 'Export failed');
    } finally {
      setBusy(null);
      setTimeout(() => {
        setLastOk('');
        setLastError('');
      }, 4000);
    }
  }

  // What's disabled in "current" mode
  function isDisabled(formatId) {
    if (activeTab === 'courseMap') return !FORMAT_SUPPORT.courseMap[formatId] || !courseMap;
    if (activeTab === 'slideDecks') {
      if (formatId === 'pptx' || formatId === 'slidepdf' || formatId === 'gslides') return !currentHasData;
      return true; // other formats not supported for slide decks
    }
    if (!currentHasData) return true;
    return !currentSupport[formatId];
  }

  const tabLabel =
    activeTabLabel || (activeTab === 'courseMap' ? 'Course Map' : FEATURE_LABELS[activeTab] || activeTab);

  // Toggle a lesson in/out of selectedLessons
  function toggleLesson(idx) {
    setPendingReadinessExport(null);
    setSelectedLessons((prev) => {
      if (prev === null) {
        // Currently all selected — deselect just this one
        return allLessons.map((_, i) => i).filter((i) => i !== idx);
      }
      if (prev.includes(idx)) {
        // Deselect — allow empty array (all unchecked)
        const next = prev.filter((i) => i !== idx);
        return next.length === allLessons.length ? null : next;
      } else {
        // Select — if now all selected, normalize to null
        const next = [...prev, idx].sort((a, b) => a - b);
        return next.length === allLessons.length ? null : next;
      }
    });
  }

  const allSelected = selectedLessons === null;
  const selectedCount = selectedLessons === null ? allLessons.length : selectedLessons.length;

  return (
    <div
      data-testid="export-side-panel"
      className="export-side-panel flex flex-col gap-4 w-full lg:w-56 lg:flex-shrink-0"
    >
      {/* ── Panel card ── */}
      <div className="glass rounded-squircle-sm shadow-glass p-4 space-y-4 animate-spring-in">
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-sm">
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <span className="text-xs font-bold text-slate-700">Export</span>
        </div>

        {/* ── Scope toggle ── */}
        <div className="flex items-center bg-slate-100/80 rounded-lg p-0.5 gap-0.5">
          {[
            { id: 'current', label: 'Current' },
            { id: 'all', label: 'All' },
          ].map((s) => (
            <button
              key={s.id}
              data-testid={`export-scope-${s.id}`}
              onClick={() => {
                setScope(s.id);
                setPendingReadinessExport(null);
              }}
              className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-all duration-200 ${
                scope === s.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Scope description */}
        <p className="text-[10px] text-slate-400 leading-snug -mt-1">
          {scope === 'current' ? (
            <>
              <span className="font-semibold text-indigo-500">{tabLabel}</span> only
            </>
          ) : (
            <>
              <span className="font-semibold text-indigo-500">
                {allReadyCount} deliverable{allReadyCount !== 1 ? 's' : ''}
              </span>{' '}
              ready
            </>
          )}
        </p>

        <ReadinessPanel readiness={activeReadiness} />

        <ReadinessConfirm
          pendingExport={pendingReadinessExport}
          onCancel={() => setPendingReadinessExport(null)}
          onConfirm={() =>
            pendingReadinessExport && doExport(pendingReadinessExport.format, { skipReadinessConfirmation: true })
          }
        />

        {/* ────────────────────────────────────────────────────────────── */}
        {/* ALL MODE: Lesson scope + ZIP download + Save Project file     */}
        {/* ────────────────────────────────────────────────────────────── */}
        {scope === 'all' && (
          <div className="space-y-3">
            {/* Lesson scope selector */}
            {allLessons.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Lesson scope</p>
                  <button
                    onClick={() => setSelectedLessons(allSelected ? [] : null)}
                    className="text-[9px] font-semibold text-indigo-500 hover:text-indigo-700 transition-colors"
                  >
                    {allSelected ? 'Uncheck all' : 'Select all'}
                  </button>
                </div>
                <div className="space-y-0.5 max-h-36 overflow-y-auto pr-0.5">
                  {allLessons.map((lesson, idx) => {
                    const isOn = allSelected || selectedLessons?.includes(idx);
                    const title = lesson.title || lesson.lessonTitle || `Lesson ${idx + 1}`;
                    return (
                      <button
                        key={idx}
                        onClick={() => toggleLesson(idx)}
                        className={`w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] text-left transition-colors ${
                          isOn ? 'bg-indigo-50 text-indigo-700' : 'text-slate-400 hover:bg-slate-50'
                        }`}
                      >
                        <span
                          className={`w-3.5 h-3.5 rounded flex-shrink-0 border flex items-center justify-center ${
                            isOn ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300'
                          }`}
                        >
                          {isOn && (
                            <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                        <span className="truncate">{title}</span>
                      </button>
                    );
                  })}
                </div>
                {!allSelected && (
                  <p className="text-[9px] text-slate-400 mt-1">
                    {selectedCount} of {allLessons.length} lessons selected
                  </p>
                )}
              </div>
            )}

            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Download</p>
              <button
                data-testid="export-download-zip"
                onClick={() => doExport('zip')}
                disabled={
                  !!busy ||
                  allReadyCount === 0 ||
                  !courseMap ||
                  (selectedLessons !== null && selectedLessons.length === 0)
                }
                title={
                  !courseMap
                    ? 'Course map is required for ZIP export'
                    : selectedLessons !== null && selectedLessons.length === 0
                      ? 'Select at least one lesson'
                      : undefined
                }
                className="tactile flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-[12px] font-bold text-white bg-gradient-to-r from-indigo-500 to-violet-600 shadow-sm hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy === 'zip' ? (
                  <Spin />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                )}
                Download ZIP
              </button>
            </div>

            {/* Save Project file */}
            <div className="pt-1 border-t border-slate-100 space-y-1.5">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Project File</p>
              <p className="text-[10px] text-slate-400 leading-snug">
                Save session to reopen later — includes all generated content.
              </p>
              <button
                data-testid="export-save-project"
                onClick={onSaveProject}
                disabled={!!busy}
                className="tactile flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-[11px] font-semibold text-slate-600 bg-white/60 border border-slate-200/50 hover:bg-white/80 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                  />
                </svg>
                Save .coursemapper
              </button>
            </div>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────────── */}
        {/* CURRENT MODE — SLIDE DECKS: .pptx + .pdf + Google Slides     */}
        {/* ────────────────────────────────────────────────────────────── */}
        {scope === 'current' && activeTab === 'slideDecks' && (
          <>
            <div className="space-y-2">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Download</p>
              <FmtBtn
                fmt={{ id: 'pptx', label: '.pptx', color: 'pptx' }}
                disabled={isDisabled('pptx')}
                busy={busy === 'pptx'}
                onClick={() => doExport('pptx')}
              />
              <FmtBtn
                fmt={{ id: 'slidepdf', label: '.pdf', color: 'slidepdf' }}
                disabled={isDisabled('slidepdf')}
                busy={busy === 'slidepdf'}
                onClick={() => doExport('slidepdf')}
              />
            </div>
            <div className="space-y-2">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Google Drive</p>
              <GDriveBtn
                fmt={{ id: 'gslides', label: 'Google Slides' }}
                disabled={isDisabled('gslides')}
                busy={busy === 'gslides'}
                onClick={() => doExport('gslides')}
              />
            </div>
          </>
        )}

        {/* ────────────────────────────────────────────────────────────── */}
        {/* CURRENT MODE — COURSE MAP: xlsx/csv/pdf/docx + gdocs/gsheets  */}
        {/* ────────────────────────────────────────────────────────────── */}
        {scope === 'current' && activeTab === 'courseMap' && (
          <>
            <div className="space-y-2">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Download</p>
              <div className="grid grid-cols-2 gap-1.5">
                {DOWNLOAD_FORMATS.map((fmt) => (
                  <FmtBtn
                    key={fmt.id}
                    fmt={fmt}
                    disabled={isDisabled(fmt.id)}
                    busy={busy === fmt.id}
                    onClick={() => doExport(fmt.id)}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Google Drive</p>
              <div className="flex flex-col gap-1.5">
                {CLOUD_FORMATS.map((fmt) => (
                  <GDriveBtn
                    key={fmt.id}
                    fmt={fmt}
                    disabled={isDisabled(fmt.id)}
                    busy={busy === fmt.id}
                    onClick={() => doExport(fmt.id)}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {/* ────────────────────────────────────────────────────────────── */}
        {/* CURRENT MODE — OTHER DELIVERABLES: relevant formats only       */}
        {/* ────────────────────────────────────────────────────────────── */}
        {scope === 'current' && activeTab !== 'courseMap' && activeTab !== 'slideDecks' && (
          <>
            <div className="space-y-2">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Download</p>
              <div className="grid grid-cols-2 gap-1.5">
                {DOWNLOAD_FORMATS.map((fmt) => (
                  <FmtBtn
                    key={fmt.id}
                    fmt={fmt}
                    disabled={isDisabled(fmt.id)}
                    busy={busy === fmt.id}
                    onClick={() => doExport(fmt.id)}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Google Drive</p>
              <div className="flex flex-col gap-1.5">
                {CLOUD_FORMATS.filter((fmt) => !isDisabled(fmt.id)).map((fmt) => (
                  <GDriveBtn
                    key={fmt.id}
                    fmt={fmt}
                    disabled={false}
                    busy={busy === fmt.id}
                    onClick={() => doExport(fmt.id)}
                  />
                ))}
                {CLOUD_FORMATS.every((fmt) => isDisabled(fmt.id)) && (
                  <p className="text-[10px] text-slate-300 italic">No cloud export available</p>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Feedback ── */}
        {lastOk && (
          <p
            data-testid="export-success"
            className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 rounded-lg px-2 py-1.5 animate-spring-in"
          >
            ✓ {lastOk}
          </p>
        )}
        {lastError && (
          <p
            data-testid="export-error"
            className="text-[10px] font-semibold text-red-500 bg-red-50 rounded-lg px-2 py-1.5 animate-spring-in"
          >
            ✗ {lastError}
          </p>
        )}
      </div>
    </div>
  );
}
