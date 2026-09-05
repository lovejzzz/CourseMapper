import type { Activity, Calculation, Course, Issue, Lesson, LessonDraft, Source } from './domain';
import { verifyAnswer } from './answer';

function median(values: number[]): number {
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}
export function calculate(operation: Calculation['operation'], values: number[]): number {
  if (!values.length || values.some((v) => !Number.isFinite(v))) throw new Error('A calculation needs finite data.');
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  switch (operation) {
    case 'count':
      return values.length;
    case 'sum':
      return sum;
    case 'mean':
      return sum / values.length;
    case 'median':
      return median(sorted);
    case 'minimum':
      return sorted[0];
    case 'maximum':
      return sorted.at(-1)!;
    case 'range':
      return sorted.at(-1)! - sorted[0];
    case 'proportion': {
      if (values.length !== 2 || values[1] <= 0 || values[0] < 0 || values[0] > values[1])
        throw new Error('Proportion data must be [part, total] with 0 ≤ part ≤ total and total > 0.');
      return values[0] / values[1];
    }
    case 'iqr':
    case 'upperFence': {
      if (values.length < 4) throw new Error('At least four observations are required for quartiles.');
      // Median of halves; exclude the central observation for odd n.
      const q1 = median(sorted.slice(0, Math.floor(sorted.length / 2)));
      const q3 = median(sorted.slice(Math.ceil(sorted.length / 2)));
      return operation === 'iqr' ? q3 - q1 : q3 + 1.5 * (q3 - q1);
    }
  }
}

export function lessonMinutes(lesson: LessonDraft): number {
  return (
    lesson.teachingMinutes +
    lesson.activities.reduce((n, a) => n + a.minutes, 0) +
    lesson.debriefMinutes +
    lesson.exitTicket.minutes
  );
}

type NumericBlock = Pick<Activity, 'datasets' | 'calculations'>;
function verifyEvidence(ref: Activity['evidence'][number], sources: Record<string, Source>): string[] {
  const source = sources[ref.sourceId];
  if (!source?.text.includes(ref.quote))
    return [`Use an exact quote from source ${ref.sourceId}; this quote is not present: ${ref.quote.slice(0, 100)}`];
  if (ref.sourceVersion !== undefined && ref.sourceVersion !== source.version)
    return [`Source ${ref.sourceId} changed after this evidence was selected.`];
  if (
    (ref.start !== undefined || ref.end !== undefined) &&
    (ref.start === undefined || ref.end === undefined || source.text.slice(ref.start, ref.end) !== ref.quote)
  )
    return [`Evidence offsets do not identify the quoted text in ${ref.sourceId}.`];
  return [];
}
export function unfinishedContent(...values: string[]): boolean {
  return /\[(?:insert|provide|identify|explain|add)\b[^\]]*\]|\b(?:insert (?:sample|text|data)|placeholder|lorem ipsum)\b|此处为|而非具体内容|学生需自行|教师自行(?:编写|补充)|待补充|自行填写材料/i.test(
    values.join('\n'),
  );
}
function unfinishedPrompt(value: string): boolean {
  // Student-facing sentence frames deliberately leave the reasoning to the
  // learner. Missing source passages or missing answers are still failures.
  return unfinishedContent(
    value.replace(
      /\[(?:insert|provide|identify|explain|add)\b(?!\s+(?:sample|source|passage|data|figure|table|handout|task|question)\b)[^\]]*\]/gi,
      'student response',
    ),
  );
}
function verifyMaterial(
  block: Pick<Activity, 'material' | 'materialOrigin'>,
  sources: Record<string, Source>,
  allowFictional: boolean,
): string[] {
  const origin = block.materialOrigin;
  if (!origin) return [];
  if (origin.kind === 'fictional') return allowFictional ? [] : ['New fictional material was not permitted.'];
  const errors = origin.refs.flatMap((ref) => verifyEvidence(ref, sources));
  if (
    origin.kind === 'source' &&
    (!origin.refs.length || block.material !== origin.refs.map((ref) => ref.quote).join('\n\n'))
  )
    errors.push('Supplied source material must match its selected original spans.');
  return errors;
}

export function sameTask(first: string, second: string): boolean {
  const normalized = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();
  return normalized(first) === normalized(second);
}

