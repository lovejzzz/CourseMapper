import React, { useEffect, useMemo, useRef, useState } from 'react';
import TeachingPerformanceEditor from './TeachingPerformanceEditor.jsx';
import TeachingGoalAlignmentEditor from './TeachingGoalAlignmentEditor.jsx';
import TeachingResponseReview from './TeachingResponseReview.jsx';
import {
  prepareResponseFeedbackRevision,
  savePendingResponseFeedback,
  pendingResponseFeedbackForDraft,
  completePendingResponseFeedback,
  stagePendingResponseFeedback,
} from '../../../lib/teachingResponseRevision.js';
import { createTeachingResponseStore } from '../../../lib/teachingResponseStore.js';
import { sameJsonData } from '../../../lib/canonicalJson.js';
import { reconcileTeachingGoalLinks } from '../../../lib/teachingGoalAlignment.js';
import { FEATURES_BASE } from '../../../lib/featureCatalog.js';
import { TEACHING_OPERATION_SPECS } from '../../../lib/teachingOperationPlan.js';
import {
  createTeachingTaskReviewDraft,
  createNewTeachingTaskReviewDraft,
  selectTeachingSourceChoice,
  availableTeachingTaskLessons,
  quoteOccurrences,
  mergeTeachingSourceSuggestions,
  reviewableTeachingTaskSources,
  needsInitialTeachingTaskReview,
} from '../../../lib/teachingTaskReview.js';

const fieldLabels = {
  observationRecord: ['Observation record', '观察记录'],
  observer: ['Observer or document', '观察者或文献'],
  observedClaim: ['Reported observation', '记述的观察'],
  observationBasis: ['Stated observation basis or limit', '观察的明示依据或限制'],
  reportRecord: ['Attributed assertion record', '有归属陈述的记录'],
  reporter: ['Speaker of the assertion', '陈述者'],
  reportedClaim: ['Attributed assertion', '有归属的陈述'],
  reportingBasis: ['Stated knowledge basis or limit', '明示的知情依据或限制'],
  inferenceRecord: ['Explanation record', '解释记录'],
  inferenceAuthor: ['Author of the explanation', '解释提出者'],
  inferredClaim: ['Explanation to evaluate', '待评估的解释'],
  inferenceLimit: ['Stated evidence gap', '明示的证据缺口'],
  proposedEvidence: ['Specific missing evidence to seek', '待查找的具体证据'],
  firstCountRecord: ['First group count record', '第一组计数记录'],
  secondCountRecord: ['Second group count record', '第二组计数记录'],
  rosterRecord: ['Common roster', '共同名册'],
  populationCount: ['Population count', '总体人数'],
  populationName: ['Population name', '总体名称'],
  stablePopulation: ['Stable population evidence', '总体稳定依据'],
  attendanceRecord: ['Event attendance record', '活动签到记录'],
  firstCount: ['First event count', '第一次活动人数'],
  secondCount: ['Second event count', '第二次活动人数'],
  firstEvent: ['First event', '第一次活动'],
  secondEvent: ['Second event', '第二次活动'],
  withinGroupDistinct: ['Within-event deduplication', '活动内部去重'],
  missingOverlap: ['Missing overlap evidence', '缺失重叠的依据'],
  firstPart: ['First group outcome count', '第一组结果计数'],
  firstWhole: ['First group total', '第一组总数'],
  firstGroup: ['First group', '第一组'],
  secondPart: ['Second group outcome count', '第二组结果计数'],
  secondWhole: ['Second group total', '第二组总数'],
  secondGroup: ['Second group', '第二组'],
  countingUnit: ['Common counting unit', '共同计数单位'],
  commonDefinition: ['Common outcome and deadline', '一致的结果定义与截止时间'],
  identityRecord: ['Membership record', '成员归属记录'],
  distinctMembership: ['Evidence of distinct membership', '互斥成员证据'],
  datedRecord: ['Dated event record', '带日期的事件记录'],
  recordDate: ['Date anchoring the relative day', '相对时间所依据的记录日期'],
  eventClaim: ['Event claim including the relative day', '包含相对时间的事件陈述'],
  relativeDay: ['Relative day', '相对时间词'],
  recollectionRecord: ['Separate recollection record', '另一份回忆记录'],
  recordingDate: ['Date the recollection was recorded', '回忆被记录的日期'],
  broadMonth: ['Recalled event month', '回忆所述事件月份'],
  sameEventEvidence: ['Evidence these concern the same event', '同一事件的归属证据'],
  limitRecord: ['Record of missing information', '记载未知信息的来源'],
  firstRecord: ['First condition record', '第一组条件记录'],
  secondRecord: ['Second condition record', '第二组条件记录'],
  designRecord: ['New-test resources and measurement', '新试验资源与测量记录'],
  firstTreatment: ['First treatment setting', '第一组处理水平'],
  secondTreatment: ['Second treatment setting', '第二组处理水平'],
  firstOther: ['First competing-condition setting', '第一组另一条件设置'],
  secondOther: ['Second competing-condition setting', '第二组另一条件设置'],
  factor: ['Factor to investigate', '研究因素'],
  otherFactor: ['Other varying factor', '同时变化的另一因素'],
  unit: ['Independent assignable unit', '可独立分配的单位'],
  availableUnits: ['Available new units', '可用的新单位数量'],
  controls: ['Conditions to retain', '需要保留的控制条件'],
  measurement: ['Common measurement rule', '统一测量规则'],
  outcome: ['Outcome to measure', '结果指标'],
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
  quantities: ['Counts and membership', '计数与成员归属'],
  operation: ['Calculation and weights', '计算与权重'],
  evidence: ['Evidence', '证据'],
  reasoning: ['Reasoning', '推理'],
  boundary: ['Evidence limits', '证据边界'],
  'part-whole': ['Part and whole', '部分与整体'],
  conversion: ['Calculation and checking', '计算与核验'],
  scope: ['Scope and further evidence', '适用范围与进一步证据'],
};
const fieldClass =
  'mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none';

