import { describe, it, expect } from 'vitest';
import { importCourseMap } from '../importCourseMap';
import { buildXlsxWorkbook } from '../lightweightXlsx';

/**
 * fileParser — unit tests for the pure utility functions.
 *
 * The actual file-parsing functions (parseDocx, parsePdf, etc.) require
 * heavy browser/Node dependencies (mammoth, pdfjs-dist, jszip) that are
 * lazy-loaded at runtime. These tests focus on the synchronous, pure
 * utility functions that are testable without those dependencies:
 *   - sanitizeForAI (exported indirectly via parseFiles, but we test the logic)
 *   - parseFile routing (extension detection)
 *   - SUPPORTED_EXTENSIONS set
 *
 * Since sanitizeForAI is not exported directly, we replicate its logic here
 * to verify the sanitization contract. If it's ever exported, these tests
 * can be switched to import directly.
 */

// Replicate sanitizeForAI logic for testing (matches fileParser.js L108-125)
function sanitizeForAI(text) {
  if (!text) return '';
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\uFFFD\uFEFF\uFFF0-\uFFFF]/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{4,}/g, '\n\n\n')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim();
}

describe('sanitizeForAI', () => {
  it('returns empty string for falsy input', () => {
    expect(sanitizeForAI('')).toBe('');
    expect(sanitizeForAI(null)).toBe('');
    expect(sanitizeForAI(undefined)).toBe('');
  });

  it('strips null bytes and control characters', () => {
    expect(sanitizeForAI('Hello\x00World\x01!')).toBe('HelloWorld!');
  });

  it('preserves tabs and newlines', () => {
    const input = 'Line 1\n\tIndented\nLine 3';
    const result = sanitizeForAI(input);
    expect(result).toContain('Line 1');
    expect(result).toContain('Indented');
    expect(result).toContain('Line 3');
  });

  it('normalizes \\r\\n and \\r to \\n', () => {
    expect(sanitizeForAI('A\r\nB\rC')).toBe('A\nB\nC');
  });

  it('removes BOM and replacement characters', () => {
    expect(sanitizeForAI('\uFEFFHello\uFFFDWorld')).toBe('HelloWorld');
  });

  it('collapses excessive whitespace', () => {
    expect(sanitizeForAI('Hello    World')).toBe('Hello World');
  });

  it('collapses 4+ blank lines into 3', () => {
    const input = 'A\n\n\n\n\nB';
    const result = sanitizeForAI(input);
    expect(result).toBe('A\n\n\nB');
  });

  it('trims leading and trailing whitespace per line', () => {
    const input = '  Hello  \n  World  ';
    const result = sanitizeForAI(input);
    expect(result).toBe('Hello\nWorld');
  });

  it('handles mixed problematic content', () => {
    const input = '\uFEFF  Hello\x00\r\n  World\x01  \n\n\n\n\n  End  ';
    const result = sanitizeForAI(input);
    expect(result).toBe('Hello\nWorld\n\n\nEnd');
  });
});

