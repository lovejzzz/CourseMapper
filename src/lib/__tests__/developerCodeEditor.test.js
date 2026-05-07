import { describe, expect, it } from 'vitest';
import {
  applyEditorIndent,
  getCursorPosition,
  getLineCount,
} from '../developerCodeEditor';

describe('developerCodeEditor', () => {
  it('counts lines and reports cursor position', () => {
    const value = '{\n  "a": 1\n}';

    expect(getLineCount(value)).toBe(3);
    expect(getCursorPosition(value, 0)).toEqual({ index: 0, line: 1, column: 1 });
    expect(getCursorPosition(value, 5)).toEqual({ index: 5, line: 2, column: 4 });
  });

  it('indents a single cursor position', () => {
    expect(applyEditorIndent('abc', 1, 1)).toEqual({
      value: 'a  bc',
      selectionStart: 3,
      selectionEnd: 3,
    });
  });

  it('indents selected lines', () => {
    const result = applyEditorIndent('one\ntwo\nthree', 1, 7);

    expect(result.value).toBe('  one\n  two\nthree');
    expect(result.selectionStart).toBe(3);
    expect(result.selectionEnd).toBe(11);
  });

  it('outdents selected lines', () => {
    const result = applyEditorIndent('  one\n  two\nthree', 0, 11, { outdent: true });

    expect(result.value).toBe('one\ntwo\nthree');
    expect(result.selectionStart).toBe(0);
    expect(result.selectionEnd).toBe(7);
  });
});
