import type { Course, Lesson } from './domain';
type Activity = Lesson['activities'][number];
import { referenceKey, referenceText, type FieldReference } from './references';
import { auditCourse, calculationResults, resolveCalculations } from './verify';
import { materialLabel } from './material';

export const MATERIALS = [
  { id: 'courseMap', en: 'Course map', zh: '课程地图' },
  { id: 'syllabus', en: 'Syllabus', zh: '课程大纲' },
  { id: 'lessonPlans', en: 'Lesson plans', zh: '教学方案' },
  { id: 'slideDecks', en: 'Slide decks', zh: '教学幻灯片' },
  { id: 'assignments', en: 'Assignments', zh: '学习作业' },
  { id: 'rubrics', en: 'Rubrics', zh: '评分标准' },
  { id: 'discussions', en: 'Discussions', zh: '讨论指南' },
  { id: 'quizBank', en: 'Question bank', zh: '练习题库' },
  { id: 'studyGuides', en: 'Study guide', zh: '学习指南' },
  { id: 'courseFaq', en: 'Course FAQ', zh: '课程答疑' },
  { id: 'student', en: 'Student workbook', zh: '学生学习手册' },
  { id: 'teacher', en: 'Instructor guide', zh: '教师教学指南' },
  { id: 'sourceReader', en: 'Source reader', zh: '原始资料集' },
] as const;
export type MaterialKind = (typeof MATERIALS)[number]['id'];
export type MaterialCell = { text: string; reference?: FieldReference };
export type MaterialBlock = {
  id: string;
  type: 'title' | 'heading' | 'subheading' | 'body' | 'table' | 'page' | 'space';
  text: string;
  reference?: FieldReference;
  rows?: MaterialCell[][];
  headers?: string[];
  lines?: number;
};
export type MaterialDocument = {
  kind: MaterialKind;
  title: string;
  subtitle: string;
  language: 'en' | 'zh';
  revision: number;
  audience: 'student' | 'teacher';
  blocks: MaterialBlock[];
};
export function materialTitle(kind: MaterialKind, language: 'en' | 'zh'): string {
  return MATERIALS.find((material) => material.id === kind)![language];
}

