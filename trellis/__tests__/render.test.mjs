import { describe, it, expect, beforeAll } from 'vitest';
import { buildResearchMethods8 } from '../fixtures/graphs/researchMethods8.mjs';
import { buildLessonSlice } from '../voice/contracts.mjs';
import { mockAuthorLesson, mockAuthorCourseWide } from '../voice/mockAuthor.mjs';
import { renderPackage, FEATURE_FOLDERS, createMemoryFileProvider } from '../render/deliverables.mjs';

const GENERATED_AT = '2026-07-03T00:00:00.000Z';

function renderGolden() {
  const graph = buildResearchMethods8();
  const authored = Object.fromEntries(
    graph.lessons.map((lesson) => [lesson.id, mockAuthorLesson(buildLessonSlice(graph, lesson.id))]),
  );
  return {
    graph,
    ...renderPackage({ graph, authored, courseWide: mockAuthorCourseWide(graph), generatedAt: GENERATED_AT }),
  };
}

describe('render-compat package tree', () => {
  let graph;
  let files;
  let manifest;
  beforeAll(() => {
    ({ graph, files, manifest } = renderGolden());
  });

  it('creates every FOLDER_FEATURE folder the grader expects', () => {
    const tops = new Set([...files.keys()].map((p) => p.split('/')[0]));
    for (const folder of Object.values(FEATURE_FOLDERS)) {
      expect(tops, `missing folder ${folder}`).toContain(folder);
    }
  });

  it('names lesson files "Lesson NN - Title" so the grader extracts lesson numbers', () => {
    const lessonPlans = [...files.keys()].filter((p) => p.startsWith('Lesson Plans/'));
    expect(lessonPlans).toHaveLength(8);
    for (const path of lessonPlans) {
      expect(path).toMatch(/Lesson Plans\/Lesson \d{2} - .+\.md$/);
    }
  });

  it('renders one quiz file per lesson plus one file per exam', () => {
    const quizFiles = [...files.keys()].filter((p) => p.startsWith('Quiz & Exam Bank/'));
    expect(quizFiles).toHaveLength(8 + 2);
    expect(quizFiles.some((p) => p.includes('Midterm Exam'))).toBe(true);
    expect(quizFiles.some((p) => p.includes('Final Exam'))).toBe(true);
  });

  it('every quiz and exam carries an answer key and scoring rule (autograding spec)', () => {
    for (const [path, content] of files) {
      if (!path.startsWith('Quiz & Exam Bank/')) continue;
      expect(content, path).toMatch(/Answer key and scoring/);
      expect(content, path).toMatch(/Scoring rule: one correct letter/);
    }
  });

  it('exam items name their source lesson (no topic-connected-to-itself synthesis)', () => {
    const midterm = files.get('Quiz & Exam Bank/Midterm Exam.md');
    expect(midterm).toMatch(/from Lesson \d+:/);
  });

  it('the alignment table covers every lesson and every outcome', () => {
    const map = files.get(`Course Map/Course Map - ${graph.course.title}.md`);
    for (let n = 1; n <= 8; n += 1) expect(map).toMatch(new RegExp(`L${n}:`));
    for (const outcome of graph.outcomes) {
      expect(map).toContain(outcome.statement);
    }
  });

  it('the syllabus grading table carries registry keys verbatim and weights totaling 100', () => {
    const syllabus = files.get(`Syllabus/Syllabus - ${graph.course.title}.md`);
    for (const assessment of graph.assessments) {
      expect(syllabus).toContain(assessment.registryKey);
    }
    expect(syllabus).toContain('Weights total 100%');
  });

  it('real dates appear when termStart is set', () => {
    const syllabus = files.get(`Syllabus/Syllabus - ${graph.course.title}.md`);
    expect(syllabus).toMatch(/2026-09-07/);
    expect(syllabus).toMatch(/2026-10-26/); // week 8 = termStart + 49 days
  });

  it('lesson 1 has no "last time" reference and every bridge resolves to the real next title', () => {
    const l1 = files.get([...files.keys()].find((p) => p.startsWith('Lesson Plans/Lesson 01')));
    expect(l1.toLowerCase()).not.toMatch(/last time|last week/);
    const l3 = files.get([...files.keys()].find((p) => p.startsWith('Lesson Plans/Lesson 03')));
    expect(l3).toContain(graph.lessons.find((l) => l.id === 'l4').title);
  });

  it('manifest parses, declares lessonScope all, ready status, and file registry', () => {
    expect(manifest.lessonScope).toBe('all');
    expect(manifest.readiness).toEqual({ status: 'ready', blockers: 0, warnings: 0, checkedSections: '10/10' });
    expect(manifest.assessmentSummary.weightTotal).toBe(100);
    expect(manifest.files.length).toBe(files.size - 1); // every file but the manifest itself
    // ≥3 after the best-fit reading rule: a source that shares no vocabulary
    // with a lesson no longer headlines it (the LA Eigenvalues/Invertible P1),
    // so the golden fixture honestly drops one weak lesson-reading pairing.
    expect(manifest.readings.length).toBeGreaterThanOrEqual(3);
    const parsed = JSON.parse(files.get('PACKAGE_MANIFEST.json'));
    expect(parsed.courseName).toBe(graph.course.title);
  });

  it('memory file provider round-trips text and binary', () => {
    const provider = createMemoryFileProvider(files);
    expect(provider.list().length).toBe(files.size);
    const syllabusPath = `Syllabus/Syllabus - ${graph.course.title}.md`;
    expect(provider.readText(syllabusPath)).toContain('Course description');
    expect(provider.readBinary(syllabusPath).byteLength).toBeGreaterThan(100);
    expect(() => provider.readText('nope.md')).toThrow(/no file/);
  });
});
