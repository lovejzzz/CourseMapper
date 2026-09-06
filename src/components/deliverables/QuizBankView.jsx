import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import EditProposalPanel from '../EditProposalPanel';
import { renderedDeliverableCollectionKey } from '../../lib/renderedDeliverableCollection.js';
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
import { quizPresentationOrder } from './shared/lessonGrouping';

// v0.14.1 (3.5): the lesson a quiz/exam entry belongs to — compiled exam
// entries carry lessonNumber; weekly entries name their lesson in the title.
function quizLessonNumber(quiz, index) {
  if (Number.isInteger(quiz?.lessonNumber) && quiz.lessonNumber > 0) return quiz.lessonNumber;
  const match = String(quiz?.lessonTitle || quiz?.lt || '').match(/(?:Lesson|Week)\s*(\d+)/i);
  return match ? Number(match[1]) : index + 1;
}

function ownField(object, expanded, compact) {
  return Object.prototype.hasOwnProperty.call(object || {}, expanded) ? expanded : compact;
}

function fieldValue(object, expanded, compact, fallback = '') {
  return object?.[expanded] ?? object?.[compact] ?? fallback;
}

// v0.14.4 (D2): registry identity for exam entries — id · kind · points.
function examIdentityLine(quiz) {
  const identity = [quiz?.assessmentId, 'Exam', Number.isFinite(quiz?.totalPoints) ? `${quiz.totalPoints} pts` : null]
    .filter(Boolean)
    .join(' · ');
  return identity || null;
}