// Every editable block points to a canonical field. Documents never store a
// second copy of a task, answer or rubric; changes propagate by projection.
export function materialDocument(
  course: Course,
  kind: MaterialKind,
  audience: 'student' | 'teacher' = 'student',
): MaterialDocument {
  if (!course.plan) throw new Error('Plan a course before opening its materials.');
  const teacher = kind !== 'slideDecks' && (kind === 'teacher' || kind === 'lessonPlans' || audience === 'teacher');
  const t = (en: string, zh: string) => (course.brief.language === 'zh' ? zh : en);
  const blocks: MaterialBlock[] = [];
  const add = (type: MaterialBlock['type'], text: string, reference?: FieldReference) => {
    blocks.push({
      id: `${kind}:${reference ? referenceKey(reference) : type}:${blocks.length}`,
      type,
      text,
      reference,
    });
  };
  const field = (reference: FieldReference, type: MaterialBlock['type'] = 'body', value?: string) =>
    add(type, value ?? referenceText(course, reference), reference);
  const planField = (name: string) => field({ kind: 'plan', path: [name] });
  const lessonRef = (lesson: Lesson, ...path: (string | number)[]): FieldReference => ({
    kind: 'lesson',
    lessonId: lesson.id,
    path,
  });
  const taskRef = (lesson: Lesson, task: Activity, ...path: (string | number)[]): FieldReference => ({
    kind: 'task',
    lessonId: lesson.id,
    taskId: task.id!,
    path,
  });
  const lf = (lesson: Lesson, ...path: (string | number)[]) => field(lessonRef(lesson, ...path));
  const af = (lesson: Lesson, task: Activity, name: string) =>
    field(taskRef(lesson, task, name), 'body', resolveCalculations(String(task[name as keyof Activity]), task));
  const table = (headers: string[], rows: MaterialCell[][]) =>
    blocks.push({ id: `${kind}:table:${blocks.length}`, type: 'table', text: '', headers, rows });
  const section = (lesson: Lesson, index: number) => {
    if (blocks.length > 5) add('page', '');
    add('heading', `${index + 1}. ${lesson.title}`, lessonRef(lesson, 'title'));
    lf(lesson, 'objective');
  };
  const materials = (lesson: Lesson, part: Lesson['workedExample'] | Activity) => {
    add('subheading', t('Materials', '任务材料'));
    add('body', materialLabel(part.materialOrigin, course.sources, course.brief.language));
    if ('id' in part && part.id) field(taskRef(lesson, part as Activity, 'material'));
    else lf(lesson, 'workedExample', 'material');
    for (const dataset of part.datasets) {
      add('subheading', dataset.label);
      add('body', dataset.values.join(' · '));
    }
  };
  const rubric = (lesson: Lesson, task: Activity) => {
    table(
      [
        t('Criterion', '评价维度'),
        t('Points', '分值'),
        t('Full credit', '满分'),
        t('Partial credit', '部分得分'),
        t('No credit', '不得分'),
      ],
      task.rubric.map((criterion, index) => [
        { text: criterion.criterion, reference: taskRef(lesson, task, 'rubric', index, 'criterion') },
        { text: String(criterion.points) },
        ...(['fullCredit', 'partialCredit', 'noCredit'] as const).map((key) => ({
          text: criterion[key],
          reference: taskRef(lesson, task, 'rubric', index, key),
        })),
      ]),
    );
  };
  const answer = (lesson: Lesson, task: Activity) => {
    add('subheading', t('Answer and reasoning', '参考答案与推理'));
    if (task.answerParts?.length)
      task.answerParts.forEach((part, index) => {
        field(taskRef(lesson, task, 'answerParts', index, 'title'), 'subheading');
        field(taskRef(lesson, task, 'answerParts', index, 'text'), 'body', resolveCalculations(part.text, task));
      });
    else af(lesson, task, 'answer');
    task.reasoning.forEach((step, index) =>
      field(taskRef(lesson, task, 'reasoning', index), 'body', resolveCalculations(step, task)),
    );
    if (task.calculations.length) {
      add('subheading', t('Checked calculations', '计算核验结果'));
      calculationResults(task).forEach((result) => add('body', `${result.label}: ${Number(result.value.toFixed(8))}`));
    }
  };
  const feedback = (lesson: Lesson, task: Activity) => {
    add('subheading', t('Responding to common errors', '常见错误与反馈'));
    for (const [index, item] of task.feedback.entries()) {
      field(taskRef(lesson, task, 'feedback', index, 'error'), 'subheading', resolveCalculations(item.error, task));
      field(taskRef(lesson, task, 'feedback', index, 'diagnosis'), 'body', resolveCalculations(item.diagnosis, task));
      field(taskRef(lesson, task, 'feedback', index, 'nextStep'), 'body', resolveCalculations(item.nextStep, task));
    }
  };
  const practice = (lesson: Lesson, task: Activity, index: number) => {
    add('subheading', `${t('Task', '任务')} ${index + 1} · ${task.title}`, taskRef(lesson, task, 'title'));
    materials(lesson, task);
    af(lesson, task, 'prompt');
    add('subheading', t('What to submit', '提交要求'));
    af(lesson, task, 'product');
    add('subheading', t('Assessment criteria', '评价标准'));
    rubric(lesson, task);
    if (teacher) {
      answer(lesson, task);
      feedback(lesson, task);
    } else
      blocks.push({
        id: `${kind}:${task.id}:response`,
        type: 'space',
        text: t(
          `Your response · ${task.title} — continue on a separate sheet if needed.`,
          `作答区 · ${task.title} — 如有需要，请另附纸张继续作答。`,
        ),
        lines: Math.min(
          26,
          Math.max(
            6,
            Math.ceil(
              (task.answerParts ?? []).reduce(
                (sum, part) => sum + (part.length ? part.length.min / (part.length.unit === 'words' ? 12 : 32) : 0),
                0,
              ),
            ),
          ),
        ),
      });
  };
  const worked = (lesson: Lesson) => {
    add('subheading', t('Worked example', '完整示例'));
    materials(lesson, lesson.workedExample);
    lf(lesson, 'workedExample', 'prompt');
    lesson.workedExample.steps.forEach((step, index) =>
      field(
        lessonRef(lesson, 'workedExample', 'steps', index),
        'body',
        resolveCalculations(step, lesson.workedExample),
      ),
    );
    field(
      lessonRef(lesson, 'workedExample', 'answer'),
      'body',
      resolveCalculations(lesson.workedExample.answer, lesson.workedExample),
    );
  };
  const exit = (lesson: Lesson) => {
    add('subheading', t('Exit ticket', '离堂检测'));
    lesson.exitTicket.datasets.forEach((dataset) => {
      add('subheading', dataset.label);
      add('body', dataset.values.join(' · '));
    });
    lf(lesson, 'exitTicket', 'prompt');
    if (teacher) {
      field(
        lessonRef(lesson, 'exitTicket', 'answer'),
        'body',
        resolveCalculations(lesson.exitTicket.answer, lesson.exitTicket),
      );
      lf(lesson, 'exitTicket', 'nextLessonDecision');
    } else blocks.push({ id: `${kind}:${lesson.id}:exit-space`, type: 'space', text: '', lines: 3 });
  };
  field({ kind: 'plan', path: ['title'] }, 'title');
  add('subheading', materialTitle(kind, course.brief.language));
  if (auditCourse(course).length) add('body', t('DRAFT — instructor review required', '草稿 — 需要教师审阅'));
  const lessons = course.lessonOrder.map((id) => course.lessons[id]).filter(Boolean);
  if (kind === 'student' || kind === 'teacher' || kind === 'studyGuides') {
    planField('overview');
    add('heading', t('Before you begin', '课前基础'));
    planField('prerequisites');
    add('heading', t('Learning goals', '学习目标'));
    course.plan.goals.forEach((_, index) => field({ kind: 'plan', path: ['goals', index] }));
    add('heading', t('Final assessment', '课程最终任务'));
    planField('finalProduct');
  }
  if (kind === 'sourceReader') {
    for (const source of Object.values(course.sources)) {
      add('heading', source.title);
      add(
        'body',
        source.kind === 'fictional'
          ? t('Fictional teaching material', '虚构教学材料')
          : t('Provided reading', '已提供资料'),
      );
      field({ kind: 'source', sourceId: source.id, path: ['text'] });
    }
  } else if (kind === 'courseMap' || kind === 'syllabus') {
    planField('overview');
    add('heading', t('Before you begin', '课前基础'));
    planField('prerequisites');
    add('heading', t('Learning goals', '学习目标'));
    course.plan.goals.forEach((_, index) => field({ kind: 'plan', path: ['goals', index] }));
    add('heading', t('Final assessment', '课程最终任务'));
    planField('finalProduct');
    table(
      [
        t('Lesson', '课次'),
        t('Learning objective', '学习目标'),
        t('Practice / evidence of learning', '练习与学习证据'),
        t('Minutes', '分钟'),
      ],
      lessons.map((lesson, index) => [
        { text: `${index + 1}. ${lesson.title}`, reference: lessonRef(lesson, 'title') },
        { text: lesson.objective, reference: lessonRef(lesson, 'objective') },
        {
          text: lesson.activities.find((task) => task.kind === 'independent')!.product,
          reference: taskRef(lesson, lesson.activities.find((task) => task.kind === 'independent')!, 'product'),
        },
        { text: String(course.brief.minutesPerLesson) },
      ]),
    );
  } else if (kind === 'courseFaq') {
    for (const [question, key] of [
      [t('What will I learn?', '这门课学习什么？'), 'overview'],
      [t('What should I know before starting?', '开始前需要哪些基础？'), 'prerequisites'],
      [t('What will I produce?', '我最终要完成什么？'), 'finalProduct'],
    ]) {
      add('heading', question);
      planField(key);
    }
    add('heading', t('How will my work be assessed?', '我的作答如何被评价？'));
    add(
      'body',
      t(
        'Each task includes the criteria used to assess it. Use the criteria to check your reasoning and revise your work before submitting.',
        '每个任务都附有对应的评价标准。请据此检查自己的推理，并在提交前修改作答。',
      ),
    );
    for (const [index, lesson] of lessons.entries()) {
      add(
        'heading',
        t(`What will I be able to do after lesson ${index + 1}?`, `第 ${index + 1} 课结束后，我应能完成什么？`),
      );
      lf(lesson, 'objective');
    }
  } else {
    lessons.forEach((lesson, index) => {
      section(lesson, index);
      if (kind === 'slideDecks') {
        add('subheading', t('Explore the idea', '理解概念'));
        lf(lesson, 'explanation');
        worked(lesson);
        for (const task of lesson.activities) {
          add('subheading', task.title, taskRef(lesson, task, 'title'));
          materials(lesson, task);
          af(lesson, task, 'prompt');
          add('subheading', t('What to submit', '提交要求'));
          af(lesson, task, 'product');
        }
        add('subheading', t('Discuss and compare', '讨论与比较'));
        lf(lesson, 'debrief');
        add('subheading', t('Exit ticket', '离堂检测'));
        lf(lesson, 'exitTicket', 'prompt');
      } else if (kind === 'rubrics') {
        for (const task of lesson.activities) {
          add('subheading', task.title, taskRef(lesson, task, 'title'));
          af(lesson, task, 'product');
          rubric(lesson, task);
        }
      } else if (kind === 'assignments')
        lesson.activities.filter((task) => task.kind === 'independent').forEach((task) => practice(lesson, task, 0));
      else if (kind === 'discussions') {
        add('subheading', t('Discuss and compare', '讨论与比较'));
        lf(lesson, 'debrief');
        if (teacher) {
          for (const task of lesson.activities) feedback(lesson, task);
        }
        exit(lesson);
      } else if (kind === 'quizBank') {
        add(
          'body',
          t(
            'These practice questions also appear in the course. Use them for revision; adapt them before an unseen assessment.',
            '这些练习题也出现在课程中，可用于复习；如需用于未见题测评，请先进行改编。',
          ),
        );
        lesson.activities.forEach((task, ordinal) => practice(lesson, task, ordinal));
        exit(lesson);
      } else {
        if (kind === 'lessonPlans' || teacher) {
          add('subheading', t('Before class', '课前准备'));
          lf(lesson, 'preparation');
          table(
            [t('Minutes', '分钟'), t('Teaching sequence', '教学流程')],
            [
              [lesson.teachingMinutes, t('Explanation and worked example', '概念讲解与示例')],
              ...lesson.activities.map((task) => [task.minutes, task.title]),
              [lesson.debriefMinutes, t('Debrief', '回顾讨论')],
              [lesson.exitTicket.minutes, t('Exit ticket', '离堂检测')],
            ].map((row) => row.map((value) => ({ text: String(value) }))),
          );
        }
        add('subheading', t('Learn', '概念讲解'));
        lf(lesson, 'explanation');
        worked(lesson);
        if (kind !== 'studyGuides') lesson.activities.forEach((task, ordinal) => practice(lesson, task, ordinal));
        add('subheading', t('Reflect', '回顾反思'));
        lf(lesson, 'debrief');
        exit(lesson);
      }
    });
  }
  return {
    kind,
    title: course.plan.title,
    subtitle: materialTitle(kind, course.brief.language),
    language: course.brief.language,
    revision: course.revision,
    audience: teacher ? 'teacher' : 'student',
    blocks,
  };
}
