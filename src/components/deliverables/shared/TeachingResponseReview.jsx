import React, { useMemo, useState } from 'react';
import { saveAs } from 'file-saver';
import { createTeachingResponseStore } from '../../../lib/teachingResponseStore.js';
import {
  createResponseReview,
  confirmResponseJudgment,
  undoResponseJudgment,
  summarizeResponseReviews,
  RESPONSE_LEVELS,
  responseReviewRevision,
} from '../../../lib/teachingResponseReview.js';

const labels = {
  exemplary: ['Complete performance', '完整表现'],
  proficient: ['Mostly meets the requirement', '基本达到要求'],
  developing: ['Partial evidence', '部分证据'],
  beginning: ['Mistaken evidence', '错误证据'],
  insufficient: ['Insufficient evidence', '证据不足'],
};
const field = 'mt-1 w-full rounded border border-slate-300 bg-white p-2 text-sm text-slate-800';
function judgmentFor(record, criterionId) {
  const saved = record?.judgments.find((entry) => entry.criterionId === criterionId);
  return saved ? structuredClone(saved) : { criterionId, level: 'insufficient', reason: '', evidence: null };
}

/** Only explicit reviewed exports contain responses. No props return notebook
 * data to the course/project state or to a model. */
export default function TeachingResponseReview({ source, zh, disabled, store: suppliedStore }) {
  const store = useMemo(() => suppliedStore || createTeachingResponseStore(), [suppliedStore]);
  const [records, setRecords] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(null);
  const [response, setResponse] = useState('');
  const [judgment, setJudgment] = useState({ criterionId: '', level: 'insufficient', reason: '', evidence: null });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmExport, setConfirmExport] = useState(false);
  const t = (en, cn) => (zh ? cn : en);
  const summary = useMemo(
    () => (active ? summarizeResponseReviews(records, active.sourceRevision, active.rubricRevision) : null),
    [records, active],
  );
  const criterion = active?.snapshot.criteria.find((c) => c.id === judgment.criterionId);
  async function run(action) {
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    const result = await store.list();
    setRecords(result.records);
    if (result.unreadable.length)
      setMessage(
        t('Some local reviews cannot be read. They have been retained.', '部分本地记录无法读取，原数据已保留。'),
      );
  }
  function select(record) {
    setActive(record);
    setConfirmExport(false);
    setConfirmDelete(false);
    setJudgment(judgmentFor(record, record?.snapshot.criteria[0]?.id || ''));
  }
  async function persist(record) {
    await store.save(record, active?.id === record.id ? responseReviewRevision(active) : null);
    select(record);
    await refresh();
  }
  return (
    <details
      className="rounded border border-slate-200 p-3"
      onToggle={(event) => {
        if (event.target !== event.currentTarget) return;
        setOpen(event.currentTarget.open);
        if (event.currentTarget.open) void run(refresh);
      }}
    >
      <summary className="cursor-pointer font-medium">{t('Review student responses', '审阅学生作答')}</summary>
      {open && (
        <fieldset disabled={disabled || busy} className="mt-3 space-y-3">
          <p>
            {t(
              'Anonymous text only. Saved on this device, separately from courses. No automatic grades.',
              '仅粘贴匿名文本。作答单独保存在本机，不自动评分。',
            )}
          </p>
          {source && (
            <>
              <label className="block">
                {t('New response to the saved task', '针对已保存任务的新作答')}
                <textarea
                  className={field}
                  rows={4}
                  maxLength={20000}
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!response.trim()}
                onClick={() =>
                  void run(async () => {
                    await persist(createResponseReview(source, response));
                    setResponse('');
                  })
                }
              >
                {t('Save response locally', '在本机保存作答')}
              </button>
            </>
          )}
          <label className="block">
            {t('Saved reviews on this device', '本机保存的审阅记录')}
            <select
              className={field}
              value={active?.id || ''}
              onChange={(e) => select(records.find((r) => r.id === e.target.value) || null)}
            >
              <option value="">{t('Choose a response', '选择作答')}</option>
              {records.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.snapshot.source.title} · {new Date(r.createdAt).toLocaleString(zh ? 'zh-CN' : 'en-US')}
                </option>
              ))}
            </select>
          </label>
          {active && (
            <>
              <p>{active.snapshot.source.objective}</p>
              <p className="text-xs">
                {t('Uses the task and rubric saved with this response.', '使用保存此作答时的任务与评分标准。')}
              </p>
              <details>
                <summary>{t('Original task and reference', '原任务与参考作答')}</summary>
                <p className="whitespace-pre-wrap">{active.snapshot.question}</p>
                <p className="whitespace-pre-wrap">{active.snapshot.answer}</p>
              </details>
              <label className="block">
                {t('Select the evidence in the response', '在作答中选中判断依据')}
                <textarea
                  className={field}
                  rows={5}
                  readOnly
                  value={active.response}
                  onSelect={(e) => {
                    const start = e.currentTarget.selectionStart,
                      end = e.currentTarget.selectionEnd;
                    setJudgment((j) => ({
                      ...j,
                      evidence: end > start ? { start, end, quote: active.response.slice(start, end) } : null,
                    }));
                  }}
                />
              </label>
              <label className="block">
                {t('Criterion', '评分要求')}
                <select
                  className={field}
                  value={judgment.criterionId}
                  onChange={(e) => setJudgment(judgmentFor(active, e.target.value))}
                >
                  {active.snapshot.criteria.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                {t('Teacher judgment', '教师判断')}
                <select
                  className={field}
                  value={judgment.level}
                  onChange={(e) => setJudgment((j) => ({ ...j, level: e.target.value }))}
                >
                  {RESPONSE_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {labels[level][zh ? 1 : 0]}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                {criterion?.levels?.[judgment.level] ||
                  t(
                    'Explain what evidence is missing; this is not a zero score.',
                    '说明缺少哪些证据；证据不足不等于零分。',
                  )}
              </p>
              {judgment.evidence && (
                <blockquote className="border-l-2 pl-2 whitespace-pre-wrap">{judgment.evidence.quote}</blockquote>
              )}
              <label className="block">
                {t('Reason and next teaching action', '判断理由与下一步教学动作')}
                <textarea
                  className={field}
                  rows={3}
                  maxLength={2000}
                  value={judgment.reason}
                  onChange={(e) => setJudgment((j) => ({ ...j, reason: e.target.value }))}
                />
              </label>
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!judgment.reason.trim() || (judgment.level !== 'insufficient' && !judgment.evidence)}
                onClick={() =>
                  void run(() =>
                    persist(
                      confirmResponseJudgment(active, {
                        ...judgment,
                        evidence: judgment.level === 'insufficient' ? null : judgment.evidence,
                      }),
                    ),
                  )
                }
              >
                {t('Confirm judgment', '确认判断')}
              </button>
              <ul>
                {active.judgments.map((j) => (
                  <li key={j.criterionId}>
                    {active.snapshot.criteria.find((c) => c.id === j.criterionId)?.label}: {labels[j.level][zh ? 1 : 0]}{' '}
                    — {j.reason}
                    {j.evidence && <blockquote className="whitespace-pre-wrap">{j.evidence.quote}</blockquote>}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!active.history.length}
                onClick={() => void run(() => persist(undoResponseJudgment(active)))}
              >
                {t('Undo last judgment', '撤销上次判断')}
              </button>
              <details>
                <summary>
                  {t('Reviewed samples for this version', '此版本的已审阅样本')} ({summary.sampleCount})
                </summary>
                <p>
                  {t(
                    'Counts describe only saved responses for this exact task and rubric, not class mastery.',
                    '仅统计此任务及评分版本的已保存作答，不代表全班掌握程度。',
                  )}
                </p>
                {summary.criteria.map((c) => (
                  <p key={c.criterionId}>
                    {c.label}:{' '}
                    {RESPONSE_LEVELS.map((level) => `${labels[level][zh ? 1 : 0]} ${c.counts[level]}`).join(' · ')} ·{' '}
                    {t('Unreviewed', '未审阅')} {c.unreviewed}
                  </p>
                ))}
              </details>
              <label className="block">
                <input type="checkbox" checked={confirmExport} onChange={(e) => setConfirmExport(e.target.checked)} />{' '}
                {t('I checked this review for identifying information', '我已检查此记录中的身份信息')}
              </label>
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!confirmExport}
                onClick={() =>
                  saveAs(
                    new Blob([JSON.stringify(active, null, 2)], { type: 'application/json' }),
                    `response-review-${active.id}.json`,
                  )
                }
              >
                {t('Export this review', '导出此审阅记录')}
              </button>
              <label className="block">
                <input type="checkbox" checked={confirmDelete} onChange={(e) => setConfirmDelete(e.target.checked)} />{' '}
                {t('Delete this local response and its review history', '删除此本地作答及其审阅历史')}
              </label>
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!confirmDelete}
                onClick={() =>
                  void run(async () => {
                    await store.remove(active.id);
                    select(null);
                    await refresh();
                  })
                }
              >
                {t('Delete review', '删除审阅记录')}
              </button>
            </>
          )}
          {message && <p role="alert">{message}</p>}
        </fieldset>
      )}
    </details>
  );
}
