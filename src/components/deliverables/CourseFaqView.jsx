import React, { useMemo, useState } from 'react';
import { normalizeCourseFaqCategories } from '../../lib/deliverablePostProcess';
import { renderedDeliverableCollectionKey } from '../../lib/renderedDeliverableCollection.js';
import { CollapsibleCard, E, EmptyState, SectionHeading, StreamingBanner } from './shared/SharedComponents';

const CATEGORY_STYLES = {
  'Course Logistics': 'bg-sky-50 text-sky-700 border-sky-200',
  'Assignment Clarification': 'bg-orange-50 text-orange-700 border-orange-200',
  'Concept Explanation': 'bg-violet-50 text-violet-700 border-violet-200',
  'Technical Help': 'bg-slate-50 text-slate-700 border-slate-200',
  'Assessment Prep': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  General: 'bg-cyan-50 text-cyan-700 border-cyan-200',
};

const DIFFICULTY_STYLES = {
  Basic: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Intermediate: 'bg-amber-50 text-amber-700 border-amber-200',
  Advanced: 'bg-rose-50 text-rose-700 border-rose-200',
};

function slugify(value) {
  return String(value || 'general')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function pickQuestionField(question, keys, fallback = '') {
  const key = keys.find((candidate) => question?.[candidate] !== undefined);
  return { key: key || keys[0], value: key ? question[key] : fallback };
}

function normalizeCourseFaq(data) {
  const rootKey = renderedDeliverableCollectionKey('courseFaq', data);
  const lessons = asArray(data?.[rootKey]);

  return lessons.map((lesson, lessonIndex) => {
    const questionsKey = lesson?.qs ? 'qs' : lesson?.questions ? 'questions' : 'qs';
    const tagsKey = lesson?.tg ? 'tg' : lesson?.tags ? 'tags' : 'tg';
    const titleField = lesson?.lt !== undefined ? 'lt' : lesson?.lessonTitle !== undefined ? 'lessonTitle' : 'title';
    const title = lesson?.[titleField] || `Lesson ${lessonIndex + 1}`;
    const questions = asArray(lesson?.[questionsKey]).map((question, questionIndex) => {
      const q = pickQuestionField(question, ['q', 'question']);
      const answer = pickQuestionField(question, ['an', 'a', 'answer']);
      const category = pickQuestionField(question, ['ca', 'category'], 'General');
      const related = pickQuestionField(question, ['rc', 'relatedConcepts', 'concepts'], []);
      const difficulty = pickQuestionField(question, ['df', 'difficulty'], '');

      return {
        raw: question,
        questionIndex,
        question: q.value || `Question ${questionIndex + 1}`,
        answer: answer.value || '',
        category: category.value || 'General',
        relatedConcepts: asArray(related.value),
        difficulty: difficulty.value || '',
        paths: {
          question: [rootKey, lessonIndex, questionsKey, questionIndex, q.key],
          answer: [rootKey, lessonIndex, questionsKey, questionIndex, answer.key],
          category: [rootKey, lessonIndex, questionsKey, questionIndex, category.key],
          difficulty: [rootKey, lessonIndex, questionsKey, questionIndex, difficulty.key],
        },
      };
    });

    return {
      raw: lesson,
      lessonIndex,
      title,
      titlePath: [rootKey, lessonIndex, titleField],
      tags: asArray(lesson?.[tagsKey]),
      tagsPath: [rootKey, lessonIndex, tagsKey],
      questions,
    };
  });
}

function textMatchesQuery(lesson, question, query) {
  if (!query) return true;
  const haystack = [
    lesson.title,
    question.question,
    question.answer,
    question.category,
    question.difficulty,
    ...question.relatedConcepts,
    ...lesson.tags,
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

function Pill({ children, className = '' }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-bold ${className}`}>{children}</span>
  );
}

export default function CourseFaqView({
  data,
  isStreaming,
  regeneratingIndex,
  onRegenerateLesson,
  onEdit,
  freshLessonIndices,
}) {
  const [activeCategory, setActiveCategory] = useState('All');
  const [query, setQuery] = useState('');
  const normalizedData = useMemo(() => normalizeCourseFaqCategories(data).data, [data]);
  const lessons = useMemo(() => normalizeCourseFaq(normalizedData), [normalizedData]);
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedData && isStreaming) return <StreamingBanner />;
  if (!normalizedData || lessons.length === 0) return <EmptyState featureId="courseFaq" />;

  const categoryCounts = lessons.reduce((counts, lesson) => {
    lesson.questions.forEach((question) => {
      counts.set(question.category, (counts.get(question.category) || 0) + 1);
    });
    return counts;
  }, new Map());
  const totalQuestions = Array.from(categoryCounts.values()).reduce((sum, count) => sum + count, 0);
  const categories = ['All', ...Array.from(categoryCounts.keys()).sort()];
  const filteredLessons = lessons
    .map((lesson) => ({
      ...lesson,
      questions: lesson.questions.filter((question) => {
        const categoryMatches = activeCategory === 'All' || question.category === activeCategory;
        return categoryMatches && textMatchesQuery(lesson, question, normalizedQuery);
      }),
    }))
    .filter((lesson) => lesson.questions.length > 0);

  return (
    <div data-testid="course-faq-view" className="space-y-4 p-4">
      <div className="glass rounded-squircle-xs border border-cyan-100/70 px-4 py-3">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2 text-center sm:w-[360px]">
            <div className="rounded-lg border border-cyan-100 bg-cyan-50/70 px-3 py-2">
              <p className="text-xs font-semibold text-slate-500">Lessons</p>
              <p className="mt-1 text-lg font-bold text-slate-800">{lessons.length}</p>
            </div>
            <div className="rounded-lg border border-cyan-100 bg-white/70 px-3 py-2">
              <p className="text-xs font-semibold text-slate-500">Questions</p>
              <p className="mt-1 text-lg font-bold text-slate-800">{totalQuestions}</p>
            </div>
            <div className="rounded-lg border border-cyan-100 bg-white/70 px-3 py-2">
              <p className="text-xs font-semibold text-slate-500">Categories</p>
              <p className="mt-1 text-lg font-bold text-slate-800">{categoryCounts.size}</p>
            </div>
          </div>
          <label className="relative block min-w-0 w-full">
            <span className="sr-only">Search Course FAQ</span>
            <input
              data-testid="course-faq-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search questions, answers, or topics"
              className="w-full rounded-xl border border-cyan-100 bg-white/80 px-3 py-2 text-xs font-medium text-slate-700 outline-none transition-all placeholder:text-slate-300 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
            />
          </label>
        </div>

        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {categories.map((category) => {
            const isActive = activeCategory === category;
            const count = category === 'All' ? totalQuestions : categoryCounts.get(category);
            return (
              <button
                key={category}
                type="button"
                data-testid={`course-faq-category-${slugify(category)}`}
                onClick={() => setActiveCategory(category)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition-all ${
                  isActive
                    ? 'border-cyan-300 bg-cyan-500 text-white shadow-sm'
                    : 'border-slate-200 bg-white/70 text-slate-500 hover:border-cyan-200 hover:text-cyan-700'
                }`}
              >
                {category} <span className={isActive ? 'text-cyan-100' : 'text-slate-300'}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {filteredLessons.length > 0 ? (
        filteredLessons.map((lesson) => (
          <CollapsibleCard
            viewportIndex={lesson.lessonIndex}
            key={lesson.lessonIndex}
            title={lesson.title}
            subtitle={`${lesson.questions.length} question${lesson.questions.length === 1 ? '' : 's'}`}
            defaultOpen={lesson.lessonIndex < 3}
            accent="cyan"
            regenerating={regeneratingIndex === lesson.lessonIndex}
            fresh={!!freshLessonIndices?.has(lesson.lessonIndex)}
            onRegenerate={onRegenerateLesson && !isStreaming ? () => onRegenerateLesson(lesson.lessonIndex) : undefined}
            onTitleEdit={onEdit ? (nextTitle) => onEdit(lesson.titlePath, nextTitle) : undefined}
          >
            <div className="space-y-4 pt-3">
              {lesson.tags.length > 0 && (
                <div>
                  <SectionHeading>LMS Keywords</SectionHeading>
                  <div className="flex flex-wrap gap-1.5">
                    {lesson.tags.map((tag, tagIndex) => (
                      <button
                        key={`${tag}-${tagIndex}`}
                        type="button"
                        onClick={() => setQuery(String(tag))}
                        className="rounded-full border border-cyan-100 bg-cyan-50/70 px-2 py-0.5 text-xs font-semibold text-cyan-700 hover:border-cyan-200 hover:bg-cyan-100"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-3">
                {lesson.questions.map((question) => (
                  <article
                    key={question.questionIndex}
                    data-testid="course-faq-question"
                    className="rounded-xl border border-slate-200/70 bg-white/80 p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Pill className={CATEGORY_STYLES[question.category] || CATEGORY_STYLES.General}>
                        <E value={question.category} path={question.paths.category} onEdit={onEdit} />
                      </Pill>
                      {question.difficulty && (
                        <Pill
                          className={
                            DIFFICULTY_STYLES[question.difficulty] || 'bg-slate-50 text-slate-600 border-slate-200'
                          }
                        >
                          <E value={question.difficulty} path={question.paths.difficulty} onEdit={onEdit} />
                        </Pill>
                      )}
                    </div>

                    <h4 className="mt-3 text-sm font-bold leading-snug text-slate-800">
                      <E value={question.question} path={question.paths.question} onEdit={onEdit} multiline />
                    </h4>
                    {question.answer && (
                      <p className="mt-2 text-xs leading-relaxed text-slate-600">
                        <E value={question.answer} path={question.paths.answer} onEdit={onEdit} multiline />
                      </p>
                    )}

                    {question.relatedConcepts.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {question.relatedConcepts.map((concept, conceptIndex) => (
                          <span
                            key={`${concept}-${conceptIndex}`}
                            className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500"
                          >
                            {concept}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </div>
          </CollapsibleCard>
        ))
      ) : (
        <div className="glass rounded-squircle-sm p-8 text-center text-sm font-medium text-slate-400">
          No FAQ entries match the current filters.
        </div>
      )}
    </div>
  );
}