export function verifyIndependentTask(
  previous: Pick<Activity, 'prompt' | 'datasets' | 'calculations'>,
  next: Pick<Activity, 'prompt' | 'datasets' | 'calculations'>,
  allowFictional: boolean,
): string[] {
  if (sameTask(previous.prompt, next.prompt))
    return ['This repeats the earlier question. Create a different problem that requires independent application.'];
  const solved = next.calculations.every((calculation) => {
    const dataset = next.datasets.find((data) => data.id === calculation.dataset);
    return (
      dataset &&
      previous.calculations.some((earlier) => {
        const data = previous.datasets.find((data) => data.id === earlier.dataset);
        return (
          earlier.operation === calculation.operation &&
          data?.kind === dataset.kind &&
          JSON.stringify(data.values) === JSON.stringify(dataset.values)
        );
      })
    );
  });
  if (allowFictional && next.calculations.length && solved)
    return [
      'This task only requests numerical results already solved in an earlier example or task. Use changed fictional data and a new interpretation; changing the title or selecting a subset of solved datasets is insufficient.',
    ];
  return [];
}

export function calculationResults(activity: NumericBlock): { key: string; value: number; label: string }[] {
  return activity.calculations.map((check) => {
    const dataset = activity.datasets.find((d) => d.id === check.dataset);
    if (!dataset) throw new Error(`Unknown calculation dataset ${check.dataset}.`);
    if ((check.operation === 'proportion') !== (dataset.kind === 'part-total'))
      throw new Error(
        `Use proportion only for part-total data, and other operations only for observations (${dataset.id}).`,
      );
    return {
      key: `${dataset.id}.${check.operation}`,
      value: calculate(check.operation, dataset.values),
      label: `${dataset.label} · ${check.operation}`,
    };
  });
}

// Computed answer values have one authority. Editing a dataset updates these
// tokens everywhere without asking the model to rewrite the instructor's prose.
export function resolveCalculations(value: string, activity: NumericBlock): string {
  const results = calculationResults(activity);
  return value.replace(/\{\{([a-z][a-z0-9_]*\.[a-zA-Z]+)\}\}/g, (_match, key: string) => {
    const result = results.find((r) => r.key === key);
    if (!result) throw new Error(`Unknown answer token ${key}.`);
    return String(Number(result.value.toFixed(8)));
  });
}

export function verifyNumericBlock(block: NumericBlock, answer: string): string[] {
  const issues: string[] = [];
  try {
    const results = calculationResults(block);
    resolveCalculations(answer, block);
    for (const [index, result] of results.entries()) {
      const claimed = block.calculations[index].expected;
      if (Math.abs(claimed - result.value) > Math.max(1e-6, Math.abs(result.value) * 1e-6)) {
        const check = block.calculations[index];
        const data = block.datasets.find((d) => d.id === check.dataset)!;
        const computation =
          check.operation === 'mean'
            ? ` Sum(${data.values.join(', ')}) = ${calculate('sum', data.values)}; count = ${data.values.length}; mean = ${calculate('sum', data.values)} / ${data.values.length} = ${result.value}.`
            : '';
        issues.push(
          `${result.key}: the independently calculated answer is ${result.value}, not ${claimed}.${computation} Correct the answer and its reasoning.`,
        );
      }
    }
    if (new Set(results.map((r) => r.key)).size !== results.length) issues.push('Duplicate calculation requests.');
    if (new Set(block.datasets.map((d) => d.id)).size !== block.datasets.length) issues.push('Duplicate dataset IDs.');
  } catch (error) {
    issues.push((error as Error).message);
  }
  return issues;
}

