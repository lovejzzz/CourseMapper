export function getLineCount(value) {
  return String(value ?? '').split('\n').length;
}

export function getCursorPosition(value, selectionStart = 0) {
  const text = String(value ?? '');
  const safeIndex = Math.max(0, Math.min(selectionStart, text.length));
  const beforeCursor = text.slice(0, safeIndex);
  const lines = beforeCursor.split('\n');
  return {
    index: safeIndex,
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
}

function getSelectedLineRange(value, selectionStart, selectionEnd) {
  const text = String(value ?? '');
  const lineStart = text.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
  const nextBreak = text.indexOf('\n', selectionEnd);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  return { lineStart, lineEnd };
}

export function applyEditorIndent(value, selectionStart = 0, selectionEnd = selectionStart, options = {}) {
  const text = String(value ?? '');
  const indent = options.indent ?? '  ';
  const outdent = options.outdent === true;
  const start = Math.max(0, Math.min(selectionStart, text.length));
  const end = Math.max(start, Math.min(selectionEnd, text.length));
  const hasMultilineSelection = text.slice(start, end).includes('\n');

  if (!hasMultilineSelection && !outdent) {
    return {
      value: `${text.slice(0, start)}${indent}${text.slice(end)}`,
      selectionStart: start + indent.length,
      selectionEnd: start + indent.length,
    };
  }

  const { lineStart, lineEnd } = getSelectedLineRange(text, start, end);
  const before = text.slice(0, lineStart);
  const selected = text.slice(lineStart, lineEnd);
  const after = text.slice(lineEnd);
  const lines = selected.split('\n');
  let removedBeforeStart = 0;
  let totalDelta = 0;

  const nextLines = lines.map((line, index) => {
    if (!outdent) {
      totalDelta += indent.length;
      return `${indent}${line}`;
    }

    let removeCount = 0;
    if (line.startsWith(indent)) removeCount = indent.length;
    else if (line.startsWith('\t')) removeCount = 1;
    else if (line.startsWith(' ')) removeCount = 1;

    if (removeCount > 0) {
      const absoluteLineStart = lineStart + lines.slice(0, index).join('\n').length + (index > 0 ? 1 : 0);
      if (absoluteLineStart < start) removedBeforeStart += Math.min(removeCount, start - absoluteLineStart);
      totalDelta -= removeCount;
    }
    return line.slice(removeCount);
  });

  return {
    value: `${before}${nextLines.join('\n')}${after}`,
    selectionStart: Math.max(lineStart, start + (outdent ? -removedBeforeStart : indent.length)),
    selectionEnd: Math.max(lineStart, end + totalDelta),
  };
}
