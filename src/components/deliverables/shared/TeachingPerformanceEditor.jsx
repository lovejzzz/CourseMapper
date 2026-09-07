import React from 'react';
import { PERFORMANCE_LEVELS } from '../../../lib/teachingPerformanceRequirements.js';

const fieldClass =
  'mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-indigo-500';
const emptyResponse = () => ({
  action: '',
  answer: '',
  reasoning: [],
  feedback: '',
  levels: Object.fromEntries(PERFORMANCE_LEVELS.map((key) => [key, ''])),
});
const bandLabels = {
  exemplary: ['Complete performance', '完整表现'],
  proficient: ['Mostly meets the requirement', '基本达到要求'],
  developing: ['Partial evidence', '部分证据'],
  beginning: ['Missing or mistaken evidence', '缺失或错误证据'],
};

function ResponseFields({ value, onChange, prefix, zh }) {
  const t = (en, cn) => (zh ? cn : en);
  const fields = [
    ['action', t('Student task', '学生任务')],
    ['answer', t('Reference response', '参考作答')],
    ['reasoning', t('Reasoning steps — one per line', '推理步骤 — 每行一步')],
    ['feedback', t('Feedback and next action', '反馈与下一步动作')],
  ];
  return (
    <div className="space-y-3">
      {fields.map(([key, label]) => (
        <label key={key} className="block">
          {label}
          <textarea
            aria-label={`${prefix}: ${label}`}
            className={fieldClass}
            rows={3}
            maxLength={6000}
            value={key === 'reasoning' ? (value.reasoning || []).join('\n') : value[key] || ''}
            onChange={(event) =>
              onChange({ ...value, [key]: key === 'reasoning' ? event.target.value.split('\n') : event.target.value })
            }
          />
        </label>
      ))}
      <details className="rounded border border-slate-200 p-2">
        <summary className="cursor-pointer font-medium">
          {prefix} — {t('Observable scoring levels', '可观察的评分档位')}
        </summary>
        <div className="mt-2 space-y-2">
          {PERFORMANCE_LEVELS.map((key) => (
            <label key={key} className="block">
              {bandLabels[key][zh ? 1 : 0]}
              <textarea
                aria-label={`${prefix}: ${bandLabels[key][zh ? 1 : 0]}`}
                className={fieldClass}
                rows={2}
                maxLength={6000}
                value={value.levels?.[key] || ''}
                onChange={(event) => onChange({ ...value, levels: { ...value.levels, [key]: event.target.value } })}
              />
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}

/** Editing only changes the parent's review draft. The existing preview and
 * confirmed transaction own persistence, cross-material updates and undo. */
export default function TeachingPerformanceEditor({ draft, onChange, zh, disabled }) {
  const t = (en, cn) => (zh ? cn : en);
  function update(id, value) {
    onChange((current) => ({ ...current, requirements: current.requirements.map((r) => (r.id === id ? value : r)) }));
  }
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="mb-2 font-semibold">{t('Teaching requirements', '教学要求')}</legend>
      <p>
        {t(
          'Each requirement includes its task, reference, scoring and practice. Review all of them together. Source or objective changes may require checking the authored references again.',
          '每项要求包含任务、参考、评分与练习，请一并审阅。来源或目标变化后，教师编写的参考可能需要重新核对。',
        )}
      </p>
      <p role="status">
        {t('Scoring total', '评分合计')}: {draft.requirements.reduce((sum, r) => sum + (Number(r.weight) || 0), 0)}% /
        100%
      </p>
      {draft.requirements.map((r, index) => {
        const prefix = t(`Requirement ${index + 1}`, `要求 ${index + 1}`);
        return (
          <details key={r.id} className="rounded border border-slate-300 p-3">
            <summary className="cursor-pointer font-medium">
              {index + 1}. {r.label || t('Untitled requirement', '未命名要求')} ({r.weight}%)
            </summary>
            <div className="mt-3 space-y-3">
              <label className="block">
                {t('Short label', '简短名称')}
                <input
                  aria-label={`${prefix}: ${t('Short label', '简短名称')}`}
                  className={fieldClass}
                  value={r.label}
                  maxLength={300}
                  onChange={(e) => update(r.id, { ...r, label: e.target.value })}
                />
              </label>
              <label className="block">
                {t('Weight (%)', '权重（%）')}
                <input
                  aria-label={`${prefix}: ${t('Weight (%)', '权重（%）')}`}
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  className={fieldClass}
                  value={r.weight}
                  onChange={(e) => update(r.id, { ...r, weight: Number(e.target.value) })}
                />
              </label>
              <ResponseFields value={r} onChange={(value) => update(r.id, value)} prefix={prefix} zh={zh} />
              <details className="rounded border border-slate-200 p-2">
                <summary className="cursor-pointer font-medium">
                  {t('Guided practice and review examples', '指导练习与审查用回答')}
                </summary>
                <p className="mt-2">
                  {t(
                    'These are constructed examples for reviewing the rubric, not student data.',
                    '这些是用于审查评分的构造回答，不是学生数据。',
                  )}
                </p>
                {[
                  ['guided', 'question', t('Guided question', '指导问题')],
                  ['guided', 'answer', t('Guided reference', '指导练习参考')],
                  ['examples', 'partial', t('Partial response example', '部分正确的回答')],
                  ['examples', 'misconception', t('Mistaken response example', '错误回答示例')],
                  ['examples', 'alternative', t('Acceptable alternative response', '可接受的替代回答')],
                ].map(([section, key, label]) => (
                  <label key={`${section}-${key}`} className="mt-2 block">
                    {label}
                    <textarea
                      aria-label={`${prefix}: ${label}`}
                      className={fieldClass}
                      rows={2}
                      maxLength={6000}
                      value={r[section]?.[key] || ''}
                      onChange={(e) => update(r.id, { ...r, [section]: { ...r[section], [key]: e.target.value } })}
                    />
                  </label>
                ))}
              </details>
              <details className="rounded border border-slate-200 p-2">
                <summary className="cursor-pointer font-medium">
                  {t('Apply this requirement to the independent case', '将此要求用于独立案例')}
                </summary>
                <div className="mt-2">
                  <ResponseFields
                    value={r.transfer}
                    onChange={(transfer) => update(r.id, { ...r, transfer })}
                    prefix={`${prefix}: ${t('Independent case', '独立案例')}`}
                    zh={zh}
                  />
                </div>
              </details>
              <button
                type="button"
                className="font-medium text-red-700 underline"
                onClick={() =>
                  onChange((current) => ({
                    ...current,
                    requirements: current.requirements.filter((item) => item.id !== r.id),
                  }))
                }
              >
                {t('Remove this requirement', '移除此要求')}
              </button>
            </div>
          </details>
        );
      })}
      <button
        type="button"
        className="font-medium underline"
        disabled={draft.requirements.length >= 12}
        onClick={() =>
          onChange((current) => ({
            ...current,
            requirements: [
              ...current.requirements,
              {
                ...emptyResponse(),
                id: `requirement-${crypto.randomUUID()}`,
                weight: 0,
                label: '',
                guided: { question: '', answer: '' },
                examples: { partial: '', misconception: '', alternative: '' },
                transfer: emptyResponse(),
              },
            ],
          }))
        }
      >
        {t('Add teaching requirement', '新增教学要求')}
      </button>
      <details className="rounded border border-slate-300 p-3">
        <summary className="cursor-pointer font-medium">
          {t('Sources for the independent case', '独立案例的来源')}
        </summary>
        <p className="my-2">
          {t(
            'All independent tasks above use these records. Supply a new case and keep its answers in the reference fields.',
            '上述独立任务共同使用这些记录。请提供新案例，答案另填在参考字段中。',
          )}
        </p>
        {(draft.practiceInputs || []).map((s, i) => (
          <div key={s.id} className="mb-3 space-y-2">
            <label className="block">
              {t(`Practice record ${i + 1}`, `练习记录 ${i + 1}`)}
              <textarea
                className={fieldClass}
                rows={3}
                maxLength={6000}
                value={s.text}
                onChange={(e) =>
                  onChange((current) => ({
                    ...current,
                    practiceInputs: current.practiceInputs.map((item) =>
                      item.id === s.id ? { ...item, text: e.target.value } : item,
                    ),
                  }))
                }
              />
            </label>
            <label className="block">
              {t('Record origin', '记录来源')}
              <select
                className={fieldClass}
                value={s.kind}
                onChange={(e) =>
                  onChange((current) => ({
                    ...current,
                    practiceInputs: current.practiceInputs.map((item) =>
                      item.id === s.id ? { ...item, kind: e.target.value } : item,
                    ),
                  }))
                }
              >
                <option value="fictional">{t('Fictional teaching case', '虚构教学案例')}</option>
                <option value="teacher-provided">{t('Teacher-provided record', '教师提供的记录')}</option>
              </select>
            </label>
            <button
              type="button"
              className="underline"
              onClick={() =>
                onChange((current) => ({
                  ...current,
                  practiceInputs: current.practiceInputs.filter((item) => item.id !== s.id),
                }))
              }
            >
              {t('Remove practice record', '移除练习记录')}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="underline"
          disabled={(draft.practiceInputs || []).length >= 8}
          onClick={() =>
            onChange((current) => ({
              ...current,
              practiceInputs: [
                ...(current.practiceInputs || []),
                { id: `practice-${crypto.randomUUID()}`, text: '', kind: 'teacher-provided' },
              ],
            }))
          }
        >
          {t('Add practice record', '新增练习记录')}
        </button>
      </details>
    </fieldset>
  );
}