export function verifyActivity(activity: Activity, sources: Record<string, Source>, allowFictional: boolean): string[] {
  const phaseLabels =
    /(?:^|[\n。；])\s*(?:(?:第[一二三四1234]部分|任务[一二三四1234]|part\s+\d+)\s*[：:.、(（]?\s*)?(指导练习|引导练习|独立任务|独立练习|guided\s+(?:practice|task)|independent\s+(?:practice|task))/gim;
  const phases = [...activity.prompt.matchAll(phaseLabels)].map((match) => match[1]);
  const containsOtherPhase = phases.some((label) =>
    activity.kind === 'guided' ? /独立|independent/i.test(label) : /指导|引导|guided/i.test(label),
  );
  const issues = verifyNumericBlock(activity, [activity.answer, ...activity.reasoning].join('\n'));
  if (containsOtherPhase)
    issues.push(
      `Return only this ${activity.kind} activity. Its prompt currently contains another named guided/independent phase; remove that entire extra task and keep the matching answer and rubric for this activity only.`,
    );
  issues.push(...verifyAnswer(activity));
  issues.push(...verifyMaterial(activity, sources, allowFictional));
  const placeholders =
    /学生(?:需|应)?(?:自行|独立)完成.{0,30}(?:教师|检查|分析)|学生需自行|教师自行(?:编写|补充)|\b(?:students? (?:will|should) complete (?:the |their )?(?:answer|analysis)|answers? (?:will|may) vary\.?$|insert (?:text|data)|placeholder|lorem ipsum)\b/i;
  if (
    placeholders.test([activity.material, activity.prompt, activity.answer].join('\n')) ||
    unfinishedContent(activity.material, activity.answer, ...activity.reasoning) ||
    unfinishedPrompt(activity.prompt)
  )
    issues.push('Replace placeholder material/answers with the full actual input and an explicit model response.');
  if (!activity.evidence.length && !allowFictional) issues.push('This task needs evidence from a supplied source.');
  for (const ref of activity.evidence) {
    issues.push(...verifyEvidence(ref, sources));
  }
  for (const value of [activity.hint, ...activity.feedback.flatMap((f) => [f.error, f.diagnosis, f.nextStep])]) {
    try {
      resolveCalculations(value, activity);
    } catch (error) {
      issues.push((error as Error).message);
    }
  }
  return issues;
}

export function verifyTeaching(
  lesson: Omit<LessonDraft, 'activities'>,
  sources: Record<string, Source>,
  allowFictional: boolean,
): Issue[] {
  const issues: Issue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message, severity: 'block' as const });
  if (
    unfinishedContent(
      lesson.explanation,
      lesson.workedExample.material,
      lesson.workedExample.prompt,
      lesson.workedExample.answer,
      ...lesson.workedExample.steps,
      lesson.exitTicket.prompt,
      lesson.exitTicket.answer,
    )
  )
    add('unfinished-teaching', 'The explanation, example or exit ticket contains unfinished content.');
  for (const message of verifyNumericBlock(
    lesson.workedExample,
    [lesson.workedExample.answer, ...lesson.workedExample.steps].join('\n'),
  ))
    add('worked-answer', message);
  for (const message of verifyNumericBlock(lesson.exitTicket, lesson.exitTicket.answer)) add('exit-answer', message);
  for (const message of verifyAnswer(lesson.workedExample)) add('worked-response-length', message);
  const evidenceGroups = [lesson.workedExample];
  for (const group of evidenceGroups) {
    for (const message of verifyMaterial(group, sources, allowFictional)) add('material-origin', message);
    for (const ref of group.evidence) {
      for (const message of verifyEvidence(ref, sources)) add('source-quote', message);
    }
    if (!group.evidence.length && !allowFictional)
      add(
        'unsupported-material',
        'A task or worked example has no source evidence, and fictional material is not allowed.',
      );
  }
  return issues;
}

export function verifyLesson(
  lesson: LessonDraft,
  sources: Record<string, Source>,
  minutes: number,
  allowFictional: boolean,
): Issue[] {
  const issues: Issue[] = [];
  const add = (code: string, message: string, severity: 'block' | 'review' = 'block', taskId?: string) =>
    issues.push({ code, message, severity, taskId });
  if (lessonMinutes(lesson) !== minutes)
    add('timing', `Lesson totals ${lessonMinutes(lesson)} minutes; required ${minutes}.`);
  if (!lesson.activities.some((a) => a.kind === 'independent' || a.kind === 'transfer'))
    add('independent-work', 'No independent or transfer task.');
  issues.push(...verifyTeaching(lesson, sources, allowFictional));
  const seen = new Set<string>();
  for (const activity of lesson.activities) {
    const taskId = 'id' in activity ? String(activity.id) : undefined;
    for (const message of verifyActivity(activity, sources, allowFictional))
      add('task-contract', message, 'block', taskId);
    const fingerprint = activity.prompt.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(fingerprint)) add('duplicate-task', `Repeated task: ${activity.title}`, 'block', taskId);
    seen.add(fingerprint);
    if (new Set(activity.datasets.map((d) => d.id)).size !== activity.datasets.length)
      add('duplicate-dataset', 'Dataset IDs must be distinct within a task.', 'block', taskId);
    const operations = new Set<string>();
    for (const check of activity.calculations) {
      const key = `${check.dataset}.${check.operation}`;
      if (operations.has(key)) add('duplicate-calculation', `Repeated calculation ${key}.`, 'block', taskId);
      operations.add(key);
    }
    try {
      calculationResults(activity);
      for (const value of [
        activity.answer,
        ...activity.reasoning,
        activity.hint,
        ...activity.feedback.flatMap((f) => [f.error, f.diagnosis, f.nextStep]),
      ])
        resolveCalculations(value, activity);
    } catch (error) {
      add('numeric-input', (error as Error).message, 'block', taskId);
    }
    if (
      /\b(?:insert (?:text|data)|placeholder|lorem ipsum|Record A.*objective)\b|待补充|自行填写材料/i.test(
        activity.material + '\n' + activity.prompt,
      )
    )
      add('placeholder', `Unfinished material in ${activity.title}.`, 'block', taskId);
    if (activity.datasets.length && !activity.calculations.length)
      add('unchecked-numbers', `${activity.title}: numeric data have no executable answer checks.`, 'review', taskId);
  }
  return issues;
}

