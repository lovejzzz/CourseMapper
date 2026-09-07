import React, { useMemo, useState } from 'react';
import { FEATURES_BASE } from '../../../lib/featureCatalog.js';
import { TEACHING_OPERATION_SPECS } from '../../../lib/teachingOperationPlan.js';
import {
  createTeachingTaskReviewDraft,
  quoteOccurrences,
  reviewableTeachingTaskSources,
} from '../../../lib/teachingTaskReview.js';

const fieldLabels = {
  priorRecord: ['Earlier rule record', '原规则记录'],
  amendedRecord: ['Amendment record', '修订记录'],
  priorValue: ['Earlier value', '原值'],
  amendedValue: ['Amended value', '修订值'],
  priorUnit: ['Earlier unit', '原单位'],
  amendedUnit: ['Amended unit', '修订单位'],
  effectiveDate: ['Effective date', '生效日期'],
  observationLimit: ['Record of the unknown observation date', '观察日期未知的记录'],
  countRecord: ['Record of the observed counts', '已观察计数的记录'],
  numerator: ['Count meeting the outcome', '符合结果的计数'],
  denominator: ['Count of the observed group', '已观察群体的计数'],
  observedGroup: ['Observed group', '已观察群体'],
  countedOutcome: ['Counted outcome', '所计结果'],
  scopeRecord: ['Record of the coverage limit', '覆盖范围限制的记录'],
  missingGroup: ['Group with unknown outcomes', '结果未知的群体'],
  targetGroup: ['Target population', '目标群体'],
};
const requirementLabels = {
  evidence: ['Evidence', '证据'],
  reasoning: ['Reasoning', '推理'],
  boundary: ['Evidence limits', '证据边界'],
  'part-whole': ['Part and whole', '部分与整体'],
  conversion: ['Calculation and checking', '计算与核验'],
  scope: ['Scope and further evidence', '适用范围与进一步证据'],
};
const fieldClass =
  'mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none';

/** Uses the existing material workspace. Drafts and previews are local UI
 * state; only the explicit confirmation delegates a canonical transaction. */
