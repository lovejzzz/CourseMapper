import React, { useState } from 'react';
import {
  exportDeliverableCsv,
  exportDeliverablePdf,
  exportDeliverableDocx,
  exportDeliverableToGoogleDocs,
  exportDeliverableToGoogleSheets,
  FEATURE_LABELS,
} from '../lib/deliverableExporters';
import { openTabNow, saveToGoogleSlides } from '../lib/googleDrive';
import { exportSlideDeckPptx, buildSlideDeckPptxBlob } from '../lib/pptxExporter';

// ── Which formats each deliverable supports ─────────────────────────────────
// courseMap handled separately via useExport (xlsx, csv, pdf, docx, gsheets, gdocs)
const FORMAT_SUPPORT = {
  courseMap:    { xlsx: true,  csv: true,  pdf: true,  docx: true,  gdocs: true,  gsheets: true,  pptx: false },
  syllabus:     { xlsx: false, csv: false, pdf: true,  docx: true,  gdocs: true,  gsheets: false, pptx: false },
  lessonPlans:  { xlsx: false, csv: true,  pdf: true,  docx: true,  gdocs: true,  gsheets: true,  pptx: false },
  slideDecks:   { xlsx: false, csv: false, pdf: false, docx: false, gdocs: false, gsheets: false, pptx: true  },
  assignments:  { xlsx: false, csv: true,  pdf: true,  docx: true,  gdocs: true,  gsheets: false, pptx: false },
  rubrics:      { xlsx: false, csv: true,  pdf: true,  docx: true,  gdocs: true,  gsheets: false, pptx: false },
  discussions:  { xlsx: false, csv: true,  pdf: true,  docx: true,  gdocs: true,  gsheets: false, pptx: false },
  quizBank:     { xlsx: false, csv: true,  pdf: true,  docx: true,  gdocs: true,  gsheets: true,  pptx: false },
  studyGuides:  { xlsx: false, csv: true,  pdf: true,  docx: true,  gdocs: true,  gsheets: false, pptx: false },
};

// Formats for non-slideDecks current tab
const DOWNLOAD_FORMATS = [
  { id: 'xlsx', label: '.xlsx', color: 'emerald' },
  { id: 'docx', label: '.docx', color: 'blue'    },
  { id: 'pdf',  label: '.pdf',  color: 'red'     },
  { id: 'csv',  label: '.csv',  color: 'slate'   },
];
const CLOUD_FORMATS = [
  { id: 'gdocs',   label: 'Google Docs',   color: 'gdocs'   },
  { id: 'gsheets', label: 'Google Sheets', color: 'gsheets' },
];

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
function FmtBtn({ fmt, label, disabled, busy, onClick }) {
  const colorMap = {
    emerald: 'text-white bg-gradient-to-r from-emerald-500 to-green-600 shadow-sm hover:brightness-110',
    blue:    'text-slate-600 bg-white/60 border border-slate-200/50 hover:bg-white/80',
    red:     'text-slate-600 bg-white/60 border border-slate-200/50 hover:bg-white/80',
    slate:   'text-slate-600 bg-white/60 border border-slate-200/50 hover:bg-white/80',
    gdocs:   'text-[#1967D2] bg-[#E8F0FE]/80 border border-[#4285F4]/20 hover:bg-[#D2E3FC]',
    gsheets: 'text-[#188038] bg-[#E6F4EA]/80 border border-[#34A853]/20 hover:bg-[#CEEAD6]',
    pptx:    'text-[#C55A11] bg-[#FFF2E8]/80 border border-[#E07B39]/20 hover:bg-[#FFE5CC]',
    gslides: 'text-[#F4B400] bg-[#FFF8E1]/80 border border-[#FBBC04]/30 hover:bg-[#FFF0B3]',
  };
  const displayLabel = label || fmt.label;
  return (
    <button
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
      onClick={onClick}
      disabled={disabled || busy}
      className={`tactile flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all duration-200 w-full
        ${disabled ? 'opacity-30 cursor-not-allowed bg-slate-100 text-slate-400 border border-slate-200/40' : btnClass}`}
      title={disabled ? 'Not available for this deliverable' : ''}
    >
      {busy ? <Spin /> : (
        isSlides ? (
          // Google Slides icon (presentation)
          <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="4" width="18" height="14" rx="2" fill="#FBBC04" fillOpacity="0.25"/>
            <rect x="3" y="4" width="18" height="14" rx="2" stroke="#F4B400" strokeWidth="1.2"/>
            <path d="M8 8l5 4-5 4V8z" fill="#F4B400"/>
          </svg>
        ) : isSheets ? (
          <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
            <rect x="4" y="3" width="16" height="18" rx="2" fill="#34A853" fillOpacity="0.15"/>
            <path d="M4 9h16M4 13h16M4 17h16M10 9v12M15 9v12" stroke="#34A853" strokeWidth="1" strokeLinecap="round"/>
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
            <path d="M6 3a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6H6z" fill="#4285F4" fillOpacity="0.15"/>
            <path d="M14 3l6 6h-4a2 2 0 01-2-2V3z" fill="#4285F4" fillOpacity="0.3"/>
            <path d="M7 12h10M7 15h7" stroke="#4285F4" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        )
      )}
      {displayLabel}
    </button>
  );
}