/** Candidate work belongs to the project; previews and confirmations belong
 * to this review session. Only confirmation delegates a course transaction. */
export default function TeachingTaskReview({
  featureId,
  courseMap,
  courseGraph,
  data,
  onPreview,
  onCommit,
  onProposeSources,
  sourceBrief,
  savedDrafts,
  onSaveDraft,
  onRemoveDraft,
  responseStore,
}) {
  const options = useMemo(() => {
    try {
      return { sources: reviewableTeachingTaskSources(courseMap), lessons: availableTeachingTaskLessons(courseMap) };
    } catch (error) {
      return { sources: [], lessons: [], issue: error.message };
    }
  }, [courseMap]);
  const initialEntry = savedDrafts?.entries.find((entry) => entry.draft.taskId === savedDrafts.activeTaskId);
  const [selectedId, setSelectedId] = useState(initialEntry?.draft.taskId || '');
  const [draft, setDraftState] = useState(() => (initialEntry ? structuredClone(initialEntry.draft) : null));
  const draftRef = useRef(draft);
  const [preview, setPreview] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessageState] = useState('');
  const [messageDetails, setMessageDetails] = useState([]);
  const [busy, setBusy] = useState(false);
  const [newLesson, setNewLesson] = useState('');
  const [newOperation, setNewOperation] = useState('');
  const [reviewOpen, setReviewOpen] = useState(
    () => featureId === 'assignments' && needsInitialTeachingTaskReview(courseMap, sourceBrief),
  );
  const [creationOpen, setCreationOpen] = useState(() => !options.sources.length && !initialEntry);
  const [proposing, setProposing] = useState(false);
  const [lastProposalReceipt, setLastProposalReceipt] = useState(null);
  const proposalController = useRef(null);
  const responseCompletion = useRef(null);
  const notebook = useMemo(() => responseStore || createTeachingResponseStore(), [responseStore]);
  useEffect(() => () => proposalController.current?.abort(), []);
  const selected = draft?.creation
    ? {
        id: draft.taskId,
        lessonNumber: draft.creation.lessonNumber,
        objective: draft.objective,
        title:
          options.lessons.find((row) => row.lessonNumber === draft.creation.lessonNumber)?.title ||
          savedDrafts?.entries.find((entry) => entry.draft.taskId === draft.taskId)?.title,
      }
    : options.sources.find((source) => source.id === (draft?.taskId || selectedId)) ||
      (draft
        ? {
            id: draft.taskId,
            title: savedDrafts?.entries.find((entry) => entry.draft.taskId === draft.taskId)?.title,
            objective: '',
          }
        : options.sources[0]);
  const zh = /\p{Script=Han}/u.test(selected?.objective || sourceBrief || '');
  const t = (en, cn) => (zh ? cn : en);
  function setMessage(value, details = []) {
    setMessageState(value);
    setMessageDetails(details);
  }

  if (
    !onPreview ||
    !onCommit ||
    (!options.sources.length &&
      !options.lessons.length &&
      !options.issue &&
      !savedDrafts?.entries.length &&
      !savedDrafts?.unreadable.length)
  )
    return null;
  function setDraft(update) {
    const next = typeof update === 'function' ? update(draftRef.current) : update;
    draftRef.current = next;
    setDraftState(next);
    if (next) {
      const existing = savedDrafts?.entries.find((entry) => entry.draft.taskId === next.taskId);
      const title =
        options.sources.find((source) => source.id === next.taskId)?.title ||
        options.lessons.find((lesson) => lesson.lessonNumber === next.creation?.lessonNumber)?.title ||
        existing?.title ||
        '';
      onSaveDraft?.(next, { title, featureId: existing?.featureId || featureId });
    }
  }
  function resume(entry) {
    if (!entry || busy) return;
    setSelectedId(entry.draft.taskId);
    setDraft(structuredClone(entry.draft));
    setPreview(null);
    setConfirmed(false);
    setLastProposalReceipt(null);
    setMessage(t('Draft restored. Preview to continue.', '草稿已恢复，请重新预览。'));
  }
  function discard() {
    if (!draft || busy) return;
    onRemoveDraft?.(draft.taskId);
    setDraft(null);
    setPreview(null);
    setConfirmed(false);
    setLastProposalReceipt(null);
    setMessage(t('Draft discarded.', '草稿已放弃。'));
  }
  async function beginNew(withScion = false) {
    if (!newOperation || busy) return;
    const next = createNewTeachingTaskReviewDraft(courseMap, {
      lessonNumber: Number(newLesson || options.lessons[0]?.lessonNumber),
      operation: newOperation,
      sourceBrief,
    });
    setDraft(next.status === 'needs-review' ? null : next);
    setMessage(next.message || '');
    setPreview(null);
    setConfirmed(false);
    setLastProposalReceipt(null);
    if (withScion && next.status !== 'needs-review' && next.inputs.length)
      await proposeSources(next, { autoPreview: true });
  }
  function begin(source = selected, reload = false) {
    if (!source) return;
    const entry = savedDrafts?.entries.find((entry) => entry.draft.taskId === source.id);
    if (entry && !reload) return resume(entry);
    const next = createTeachingTaskReviewDraft(source, data, featureId);
    setSelectedId(source.id);
    setDraft(next.status === 'needs-review' ? null : next);
    setMessage(next.message || '');
    setPreview(null);
    setConfirmed(false);
    setLastProposalReceipt(null);
  }
  function change(update) {
    setDraft((current) => {
      const next = update(current);
      return next.goalAlignment
        ? { ...next, goalAlignment: reconcileTeachingGoalLinks(next.goalAlignment, next.requirements) }
        : next;
    });
    setPreview(null);
    setConfirmed(false);
    setMessage('');
  }
  async function proposeSources(requestDraft = draft, { autoPreview = false } = {}) {
    if (busy || !requestDraft) return;
    const controller = new AbortController();
    proposalController.current = controller;
    setBusy(true);
    setProposing(true);
    setPreview(null);
    setConfirmed(false);
    try {
      const propose =
        onProposeSources || (await import('../../../lib/scionTeachingProposal.js')).proposeTeachingSourceBindings;
      const result = await propose(
        {
          operation: requestDraft.operation,
          objective: (requestDraft.objective || selected?.objective || '').trim(),
          inputs: requestDraft.inputs,
        },
        { signal: controller.signal, onProgress: setMessage },
      );
      if (draftRef.current !== requestDraft) return;
      if (result.receipt) setLastProposalReceipt(result.receipt);
      if (controller.signal.aborted || result.status === 'cancelled') {
        setMessage(t('Source proposal cancelled. Your draft is unchanged.', '已取消来源提案，草稿保持不变。'));
      } else if (result.status === 'review') {
        const { bindings, ...adoption } = mergeTeachingSourceSuggestions(requestDraft, result.bindings);
        const proposedDraft = {
          ...requestDraft,
          bindings,
          proposal: result.receipt ? { ...result.receipt, adoption } : undefined,
        };
        setDraft(proposedDraft);
        const missingRoles = Object.keys(bindings).filter(
          (role) => !adoption.filledRoles.includes(role) && !adoption.preservedRoles.includes(role),
        );
        setMessage(
          missingRoles.length
            ? t(
                `Review the source selections and complete ${missingRoles.length} missing field${missingRoles.length === 1 ? '' : 's'}.`,
                `请核对来源选择，并补齐 ${missingRoles.length} 处空缺。`,
              )
            : adoption.filledRoles.length
              ? t('Review the proposed source selections.', '请核对建议的来源选择。')
              : adoption.differingRoles.length
                ? t(
                    'Some suggestions differ from your selections. Review the details.',
                    '部分建议与已有选择不同，请查看核对详情。',
                  )
                : result.issues?.length
                  ? t(
                      'The source proposal could not finish. Your existing selections are kept.',
                      '来源提案未完成，已保留已有选择。',
                    )
                  : t(
                      'No new source selections. Your existing selections are kept.',
                      '没有新的来源选择，已保留已有选择。',
                    ),
          [
            ...(result.issues || []),
            ...(result.unknowns || []),
            ...(adoption.differingRoles.length
              ? [
                  t(
                    `Scion suggested a different phrase for: ${adoption.differingRoles.map((role) => fieldLabels[role][0]).join(', ')}. Your existing choices remain; review these roles if you want to change them.`,
                    `Scion 对以下角色提出了不同片段：${adoption.differingRoles.map((role) => fieldLabels[role][1]).join('、')}。已有选择保持不变，可核对后手动修改。`,
                  ),
                ]
              : []),
            ...(missingRoles.length
              ? [
                  t(
                    `Complete: ${missingRoles.map((role) => fieldLabels[role]?.[0] || role).join(', ')}.`,
                    `请补充：${missingRoles.map((role) => fieldLabels[role]?.[1] || role).join('、')}。`,
                  ),
                ]
              : []),
          ],
        );
        // Preview is still unapproved and uses the same source/transaction
        // validator as manual review. Missing or disputed evidence stays editable.
        if (autoPreview && !missingRoles.length && !result.issues?.length && !result.unknowns?.length) {
          const candidate = await onPreview(proposedDraft);
          if (controller.signal.aborted || draftRef.current !== proposedDraft) return;
          if (candidate.status === 'preview') {
            setPreview(candidate);
            setMessage(t('Review the task, reference and scoring below.', '请审阅下方任务、参考答案和评分。'));
          } else setMessage(candidate.message || t('Complete the source review.', '请补全来源审阅。'));
        }
      } else
        setMessage(
          result.message ||
            t(
              'The source proposal could not finish. You can complete the fields yourself.',
              '来源提案未完成，可手动填写字段。',
            ),
        );
    } catch (error) {
      setMessage(error.message);
    } finally {
      if (proposalController.current === controller) {
        proposalController.current = null;
        setBusy(false);
        setProposing(false);
      }
    }
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
      const changesFeedback =
        selected?.operationPlan?.version === 2 &&
        (responseStore || globalThis.indexedDB) &&
        preview.draft?.requirements?.some(
          (requirement) =>
            selected?.operationPlan?.requirements?.find((entry) => entry.id === requirement.id)?.feedback !==
            requirement.feedback,
        );
      const pendingResponses = changesFeedback ? await pendingResponseFeedbackForDraft(notebook, preview.draft) : [];
      if (pendingResponses.length) await stagePendingResponseFeedback(notebook, pendingResponses, preview);
      const result = await onCommit(preview, confirmed);
      if (result.status === 'applied') {
        onRemoveDraft?.(draft.taskId);
        setSelectedId(preview.draft?.taskId || selectedId);
        setDraft(null);
        setPreview(null);
        setConfirmed(false);
        setMessage(t('Task updated. You can undo this change.', '任务已更新，可撤销。'));
        if (pendingResponses.length) {
          try {
            await completePendingResponseFeedback(notebook, pendingResponses, {
              previewRevision: preview.revision,
              updatedSource: reviewableTeachingTaskSources(result.courseMap).find(
                (row) => row.id === preview.draft.taskId,
              ),
            });
          } catch (error) {
            const completion = responseCompletion.current;
            if (completion?.revision === preview.revision) {
              try {
                await completion.complete({
                  previewRevision: preview.revision,
                  pendingDraftRevision: pendingResponses[0].pendingFeedbackRevision.draftRevision,
                  updatedSource: reviewableTeachingTaskSources(result.courseMap).find(
                    (row) => row.id === preview.draft.taskId,
                  ),
                });
              } catch {
                /* The response panel retains its retry receipt. */
              }
            }
            setMessage(
              t(
                'Task updated; check the local revision record in response review.',
                '任务已更新，请在作答审阅中核对本地修订记录。',
              ),
              [error.message],
            );
          }
        }
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
      open={reviewOpen}
      className="mx-4 mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
      onToggle={(event) => {
        if (event.target !== event.currentTarget) return;
        setReviewOpen(event.currentTarget.open);
        if (event.target === event.currentTarget && event.currentTarget.open && !draft && selected) begin();
      }}
    >
      <summary className="cursor-pointer font-medium">{t('Edit lesson requirements', '修改本课要求')}</summary>
      <TeachingResponseReview
        store={notebook}
        source={options.sources.find((row) => row.id === selected?.id)}
        zh={zh}
        disabled={busy}
        onPrepareFeedback={async (request, complete) => {
          const source = options.sources.find((row) => row.id === request.record.taskId);
          const base = source && createTeachingTaskReviewDraft(source, data, featureId);
          if (draftRef.current && !sameJsonData(draftRef.current, base))
            throw new Error(t('Finish or discard the current task draft first.', '请先完成或放弃当前任务草稿。'));
          const next = prepareResponseFeedbackRevision({ ...request, source, materialData: data, featureId });
          setBusy(true);
          try {
            const result = await onPreview(next);
            if (result.status !== 'preview')
              throw new Error(result.message || t('The change needs review.', '修改需要进一步审阅。'));
            await savePendingResponseFeedback(notebook, request.record, next, request);
            responseCompletion.current = { revision: result.revision, complete };
            setDraft(next);
            setSelectedId(next.taskId);
            setPreview(result);
            setConfirmed(false);
            setMessage(
              t(
                'Feedback revision prepared. Review the linked changes below before applying.',
                '反馈修订已准备，请审阅下方联动变化后再应用。',
              ),
            );
          } finally {
            setBusy(false);
          }
        }}
      />
      {options.issue && (
        <p role="alert" className="mt-3 text-amber-800">
          {options.issue}
        </p>
      )}
      {!!savedDrafts?.unreadable.length && (
        <p role="alert" className="mt-3 text-amber-800">
          {t(
            'Some saved drafts cannot be opened by this editor. They remain in your project download for recovery.',
            '部分已保存草稿无法在此编辑器中打开，其原始内容仍保留在工程下载中，供后续恢复。',
          )}
        </p>
      )}
      {!!savedDrafts?.entries.length && (
        <label className="mt-3 block font-medium">
          {t('Saved task drafts', '已保存的任务草稿')}
          <select
            className={fieldClass}
            disabled={busy}
            value={draft?.taskId || ''}
            onChange={(event) => resume(savedDrafts.entries.find((entry) => entry.draft.taskId === event.target.value))}
          >
            <option value="">{t('Choose a draft to resume', '选择要继续编辑的草稿')}</option>
            {savedDrafts.entries.map((entry, index) => (
              <option key={entry.draft.taskId} value={entry.draft.taskId}>
                {index + 1}. {entry.title || t('Untitled task', '未命名任务')}
                {entry.draft.creation ? t(' (new task)', '（新任务）') : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      {options.lessons.length > 0 && (
        <details
          open={creationOpen}
          onToggle={(event) => {
            if (event.target === event.currentTarget) setCreationOpen(event.currentTarget.open);
          }}
          className="mt-3 rounded border border-slate-200 p-3"
        >
          <summary className="cursor-pointer font-medium">{t('Create a teaching task', '创建教学任务')}</summary>
          <fieldset disabled={busy} className="mt-3 space-y-3">
            <label className="block">
              {t('Lesson for the new task', '新任务所属课次')}
              <select
                className={fieldClass}
                value={newLesson || options.lessons[0].lessonNumber}
                onChange={(event) => setNewLesson(event.target.value)}
              >
                {options.lessons.map((lesson) => (
                  <option key={lesson.lessonNumber} value={lesson.lessonNumber}>
                    {lesson.lessonNumber}. {lesson.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              {t('Teaching focus', '教学重点')}
              <select
                className={fieldClass}
                value={newOperation}
                aria-label={t('Teaching focus', '教学重点')}
                onChange={(event) => setNewOperation(event.target.value)}
              >
                <option value="">{t('Choose the teaching focus', '选择教学重点')}</option>
                <option value="observed-proportion">
                  {t('Observed proportion and population limits', '观察比例与总体限制')}
                </option>
                <option value="record-amendment">{t('Changed rule and evidence limits', '规则修订与证据限制')}</option>
                <option value="claim-attribution">
                  {t('Claims, attribution and evidence limits', '陈述归属与证据边界')}
                </option>
                <option value="union-bounds">{t('Overlapping membership and bounds', '重叠成员与范围')}</option>
                <option value="pooled-proportion">
                  {t('Combined proportion and group weights', '合并比例与群体权重')}
                </option>
                <option value="record-relative-day">{t('Event dates and recollections', '事件日期与回忆记录')}</option>
                <option value="paired-condition-confound">
                  {t('Confounded comparison and a testable design', '混杂比较与可检验设计')}
                </option>
              </select>
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={!newOperation}
                className="font-medium underline disabled:opacity-50"
                onClick={() => beginNew(true)}
              >
                {t('Draft with local Scion', '用本地 Scion 起草')}
              </button>
              <button
                type="button"
                disabled={!newOperation}
                className="underline disabled:opacity-50"
                onClick={() => beginNew()}
              >
                {t('Start task draft', '开始任务草稿')}
              </button>
            </div>
          </fieldset>
        </details>
      )}
      {selected && (
        <div className="mt-3 space-y-4">
          {!draft?.creation ? (
            <>
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
                  {draft && !options.sources.some((source) => source.id === draft.taskId) && (
                    <option value={draft.taskId}>{selected.title || t('Unavailable task', '任务已不可用')}</option>
                  )}
                </select>
              </label>
              <p>{selected.objective}</p>
              {draft && options.sources.some((source) => source.id === draft.taskId) && (
                <button disabled={busy} className="font-medium underline" onClick={() => begin(selected, true)}>
                  {t('Reload current task and discard draft', '重新载入当前任务并放弃草稿')}
                </button>
              )}
              {!draft && (
                <button className="font-medium underline" onClick={() => begin()}>
                  {t('Open task review', '打开任务审阅')}
                </button>
              )}
            </>
          ) : (
            <fieldset disabled={busy} className="space-y-3">
              <legend className="font-semibold">{selected.title}</legend>
              <label className="block">
                {t('Teaching objective', '教学目标')}
                <textarea
                  aria-label={t('Teaching objective', '教学目标')}
                  className={fieldClass}
                  rows={3}
                  maxLength={6000}
                  value={draft.objective}
                  onChange={(event) => change((current) => ({ ...current, objective: event.target.value }))}
                />
              </label>
              <label className="block">
                {t('Class session (minutes)', '课堂时长（分钟）')}
                <input
                  className={fieldClass}
                  type="number"
                  min={1}
                  max={480}
                  value={draft.sessionMinutes}
                  onChange={(event) =>
                    change((current) => ({ ...current, sessionMinutes: Number(event.target.value) }))
                  }
                />
              </label>
              <label className="block">
                {t('Task practice (minutes)', '任务练习时长（分钟）')}
                <input
                  className={fieldClass}
                  type="number"
                  min={1}
                  max={draft.sessionMinutes}
                  value={draft.practiceMinutes}
                  onChange={(event) =>
                    change((current) => ({ ...current, practiceMinutes: Number(event.target.value) }))
                  }
                />
              </label>
            </fieldset>
          )}
          {draft && (
            <>
              {!draft.creation && (
                <label className="block font-medium">
                  {t('Task objective', '任务目标')}
                  <textarea
                    aria-label={t('Task objective', '任务目标')}
                    className={fieldClass}
                    rows={3}
                    maxLength={6000}
                    disabled={busy}
                    value={draft.objective ?? selected.objective}
                    onChange={(event) => change((current) => ({ ...current, objective: event.target.value }))}
                  />
                </label>
              )}
              {onRemoveDraft && (
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" disabled={busy} className="underline" onClick={discard}>
                    {t('Discard saved draft', '放弃已保存草稿')}
                  </button>
                </div>
              )}
              <fieldset disabled={busy} className="space-y-3">
                <legend className="font-semibold">{t('Source records', '来源记录')}</legend>
                {draft.creation && draft.sourceChoices?.length > 0 && (
                  <details open className="rounded border p-2">
                    <summary className="cursor-pointer">
                      {t(
                        `Choose records for this task (${draft.inputs.length}/8)`,
                        `选择本任务的来源（${draft.inputs.length}/8）`,
                      )}
                    </summary>
                    <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                      {draft.sourceChoices.map((choice, index) => {
                        const selected = draft.inputs.some((input) => input.id === choice.id);
                        return (
                          <label key={choice.id} className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={selected}
                              aria-label={t(`Use source record ${index + 1}`, `使用来源记录 ${index + 1}`)}
                              disabled={!selected && draft.inputs.length >= 8}
                              onChange={(event) => {
                                const checked = event.target.checked;
                                change((current) => selectTeachingSourceChoice(current, choice.id, checked));
                              }}
                            />
                            <span>{choice.text}</span>
                          </label>
                        );
                      })}
                    </div>
                  </details>
                )}
                {draft.inputs.map((input, index) => (
                  <div key={input.id}>
                    <label className="block">
                      {t(`Record ${index + 1}`, `记录 ${index + 1}`)}
                      <textarea
                        aria-label={t(`Record ${index + 1}`, `记录 ${index + 1}`)}
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
                    {draft.creation && (
                      <button
                        type="button"
                        className="mt-1 underline"
                        onClick={() =>
                          change((current) =>
                            current.sourceChoices?.some((choice) => choice.id === input.id)
                              ? selectTeachingSourceChoice(current, input.id, false)
                              : { ...current, inputs: current.inputs.filter((item) => item.id !== input.id) },
                          )
                        }
                      >
                        {t(`Remove record ${index + 1}`, `移除记录 ${index + 1}`)}
                      </button>
                    )}
                  </div>
                ))}
                {draft.creation && (
                  <button
                    type="button"
                    disabled={draft.inputs.length >= 8}
                    className="font-medium underline"
                    onClick={() =>
                      change((current) => ({
                        ...current,
                        inputs: [...current.inputs, { id: `input-${crypto.randomUUID()}`, text: '' }],
                      }))
                    }
                  >
                    {t('Add source record', '新增来源记录')}
                  </button>
                )}
              </fieldset>
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={busy || !draft.inputs.length}
                  className="font-medium underline"
                  onClick={() => proposeSources()}
                >
                  {t('Locate source phrases with local Scion', '让本地 Scion 定位来源片段')}
                </button>
                {proposing && (
                  <button type="button" className="ml-3 underline" onClick={() => proposalController.current?.abort()}>
                    {t('Cancel source proposal', '取消来源提案')}
                  </button>
                )}
                {import.meta.env.DEV && (lastProposalReceipt || draft.proposal) && (
                  <button
                    type="button"
                    className="ml-3 underline"
                    onClick={() => {
                      const url = URL.createObjectURL(
                        new Blob([JSON.stringify(lastProposalReceipt || draft.proposal, null, 2)], {
                          type: 'application/json',
                        }),
                      );
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = 'scion-source-proposal-development.json';
                      link.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Save development proposal record
                  </button>
                )}
              </div>
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
                    : draft.operation === 'union-bounds'
                      ? t(
                          'Check the common stable roster, within-event deduplication, missing overlap and both endpoint allocations.',
                          '核对共同稳定名册、活动内部去重、缺失重叠与两端分组。',
                        )
                      : draft.operation === 'pooled-proportion'
                        ? t(
                            'Check four counts, distinct membership, and a common outcome and deadline. Different group names alone do not justify pooling.',
                            '核对四个计数、互斥成员及一致的结果定义与截止时间。群体名称不同本身不能作为合并依据。',
                          )
                        : draft.operation === 'record-relative-day'
                          ? t(
                              'Check that the relative day refers to the selected Gregorian record date and that both records concern the same event. Keep missing years and verification limits explicit.',
                              '核对相对时间指向所选公历记录日期，且两份记录涉及同一事件；保留未知年份及核实限制。',
                            )
                          : draft.operation === 'claim-attribution'
                            ? t(
                                'Check each speaker, claim and stated basis. Keep missing evidence explicit.',
                                '核对各陈述者、陈述与明示依据，保留证据缺口。',
                              )
                            : draft.operation === 'paired-condition-confound'
                              ? t(
                                  'Check both condition combinations, independently assignable units, feasible controls and a shared measurement rule. Repeated readings belong to the same unit.',
                                  '核对两组条件、可独立分配的单位、可行的控制条件和一致测量规则；重复读数仍属于同一单位。',
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
              {draft.version === 2 ? (
                <TeachingPerformanceEditor draft={draft} onChange={change} zh={zh} disabled={busy} />
              ) : (
                <>
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
                  <details className="rounded border border-slate-200 p-2">
                    <summary className="cursor-pointer font-medium">
                      {t('Write a new requirement set', '编写新的教学要求')}
                    </summary>
                    <p className="my-2">
                      {t(
                        'Create replacement tasks, references, scoring and practice. The current materials remain available until you preview and confirm the complete set. Reload the current task to discard this draft.',
                        '编写替代的任务、参考、评分与练习。预览并确认完整方案前，现有材料保持可用；可重新载入当前任务来放弃草稿。',
                      )}
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      className="font-medium underline"
                      onClick={() =>
                        change((current) => ({ ...current, version: 2, requirements: [], practiceInputs: [] }))
                      }
                    >
                      {t('Start a requirement draft', '开始编写要求草稿')}
                    </button>
                  </details>
                </>
              )}
              <TeachingGoalAlignmentEditor
                draft={draft}
                requirementLabels={requirementLabels}
                onChange={change}
                courseGraph={courseGraph}
                courseMap={courseMap}
                lessonNumber={selected.lessonNumber}
                zh={zh}
                disabled={busy}
              />
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
            <div className="space-y-2 text-slate-700">
              <p role="status">{message}</p>
              {messageDetails.length > 0 && (
                <details>
                  <summary className="cursor-pointer underline">{t('Review details', '查看核对详情')}</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {messageDetails.map((detail, index) => (
                      <li key={index}>{detail}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
          {preview && (
            <section
              aria-label={t('Linked change preview', '关联修改预览')}
              className="space-y-3 border-t border-slate-300 pt-3"
            >
              <h4 className="font-semibold">{t('Proposed task', '建议任务')}</h4>
              <p>{preview.task.objective}</p>
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
                  data-testid="teaching-review-confirm"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                {draft.version === 2
                  ? t(
                      'I have reviewed the source conditions, student tasks, reference reasoning, scoring levels and independent practice together. Apply this complete teaching requirement set.',
                      '我已一并审阅来源条件、学生任务、参考推理、评分档位与独立练习；同意应用这套完整教学要求。',
                    )
                  : draft.operation === 'observed-proportion'
                    ? t(
                        'I have checked the part and whole refer to the same observed group, the unobserved outcomes are unknown, and the target population is wider. Apply these sources and scoring weights.',
                        '我已核对部分与整体属于同一已观察群体、未观察结果确实未知，且目标群体更广；同意应用这些来源与评分权重。',
                      )
                    : draft.operation === 'union-bounds'
                      ? t(
                          'I have checked the common roster, deduplication, missing overlap and both endpoints. Apply this task.',
                          '我已核对共同名册、去重、缺失重叠与两端分组，同意应用此任务。',
                        )
                      : draft.operation === 'pooled-proportion'
                        ? t(
                            'I have checked distinct membership, comparable counts, weights and the limits of this comparison. Apply this task.',
                            '我已核对成员互斥、计数可比、权重及比较限制，同意应用此任务。',
                          )
                        : draft.operation === 'record-relative-day'
                          ? t(
                              'I have checked the calendar, relative-date anchor and same-event evidence. Apply this task and scoring.',
                              '我已核对历法、相对日期依据和同一事件证据，同意应用此任务与评分。',
                            )
                          : draft.operation === 'claim-attribution'
                            ? t(
                                'I have checked the attribution, evidence limits, reference and scoring. Apply this task.',
                                '我已核对归属、证据限制、参考与评分，同意应用此任务。',
                              )
                            : draft.operation === 'paired-condition-confound'
                              ? t(
                                  'I have reviewed the source conditions, proposed procedure, reference and scoring. Apply this task.',
                                  '我已核对来源条件、建议步骤、参考与评分，同意应用此任务。',
                                )
                              : t(
                                  'I have checked the source roles, the effective change for the same setting, and the unknown observation date. Apply these sources and scoring weights.',
                                  '我已核对来源角色、同一情境下规则的生效变更，以及观察日期未知的条件；同意应用这些来源与评分权重。',
                                )}
              </label>
              {draft.goalAlignment && (
                <p>
                  {t(
                    'Confirmation also records that you checked how each requirement, its reference and practice support the selected learning targets.',
                    '确认同时记录您已核对各项要求、参考与练习如何支持所选学习目标。',
                  )}
                </p>
              )}
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