// ─── Quiz Bank ───
export default function QuizBankView({
  data,
  isStreaming,
  onEdit,
  regeneratingIndex,
  onRegenerateLesson,
  onSaveToBank,
  isStudentView,
  activeTier,
  freshLessonIndices,
  proposals,
  onAcceptProposal,
  onDismissProposal,
  onRegenerateProposal,
  onShowInCourseMap,
}) {
  const [localTiers, setLocalTiers] = useState({});
  if (!data) return isStreaming ? <StreamingBanner /> : <EmptyState />;
  const key = renderedDeliverableCollectionKey('quizBank', data);
  const quizzes = key ? data[key] : [];
  if (quizzes.length === 0 && !isStreaming) return <EmptyState />;
  // v0.14.4 (D2): presentation-only reorder — the compiler appends exam
  // entries at the end of the array; on screen each exam sits right after its
  // own lesson's weekly quiz. Edit paths keep the ORIGINAL index.
  const ordered = quizPresentationOrder(quizzes, quizLessonNumber);
  return (
    <div className="space-y-3 p-4">
      {ordered.map(({ item: baseQuiz, index: i }) => {
        // Feature 4.1 — select tier variant
        const currentTier = localTiers[i] || 'standard';
        const quiz =
          currentTier !== 'standard' && baseQuiz.tiers?.[currentTier]
            ? { ...baseQuiz, ...baseQuiz.tiers[currentTier] }
            : baseQuiz;
        const questionKey = Array.isArray(quiz.questions) ? 'questions' : Array.isArray(quiz.qs) ? 'qs' : 'questions';
        const questions = quiz[questionKey] || [];
        const bloomsCoverage = quiz.bloomsCoverage || quiz.bc || [];
        const subtitle = [
          questions.length ? `${questions.length} question${questions.length === 1 ? '' : 's'}` : null,
          bloomsCoverage.length ? bloomsCoverage.join(', ') : null,
        ]
          .filter(Boolean)
          .join(' · ');
        const isExam = baseQuiz.kind === 'exam';
        const courseLessonIndex = Math.max(0, quizLessonNumber(baseQuiz, i) - 1);
        const regenerationTarget = {
          deliverableItemIndex: i,
          targetKind: isExam ? 'exam' : 'lesson',
          ...(isExam ? { assessmentId: baseQuiz.assessmentId || baseQuiz.registryId || '' } : {}),
        };
        const card = (
          <CollapsibleCard
            viewportIndex={i}
            title={quiz.lessonTitle || quiz.lt || `Quiz ${i + 1}`}
            subtitle={subtitle}
            metaLine={isExam ? examIdentityLine(baseQuiz) : null}
            defaultOpen={i < 3}
            accent={isExam ? 'indigo' : 'sky'}
            streaming={isStreaming && i === quizzes.length - 1}
            regenerating={regeneratingIndex === i}
            fresh={!!freshLessonIndices?.has(i)}
            onRegenerate={
              onRegenerateLesson && !isStreaming
                ? () => onRegenerateLesson(courseLessonIndex, regenerationTarget)
                : undefined
            }
            onTitleEdit={
              onEdit ? (newTitle) => onEdit([key, i, ownField(quiz, 'lessonTitle', 'lt')], newTitle) : undefined
            }
          >
            <div className="pt-3 space-y-3">
              {bloomsCoverage.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {bloomsCoverage.map((b, k) => (
                    <BloomsTag key={k} level={b} />
                  ))}
                </div>
              )}
              {questions.map((q, j) => (
                <QuestionCard
                  key={j}
                  question={q}
                  number={j + 1}
                  qPath={[key, i, questionKey, j]}
                  onEdit={onEdit}
                  onSaveToBank={onSaveToBank}
                  isStudentView={isStudentView}
                />
              ))}
              {/* v0.14.4 (D2): the exam's answer key, visually separated from
                  the question list. Constructed-response rows show their
                  scoring guide in place of a letter. */}
              {!isStudentView && isExam && Array.isArray(quiz.answerKey) && quiz.answerKey.length > 0 && (
                <div
                  data-exam-answer-key="true"
                  className="mt-4 rounded-lg border border-slate-200/70 dark:border-slate-700/60 overflow-hidden"
                >
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200/60 dark:border-slate-700/60">
                    <h4 className="text-[12px] font-semibold text-slate-600 dark:text-slate-300">Answer key</h4>
                    {Number.isFinite(quiz.totalPoints) && (
                      <span className="text-[12px] tabular-nums text-slate-400 dark:text-slate-500">
                        {quiz.totalPoints} pts
                      </span>
                    )}
                  </div>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {quiz.answerKey.map((entry, k) => (
                      <li key={k} className="flex items-start gap-2 px-3 py-1.5 text-[12px]">
                        <span className="flex-shrink-0 w-8 font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                          Q{entry.question}
                        </span>
                        <span className="flex-shrink-0 w-24 capitalize text-slate-400 dark:text-slate-500">
                          {String(entry.type || '').replace(/_/g, ' ')}
                        </span>
                        <span className="min-w-0 text-slate-700 dark:text-slate-200 line-clamp-2">{entry.answer}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </CollapsibleCard>
        );
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
            {/* v0.14.1 (3.5): focus anchor — exam chips in the course map
                scroll to and highlight this wrapper (DeliverableView). */}
            <div
              data-assessment-anchor="true"
              data-assessment-id={baseQuiz.assessmentId || ''}
              data-assessment-title={baseQuiz.lessonTitle || baseQuiz.lt || ''}
              data-lesson-number={quizLessonNumber(baseQuiz, i)}
              className="rounded-squircle-xs transition-shadow duration-300"
            >
              {isExam ? (
                /* v0.14.4 (D2): exams stand out — indigo-bordered shell with an
                   "Exam" chip, the examScope coverage line, and the reverse
                   "Show in course map" affordance (D3) always visible. */
                <div
                  data-exam-entry="true"
                  className="rounded-squircle-xs border border-indigo-200/80 dark:border-indigo-800/60 overflow-hidden"
                >
                  <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-indigo-50/80 dark:bg-indigo-950/40 border-b border-indigo-100/70 dark:border-indigo-900/50">
                    <span
                      data-exam-chip="true"
                      className="text-[12px] font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300 bg-indigo-100/80 dark:bg-indigo-900/50 px-2 py-0.5 rounded-full"
                    >
                      Exam
                    </span>
                    {baseQuiz.examScope && (
                      <span
                        data-exam-scope="true"
                        className="min-w-0 text-[12px] font-medium text-indigo-900 dark:text-indigo-200"
                      >
                        {baseQuiz.examScope}
                      </span>
                    )}
                    {onShowInCourseMap && !isStudentView && (
                      <button
                        type="button"
                        data-show-in-coursemap="true"
                        onClick={() =>
                          onShowInCourseMap({
                            ...baseQuiz,
                            // The map cell carries the colon form ("Midterm
                            // Exam: …"); the compiled entry display-titles
                            // itself with an em dash.
                            title: String(baseQuiz.lessonTitle || baseQuiz.lt || '').replace(/\s+—\s+/, ': '),
                          })
                        }
                        className="tactile ml-auto inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-0.5 rounded-full text-indigo-600 dark:text-indigo-300 bg-white/70 dark:bg-slate-900/50 border border-indigo-200/70 dark:border-indigo-800/70 hover:bg-indigo-100/70 dark:hover:bg-indigo-900/40 transition-all duration-150"
                        title="Show this exam's row in the course map"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth={1.6} />
                          <path
                            d="M3 9h18M3 15h18M9 3v18"
                            stroke="currentColor"
                            strokeWidth={1.6}
                            strokeLinecap="round"
                          />
                        </svg>
                        Show in course map
                      </button>
                    )}
                  </div>
                  {card}
                </div>
              ) : (
                card
              )}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function QuestionCard({ question, number, qPath, onEdit, onSaveToBank, isStudentView }) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [saved, setSaved] = useState(false);
  const q = question;
  const typeColors = { multiple_choice: 'sky', short_answer: 'violet', essay: 'rose' };
  const diffColors = {
    Easy: 'text-emerald-600 bg-emerald-50',
    Medium: 'text-amber-600 bg-amber-50',
    Hard: 'text-red-600 bg-red-50',
  };
  const type = fieldValue(q, 'type', 'ty', 'question');
  const bloomsLevel = fieldValue(q, 'bloomsLevel', 'bl');
  const difficulty = fieldValue(q, 'difficulty', 'df');
  const points = fieldValue(q, 'points', 'pt', null);
  const estimatedMinutes = fieldValue(q, 'estimatedMinutes', 'em', null);
  const objectiveAligned = fieldValue(q, 'objectiveAligned', 'oa');
  const prompt = fieldValue(q, 'question', 'q');
  const options = fieldValue(q, 'options', 'op', null);
  const answer = fieldValue(q, 'answer', 'an');
  const explanation = fieldValue(q, 'explanation', 'ex');
  const distractorRationale = fieldValue(q, 'distractorRationale', 'dr');
  const sampleAnswer = fieldValue(q, 'sampleAnswer', 'sa');
  const rubricHints = fieldValue(q, 'rubricHints', 'rh');
  const scoringGuidance = fieldValue(q, 'scoringGuidance', 'sg');
  const color = typeColors[type] || 'slate';
  const handleSave = () => {
    if (!onSaveToBank) return;
    onSaveToBank({ type: 'quiz', text: prompt, bloomsLevel });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  return (
    <div className="bg-white/60 rounded-lg border border-slate-100 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0">
          Q{number}
        </span>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            <Badge color={color}>{type.replace('_', ' ')}</Badge>
            {bloomsLevel && <BloomsTag level={bloomsLevel} />}
            {difficulty && (
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${diffColors[difficulty] || 'text-slate-500 bg-slate-50'}`}
              >
                {difficulty}
              </span>
            )}
            {points && <span className="text-xs text-slate-400 ml-auto">{points} pts</span>}
            {estimatedMinutes && <span className="text-xs text-slate-400">~{estimatedMinutes} min</span>}
            {onSaveToBank && (
              <button
                onClick={handleSave}
                className={`ml-auto text-xs font-semibold px-1.5 py-0.5 rounded transition-all ${saved ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'}`}
                title="Save to Assessment Bank"
                aria-label={saved ? 'Saved to Assessment Bank' : 'Save to Assessment Bank'}
              >
                {saved ? '✓ Saved' : '💾'}
              </button>
            )}
          </div>
          {objectiveAligned && (
            <p className="text-xs text-indigo-400 mb-1.5">
              ↳{' '}
              <E
                value={objectiveAligned}
                path={[...qPath, ownField(q, 'objectiveAligned', 'oa')]}
                onEdit={onEdit}
                className="text-xs text-indigo-400"
              />
            </p>
          )}
          <p className="text-xs text-slate-800 font-medium leading-relaxed">
            <E value={prompt} path={[...qPath, ownField(q, 'question', 'q')]} onEdit={onEdit} multiline />
          </p>
        </div>
      </div>
      {options && (
        <div className="ml-8 space-y-1">
          {options.map((opt, k) => {
            const isCorrect = !isStudentView && showAnswer && Boolean(answer) && opt.startsWith(answer);
            return (
              <div
                key={k}
                className={`text-xs px-2.5 py-1.5 rounded transition-colors ${isCorrect ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-slate-600 bg-slate-50/40'}`}
              >
                <E value={opt} path={[...qPath, ownField(q, 'options', 'op'), k]} onEdit={onEdit} />
              </div>
            );
          })}
        </div>
      )}
      {!isStudentView && q.sourceReviewRequired === true && (
        <p className="ml-8 text-xs text-amber-800 dark:text-amber-300">
          Teacher review: replace general guidance with a specific answer supported by this question's record.
          {onEdit && (
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => onEdit([...qPath, 'sourceReviewRequired'], false)}
            >
              Mark answer reviewed
            </button>
          )}
        </p>
      )}
      {!isStudentView && (
        <button
          onClick={() => setShowAnswer(!showAnswer)}
          className="text-xs font-semibold text-indigo-500 hover:text-indigo-700 ml-8 transition-colors"
        >
          {showAnswer ? 'Hide answer ↑' : 'Show answer + rationale ↓'}
        </button>
      )}
      {!isStudentView && showAnswer && (
        <div className="ml-8 text-xs bg-emerald-50/60 rounded-lg p-3 border border-emerald-100/50 space-y-2">
          {answer && (
            <p>
              <span className="font-semibold text-emerald-700">Answer:</span>{' '}
              <E
                value={answer}
                path={[...qPath, ownField(q, 'answer', 'an')]}
                onEdit={onEdit}
                className="text-slate-700"
              />
            </p>
          )}
          {explanation && (
            <div>
              <span className="font-semibold text-emerald-700 block mb-0.5">Explanation:</span>
              <E
                value={explanation}
                path={[...qPath, ownField(q, 'explanation', 'ex')]}
                onEdit={onEdit}
                className="text-slate-700 leading-relaxed"
                multiline
              />
            </div>
          )}
          {distractorRationale && (
            <div className="bg-amber-50/60 rounded p-2 border border-amber-100/50">
              <span className="font-semibold text-amber-700 block mb-0.5 text-xs">
                Distractor Rationale (misconceptions tested):
              </span>
              <E
                value={distractorRationale}
                path={[...qPath, ownField(q, 'distractorRationale', 'dr')]}
                onEdit={onEdit}
                className="text-slate-600 text-xs leading-relaxed"
                multiline
              />
            </div>
          )}
          {sampleAnswer && (
            <div>
              <span className="font-semibold text-emerald-700 block mb-0.5">Model Answer:</span>
              <E
                value={sampleAnswer}
                path={[...qPath, ownField(q, 'sampleAnswer', 'sa')]}
                onEdit={onEdit}
                className="text-slate-700 leading-relaxed"
                multiline
              />
            </div>
          )}
          {(rubricHints || scoringGuidance) && (
            <div className="bg-violet-50/40 rounded p-2 border border-violet-100/50">
              <span className="font-semibold text-violet-700 block mb-0.5 text-xs">
                {rubricHints ? 'Essay scoring criteria:' : 'Scoring guidance:'}
              </span>
              <E
                value={rubricHints || scoringGuidance}
                path={[...qPath, rubricHints ? ownField(q, 'rubricHints', 'rh') : ownField(q, 'scoringGuidance', 'sg')]}
                onEdit={onEdit}
                className="text-slate-600 text-xs leading-relaxed"
                multiline
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
