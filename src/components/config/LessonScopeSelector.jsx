export default function LessonScopeSelector({
  lessonCount,
  isDetectingLessons,
  courseMap,
  lessonScope,
  setLessonScope,
}) {
  const generatedLessons = courseMap?.lessons || [];
  const total = generatedLessons.length > 0 ? generatedLessons.length : lessonCount || 0;
  const rows = Array.from({ length: total }, (_, i) => ({
    index: i,
    label: generatedLessons[i]?.title || `Lesson ${i + 1}`,
  }));

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/65 p-4 dark:border-slate-800 dark:bg-slate-900/55">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-400/10">
          <svg
            className="w-4 h-4 text-blue-600 dark:text-blue-200"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Lesson scope</h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Generate all lessons or a focused subset.</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setLessonScope({ type: 'all' })}
          aria-pressed={lessonScope.type === 'all'}
          className={`tactile min-h-11 flex-1 rounded-lg text-xs font-semibold transition-all duration-200 ${
            lessonScope.type === 'all'
              ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950'
              : 'border border-slate-200 bg-white/80 text-slate-600 hover:bg-white dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-300 dark:hover:bg-slate-950'
          }`}
        >
          All {total > 0 ? `(${total} ${total === 1 ? 'lesson' : 'lessons'})` : 'lessons'}
        </button>
        <button
          type="button"
          onClick={() => setLessonScope({ type: 'specific', indices: lessonScope.indices || [] })}
          aria-pressed={lessonScope.type === 'specific'}
          className={`tactile min-h-11 flex-1 rounded-lg text-xs font-semibold transition-all duration-200 ${
            lessonScope.type === 'specific'
              ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950'
              : 'border border-slate-200 bg-white/80 text-slate-600 hover:bg-white dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-300 dark:hover:bg-slate-950'
          }`}
        >
          Specific lessons
        </button>
      </div>

      {lessonScope.type === 'specific' && (
        <div className="space-y-2 animate-spring-in">
          {total === 0 ? (
            isDetectingLessons ? (
              <p className="text-[11px] text-blue-600 italic flex items-center gap-1.5 dark:text-blue-200">
                <svg className="w-3 h-3 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Detecting lesson count from your syllabus…
              </p>
            ) : (
              <p className="text-[11px] text-amber-500 italic">
                No lesson count detected — enter a course description or upload a syllabus on the previous page.
              </p>
            )
          ) : (
            <>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400">
                  {lessonScope.indices?.length || 0} of {total} selected
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setLessonScope({ type: 'specific', indices: rows.map((r) => r.index) })}
                    className="min-h-11 px-2 text-[10px] font-semibold text-blue-600 transition-colors hover:text-blue-800 dark:text-blue-200"
                  >
                    Select all
                  </button>
                  <span className="text-slate-300 text-[10px]">·</span>
                  <button
                    type="button"
                    onClick={() => setLessonScope({ type: 'specific', indices: [] })}
                    className="min-h-11 px-2 text-[10px] font-semibold text-slate-400 transition-colors hover:text-slate-600"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-64 overflow-y-auto pr-1">
                {rows.map(({ index, label }) => {
                  const isSelected = (lessonScope.indices || []).includes(index);
                  return (
                    <button
                      key={index}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => {
                        const current = lessonScope.indices || [];
                        const next = isSelected
                          ? current.filter((x) => x !== index)
                          : [...current, index].sort((a, b) => a - b);
                        setLessonScope({ type: 'specific', indices: next });
                      }}
                      className={`tactile min-h-11 rounded-lg px-3 py-2 text-left text-[11px] transition-all duration-150 ${
                        isSelected
                          ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950'
                          : 'border border-slate-200 bg-white/80 text-slate-600 hover:bg-white dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-300'
                      }`}
                    >
                      <span
                        className={`font-semibold ${isSelected ? 'text-slate-200 dark:text-slate-500' : 'text-blue-600 dark:text-blue-200'}`}
                      >
                        #{index + 1}
                      </span>
                      <span className="block truncate mt-0.5">{label}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
