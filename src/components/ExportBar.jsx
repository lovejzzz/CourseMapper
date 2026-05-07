import React, { useState, useRef } from 'react';

export default function ExportBar({ onExport, onImport }) {
  const [exporting, setExporting] = useState(null);
  const importRef = useRef(null);

  async function handleExport(format) {
    setExporting(format);
    try {
      await onExport(format);
    } finally {
      setTimeout(() => setExporting(null), 500);
    }
  }

  function handleImportChange(e) {
    const file = e.target.files?.[0];
    if (file && onImport) onImport(file);
    e.target.value = '';
  }

  const btnBase =
    'tactile flex items-center gap-2 px-4 py-2.5 rounded-pill text-xs font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed';
  const btnLight = `${btnBase} text-slate-500 bg-white/50 border border-slate-200/40 hover:bg-white/70 hover:text-slate-700 shadow-glass hover:shadow-glass-lg`;

  function SpinOrIcon({ format, children }) {
    return exporting === format ? (
      <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    ) : (
      children
    );
  }

  return (
    <div className="mt-4 ml-10 animate-spring-in">
      {/* Row 1: Download exports */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mr-1">Download</span>
        <button
          onClick={() => handleExport('xlsx')}
          disabled={!!exporting}
          className={`${btnBase} text-white bg-gradient-to-r from-emerald-500 to-green-600 shadow-btn-green hover:brightness-110`}
        >
          <SpinOrIcon format="xlsx">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </SpinOrIcon>
          {exporting === 'xlsx' ? 'Exporting...' : '.xlsx'}
        </button>
        <button onClick={() => handleExport('docx')} disabled={!!exporting} className={btnLight}>
          <SpinOrIcon format="docx">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </SpinOrIcon>
          {exporting === 'docx' ? 'Exporting...' : '.docx'}
        </button>
        <button onClick={() => handleExport('pdf')} disabled={!!exporting} className={btnLight}>
          <SpinOrIcon format="pdf">
            <span className="w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold text-red-500">PDF</span>
          </SpinOrIcon>
          {exporting === 'pdf' ? 'Exporting...' : '.pdf'}
        </button>
        <button onClick={() => handleExport('csv')} disabled={!!exporting} className={btnLight}>
          <SpinOrIcon format="csv">
            <span className="w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold text-blue-500">CSV</span>
          </SpinOrIcon>
          {exporting === 'csv' ? 'Exporting...' : '.csv'}
        </button>
        {onImport && (
          <>
            <div className="w-px h-5 bg-slate-200/60 mx-1" />
            <input ref={importRef} type="file" accept=".xlsx,.csv" onChange={handleImportChange} className="hidden" />
            <button
              onClick={() => importRef.current?.click()}
              className={btnLight}
              title="Import course map from .xlsx or .csv"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              Import
            </button>
          </>
        )}
      </div>
      {/* Row 2: Google Drive exports */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mr-1">Google Drive</span>
        <button
          onClick={() => handleExport('gsheets')}
          disabled={!!exporting}
          className={`${btnBase} text-[#188038] bg-[#E6F4EA]/80 border border-[#34A853]/20 hover:bg-[#CEEAD6] shadow-glass`}
        >
          <SpinOrIcon format="gsheets">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
              <rect x="4" y="3" width="16" height="18" rx="2" fill="#34A853" fillOpacity="0.15" />
              <path
                d="M4 9h16M4 13h16M4 17h16M10 9v12M15 9v12"
                stroke="#34A853"
                strokeWidth="1"
                strokeLinecap="round"
              />
            </svg>
          </SpinOrIcon>
          {exporting === 'gsheets' ? 'Saving...' : 'Google Sheets'}
        </button>
        <button
          onClick={() => handleExport('gdocs')}
          disabled={!!exporting}
          className={`${btnBase} text-[#1967D2] bg-[#E8F0FE]/80 border border-[#4285F4]/20 hover:bg-[#D2E3FC] shadow-glass`}
        >
          <SpinOrIcon format="gdocs">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
              <path d="M6 3a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6H6z" fill="#4285F4" fillOpacity="0.15" />
              <path d="M14 3l6 6h-4a2 2 0 01-2-2V3z" fill="#4285F4" fillOpacity="0.3" />
              <path d="M7 12h10M7 15h7" stroke="#4285F4" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </SpinOrIcon>
          {exporting === 'gdocs' ? 'Saving...' : 'Google Docs'}
        </button>
      </div>
    </div>
  );
}
