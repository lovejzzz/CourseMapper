import { describe, expect, it } from 'vitest';
import { buildLessonIdentityIssues } from '../packageFinalizer';
describe('package lesson identity', () => {
  it('retains a review-day quiz alongside the exam paper', () => {
    const courseMap = { lessons: [{ title: 'Lesson 1: Final Exam Review' }] };
    const exam = {
      kind: 'exam',
      assessmentId: 'final',
      lessonNumber: 1,
      lessonTitle: 'Final Exam',
      examScope: 'Covers Lesson 1.',
    };
    const check = (quizzes) =>
      buildLessonIdentityIssues({ courseMap, deliverables: { quizBank: { status: 'done', data: { quizzes } } } });
    expect(check([{ lessonNumber: 1, lessonTitle: courseMap.lessons[0].title }, exam])).toEqual([]);
    expect(check([exam])).toHaveLength(1);
  });

  it('accepts a separate final exam without treating it as an extra weekly lesson', () => {
    const lessons = [{ title: 'Lesson 1: Variables' }, { title: 'Lesson 2: Functions' }];
    const quizzes = lessons.map((lesson, i) => ({ lessonTitle: lesson.title, lessonNumber: i + 1 }));
    const exam = {
      kind: 'exam',
      assessmentId: 'final',
      lessonNumber: 2,
      lessonTitle: 'Final exam',
      examScope: 'Covers Lessons 1–2.',
    };
    const check = (items) =>
      buildLessonIdentityIssues({
        courseMap: { lessons },
        deliverables: { quizBank: { status: 'done', data: { quizzes: items } } },
      });
    expect(check([...quizzes, exam])).toEqual([]);
    expect(check([quizzes[0], exam])).toHaveLength(1);
    expect(check([...quizzes, { ...exam, lessonNumber: 3 }])).toHaveLength(1);
    expect(check([quizzes[1], quizzes[0], exam])).toHaveLength(2);
    expect(check([...quizzes, quizzes[0]])).toHaveLength(1);
  });
  it('allows an exam to replace the weekly quiz on an explicitly named exam day', () => {
    const issues = buildLessonIdentityIssues({
      courseMap: { lessons: [{ title: 'Lesson 1: Variables' }, { title: 'Lesson 2: Final exam' }] },
      deliverables: {
        quizBank: {
          status: 'done',
          data: {
            quizzes: [
              { lessonTitle: 'Lesson 1: Variables', lessonNumber: 1 },
              {
                kind: 'exam',
                assessmentId: 'final',
                lessonNumber: 2,
                lessonTitle: 'Final exam',
                examScope: 'Covers Lessons 1–2.',
              },
            ],
          },
        },
      },
    });
    expect(issues).toEqual([]);
  });
});
