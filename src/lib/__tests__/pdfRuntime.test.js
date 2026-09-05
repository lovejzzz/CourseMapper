import fs from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { JSPDF_AUTOTABLE_MODULE_URL, JSPDF_MODULE_URL } from '../pdfRuntime';

describe('PDF runtime loader', () => {
  it('uses pinned external runtime URLs', () => {
    expect(JSPDF_MODULE_URL).toBe('https://cdn.jsdelivr.net/npm/jspdf@4.2.1/+esm');
    expect(JSPDF_AUTOTABLE_MODULE_URL).toBe('https://cdn.jsdelivr.net/npm/jspdf-autotable@5.0.7/+esm');
  });

  it('prevents Vite from bundling PDF renderers', async () => {
    const source = await fs.readFile(new URL('../pdfRuntime.js', import.meta.url), 'utf8');
    expect(source).toContain('@vite-ignore');
  });

  it('keeps jsPDF and autotable out of static imports', async () => {
    const files = [
      new URL('../exporters.js', import.meta.url),
      new URL('../deliverableExporters.js', import.meta.url),
      new URL('../exporters/exporterUtils.js', import.meta.url),
      new URL('../../components/ExportSidePanel.jsx', import.meta.url),
    ];
    const sources = await Promise.all(files.map((file) => fs.readFile(file, 'utf8')));
    const source = sources.join('\n');
    expect(source).not.toMatch(/import\s*\(\s*['"]jspdf['"]\s*\)/);
    expect(source).not.toMatch(/import\s*\(\s*['"]jspdf-autotable['"]\s*\)/);
  });
});