describe('parseFile routing', () => {
  // We test that parseFile dispatches correctly by checking unsupported extensions
  it('throws for unsupported file types', async () => {
    const { parseFile } = await import('../fileParser');
    const mockFile = new File(['test'], 'test.xyz', { type: 'application/octet-stream' });
    await expect(parseFile(mockFile)).rejects.toThrow('Unsupported file type: .xyz');
  });

  it('rejects files larger than the input limit before parsing', async () => {
    const { MAX_INPUT_FILE_BYTES, parseFile } = await import('../fileParser');
    const mockFile = {
      name: 'oversized.txt',
      size: MAX_INPUT_FILE_BYTES + 1,
      text: async () => 'not read',
    };

    await expect(parseFile(mockFile)).rejects.toThrow('File is larger than 64 MB');
  });

  it('txt files are parsed without error', async () => {
    const { parseFile } = await import('../fileParser');
    const mockFile = new File(['Hello text content'], 'test.txt', { type: 'text/plain' });
    const result = await parseFile(mockFile);
    expect(result).toBe('Hello text content');
  });

  it('md files are parsed as plain text', async () => {
    const { parseFile } = await import('../fileParser');
    const mockFile = new File(['# Heading\n\nParagraph'], 'readme.md', { type: 'text/markdown' });
    const result = await parseFile(mockFile);
    expect(result).toContain('# Heading');
    expect(result).toContain('Paragraph');
  });

  it('csv files are parsed as plain text', async () => {
    const { parseFile } = await import('../fileParser');
    const mockFile = new File(['Name,Age\nAlice,30'], 'data.csv', { type: 'text/csv' });
    const result = await parseFile(mockFile);
    expect(result).toContain('Name,Age');
  });

  it('xlsx files are parsed without the ExcelJS or xlsx packages', async () => {
    const { parseFile } = await import('../fileParser');
    const buffer = await buildXlsxWorkbook({
      sheets: [
        {
          name: 'Schedule',
          rows: [
            ['Week', 'Topic'],
            ['Week 1', 'Data Ethics Foundations'],
          ],
        },
      ],
    });
    const file = new File([buffer], 'schedule.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const result = await parseFile(file);

    expect(result).toContain('--- Sheet: Schedule ---');
    expect(result).toContain('Week,Topic');
    expect(result).toContain('Week 1,Data Ethics Foundations');
  });
});

describe('archive safety limits', () => {
  it('rejects archives with too many entries', async () => {
    const { MAX_ARCHIVE_ENTRIES, assertSafeZipArchive } = await import('../fileParser');
    const files = Object.fromEntries(
      Array.from({ length: MAX_ARCHIVE_ENTRIES + 1 }, (_, index) => [
        `file-${index}.txt`,
        { dir: false, _data: { uncompressedSize: 1 } },
      ]),
    );

    expect(() => assertSafeZipArchive({ files }, 'upload.zip')).toThrow('contains too many files');
  });

  it('rejects archives whose expanded content exceeds the total limit', async () => {
    const { MAX_ARCHIVE_TOTAL_BYTES, assertSafeZipArchive } = await import('../fileParser');
    const files = Object.fromEntries(
      Array.from({ length: 6 }, (_, index) => [
        `file-${index}.txt`,
        { dir: false, _data: { uncompressedSize: MAX_ARCHIVE_TOTAL_BYTES / 5 } },
      ]),
    );

    expect(() => assertSafeZipArchive({ files }, 'upload.zip')).toThrow('expands beyond 128 MB');
  });
});

describe('parseFiles', () => {
  it('returns error entries for unsupported files', async () => {
    const { parseFiles } = await import('../fileParser');
    const mockFile = new File(['data'], 'photo.xyz', { type: 'application/octet-stream' });
    const results = await parseFiles([mockFile]);
    expect(results).toHaveLength(1);
    expect(results[0].error).toMatch(/Unsupported file type/);
    expect(results[0].text).toBe('');
  });

  it('parses multiple text files and sanitizes output', async () => {
    const { parseFiles } = await import('../fileParser');
    const file1 = new File(['Hello\x00'], 'a.txt', { type: 'text/plain' });
    const file2 = new File(['World'], 'b.txt', { type: 'text/plain' });
    const results = await parseFiles([file1, file2]);
    expect(results).toHaveLength(2);
    expect(results[0].text).toBe('Hello');
    expect(results[0].error).toBeNull();
    expect(results[1].text).toBe('World');
  });
});

describe('importCourseMap', () => {
  it('imports a course map from xlsx without ExcelJS', async () => {
    const buffer = await buildXlsxWorkbook({
      sheets: [
        {
          name: 'Course Map',
          rows: [
            ['Week/Module', 'Learning Objectives', 'Topic', 'Assessments'],
            ['Week 1', 'Explain data ethics principles', 'Privacy and consent', 'Reflection'],
            ['Week 2', 'Apply ethical review practices', 'Bias and accountability', 'Case analysis'],
          ],
        },
      ],
    });
    const file = new File([buffer], 'Data Ethics Course Map.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const imported = await importCourseMap(file);

    expect(imported.courseName).toBe('Data Ethics');
    expect(imported.lessons).toHaveLength(2);
    expect(imported.lessons[0].title).toBe('Week 1');
    expect(imported.lessons[0].sections[0].learningObjectives).toContain('Explain data ethics');
    expect(imported.lessons[1].sections[0].weeklyAssessments).toBe('Case analysis');
  });

  it('rejects legacy xls course-map imports with a clear conversion message', async () => {
    const file = new File(['legacy'], 'legacy.xls', { type: 'application/vnd.ms-excel' });

    await expect(importCourseMap(file)).rejects.toThrow(/Convert it to \.xlsx or \.csv/);
  });
});
