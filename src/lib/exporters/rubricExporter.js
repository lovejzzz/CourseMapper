// ─── Feature 7.4: Rubric → Gradebook CSV ────────────────────────────────────
import { expandKeys } from '../keyMaps.js';

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
  const expanded = expandKeys('rubrics', rubricData || {});
  const rubrics = expanded.rubrics || [];
  if (rubrics.length === 0) return;

  const rows = [];

  rubrics.forEach((rubric, ri) => {
    const criteria = rubric.criteria || [];
    const title = rubric.title || `Rubric ${ri + 1}`;

    // Row 1: rubric metadata
    const metaRow = [`${title} (Metadata)`, 'Max Points', ...criteria.map((c) => c.points ?? ''), '', ''];
    rows.push(metaRow);

    // Row 2: weights sub-header
    const weightRow = ['', 'Weight %', ...criteria.map((c) => `${c.weight ?? ''}%`), '', ''];
    rows.push(weightRow);

    // Row 3: column headers
    const headerRow = [
      'Student Name',
      ...criteria.map((c) => c.criterion || c.name || `Criterion ${criteria.indexOf(c) + 1}`),
      'Total Score',
      'Feedback',
    ];
    rows.push(headerRow);

    // Student rows
    for (let s = 0; s < studentCount; s++) {
      const studentRow = [`Student ${s + 1}`, ...criteria.map(() => ''), '', ''];
      rows.push(studentRow);
    }

    // Blank separator between rubrics
    rows.push([]);
  });

  const csvContent = rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? '');
          if (s.includes(',') || s.includes('"') || s.includes('\n')) {
            return '"' + s.replace(/"/g, '""') + '"';
          }
          return s;
        })
        .join(','),
    )
    .join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rubric_gradebook.csv';
  a.click();
  URL.revokeObjectURL(url);
}
