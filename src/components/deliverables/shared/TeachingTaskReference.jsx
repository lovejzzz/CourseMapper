import React from 'react';
import { E } from './SharedComponents';

/** The same editable teacher reference used by task briefs and rubrics. */
export default function TeachingTaskReference({ reference, path, onEdit }) {
  if (!reference?.strongSample) return null;
  const zh = reference.language === 'zh';
  return (
    <details data-teaching-task-reference className="rounded-lg border border-slate-200/70 bg-slate-50/60 p-3">
      <summary className="cursor-pointer text-xs font-semibold text-slate-700">
        {zh ? '教师参考：答案与反馈' : 'Teacher reference: answers and feedback'}
      </summary>
      <div className="mt-3 space-y-3 text-xs leading-relaxed text-slate-700">
        {reference.sampleOrigin === 'synthetic-review-examples' && (
          <p>
            {zh
              ? '以下为检查评分标准而编写的模拟回答，并非真实学生作答。评分示例需由教师审阅。'
              : 'These constructed responses help review the rubric. They are not student data; scoring examples require teacher review.'}
          </p>
        )}
        {[
          ['strongSample', zh ? '完整回答' : 'Strong response'],
          ['partialSample', zh ? '部分理解的回答' : 'Partial response'],
          ['misconceptionSample', zh ? '典型误解' : 'Typical misconception'],
          ['alternativeSample', zh ? '合理的替代表达' : 'Acceptable alternative'],
          ['scoringRationale', zh ? '评分为何不同' : 'Why the score differs'],
          ['revisionPrompt', zh ? '修改反馈' : 'Feedback for revision'],
        ].map(([field, label]) =>
          reference[field] ? (
            <div key={field}>
              <p className="mb-1 font-semibold text-slate-800">{label}</p>
              <E value={reference[field]} path={[...path, field]} onEdit={onEdit} multiline />
            </div>
          ) : null,
        )}
      </div>
    </details>
  );
}
