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
    <div className="glass rounded-squircle-sm p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Lesson Scope</h2>
          <p className="text-[11px] text-slate-400">
            All deliverables will only be generated for the selected lessons.
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setLessonScope({ type: 'all' })}
          className={`tactile flex-1 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
            lessonScope.type === 'all'
              ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20'
              : 'bg-white/60 text-slate-500 border border-slate-200/60 hover:bg-white/80'
          }`}
        >
          All {total > 0 ? `(${total} lessons)` : 'lessons'}
        </button>
        <button
          onClick={() => setLessonScope({ type: 'specific', indices: lessonScope.indices || [] })}
          className={`tactile flex-1 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
            lessonScope.type === 'specific'
              ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20'
              : 'bg-white/60 text-slate-500 border border-slate-200/60 hover:bg-white/80'
          }`}
        >
          Specific lessons
        </button>
      </div>

      {lessonScope.type === 'specific' && (
        <div className="space-y-2 animate-spring-in">
          {total === 0 ? (
            isDetectingLessons ? (
              <p className="text-[11px] text-indigo-500 italic flex items-center gap-1.5">
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
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  {lessonScope.indices?.length || 0} of {total} selected
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLessonScope({ type: 'specific', indices: rows.map((r) => r.index) })}
                    className="text-[10px] font-semibold text-indigo-500 hover:text-indigo-700 transition-colors"
                  >
                    Select all
                  </button>
                  <span className="text-slate-300 text-[10px]">·</span>
                  <button
                    onClick={() => setLessonScope({ type: 'specific', indices: [] })}
                    className="text-[10px] font-semibold text-slate-400 hover:text-slate-600 transition-colors"
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
                      onClick={() => {
                        const current = lessonScope.indices || [];
                        const next = isSelected
                          ? current.filter((x) => x !== index)
                          : [...current, index].sort((a, b) => a - b);
                        setLessonScope({ type: 'specific', indices: next });
                      }}
                      className={`tactile text-left px-3 py-2 rounded-lg text-[11px] transition-all duration-150 ${
                        isSelected
                          ? 'bg-indigo-500 text-white shadow-sm'
                          : 'bg-white/60 text-slate-600 border border-slate-200/60 hover:bg-white/90'
                      }`}
                    >
                      <span className={`font-semibold ${isSelected ? 'text-indigo-100' : 'text-indigo-500'}`}>
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
