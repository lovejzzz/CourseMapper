import { taskCopy, taskText } from './teachingTaskCopy.js';
/** Stable slide roles make the same task projection replayable after edits.
 * Worked examples show reasoning; independent questions keep answers in notes.
 * Authored slides survive. Layout and slide editing stay in the existing view. */
export function projectTeachingTaskSlides(deck, task) {
  Object.assign(deck, { taskId: task.id, taskRevision: task.revision });
  const transfer = task.sequence?.find((unit) => unit.kind === 'independent-transfer');
  const chunks = (lines, wordLimit = 60) => {
    const result = [];
    const units = [];
    const measure = (text) =>
      /\p{Script=Han}/u.test(text) ? [...text.replace(/\s/g, '')].length / 3 : text.trim().split(/\s+/).length;
    for (const line of lines) {
      const segments = [
        ...new Intl.Segmenter(task.language || 'en', { granularity: 'sentence' }).segment(line),
      ].flatMap((entry) => entry.segment.trim().match(/[^;；]+[;；]?/g) || []);
      const sentences = segments.flatMap((segment) => {
        if (measure(segment) <= wordLimit) return [segment.trim()];
        const tokens = /\p{Script=Han}/u.test(segment) ? [...segment] : segment.split(/(?<=\s)/);
        const parts = [];
        let part = '';
        for (const token of tokens) {
          if (part && measure(part + token) > wordLimit) {
            parts.push(part.trim());
            part = '';
          }
          part += token;
        }
        if (part.trim()) parts.push(part.trim());
        return parts;
      });
      units.push(...sentences);
    }
    // Balance short final fragments without raising the text-density limit.
    const total = units.reduce((sum, unit) => sum + measure(unit), 0);
    const target = Math.min(wordLimit, Math.ceil(total / Math.max(1, Math.ceil(total / wordLimit))));
    for (const sentence of units) {
      const previous = result.at(-1);
      if (previous && measure(`${previous} ${sentence}`) <= target) result[result.length - 1] += ` ${sentence}`;
      else result.push(sentence);
    }
    return result;
  };
  const records = chunks(task.inputs.map((input) => input.text));
  const steps = chunks(task.reasoning);
  const transferRecords = transfer ? chunks(transfer.sources) : [];
  const material = (role) => {
    const [kind, indexText = '0'] = role.split(':');
    const index = Number(indexText);
    switch (kind) {
      case 'transfer-record':
        return {
          title: taskText(
            task,
            `A new fictional case${transferRecords.length > 1 ? ` (${index + 1}/${transferRecords.length})` : ''}`,
            `新的虚构案例${transferRecords.length > 1 ? `（${index + 1}/${transferRecords.length}）` : ''}`,
          ),
          bullets: [transferRecords[index]],
          notes: taskCopy(
            task,
            'Keep the worked example covered. Give each learner time to select the relevant evidence before discussing the answer.',
          ),
        };
      case 'title':
        return { title: task.title, bullets: [task.objective], notes: task.product };
      case 'agenda':
        return {
          title: taskCopy(task, 'Read, reason, check, revise'),
          bullets: [
            taskCopy(task, 'Inspect the source record.'),
            taskCopy(task, 'Work through an example.'),
            taskCopy(task, 'Explain and correct an error.'),
            taskCopy(task, 'Write and check your response.'),
          ],
          notes: task.question,
        };
      case 'objectives':
        return {
          title: taskCopy(task, 'What your response should show'),
          bullets: task.criteria.map((criterion) => criterion.label),
          notes: task.criteria.map((criterion) => criterion.levels.exemplary).join('\n'),
        };
      case 'record':
        return {
          title: taskText(
            task,
            `Read the source record${records.length > 1 ? ` (${index + 1}/${records.length})` : ''}`,
            `阅读原始材料${records.length > 1 ? `（${index + 1}/${records.length}）` : ''}`,
          ),
          bullets: [records[index] || records[0]],
          notes: taskCopy(
            task,
            'Ask students to distinguish supplied observations from their own inferences. Do not add facts that are absent from this record.',
          ),
        };
      case 'worked':
        return {
          title: taskText(
            task,
            `Worked example: reasoning ${index + 1} of ${steps.length}`,
            `推理示范：${index + 1}/${steps.length}`,
          ),
          bullets: [steps[index] || steps[0]],
          notes: [
            index === 0
              ? taskText(
                  task,
                  `Source records: ${task.inputs.map((input) => input.text).join(' ')}`,
                  `原始材料：${task.inputs.map((input) => input.text).join(' ')}`,
                )
              : '',
            index === steps.length - 1
              ? taskText(task, `Complete reference response: ${task.answer}`, `完整参考答案：${task.answer}`)
              : taskText(
                  task,
                  `Ask learners to explain this step before revealing the next one. ${task.criteria[0].feedback}`,
                  `展示下一步之前，请学生解释这一步。${task.criteria[0].feedback}`,
                ),
          ]
            .filter(Boolean)
            .join('\n'),
        };
      case 'error': {
        const error = task.errors[index % task.errors.length];
        return {
          title: taskCopy(task, 'Find the error and explain why'),
          bullets: [
            taskText(task, `A learner writes: “${error.response}”`, `一位学生写道：“${error.response}”`),
            taskCopy(task, 'Identify the incorrect step. Explain a correction using the source record.'),
          ],
          notes: taskText(
            task,
            `Correction: ${error.correction}\nFeedback: ${error.feedback}`,
            `修正：${error.correction}\n反馈：${error.feedback}`,
          ),
        };
      }
      case 'scaffold': {
        const question = task.scaffoldQuestions?.[index % task.scaffoldQuestions.length] || task.checkpoint;
        return {
          title: taskCopy(task, 'Explain one reasoning step'),
          bullets: [question.question],
          notes: taskText(task, `Expected response: ${question.answer}`, `参考回答：${question.answer}`),
        };
      }
      case 'activity':
        return {
          title: taskCopy(task, 'Write your response'),
          bullets: [
            transfer?.directions || task.question,
            taskCopy(task, 'Show your reasoning before checking the model answer.'),
          ],
          notes: transfer
            ? taskText(
                task,
                `Reference response: ${transfer.answer}\nScoring: ${transfer.criteria.join(' ')}\nFeedback: ${transfer.feedback}`,
                `参考回答：${transfer.answer}\n评分：${transfer.criteria.join(' ')}\n反馈：${transfer.feedback}`,
              )
            : taskText(
                task,
                `Reference response: ${task.answer}\nFeedback: ${task.criteria.map((criterion) => criterion.feedback).join(' ')}`,
                `参考回答：${task.answer}\n反馈：${task.criteria.map((criterion) => criterion.feedback).join(' ')}`,
              ),
        };
      case 'discussion':
        return {
          title: taskCopy(task, 'Compare the reasoning'),
          bullets: [task.checkpoint.question],
          notes: taskText(task, `Expected response: ${task.checkpoint.answer}`, `参考回答：${task.checkpoint.answer}`),
        };
      case 'summary':
        return {
          title: taskCopy(task, 'Check your work'),
          bullets: task.criteria.map((criterion) => criterion.label),
          notes: task.criteria.map((criterion) => `${criterion.label}: ${criterion.levels.exemplary}`).join('\n'),
        };
      default:
        return {
          title: taskCopy(task, 'Revise and retain'),
          bullets: [
            taskCopy(task, 'Find the first incorrect or missing step.'),
            taskCopy(task, 'Use the matching feedback and revise your response.'),
            taskCopy(task, 'Record one remaining question.'),
          ],
          notes: task.criteria.map((criterion) => criterion.feedback).join('\n'),
        };
    }
  };
  const contentRoles = [
    ...records.map((_, index) => `record:${index}`),
    ...steps.map((_, index) => `worked:${index}`),
    ...task.errors.map((_, index) => `error:${index}`),
    ...(task.scaffoldQuestions || []).map((_, index) => `scaffold:${index}`),
  ];
  let cursor = 0;
  const slides = (Array.isArray(deck.slides) ? deck.slides : []).filter((slide) => {
    if (!slide.taskRole) return true;
    if (/^(record|worked):/.test(slide.taskRole)) return contentRoles.includes(slide.taskRole);
    return !slide.taskRole.startsWith('transfer-record') || Boolean(transfer);
  });
  for (const slide of slides) {
    if (!slide.taskRole && /^(?:authored|model-authored|instructor)/.test(slide.enrichmentSource || '')) continue;
    const role =
      slide.taskRole ||
      (['title', 'agenda', 'objectives', 'activity', 'discussion', 'summary', 'closing'].includes(slide.type)
        ? slide.type
        : contentRoles[cursor++] || `scaffold:${cursor}`);
    Object.assign(slide, material(role), {
      // Legacy recap/key-concept layouts consume different fields and can
      // silently discard a task title or reserve an empty comparison column.
      type: contentRoles.includes(role) || role.startsWith('transfer-record') ? 'content' : role,
      taskRole: role,
      taskId: task.id,
      taskRevision: task.revision,
      objectiveLink: task.objective,
      enrichmentSource: 'shared-teaching-task',
      visual: { kind: 'none', description: '', altText: '' },
      content: undefined,
      activity: null,
      workedExample: role === 'worked:0' ? task.workedExample : undefined,
    });
  }
  // Reconcile roles on every replay: a longer source needs additional slides,
  // and removed source chunks must not retain obsolete answers. The outer
  // three-way merge preserves teacher notes on surviving/deleted slide IDs.
  const required = [...contentRoles];
  if (transfer)
    required.push(...transferRecords.map((_, index) => (index === 0 ? 'transfer-record' : `transfer-record:${index}`)));
  for (const role of required) {
    if (slides.some((slide) => slide.taskRole === role)) continue;
    const requiredIndex = required.indexOf(role);
    const following = required.slice(requiredIndex + 1);
    let position = slides.findIndex((slide) => following.includes(slide.taskRole));
    if (position < 0) position = slides.findIndex((slide) => slide.taskRole === 'activity');
    slides.splice(position < 0 ? slides.length : position, 0, {
      ...material(role),
      type: 'content',
      taskRole: role,
      taskId: task.id,
      taskRevision: task.revision,
      objectiveLink: task.objective,
      enrichmentSource: 'shared-teaching-task',
      timer: role.startsWith('transfer-record')
        ? taskCopy(task, 'Within the independent practice time')
        : taskCopy(task, 'Within the model time'),
      visual: { kind: 'none', description: '', altText: '' },
      workedExample: role === 'worked:0' ? task.workedExample : undefined,
    });
  }
  const roleOrder = ['title', 'agenda', 'objectives', ...required, 'activity', 'discussion', 'summary', 'closing'];
  const uniqueRoles = new Set();
  const kept = slides.filter((slide) => {
    if (!slide.taskRole) return true;
    if (!roleOrder.includes(slide.taskRole) || uniqueRoles.has(slide.taskRole)) return false;
    uniqueRoles.add(slide.taskRole);
    return true;
  });
  const ordered = kept
    .filter((slide) => slide.taskRole)
    .sort((a, b) => roleOrder.indexOf(a.taskRole) - roleOrder.indexOf(b.taskRole));
  // Teacher-authored slides keep their positions; generated reasoning always
  // precedes independent work, including when an old deck had later content slots.
  deck.slides = kept.map((slide) => (slide.taskRole ? ordered.shift() : slide));
  deck.totalSlides = deck.slides.length;
}
