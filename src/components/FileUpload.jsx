import React, { useCallback } from 'react';

const ACCEPTED_TYPES = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/vnd.oasis.opendocument.text': '.odt',
  'application/vnd.oasis.opendocument.presentation': '.odp',
  'application/vnd.oasis.opendocument.spreadsheet': '.ods',
  'application/epub+zip': '.epub',
  'application/rtf': '.rtf',
  'text/rtf': '.rtf',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'text/csv': '.csv',
  'text/html': '.html',
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
};

const ACCEPTED_EXTENSIONS = [
  '.doc', '.docx', '.pdf', '.txt', '.md', '.csv', '.rtf',
  '.html', '.htm', '.xlsx', '.xls', '.ods',
  '.ppt', '.pptx', '.odp',
  '.odt', '.epub', '.key', '.pages',
  '.zip',
];

export default function FileUpload({ files, setFiles }) {
  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      const dropped = Array.from(e.dataTransfer.files).filter(isValidFile);
      setFiles((prev) => [...prev, ...dropped]);
    },
    [setFiles]
  );

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
  }, []);

  const handleFileInput = useCallback(
    (e) => {
      const selected = Array.from(e.target.files).filter(isValidFile);
      setFiles((prev) => [...prev, ...selected]);
      e.target.value = '';
    },
    [setFiles]
  );

  const removeFile = useCallback(
    (index) => {
      setFiles((prev) => prev.filter((_, i) => i !== index));
    },
    [setFiles]
  );

  return (
    <div className="glass rounded-squircle shadow-glass p-7 animate-stagger-2">
      <h2 className="text-[15px] font-bold text-slate-800 mb-5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm shadow-sky-500/20">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        Upload Course Materials
      </h2>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="tactile border-2 border-dashed border-slate-200/60 rounded-squircle-sm p-8 text-center hover:border-indigo-400/50 hover:bg-indigo-50/20 transition-all duration-300 cursor-pointer group"
        onClick={() => document.getElementById('file-input').click()}
      >
        <div className="w-14 h-14 rounded-squircle-sm bg-slate-100/80 flex items-center justify-center mx-auto mb-4 group-hover:bg-indigo-100/60 group-hover:scale-105 transition-all duration-300">
          <svg className="w-6 h-6 text-slate-400 group-hover:text-indigo-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-600">
          Drop files here or click to browse
        </p>
        <p className="text-slate-400 text-xs mt-1.5">
          Documents, slides, spreadsheets, e-books, ZIP archives & more
        </p>
        <input
          id="file-input"
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS.join(',')}
          onChange={handleFileInput}
          className="hidden"
        />
      </div>

      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          {files.map((file, index) => (
            <div
              key={index}
              className="flex items-center justify-between rounded-squircle-xs px-4 py-2.5 bg-white/50 border border-white/40 animate-spring-in"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileIcon ext={file.name.split('.').pop()} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">
                    {file.name}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {formatSize(file.size)}
                  </p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(index);
                }}
                className="tactile text-slate-300 hover:text-red-400 transition-colors ml-2 flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FileIcon({ ext }) {
  const colors = {
    doc: 'text-blue-500',
    docx: 'text-blue-500',
    odt: 'text-blue-400',
    rtf: 'text-blue-400',
    pages: 'text-blue-400',
    pdf: 'text-red-500',
    txt: 'text-slate-500',
    md: 'text-slate-500',
    csv: 'text-slate-500',
    html: 'text-orange-500',
    htm: 'text-orange-500',
    xlsx: 'text-green-500',
    xls: 'text-green-500',
    ods: 'text-green-400',
    ppt: 'text-amber-500',
    pptx: 'text-amber-500',
    odp: 'text-amber-400',
    key: 'text-amber-400',
    epub: 'text-purple-500',
    zip: 'text-slate-600',
  };

  return (
    <div className={`flex-shrink-0 ${colors[ext] || 'text-gray-500'}`}>
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
  );
}

function isValidFile(file) {
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  return ACCEPTED_EXTENSIONS.includes(ext);
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
