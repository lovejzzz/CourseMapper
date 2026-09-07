import React, { useMemo } from 'react';
import { deriveCourseGraphFromCourseMap } from '../../../lib/courseGraph/deriveFromCourseMap.js';
import { teachingOutcomeChoices, reconcileTeachingGoalLinks } from '../../../lib/teachingGoalAlignment.js';

/** A teacher declares which observable performances support existing course
 * targets. This is not semantic certification or inferred achievement. */
export default function TeachingGoalAlignmentEditor({
  draft,
  onChange,
  courseGraph,
  courseMap,
  lessonNumber,
  zh,
  disabled,
  requirementLabels = {},
}) {
  const t = (en, cn) => (zh ? cn : en);
  const choices = useMemo(
    () => teachingOutcomeChoices(courseGraph || deriveCourseGraphFromCourseMap(courseMap), lessonNumber),
    [courseGraph, courseMap, lessonNumber],
  );
  const alignment = draft.goalAlignment;
  function selectTarget(requirementId, choice, checked) {
    onChange((current) => {
      let next = reconcileTeachingGoalLinks(
        current.goalAlignment || { version: 1, targets: [], requirementLinks: [] },
        current.requirements,
      );
      next = {
        ...next,
        requirementLinks: next.requirementLinks.map((link) =>
          link.requirementId === requirementId
            ? {
                ...link,
                outcomeRefs: checked
                  ? [...new Set([...link.outcomeRefs, choice.id])]
                  : link.outcomeRefs.filter((id) => id !== choice.id),
              }
            : link,
        ),
      };
      if (checked && !next.targets.some((target) => target.outcomeRef === choice.id))
        next.targets = [...next.targets, { outcomeRef: choice.id, revision: choice.revision }];
      return { ...current, goalAlignment: reconcileTeachingGoalLinks(next, current.requirements) };
    });
  }
  return (
    <details className="rounded border border-slate-300 p-3">
      <summary className="cursor-pointer font-medium">
        {t('Link requirements to learning targets', '将教学要求关联到学习目标')}
      </summary>
      <fieldset disabled={disabled} className="mt-3 space-y-3">
        <p>
          {t(
            'Choose the existing targets each requirement prepares or assesses. Check the task, reference and practice against the target; a saved link records your review, not proof of learning.',
            '选择各项要求所训练或评价的现有目标，并核对任务、参考与练习。保存关联记录的是您的审阅，不代表已经证明学习成效。',
          )}
        </p>
        {!choices.length && (
          <p>
            {t(
              'This lesson has no available learning targets. Add its objectives in the course map before linking this task.',
              '此课次还没有可用学习目标，请先在课程图中添加课次目标。',
            )}
          </p>
        )}
        {draft.requirements.map((requirement, index) => {
          const refs =
            alignment?.requirementLinks.find((link) => link.requirementId === requirement.id)?.outcomeRefs || [];
          const missing = refs.filter((id) => !choices.some((choice) => choice.id === id));
          return (
            <fieldset key={requirement.id} className="space-y-2 rounded border border-slate-200 p-2">
              <legend className="font-medium">
                {requirement.label ||
                  requirementLabels[requirement.id]?.[zh ? 1 : 0] ||
                  t(`Requirement ${index + 1}`, `要求 ${index + 1}`)}
              </legend>
              {choices.map((choice) => (
                <label key={choice.id} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    aria-label={t(
                      `Requirement ${index + 1} target: ${choice.text}`,
                      `要求 ${index + 1} 的目标：${choice.text}`,
                    )}
                    checked={refs.includes(choice.id)}
                    onChange={(event) => selectTarget(requirement.id, choice, event.target.checked)}
                  />
                  <span>
                    {choice.label ? `${choice.label}. ` : ''}
                    {choice.text}
                    {alignment?.targets.some(
                      (target) => target.outcomeRef === choice.id && target.revision !== choice.revision,
                    ) && (
                      <strong className="ml-2 text-amber-800">
                        {t('Changed — review again', '已变化，需重新审阅')}
                      </strong>
                    )}
                  </span>
                </label>
              ))}
              {!!missing.length && (
                <p role="alert" className="text-amber-800">
                  {t(
                    'A previously linked target is missing. Choose a current target and remove the unavailable links.',
                    '先前关联的目标已不可用，请选择当前目标并移除失效关联。',
                  )}
                </p>
              )}
            </fieldset>
          );
        })}
        {alignment && (
          <button
            type="button"
            className="underline"
            onClick={() =>
              onChange((current) => {
                const next = reconcileTeachingGoalLinks(current.goalAlignment, current.requirements);
                const available = new Map(choices.map((choice) => [choice.id, choice]));
                return {
                  ...current,
                  goalAlignment: {
                    ...next,
                    targets: next.targets
                      .filter((target) => available.has(target.outcomeRef))
                      .map((target) => ({ ...target, revision: available.get(target.outcomeRef).revision })),
                    requirementLinks: next.requirementLinks.map((link) => ({
                      ...link,
                      outcomeRefs: link.outcomeRefs.filter((id) => available.has(id)),
                    })),
                  },
                };
              })
            }
          >
            {t('I reviewed the current target versions — refresh links', '我已审阅当前目标版本，更新关联')}
          </button>
        )}
      </fieldset>
    </details>
  );
}
