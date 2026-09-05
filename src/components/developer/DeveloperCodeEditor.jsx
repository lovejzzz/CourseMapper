import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { applyEditorIndent, getCursorPosition, getLineCount } from '../../lib/developerCodeEditor.js';
import { findJsonPathLocation, offsetToLineColumn } from '../../lib/developerJsonPath.js';

const DeveloperCodeEditor = forwardRef(function DeveloperCodeEditor(
  {
    value,
    onChange,
    onApply,
    onFormat,
    canApply = false,
    canFormat = true,
    sectionLabel = 'JSON',
    sectionId = 'raw',
    diagnostics = [],
  },
  forwardedRef,
) {
  const textareaRef = useRef(null);
  const cmViewRef = useRef(null);
  const lineNumberRef = useRef(null);
  const [cursor, setCursor] = useState(() => getCursorPosition(value, 0));
  const [codeMirror, setCodeMirror] = useState(null);
  const lineCount = getLineCount(value);
  const lineNumbers = useMemo(() => Array.from({ length: lineCount }, (_, index) => index + 1).join('\n'), [lineCount]);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      import('@uiw/react-codemirror'),
      import('@codemirror/lang-json'),
      import('@codemirror/lint'),
      import('@codemirror/view'),
      import('@codemirror/commands'),
      import('@codemirror/search'),
    ])
      .then(([cm, jsonMod, lintMod, viewMod, commandsMod, searchMod]) => {
        if (!mounted) return;
        setCodeMirror({
          CodeMirror: cm.default,
          json: jsonMod.json,
          linter: lintMod.linter,
          EditorView: viewMod.EditorView,
          keymap: viewMod.keymap,
          indentWithTab: commandsMod.indentWithTab,
          searchKeymap: searchMod.searchKeymap,
        });
      })
      .catch(() => {
        if (mounted) setCodeMirror(null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  function selectRange(selectionStart, selectionEnd = selectionStart) {
    if (cmViewRef.current) {
      const effects = codeMirror?.EditorView
        ? codeMirror.EditorView.scrollIntoView(selectionStart, { y: 'center' })
        : undefined;
      cmViewRef.current.dispatch({
        selection: { anchor: selectionStart, head: selectionEnd },
        ...(effects ? { effects } : {}),
      });
      cmViewRef.current.focus();
      setCursor(offsetToLineColumn(value, selectionStart));
      return;
    }
    if (!textareaRef.current) return;
    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(selectionStart, selectionEnd);
    textareaRef.current.scrollTop = Math.max(0, textareaRef.current.scrollTop - 40);
    updateCursor(textareaRef.current);
  }

  useImperativeHandle(forwardedRef, () => ({
    focus() {
      if (cmViewRef.current) cmViewRef.current.focus();
      else textareaRef.current?.focus();
    },
    getSelectionEnd() {
      if (cmViewRef.current) return cmViewRef.current.state.selection.main.head;
      return textareaRef.current?.selectionEnd || 0;
    },
    selectRange,
  }));

  function updateCursor(target = textareaRef.current) {
    if (!target) return;
    setCursor(getCursorPosition(target.value, target.selectionStart));
  }

  function setValueWithSelection(next) {
    onChange(next.value);
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(next.selectionStart, next.selectionEnd);
      updateCursor(textareaRef.current);
    });
  }

  function handleKeyDown(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      setValueWithSelection(
        applyEditorIndent(value, e.currentTarget.selectionStart, e.currentTarget.selectionEnd, { outdent: e.shiftKey }),
      );
      return;
    }

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (canApply) onApply?.();
      return;
    }

    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (canApply) onApply?.();
      return;
    }

    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      if (canFormat) onFormat?.();
    }
  }

  function handleScroll(e) {
    if (lineNumberRef.current) lineNumberRef.current.scrollTop = e.currentTarget.scrollTop;
  }

  const cmExtensions = useMemo(() => {
    if (!codeMirror) return [];
    const diagnosticSource = () =>
      diagnostics
        .map((finding) => {
          try {
            const location = findJsonPathLocation(value, finding.path, sectionId);
            return {
              from: location.index,
              to: Math.max(location.endIndex, location.index + 1),
              severity: finding.level === 'error' ? 'error' : 'warning',
              message: `${finding.path}: ${finding.message}`,
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean);

    return [
      codeMirror.json(),
      codeMirror.linter(diagnosticSource),
      codeMirror.keymap.of([
        {
          key: 'Mod-s',
          run: () => {
            if (canApply) onApply?.();
            return true;
          },
        },
        {
          key: 'Mod-Enter',
          run: () => {
            if (canApply) onApply?.();
            return true;
          },
        },
        {
          key: 'Mod-Shift-f',
          run: () => {
            if (canFormat) onFormat?.();
            return true;
          },
        },
        ...(codeMirror.searchKeymap || []),
        codeMirror.indentWithTab,
      ]),
      codeMirror.EditorView.theme({
        '&': { height: '100%', minHeight: 0, backgroundColor: '#020617', color: '#e2e8f0' },
        '.cm-editor': { height: '100%', backgroundColor: '#020617' },
        '.cm-scroller': {
          overflow: 'auto',
          backgroundColor: '#020617',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: '12px',
          lineHeight: '20px',
          scrollbarColor: '#64748b #0f172a',
          scrollbarWidth: 'thin',
        },
        '.cm-scroller::-webkit-scrollbar': { width: '12px', height: '12px' },
        '.cm-scroller::-webkit-scrollbar-track': { backgroundColor: '#0f172a' },
        '.cm-scroller::-webkit-scrollbar-thumb': {
          backgroundColor: '#64748b',
          border: '3px solid #0f172a',
          borderRadius: '999px',
        },
        '.cm-scroller::-webkit-scrollbar-thumb:hover': { backgroundColor: '#94a3b8' },
        '.cm-content': { minHeight: '100%', padding: '12px 0 32px', backgroundColor: '#020617' },
        '.cm-line': { color: '#e2e8f0' },
        '.cm-gutters': { backgroundColor: '#0f172a', color: '#64748b', borderRightColor: '#1e293b' },
        '.cm-activeLineGutter': { backgroundColor: '#111827' },
        '.cm-activeLine': { backgroundColor: 'rgba(99, 102, 241, 0.08)' },
        '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
          backgroundColor: 'rgba(99, 102, 241, 0.35)',
        },
      }),
    ];
  }, [canApply, canFormat, codeMirror, diagnostics, onApply, onFormat, sectionId, value]);

  return (
    <div
      data-testid={`developer-code-editor-${sectionId}`}
      data-section={sectionId}
      className="flex min-h-0 flex-1 flex-col bg-slate-950"
    >
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-bold text-slate-200">{sectionLabel}</p>
          <p className="text-[10px] text-slate-500">{lineCount} lines</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-500">
          <span data-testid="developer-code-cursor">
            Ln {cursor.line}, Col {cursor.column}
          </span>
          <span className="hidden rounded-md border border-slate-700 px-2 py-1 sm:inline">Tab indents</span>
          <span className="hidden rounded-md border border-slate-700 px-2 py-1 sm:inline">Cmd+S saves</span>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[3.5rem_minmax(0,1fr)]">
        {codeMirror ? (
          <div className="col-span-2 min-h-0 overflow-hidden bg-slate-950 [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto">
            <codeMirror.CodeMirror
              value={value}
              height="100%"
              className="h-full"
              theme="dark"
              basicSetup
              extensions={cmExtensions}
              onCreateEditor={(view) => {
                cmViewRef.current = view;
              }}
              onChange={(nextValue, viewUpdate) => {
                onChange(nextValue);
                const head = viewUpdate?.state?.selection?.main?.head || 0;
                setCursor(offsetToLineColumn(nextValue, head));
              }}
            />
          </div>
        ) : (
          <>
            <pre
              ref={lineNumberRef}
              aria-hidden="true"
              className="select-none overflow-hidden border-r border-slate-800 bg-slate-900 px-3 py-3 text-right font-mono text-[12px] leading-5 text-slate-600"
            >
              {lineNumbers}
            </pre>
            <textarea
              ref={textareaRef}
              value={value}
              spellCheck={false}
              onChange={(e) => {
                onChange(e.target.value);
                updateCursor(e.target);
              }}
              onClick={(e) => updateCursor(e.currentTarget)}
              onKeyUp={(e) => updateCursor(e.currentTarget)}
              onKeyDown={handleKeyDown}
              onScroll={handleScroll}
              className="developer-code-editor h-full min-h-0 w-full resize-none overflow-auto px-4 py-3 font-mono text-[12px] leading-5 outline-none selection:bg-indigo-500/40"
              style={{ scrollbarColor: '#64748b #0f172a', scrollbarWidth: 'thin' }}
            />
          </>
        )}
      </div>
    </div>
  );
});

export default DeveloperCodeEditor;
