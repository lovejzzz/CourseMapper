import { expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { exportDeliverableToGoogleDocs } from '../exporters/googleExporter.js';
import { saveToGoogleDocsBlob, updateTabStatus } from '../googleDrive.js';
vi.mock('../googleDrive.js', () => ({ saveToGoogleDocsBlob: vi.fn(async () => 'uploaded'), updateTabStatus: vi.fn() }));
it('uploads the actual student document and labels it distinctly while retaining teacher export', async () => {
  const data = {
    quizzes: [
      {
        lessonTitle: 'Read a record',
        questions: [
          { type: 'short_answer', question: 'Explain the recorded result.', answer: 'TEACHER_REFERENCE_SENTINEL' },
        ],
      },
    ],
  };
  const original = structuredClone(data);
  const tab = { closed: false };
  for (const audience of ['student', 'teacher']) {
    await exportDeliverableToGoogleDocs('quizBank', data, 'Course', tab, { audience });
    const [blob, title, course, target] = saveToGoogleDocsBlob.mock.calls.at(-1);
    const archive = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await archive.file('word/document.xml').async('string');
    expect(xml).toContain('Explain the recorded result.');
    expect(xml.includes('TEACHER_REFERENCE_SENTINEL')).toBe(audience === 'teacher');
    expect(title.includes('Student')).toBe(audience === 'student');
    expect(course).toBe('Course');
    expect(target).toBe(tab);
  }
  expect(updateTabStatus).toHaveBeenCalledWith(tab, 'build');
  expect(data).toEqual(original);
});
it('does not upload an unsupported student artifact', async () => {
  const calls = saveToGoogleDocsBlob.mock.calls.length;
  await expect(
    exportDeliverableToGoogleDocs('lessonPlans', {}, 'Course', null, { audience: 'student' }),
  ).rejects.toThrow(/supported/);
  expect(saveToGoogleDocsBlob.mock.calls).toHaveLength(calls);
});