export function auditCourse(course: Course): Issue[] {
  const issues: Issue[] = [];
  if (!course.plan) return [{ severity: 'block', code: 'no-plan', message: 'Course planning is incomplete.' }];
  if (
    course.lessonOrder.length !== course.brief.lessonCount ||
    new Set(course.lessonOrder).size !== course.lessonOrder.length
  )
    issues.push({
      severity: 'block',
      code: 'lesson-order',
      message: 'Course lesson order is incomplete or contains duplicates.',
    });
  const covered = new Set(course.plan.lessons.flatMap((l) => l.goalIndices));
  course.plan.goals.forEach((_, i) => {
    if (!covered.has(i))
      issues.push({ severity: 'block', code: 'goal-coverage', message: `Goal ${i + 1} has no planned lesson.` });
  });
  for (const lessonId of course.lessonOrder) {
    const planIndex = course.planLessonIds.indexOf(lessonId);
    const spec = course.plan.lessons[planIndex];
    if (
      spec?.buildsOn.some(
        (i) => course.lessonOrder.indexOf(course.planLessonIds[i]) >= course.lessonOrder.indexOf(lessonId),
      )
    )
      issues.push({
        severity: 'review',
        code: 'prerequisite-order',
        lessonId,
        message: 'This lesson now appears before one of its planned prerequisites. Check the learning sequence.',
      });
    const lesson = course.lessons[lessonId];
    if (!lesson) {
      issues.push({
        severity: 'block',
        code: 'missing-lesson',
        lessonId,
        message: 'This lesson has not been generated.',
      });
      continue;
    }
    issues.push(
      ...verifyLesson(lesson, course.sources, course.brief.minutesPerLesson, course.brief.allowFictional).map((i) => ({
        ...i,
        lessonId,
      })),
    );
    if (lessonId === course.planLessonIds.at(-1)) {
      for (const task of lesson.activities.filter((a) => a.kind === 'independent' || a.kind === 'transfer'))
        for (const message of verifyAnswer(task, course.brief.description))
          issues.push({ severity: 'block', code: 'final-product-length', lessonId, taskId: task.id, message });
    }
    for (const [sourceId, version] of Object.entries(lesson.sourceVersions)) {
      if (course.sources[sourceId]?.version !== version)
        issues.push({
          severity: 'block',
          code: 'stale-source',
          lessonId,
          message: 'Source material changed. Review and update the dependent lesson.',
        });
    }
    if (lesson.review !== 'approved')
      for (const finding of lesson.pedagogy?.issues ?? [])
        issues.push({
          severity: 'review',
          code: 'pedagogy-review',
          lessonId,
          message: `Model review suggestion — ${finding.explanation}\n“${finding.quote}”\n${finding.correction}`,
        });
    if (lesson.review !== 'approved')
      issues.push({
        severity: 'review',
        code: 'teacher-review',
        lessonId,
        message: 'An instructor must check accuracy, difficulty, alignment and classroom feasibility.',
      });
  }
  return issues;
}

export function approveLesson(course: Course, lesson: Lesson): Lesson {
  const blocks = verifyLesson(
    lesson,
    course.sources,
    course.brief.minutesPerLesson,
    course.brief.allowFictional,
  ).filter((i) => i.severity === 'block');
  if (blocks.length) throw new Error(blocks.map((i) => i.message).join('\n'));
  if (lesson.id === course.planLessonIds.at(-1)) {
    const errors = lesson.activities
      .filter((a) => a.kind === 'independent' || a.kind === 'transfer')
      .flatMap((a) => verifyAnswer(a, course.brief.description));
    if (errors.length) throw new Error(errors.join('\n'));
  }
  if (Object.entries(lesson.sourceVersions).some(([id, v]) => course.sources[id]?.version !== v))
    throw new Error('Source versions changed. Update the lesson before approval.');
  return { ...lesson, review: 'approved', version: lesson.version + 1 };
}
