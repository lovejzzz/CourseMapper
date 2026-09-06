/** @vitest-environment happy-dom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import useExport from '../useExport.js';

vi.mock('../../lib/exporters', () => ({ generatePdf: vi.fn().mockRejectedValue(new Error('PDF font unavailable')) }));

it('propagates a PDF failure to the export sidebar instead of reporting a completed download', async () => {
  let download;
  function Harness() {
    download = useExport({ courseName: 'Export check', lessons: [] }, []).handleDownload;
    return null;
  }
  const root = createRoot(document.createElement('div'));
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => {
      await expect(download('pdf')).rejects.toThrow('PDF font unavailable');
    });
  } finally {
    await act(async () => root.unmount());
  }
});
