import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import EditProposalPanel from '../EditProposalPanel';
import {
  QualityBadge,
  updatePath,
  E,
  ResizableTh,
  SaveToBankButton,
  StreamingBanner,
  ErrorState,
  WaitingState,
  EmptyState,
  CollapsibleCard,
  Badge,
  BloomsTag,
  SectionHeading,
  FEATURE_META,
  TierToggle,
} from './shared/SharedComponents';

// ─── Quiz Bank ───
export default function QuizBankView({
  data,
  isStreaming,
  onEdit,
  regeneratingIndex,
  onRegenerateLesson,
  onSaveToBank,
  activeTier,
  freshLessonIndices,
  proposals,
  onAcceptProposal,
  onDismissProposal,
  onRegenerateProposal,
}) {
  const [localTiers, setLocalTiers] = useState({});
  if (!data) return isStreaming ? <StreamingBanner /> : <EmptyState />;
  const key = data.quizzes ? 'quizzes' : 'quizBank';
  const quizzes = data[key] || [];
  if (quizzes.length === 0 && !isStreaming) return <EmptyState />;
  return (
    <div className="space-y-3 p-4">
      {quizzes.map((baseQuiz, i) => {
        // Feature 4.1 — select tier variant
        const currentTier = localTiers[i] || 'standard';
        const quiz =
          currentTier !== 'standard' && baseQuiz.tiers?.[currentTier]
            ? { ...baseQuiz, ...baseQuiz.tiers[currentTier] }
            : baseQuiz;
        const subtitle = [
          quiz.questions?.length ? `${quiz.questions.length} questions` : null,
          quiz.bloomsCoverage?.length ? quiz.bloomsCoverage.join(', ') : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <React.Fragment key={i}>
            {proposals?.[i] && (
              <EditProposalPanel
                proposal={proposals[i]}
                featureId="quizBank"
                onInsert={() => onAcceptProposal?.(i)}
                onDismiss={() => onDismissProposal?.(i)}
                onRegenerate={() => onRegenerateProposal?.(i)}
              />
            )}
            <CollapsibleCard
              title={quiz.lessonTitle || `Quiz ${i + 1}`}
              subtitle={subtitle}
              defaultOpen={i < 3}
              accent="sky"
              streaming={isStreaming && i === quizzes.length - 1}
              regenerating={regeneratingIndex === i}
              fresh={!!freshLessonIndices?.has(i)}
              onRegenerate={onRegenerateLesson && !isStreaming ? () => onRegenerateLesson(i) : undefined}
              onTitleEdit={onEdit ? (newTitle) => onEdit([key, i, 'lessonTitle'], newTitle) : undefined}
            >
              <div className="pt-3 space-y-3">
                {quiz.bloomsCoverage?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {quiz.bloomsCoverage.map((b, k) => (
                      <BloomsTag key={k} level={b} />
                    ))}
                  </div>
                )}
                {(quiz.questions || []).map((q, j) => (
                  <QuestionCard
                    key={j}
                    question={q}
                    number={j + 1}
                    qPath={[key, i, 'questions', j]}
                    onEdit={onEdit}
                    onSaveToBank={onSaveToBank}
                  />
                ))}
              </div>
            </CollapsibleCard>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function QuestionCard({ question, number, qPath, onEdit, onSaveToBank }) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [saved, setSaved] = useState(false);
  const q = question;
  const typeColors = { multiple_choice: 'sky', short_answer: 'violet', essay: 'rose' };
  const diffColors = {
    Easy: 'text-emerald-600 bg-emerald-50',
    Medium: 'text-amber-600 bg-amber-50',
    Hard: 'text-red-600 bg-red-50',
  };
  const color = typeColors[q.type] || 'slate';
  const handleSave = () => {
    if (!onSaveToBank) return;
    onSaveToBank({ type: 'quiz', text: q.question || '', bloomsLevel: q.bloomsLevel || '' });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  return (
    <div className="bg-white/60 rounded-lg border border-slate-100 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <span className="text-[10px] font-bold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0">
          Q{number}
        </span>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            <Badge color={color}>{(q.type || 'question').replace('_', ' ')}</Badge>
            {q.bloomsLevel && <BloomsTag level={q.bloomsLevel} />}
            {q.difficulty && (
              <span
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${diffColors[q.difficulty] || 'text-slate-500 bg-slate-50'}`}
              >
                {q.difficulty}
              </span>
            )}
            {q.points && <span className="text-[10px] text-slate-400 ml-auto">{q.points} pts</span>}
            {q.estimatedMinutes && <span className="text-[10px] text-slate-400">~{q.estimatedMinutes} min</span>}
            {onSaveToBank && (
              <button
                onClick={handleSave}
                className={`ml-auto text-[9px] font-semibold px-1.5 py-0.5 rounded transition-all ${saved ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'}`}
                title="Save to Assessment Bank"
                aria-label={saved ? 'Saved to Assessment Bank' : 'Save to Assessment Bank'}
              >
                {saved ? '✓ Saved' : '💾'}
              </button>
            )}
          </div>
          {q.objectiveAligned && (
            <p className="text-[9px] text-indigo-400 mb-1.5">
              ↳{' '}
              <E
                value={q.objectiveAligned}
                path={[...qPath, 'objectiveAligned']}
                onEdit={onEdit}
                className="text-[9px] text-indigo-400"
              />
            </p>
          )}
          <p className="text-xs text-slate-800 font-medium leading-relaxed">
            <E value={q.question} path={[...qPath, 'question']} onEdit={onEdit} multiline />
          </p>
        </div>
      </div>
      {q.options && (
        <div className="ml-8 space-y-1">
          {q.options.map((opt, k) => {
            const isCorrect = showAnswer && opt.startsWith(q.answer);
            return (
              <div
                key={k}
                className={`text-[11px] px-2.5 py-1.5 rounded transition-colors ${isCorrect ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-slate-600 bg-slate-50/40'}`}
              >
                <E value={opt} path={[...qPath, 'options', k]} onEdit={onEdit} />
              </div>
            );
          })}
        </div>
      )}
      <button
        onClick={() => setShowAnswer(!showAnswer)}
        className="text-[10px] font-semibold text-indigo-500 hover:text-indigo-700 ml-8 transition-colors"
      >
        {showAnswer ? 'Hide answer ↑' : 'Show answer + rationale ↓'}
      </button>
      {showAnswer && (
        <div className="ml-8 text-[11px] bg-emerald-50/60 rounded-lg p-3 border border-emerald-100/50 space-y-2">
          {q.answer && (
            <p>
              <span className="font-semibold text-emerald-700">Answer:</span>{' '}
              <E value={q.answer} path={[...qPath, 'answer']} onEdit={onEdit} className="text-slate-700" />
            </p>
          )}
          {q.explanation && (
            <div>
              <span className="font-semibold text-emerald-700 block mb-0.5">Explanation:</span>
              <E
                value={q.explanation}
                path={[...qPath, 'explanation']}
                onEdit={onEdit}
                className="text-slate-700 leading-relaxed"
                multiline
              />
            </div>
          )}
          {q.distractorRationale && (
            <div className="bg-amber-50/60 rounded p-2 border border-amber-100/50">
              <span className="font-semibold text-amber-700 block mb-0.5 text-[10px]">
                Distractor Rationale (misconceptions tested):
              </span>
              <E
                value={q.distractorRationale}
                path={[...qPath, 'distractorRationale']}
                onEdit={onEdit}
                className="text-slate-600 text-[10px] leading-relaxed"
                multiline
              />
            </div>
          )}
          {q.sampleAnswer && (
            <div>
              <span className="font-semibold text-emerald-700 block mb-0.5">Model Answer:</span>
              <E
                value={q.sampleAnswer}
                path={[...qPath, 'sampleAnswer']}
                onEdit={onEdit}
                className="text-slate-700 leading-relaxed"
                multiline
              />
            </div>
          )}
          {q.rubricHints && (
            <div className="bg-violet-50/40 rounded p-2 border border-violet-100/50">
              <span className="font-semibold text-violet-700 block mb-0.5 text-[10px]">Essay Scoring Criteria:</span>
              <E
                value={q.rubricHints}
                path={[...qPath, 'rubricHints']}
                onEdit={onEdit}
                className="text-slate-600 text-[10px] leading-relaxed"
                multiline
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
