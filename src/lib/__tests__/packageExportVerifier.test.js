import { describe, expect, it, vi } from 'vitest';
import { verifyPackageExports } from '../packageExportVerifier';

vi.mock('../customDeliverableLibrary', () => ({
  getCustomDeliverable: vi.fn((id) => (id === 'custom_weeklyReflection' ? { name: 'Weekly Reflection' } : null)),
}));

vi.mock('../xlsxGenerator', () => ({
  buildXlsxBuffer: vi.fn(() => Promise.resolve(new Uint8Array(256).buffer)),
}));

vi.mock('../exporters/csvExporter', () => ({
  deliverableToCsvRows: vi.fn(() => ({ headers: ['Lesson'], rows: [['Lesson 1']] })),
}));

vi.mock('../exporters/bulkDocxExporter', () => ({
  buildDeliverableDocxBlob: vi.fn(() => Promise.resolve({ size: 256 })),
}));

vi.mock('../exporters/pptxExporter', () => ({
  buildSlideDeckPptxBlob: vi.fn(() => Promise.resolve({ size: 256 })),
}));

describe('verifyPackageExports', () => {
  it('runs in-memory checks for course map and selected deliverables', async () => {
    const result = await verifyPackageExports({
      courseMap: {
        courseName: 'Research Methods',
        lessons: [{ title: 'Lesson 1', sections: [{ learningObjectives: 'Define sampling.' }] }],
      },
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: { lessonPlans: [{ lt: 'Lesson 1', ob: 'Define sampling.' }] },
        },
      },
      selectedFeatures: ['courseMap', 'lessonPlans'],
    });

    expect(result.status).toBe('passed');
    expect(result.checked).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.checks.map((check) => check.format)).toEqual(['xlsx', 'csv', 'docx']);
  });

  it('fails honestly when the course map export has no lessons', async () => {
    const result = await verifyPackageExports({
      courseMap: { courseName: 'Empty', lessons: [] },
      deliverables: {},
      selectedFeatures: ['courseMap'],
    });

    expect(result.status).toBe('failed');
    expect(result.checks[0].message).toContain('no lessons');
  });

  it('uses custom deliverable names in export verification messages', async () => {
    const result = await verifyPackageExports({
      courseMap: { courseName: 'Research Methods', lessons: [{ title: 'Lesson 1', sections: [] }] },
      deliverables: { custom_weeklyReflection: { status: 'error' } },
      selectedFeatures: ['custom_weeklyReflection'],
    });

    expect(result.status).toBe('warnings');
    expect(result.checks[0]).toMatchObject({
      featureId: 'custom_weeklyReflection',
      label: 'Weekly Reflection',
      message: 'Weekly Reflection has no generated data.',
    });
    expect(result.checks[0].message).not.toContain('custom_weeklyReflection');
  });
});
