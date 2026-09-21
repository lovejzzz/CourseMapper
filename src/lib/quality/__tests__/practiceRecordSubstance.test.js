import { describe, it, expect } from 'vitest';
import { grade } from '../deepQualityGrader.js';
import { createMemoryFileProvider } from '../fileProviders.js';
const text = [
  'Record A - Objective: Explain logic.',
  'Record B - Evidence target: explain a concept.',
  'Record C - Decision boundary: do not overclaim.',
  'Record D - Required product: weekly quiz.',
].join('\n');
async function regrade(courseName, body) {
  const path = 'Quiz & Exam Bank/Lesson 01 - Quiz.txt';
  return grade({
    fileProvider: createMemoryFileProvider({
      'PACKAGE_MANIFEST.json': JSON.stringify({
        courseName,
        files: [{ path, featureId: 'quizBank', lessonNumber: 1 }],
        lessonScope: [1],
      }),
      [path]: body,
    }),
    course: { title: courseName, featureIds: ['quizBank'] },
    honesty: { pipeline: { judgment: 'fixture' } },
  });
}
describe('metadata-only quiz case grading', () => {
  it('scores the actual generic lesson-instruction pattern as a substance defect', async () => {
    const result = await regrade('Discrete Mathematics', text);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'QUIZ_METADATA_ONLY_PRACTICE', severity: 'P1', dimension: 'substance' }),
      ]),
    );
  });
  it.each([
    ['Discrete Mathematics', 'Inputs: P=T,Q=F. NOT reverses the value.'],
    ['Instructional Design', text],
  ])('does not flag valid practice in %s', async (title, body) => {
    expect((await regrade(title, body)).findings.some((x) => x.code === 'QUIZ_METADATA_ONLY_PRACTICE')).toBe(false);
  });
});
