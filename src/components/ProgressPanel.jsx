import React, { useState, useRef, useEffect } from 'react';
import GenerationLogPanel from './GenerationLogPanel';
import ExamSummary from './ExamSummary';
import ExportBar from './ExportBar';
import RevisionChat from './RevisionChat';

const STEPS = [
  { key: 'parsing', label: 'Parsing uploaded files' },
  { key: 'sending', label: 'Sending to AI model' },
  { key: 'generating', label: 'AI is generating course map' },
  { key: 'continuing', label: 'Auto-completing missing lessons' },
  { key: 'examining', label: 'Examining course map for completeness' },
  { key: 'done', label: 'Course map ready' },
];

export default function ProgressPanel({
  currentStep, modelName, error,
  courseMap, onRevision, isRevising,
  streamDetail, streamProgress, onStop,
  isStopped, onResume, onClearAll,
  examChanges, retryInfo, completenessInfo, generationLog, onExport, onImport, onRetryExamine,
  chatHistory, onChatHistoryChange,
}) {
  // Track start time for ETA calculation
  const startTimeRef = useRef(null);
  const [eta, setEta] = useState('');

  useEffect(() => {
    if ((currentStep === 'generating' || currentStep === 'continuing' || currentStep === 'examining') && !startTimeRef.current) {
      startTimeRef.current = Date.now();
    }
    if (currentStep === 'done' || !currentStep) {
      startTimeRef.current = null;
      setEta('');
    }
  }, [currentStep]);

  useEffect(() => {
    if (!startTimeRef.current || streamProgress <= 5 || streamProgress >= 100) {
      setEta('');
      return;
    }
    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    const totalEstimate = elapsed / (streamProgress / 100);
    const remaining = Math.max(Math.round(totalEstimate - elapsed), 0);
    if (remaining < 5) setEta('almost done');
    else if (remaining < 60) setEta(`~${remaining}s left`);
    else setEta(`~${Math.ceil(remaining / 60)}min left`);
  }, [streamProgress]);

  if (!currentStep && !error) return null;

  const isDone = currentStep === 'done' && !isRevising;

  // Only show the 'continuing' step if auto-continuation is active or was used
  const showContinuing = completenessInfo && (
    currentStep === 'continuing' ||
    completenessInfo.status === 'continuing' ||
    completenessInfo.continuationUsed
  );
  const visibleSteps = showContinuing ? STEPS : STEPS.filter(s => s.key !== 'continuing');
  const currentIdx = visibleSteps.findIndex((s) => s.key === currentStep);

  return (
    <div className="glass rounded-squircle shadow-glass overflow-hidden animate-spring-scale">
      <div className="p-7 pb-5">
        <h2 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-squircle-xs bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none">
              <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round"/>
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={1.6}/>
            </svg>
          </div>
          Generation Progress
        </h2>

        {isDone ? (
          <div>
            <div className="flex items-center gap-3 py-1">
              <div className="w-7 h-7 rounded-full bg-emerald-100/80 flex items-center justify-center flex-shrink-0">
                <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-sm font-medium text-emerald-700">Course map ready</span>
              {completenessInfo && (
                <span className={`ml-2 text-[10px] font-semibold px-2.5 py-1 rounded-pill ${
                  completenessInfo.status === 'complete'
                    ? 'text-emerald-600 bg-emerald-50/60 border border-emerald-100/50'
                    : completenessInfo.status === 'incomplete'
                    ? 'text-amber-600 bg-amber-50/60 border border-amber-100/50'
                    : 'text-slate-500 bg-slate-50/60 border border-slate-200/50'
                }`}>
                  {completenessInfo.status === 'complete' || completenessInfo.actual >= (completenessInfo.expected || 0)
                    ? `${completenessInfo.actual} lessons ✓`
                    : `${completenessInfo.actual} of ${completenessInfo.expected || '?'} lessons — may be incomplete`}
                </span>
              )}
              <div className="ml-2 flex-1 h-1 bg-emerald-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full w-full" />
              </div>
            </div>
            {generationLog && generationLog.length > 0 && (
              <GenerationLogPanel entries={generationLog} defaultCollapsed={true} />
            )}
            {examChanges && examChanges.length > 0 && (
              <ExamSummary changes={examChanges} onRetry={onRetryExamine} />
            )}
            {onExport && (
              <ExportBar onExport={onExport} onImport={onImport} />
            )}
          </div>
        ) : (
          <>
            <div className="space-y-0.5">
              {visibleSteps.map((step, idx) => {
                let state = 'pending';
                if (error && idx === currentIdx) state = 'error';
                else if (idx < currentIdx) state = 'done';
                else if (idx === currentIdx) state = 'active';

                return (
                  <div key={step.key} className="flex items-center gap-3 py-1.5">
                    <StepIcon state={state} />
                    <div className="flex flex-col">
                      <span className={`text-sm font-medium ${
                        state === 'done' ? 'text-emerald-600'
                          : state === 'active' ? 'text-indigo-600'
                          : state === 'error' ? 'text-red-500'
                          : 'text-slate-300'
                      }`}>
                        {step.key === 'generating' && modelName
                          ? `${modelName} is generating course map`
                          : step.key === 'continuing' && modelName
                          ? `${modelName} is completing missing lessons`
                          : step.key === 'examining' && modelName
                          ? `${modelName} is examining course map`
                          : step.label}
                      </span>
                      {state === 'active' && (step.key === 'generating' || step.key === 'examining' || step.key === 'continuing') && streamDetail && (
                        <span className="text-xs text-indigo-400 mt-0.5 truncate max-w-[320px]">
                          {streamDetail}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {generationLog && generationLog.length > 0 && (
              <GenerationLogPanel entries={generationLog} />
            )}

            {isStopped && (
              <div className="mt-4 flex items-center gap-3">
                <div className="flex-1 h-1.5 bg-slate-100/80 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${streamProgress || 50}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-amber-600 bg-amber-50/80 px-2.5 py-1 rounded-full flex-shrink-0">
                  Paused
                </span>
              </div>
            )}

            {isStopped && error && (
              <div className="mt-3 px-3.5 py-2.5 rounded-squircle-xs bg-red-50/80 border border-red-200/40 text-xs text-red-600 font-medium animate-spring-in">
                {error}
              </div>
            )}

            {isStopped && (
              <div className="mt-3 flex items-center gap-2.5">
                <button
                  onClick={onResume}
                  className="tactile flex items-center gap-1.5 px-5 py-2 rounded-squircle-xs text-xs font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-600 shadow-btn hover:brightness-110 transition-all duration-200"
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Resume
                </button>
                <button
                  onClick={onClearAll}
                  className="tactile flex items-center gap-1.5 px-5 py-2 rounded-squircle-xs text-xs font-semibold text-red-500 bg-red-50/80 border border-red-200/40 hover:bg-red-100/80 transition-all duration-200"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Clear All
                </button>
              </div>
            )}

            {retryInfo && (
              <div className="mt-3 flex items-center gap-2.5 px-3.5 py-2.5 rounded-squircle-xs bg-amber-50/80 border border-amber-200/50 animate-spring-in">
                <svg className="animate-spin w-3.5 h-3.5 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-xs font-medium text-amber-700">
                  Connection lost — retrying ({retryInfo.attempt}/{retryInfo.max})...
                </span>
              </div>
            )}

            {!isStopped && currentStep && !error && currentStep !== 'done' && (
              <div className="mt-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1.5 bg-slate-100/80 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${(currentStep === 'generating' || currentStep === 'continuing') && streamProgress > 0 ? streamProgress : Math.min(((currentIdx + 1) / visibleSteps.length) * 100, 20)}%` }}
                    />
                  </div>
                  {onStop && (
                    <button
                      onClick={onStop}
                      className="tactile flex items-center gap-1.5 px-3.5 py-1.5 rounded-squircle-xs text-xs font-semibold text-red-500 bg-red-50/80 border border-red-200/40 hover:bg-red-100/80 transition-all duration-200 flex-shrink-0"
                    >
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="6" width="12" height="12" rx="2" />
                      </svg>
                      Stop
                    </button>
                  )}
                </div>
                {eta && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
                      <path strokeLinecap="round" strokeWidth={1.5} d="M12 6v6l4 2" />
                    </svg>
                    <span className="text-[11px] font-medium text-slate-400">{eta}</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {(isDone || isStopped) && courseMap && (
        <RevisionChat onRevision={onRevision} isRevising={isRevising} savedMessages={chatHistory} onMessagesChange={onChatHistoryChange} />
      )}
    </div>
  );
}

function StepIcon({ state }) {
  if (state === 'done') {
    return (
      <div className="w-6 h-6 rounded-full bg-emerald-100/80 flex items-center justify-center flex-shrink-0">
        <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }
  if (state === 'active') {
    return (
      <div className="w-6 h-6 rounded-full bg-indigo-100/80 flex items-center justify-center flex-shrink-0">
        <svg className="animate-spin w-3.5 h-3.5 text-indigo-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="w-6 h-6 rounded-full bg-red-100/80 flex items-center justify-center flex-shrink-0">
        <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
    );
  }
  return (
    <div className="w-6 h-6 rounded-full bg-slate-100/60 flex items-center justify-center flex-shrink-0">
      <div className="w-2 h-2 rounded-full bg-slate-200" />
    </div>
  );
}
