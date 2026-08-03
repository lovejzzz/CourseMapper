import { describe, expect, it } from 'vitest';
import {
  buildPromptAwarePreview,
  derivePromptPreviewTitle,
  repairGeneratedCourseTitle,
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
    expect(
      derivePromptPreviewTitle(
        'Introduction to Genetics, a 15-lesson undergraduate biology course with problem sets and a model-organism lab.',
      ),
    ).toBe('Introduction to Genetics');
    expect(derivePromptPreviewTitle('Create a 10-week course called “World Literature” for first-year students.')).toBe(
      'World Literature',
    );
    expect(derivePromptPreviewTitle('Build a course on Intro to Psychology with 15 lessons.')).toBe(
      'Intro to Psychology',
    );
    expect(derivePromptPreviewTitle('Build an 8-lesson Spanish for Healthcare Professionals course.')).toBe(
      'Spanish for Healthcare Professionals',
    );
    expect(derivePromptPreviewTitle('Design a Writing with AI seminar.')).toBe('Writing with AI');
    expect(
      derivePromptPreviewTitle(
        'Elementary Mandarin — one lesson: Pinyin and Tones for adult beginners. Use only these instructor-provided facts: Pinyin uses Latin letters.',
      ),
    ).toBe('Elementary Mandarin');
    expect(
      derivePromptPreviewTitle(
        'Create a rigorous 15-lesson undergraduate course titled Introduction to Genetics. For Lesson 3 use the exact reading title “Textbook Chapter: DNA Structure and Replication”.',
      ),
    ).toBe('Introduction to Genetics');
    expect(
      derivePromptPreviewTitle(
        'Course title: World Literature Survey\nBuild an 8-week course using Borges’s “The Library of Babel.”',
      ),
    ).toBe('World Literature Survey');
    expect(
      derivePromptPreviewTitle(
        'World Literature: Epic, Drama, Poetry, and Global Fiction. Build an 8-week survey using Borges’s “The Library of Babel.”',
      ),
    ).toBe('World Literature: Epic, Drama, Poetry, and Global Fiction');
    expect(
      derivePromptPreviewTitle(
        'Digital Accessibility for Product Teams, exactly three lessons: 1) WCAG principles; 2) semantic HTML; 3) accessible forms.',
      ),
    ).toBe('Digital Accessibility for Product Teams');
    expect(
      derivePromptPreviewTitle(
        'Digital Accessibility for Product Teams — create exactly 4 lessons: WCAG principles, semantic HTML, accessible forms, and evidence-based testing.',
      ),
    ).toBe('Digital Accessibility for Product Teams');
    expect(
      derivePromptPreviewTitle(
        'Build a 6-week undergraduate Community Data Storytelling studio for journalism and public-policy students. Use exactly these six lessons in order: 1) Framing a data question; 2) Data provenance.',
      ),
    ).toBe('Community Data Storytelling Studio');
  });

  it('replaces an instruction-shaped model title with the prompt-derived course identity', () => {
    const prompt =
      'Build a 6-week undergraduate Community Data Storytelling studio for journalism and public-policy students. Use exactly these six lessons in order: 1) Framing a data question; 2) Data provenance.';

    expect(
      repairGeneratedCourseTitle(
        'Build a 6-week undergraduate Community Data Storytelling studio for journalism and public-policy students. Use exactly',
        prompt,
      ),
    ).toBe('Community Data Storytelling Studio');
    expect(repairGeneratedCourseTitle('Community Data Storytelling Studio', prompt)).toBe(
      'Community Data Storytelling Studio',
    );
    expect(repairGeneratedCourseTitle('Course', prompt)).toBe('Community Data Storytelling Studio');
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
