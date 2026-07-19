import { describe, expect, it } from 'vitest';
import {
  buildPromptAwarePreview,
  derivePromptPreviewTitle,
  resolvePreviewLessonCount,
  resolveWorkspaceCourseTitle,
  scopePromptAwarePreviewItems,
} from '../promptAwarePreview';

describe('prompt-aware setup previews', () => {
  it('extracts a compact course identity from common course briefs', () => {
    expect(derivePromptPreviewTitle('User Experience Design Studio, 12 lessons, undergraduate')).toBe(
      'User Experience Design Studio',
    );
    expect(derivePromptPreviewTitle('User Experience Design Studio, 12-week project-based undergraduate course')).toBe(
      'User Experience Design Studio',
    );
    expect(derivePromptPreviewTitle('Create a 10-week course called “World Literature” for first-year students.')).toBe(
      'World Literature',
    );
    expect(derivePromptPreviewTitle('Build a course on Intro to Psychology with 15 lessons.')).toBe(
      'Intro to Psychology',
    );
    expect(
      derivePromptPreviewTitle(
        'Elementary Mandarin — one lesson: Pinyin and Tones for adult beginners. Use only these instructor-provided facts: Pinyin uses Latin letters.',
      ),
    ).toBe('Elementary Mandarin');
  });

  it('uses the active course in every built-in material preview', () => {
    const features = [
      'courseMap',
      'lessonPlans',
      'slideDecks',
      'rubrics',
      'quizBank',
      'discussions',
      'assignments',
      'studyGuides',
      'syllabus',
      'courseFaq',
    ];

    for (const featureId of features) {
      const preview = buildPromptAwarePreview(featureId, {
        promptText: 'User Experience Design Studio, 12 lessons, undergraduate',
        lessonCount: 12,
      });
      expect(preview.courseTitle).toBe('User Experience Design Studio');
      expect(JSON.stringify(preview)).not.toMatch(/machine learning|random forest|scikit|kaggle|iris/i);
    }
  });

  it('keeps the prompt-derived title while streamed course-map metadata is incomplete', () => {
    const promptText =
      "Introductory Physics II: Electricity and Magnetism, 15-week calculus-based course with circuit labs. Covers Faraday's law of induction, inductance, and Maxwell's equations.";

    expect(
      resolveWorkspaceCourseTitle({
        courseMapTitle: 's law of induction, inductance, and Maxwell',
        promptText,
        mappingInProgress: true,
      }),
    ).toBe('Introductory Physics II: Electricity and Magnetism');
    expect(
      resolveWorkspaceCourseTitle({
        courseMapTitle: 'Physics II: Electricity and Magnetism',
        promptText,
        mappingInProgress: false,
      }),
    ).toBe('Physics II: Electricity and Magnetism');
  });

  it('preserves requested course-map columns and the visible lesson count', () => {
    const preview = buildPromptAwarePreview('courseMap', {
      promptText: 'Nutrition, 8 lessons',
      lessonCount: 8,
      columns: [
        { key: 'topics', label: 'Topics', enabled: true },
        { key: 'assessment', label: 'Evidence', enabled: true },
        { key: 'hidden', label: 'Hidden', enabled: false },
      ],
    });

    expect(preview.total).toBe(8);
    expect(preview.lessons).toHaveLength(3);
    expect(preview.cols.map((column) => column.key)).toEqual(['topics', 'assessment']);
    expect(preview.lessons[0].sections[0].assessment).toContain('Lesson 1');
  });

  it('scopes setup previews to the lessons the user actually selected', () => {
    const count = resolvePreviewLessonCount({
      lessonScope: { type: 'specific', indices: [4] },
      courseMap: { lessons: Array.from({ length: 15 }, (_, index) => ({ title: `Lesson ${index + 1}` })) },
      lessonCount: 15,
    });
    const preview = scopePromptAwarePreviewItems(
      buildPromptAwarePreview('lessonPlans', { promptText: 'Data Structures', lessonCount: count }),
      count,
      ['Lesson 5: Information Architecture'],
    );

    expect(count).toBe(1);
    expect(preview.total).toBe(1);
    expect(preview.items).toHaveLength(1);
    expect(preview.items[0].lessonTitle).toBe('Lesson 5: Information Architecture');
  });
});