export default function TeachingTaskReview({ featureId, courseMap, data, onPreview, onCommit }) {
  const options = useMemo(() => {
    try {
      return { sources: reviewableTeachingTaskSources(courseMap) };
    } catch (error) {
      return { sources: [], issue: error.message };
    }
  }, [courseMap]);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState(null);
  const [preview, setPreview] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const selected = options.sources.find((source) => source.id === selectedId) || options.sources[0];
  const zh = /\p{Script=Han}/u.test(selected?.objective || '');
  const t = (en, cn) => (zh ? cn : en);

  if (!onPreview || !onCommit || (!options.sources.length && !options.issue)) return null;
  function begin(source = selected) {
    if (!source) return;
    const next = createTeachingTaskReviewDraft(source, data, featureId);
    setSelectedId(source.id);
    setDraft(next.status === 'needs-review' ? null : next);
    setMessage(next.message || '');
    setPreview(null);
    setConfirmed(false);
  }
  function change(update) {
    setDraft((current) => update(current));
    setPreview(null);
    setConfirmed(false);
    setMessage('');
  }
  async function previewChanges() {
    setBusy(true);
    try {
      const result = await onPreview(draft);
      setPreview(result.status === 'preview' ? result : null);
      setMessage(result.message || '');
      setConfirmed(false);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function applyChanges() {
    if (!confirmed || !preview) return;
    setBusy(true);
    try {
      const result = await onCommit(preview, confirmed);
      if (result.status === 'applied') {
        setDraft(null);
        setPreview(null);
        setConfirmed(false);
        setMessage(
          t(
            'Updated the shared task. Any competing teacher edits are preserved for review. You can undo this update from the toolbar.',
            '已更新共享任务。有冲突的教师编辑会保留供审阅；可通过工具栏撤销本次更新。',
          ),
        );
      } else {
        setPreview(null);
        setConfirmed(false);
        setMessage(result.message);
      }
    } catch (error) {
      setPreview(null);
      setConfirmed(false);
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="mx-4 mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
      onToggle={(event) => {
        if (event.target === event.currentTarget && event.currentTarget.open && !draft) begin();
      }}
    >
      <summary className="cursor-pointer font-medium">{t('Review sources and scoring', '审阅来源与评分')}</summary>
      {options.issue && (
        <p role="alert" className="mt-3 text-amber-800">
          {options.issue}
        </p>
      )}
      {selected && (
        <div className="mt-3 space-y-4">
          <label className="block font-medium">
            {t('Teaching task', '教学任务')}
            <select
              className={fieldClass}
              value={selected.id}
              disabled={busy}
              onChange={(event) => begin(options.sources.find((source) => source.id === event.target.value))}
            >
              {options.sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.lessonNumber}. {source.title}
                </option>
              ))}
            </select>
          </label>
          <p>{selected.objective}</p>
          {draft && (
            <button disabled={busy} className="font-medium underline" onClick={() => begin()}>
              {t('Reload current task and discard draft', '重新载入当前任务并放弃草稿')}
            </button>
          )}
          {!draft && (
            <button className="font-medium underline" onClick={() => begin()}>
              {t('Open task review', '打开任务审阅')}
            </button>
          )}
          {draft && (
            <>
              <fieldset disabled={busy} className="space-y-3">
                <legend className="font-semibold">{t('Source records', '来源记录')}</legend>
                {draft.inputs.map((input, index) => (
                  <label key={input.id} className="block">
                    {t(`Record ${index + 1}`, `记录 ${index + 1}`)}
                    <textarea
                      rows={3}
                      className={fieldClass}
                      value={input.text}
                      onChange={(event) => {
                        const text = event.target.value;
                        change((current) => ({
                          ...current,
                          inputs: current.inputs.map((item) => (item.id === input.id ? { ...item, text } : item)),
                        }));
                      }}
                    />
                  </label>
                ))}
              </fieldset>
              <fieldset disabled={busy} className="space-y-3">
                <legend className="font-semibold">
                  {t('Which record supports each part?', '每一部分由哪条记录支持？')}
                </legend>
                <p>
                  {draft.operation === 'observed-proportion'
                    ? t(
                        'Locate exact text in the records. Check that the numerator counts a subset of the observed group, using the same unit and observation period. Identify the unobserved group and the wider population; missing outcomes must actually be unknown. A repeated phrase needs its occurrence selected.',
                        '请选择记录中的原文。核对分子是已观察群体中的一部分，采用相同计数单位与观察时段；指出未观察群体和更大的目标群体，确认缺失结果确实未知。原文重复出现时请选择位置。',
                      )
                    : t(
                        'Locate exact text in the records. A repeated phrase needs its occurrence selected. Check that both rules concern the same setting and that the observation date is unknown.',
                        '请选择记录中的原文；原文重复出现时请选择位置。请核对两版规则涉及同一情境，且观察日期确实未知。',
                      )}
                </p>
                {Object.entries(TEACHING_OPERATION_SPECS[draft.operation].bindings).map(([name, type]) => {
                  const binding = draft.bindings[name];
                  const source = draft.inputs.find((input) => input.id === binding.inputId);
                  const positions = quoteOccurrences(source?.text, binding.quote);
                  const label = fieldLabels[name]?.[zh ? 1 : 0] || name;
                  return (
                    <div key={name} className="rounded-md border border-slate-200 p-2">
                      <label className="block font-medium">
                        {label}
                        <select
                          className={fieldClass}
                          value={binding.inputId}
                          onChange={(event) => {
                            const inputId = event.target.value;
                            change((current) => ({
                              ...current,
                              bindings: { ...current.bindings, [name]: { ...binding, inputId, occurrence: null } },
                            }));
                          }}
                        >
                          <option value="">{t('Choose a source record', '选择来源记录')}</option>
                          {draft.inputs.map((input, index) => (
                            <option key={input.id} value={input.id}>
                              {t(`Record ${index + 1}`, `记录 ${index + 1}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                      {type !== 'record' && (
                        <label className="mt-2 block">
                          {t('Exact text', '原文片段')}: {label}
                          <input
                            className={fieldClass}
                            value={binding.quote}
                            onChange={(event) => {
                              const quote = event.target.value;
                              change((current) => ({
                                ...current,
                                bindings: { ...current.bindings, [name]: { ...binding, quote, occurrence: null } },
                              }));
                            }}
                          />
                        </label>
                      )}
                      {type !== 'record' && positions.length > 1 && (
                        <label className="mt-2 block">
                          {t('Occurrence', '出现位置')}: {label}
                          <select
                            className={fieldClass}
                            value={binding.occurrence ?? ''}
                            onChange={(event) => {
                              const occurrence = event.target.value === '' ? null : Number(event.target.value);
                              change((current) => ({
                                ...current,
                                bindings: { ...current.bindings, [name]: { ...binding, occurrence } },
                              }));
                            }}
                          >
                            <option value="">{t('Choose the matching passage', '选择对应的片段')}</option>
                            {positions.map((at, index) => (
                              <option key={at} value={index}>
                                {index + 1}. …{source.text.slice(Math.max(0, at - 28), at + binding.quote.length + 28)}…
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                  );
                })}
              </fieldset>
              <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-3">
                <legend className="mb-2 font-semibold">
                  {t('Scoring weights — total 100%', '评分权重 — 合计 100%')}
                </legend>
                {draft.requirements.map((requirement) => (
                  <label key={requirement.id}>
                    {requirementLabels[requirement.id]?.[zh ? 1 : 0] || requirement.id} (%)
                    <input
                      className={fieldClass}
                      type="number"
                      min="1"
                      max="98"
                      step="1"
                      value={requirement.weight}
                      onChange={(event) => {
                        const weight = Number(event.target.value);
                        change((current) => ({
                          ...current,
                          requirements: current.requirements.map((item) =>
                            item.id === requirement.id ? { ...item, weight } : item,
                          ),
                        }));
                      }}
                    />
                  </label>
                ))}
              </fieldset>
              <button
                disabled={busy}
                className="rounded-md bg-indigo-600 px-3 py-2 font-semibold text-white disabled:opacity-50"
                onClick={previewChanges}
              >
                {busy ? t('Preparing…', '处理中…') : t('Preview linked changes', '预览关联修改')}
              </button>
            </>
          )}
          {message && (
            <p role="status" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
              {message}
            </p>
          )}
          {preview && (
            <section
              aria-label={t('Linked change preview', '关联修改预览')}
              className="space-y-3 border-t border-slate-300 pt-3"
            >
              <h4 className="font-semibold">{t('Proposed task', '建议任务')}</h4>
              <p>{preview.task.question}</p>
              <details>
                <summary className="cursor-pointer font-medium">
                  {t('Proposed reference answer and scoring', '建议参考答案与评分')}
                </summary>
                <p className="mt-2 whitespace-pre-wrap">{preview.task.answer}</p>
                <ul className="mt-2 space-y-2">
                  {preview.task.criteria.map((criterion) => (
                    <li key={criterion.id}>
                      <strong>
                        {criterion.label}: {criterion.weight}%
                      </strong>
                      <p>{criterion.levels.exemplary}</p>
                    </li>
                  ))}
                </ul>
              </details>
              <p className="font-semibold">{t('Related materials to update', '将更新的关联材料')}</p>
              <ul className="list-disc pl-5">
                {preview.impacts.map((impact) => (
                  <li key={impact.featureId}>
                    {FEATURES_BASE.find((feature) => feature.id === impact.featureId)?.label || impact.featureId}
                    {impact.conflicts.length
                      ? t(
                          ` — ${impact.conflicts.length} teacher edits preserved for review`,
                          ` — 保留 ${impact.conflicts.length} 处教师编辑供审阅`,
                        )
                      : ''}
                  </li>
                ))}
              </ul>
              <label className="flex items-start gap-2">
                <input
                  className="mt-1"
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                {draft.operation === 'observed-proportion'
                  ? t(
                      'I have checked the part and whole refer to the same observed group, the unobserved outcomes are unknown, and the target population is wider. Apply these sources and scoring weights.',
                      '我已核对部分与整体属于同一已观察群体、未观察结果确实未知，且目标群体更广；同意应用这些来源与评分权重。',
                    )
                  : t(
                      'I have checked the source roles, the effective change for the same setting, and the unknown observation date. Apply these sources and scoring weights.',
                      '我已核对来源角色、同一情境下规则的生效变更，以及观察日期未知的条件；同意应用这些来源与评分权重。',
                    )}
              </label>
              <div className="flex gap-3">
                <button
                  className="rounded-md bg-indigo-600 px-3 py-2 font-semibold text-white disabled:opacity-50"
                  disabled={!confirmed || busy}
                  onClick={applyChanges}
                >
                  {t('Apply reviewed changes', '应用已审阅修改')}
                </button>
                <button
                  className="font-medium underline"
                  disabled={busy}
                  onClick={() => {
                    setPreview(null);
                    setConfirmed(false);
                  }}
                >
                  {t('Discard preview', '放弃预览')}
                </button>
              </div>
            </section>
          )}
        </div>
      )}
    </details>
  );
}