// ── ZIP export (all deliverables) ─────────────────────────────────────────────
async function exportAllAsZip(deliverables, courseMap, columns, courseName) {
  let JSZip;
  try {
    JSZip = (await import('jszip')).default;
  } catch {
    throw new Error('ZIP library unavailable — please export individually');
  }

  const { buildDeliverableDocxBlob } = await import('../lib/deliverableExporters');
  const { buildXlsxBuffer } = await import('../lib/xlsxGenerator');
  const { saveAs } = await import('file-saver');

  const zip = new JSZip();
  const name = courseName || 'Course';

  // ── Course Map folder ──
  const cmFolder = zip.folder('Course Map');
  try {
    const buf = await buildXlsxBuffer(courseMap, columns);
    cmFolder.file(`${name} - Course Map.xlsx`, buf);
  } catch (e) { console.warn('CM xlsx failed', e); }

  // ── Each deliverable in its own folder ──
  for (const [featureId, entry] of Object.entries(deliverables)) {
    if (!entry?.data || entry.status !== 'done' || featureId === 'courseMap') continue;
    const label = FEATURE_LABELS[featureId] || featureId;
    const folder = zip.folder(label);
    const support = FORMAT_SUPPORT[featureId] || {};

    // Slide Decks → PPTX
    if (featureId === 'slideDecks' && support.pptx) {
      try {
        const blob = await buildSlideDeckPptxBlob(entry.data, name);
        folder.file(`${name} - ${label}.pptx`, blob);
      } catch (e) { console.warn(`${featureId} pptx blob failed`, e); }
    } else {
      // DOCX for other deliverables
      if (support.docx) {
        try {
          const blob = await buildDeliverableDocxBlob(featureId, entry.data, name);
          folder.file(`${name} - ${label}.docx`, blob);
        } catch (e) { console.warn(`${featureId} docx blob failed`, e); }
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
  courseMap,
  columns,
  deliverables,
  selectedFeatures,
  onCourseMapExport,   // handleDownload from useExport
  onSaveProject,       // save full session as .coursemapper
}) {
  const [scope, setScope] = useState('current'); // 'current' | 'all'
  const [busy, setBusy] = useState(null); // format string or 'zip'
  const [lastError, setLastError] = useState('');
  const [lastOk, setLastOk] = useState('');

  const courseName = courseMap?.courseName || 'Course';

  // ── Determine what we're exporting ──────────────────────────────────────────
  const isCurrentCourseMap = scope === 'current' && activeTab === 'courseMap';
  const isCurrentSlideDecks = scope === 'current' && activeTab === 'slideDecks';
  const isCurrentDeliverable = scope === 'current' && activeTab !== 'courseMap';
  const currentDeliverable = deliverables?.[activeTab];
  const currentHasData = isCurrentDeliverable && currentDeliverable?.status === 'done' && currentDeliverable?.data;

  // Format support for current tab
  const currentSupport = FORMAT_SUPPORT[activeTab] || {};

  // Count ready deliverables for "All" mode
  const allReadyCount = Object.entries(deliverables || {})
    .filter(([id, e]) => id !== 'courseMap' && e?.status === 'done').length
    + (courseMap ? 1 : 0);

  async function doExport(format) {
    // For Google exports we must open a tab BEFORE any await (popup blocker)
    const needsTab = format === 'gdocs' || format === 'gsheets' || format === 'gslides';
    const preTab = needsTab ? openTabNow() : null;

    setBusy(format);
    setLastError('');
    setLastOk('');
    try {
      if (scope === 'all') {
        // All mode: only ZIP is available
        if (format === 'zip') {
          await exportAllAsZip(deliverables || {}, courseMap, columns, courseName);
          setLastOk('ZIP downloaded!');
        }
      } else {
        // Current tab
        if (activeTab === 'courseMap') {
          await onCourseMapExport(format);
        } else if (activeTab === 'slideDecks') {
          // Slide decks: pptx or google slides
          if (!currentDeliverable?.data) throw new Error('No slide data yet');
          if (format === 'pptx') {
            await exportSlideDeckPptx(currentDeliverable.data, courseName);
          } else if (format === 'gslides') {
            const blob = await buildSlideDeckPptxBlob(currentDeliverable.data, courseName);
            await saveToGoogleSlides(blob, `${courseName} - Slide Decks`, preTab);
          }
        } else {
          if (!currentDeliverable?.data) throw new Error('No data yet');
          if (format === 'csv')     await exportDeliverableCsv(activeTab, currentDeliverable.data, courseName);
          if (format === 'pdf')     await exportDeliverablePdf(activeTab, currentDeliverable.data, courseName);
          if (format === 'docx')    await exportDeliverableDocx(activeTab, currentDeliverable.data, courseName);
          if (format === 'gdocs')   await exportDeliverableToGoogleDocs(activeTab, currentDeliverable.data, courseName, preTab);
          if (format === 'gsheets') await exportDeliverableToGoogleSheets(activeTab, currentDeliverable.data, courseName, preTab);
        }
        setLastOk('Done!');
      }
    } catch (err) {
      if (preTab && !preTab.closed) preTab.close();
      setLastError(err.message || 'Export failed');
    } finally {
      setBusy(null);
      setTimeout(() => { setLastOk(''); setLastError(''); }, 4000);
    }
  }

  // What's disabled in "current" mode
  function isDisabled(formatId) {
    if (activeTab === 'courseMap') return !FORMAT_SUPPORT.courseMap[formatId];
    if (activeTab === 'slideDecks') {
      if (formatId === 'pptx' || formatId === 'gslides') return !currentHasData;
      return true; // other formats not supported for slide decks
    }
    if (!currentHasData) return true;
    return !currentSupport[formatId];
  }

  const tabLabel = activeTab === 'courseMap' ? 'Course Map' : (FEATURE_LABELS[activeTab] || activeTab);

  return (
    <div className="flex flex-col gap-4 w-56 flex-shrink-0">
      {/* ── Panel card ── */}
      <div className="glass rounded-squircle-sm shadow-glass p-4 space-y-4 animate-spring-in">

        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-sm">
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <span className="text-xs font-bold text-slate-700">Export</span>
        </div>

        {/* ── Scope toggle ── */}
        <div className="flex items-center bg-slate-100/80 rounded-lg p-0.5 gap-0.5">
          {[
            { id: 'current', label: 'Current' },
            { id: 'all',     label: 'All' },
          ].map(s => (
            <button
              key={s.id}
              onClick={() => setScope(s.id)}
              className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-all duration-200 ${
                scope === s.id
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Scope description */}
        <p className="text-[10px] text-slate-400 leading-snug -mt-1">
          {scope === 'current'
            ? <><span className="font-semibold text-indigo-500">{tabLabel}</span> only</>
            : <><span className="font-semibold text-indigo-500">{allReadyCount} item{allReadyCount !== 1 ? 's' : ''}</span> ready</>
          }
        </p>

        {/* ────────────────────────────────────────────────────────────── */}
        {/* ALL MODE: ZIP download + Save Project file                     */}
        {/* ────────────────────────────────────────────────────────────── */}
        {scope === 'all' && (
          <div className="space-y-2">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Download</p>
            <p className="text-[10px] text-slate-400 leading-snug">
              All deliverables in one ZIP, organized by folder.
            </p>
            <button
              onClick={() => doExport('zip')}
              disabled={!!busy || allReadyCount === 0}
              className="tactile flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-[12px] font-bold text-white bg-gradient-to-r from-indigo-500 to-violet-600 shadow-sm hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy === 'zip' ? <Spin /> : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              )}
              Download ZIP
            </button>

            {/* Save Project file */}
            <div className="pt-1 border-t border-slate-100 space-y-1.5">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Project File</p>
              <p className="text-[10px] text-slate-400 leading-snug">
                Save session to reopen later — includes all generated content.
              </p>
              <button
                onClick={onSaveProject}
                disabled={!!busy}
                className="tactile flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-[11px] font-semibold text-slate-600 bg-white/60 border border-slate-200/50 hover:bg-white/80 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                Save .coursemapper
              </button>
            </div>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────────── */}
        {/* CURRENT MODE — SLIDE DECKS: .pptx + Google Slides             */}
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
                {DOWNLOAD_FORMATS.map(fmt => (
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
                {CLOUD_FORMATS.map(fmt => (
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
                {DOWNLOAD_FORMATS.map(fmt => (
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
                {CLOUD_FORMATS.filter(fmt => !isDisabled(fmt.id)).map(fmt => (
                  <GDriveBtn
                    key={fmt.id}
                    fmt={fmt}
                    disabled={false}
                    busy={busy === fmt.id}
                    onClick={() => doExport(fmt.id)}
                  />
                ))}
                {CLOUD_FORMATS.every(fmt => isDisabled(fmt.id)) && (
                  <p className="text-[10px] text-slate-300 italic">No cloud export available</p>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Feedback ── */}
        {lastOk && (
          <p className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 rounded-lg px-2 py-1.5 animate-spring-in">
            ✓ {lastOk}
          </p>
        )}
        {lastError && (
          <p className="text-[10px] font-semibold text-red-500 bg-red-50 rounded-lg px-2 py-1.5 animate-spring-in">
            ✗ {lastError}
          </p>
        )}
      </div>
    </div>
  );
}
