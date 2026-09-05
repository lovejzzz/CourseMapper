import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  createCourse,
  editLesson,
  editSource,
  rebuildLesson,
  newId,
  reorderLessons,
  revise,
  type Activity,
  type Course,
  type Lesson,
  type Source,
} from './domain';
import { auditCourse, approveLesson, resolveCalculations, lessonMinutes } from './verify';
import { importCourse, listCourses, saveCourse } from './storage';
import { browserInference, serverInference, SCION_ENDPOINT, unloadLocalScion } from './scion';
import './studio.css';
import LessonEditor from './LessonEditor';
import { materialLabel } from './material';
const MaterialStudio = lazy(() => import('./MaterialStudio'));
const ExportPanel = lazy(() => import('./ExportPanel'));

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function DatasetList({ datasets }: Pick<Activity, 'datasets'>) {
  return (
    <>
      {datasets.map((dataset) => (
        <div className="data-strip" key={dataset.id}>
          <small>{dataset.label}</small>
          <p>{dataset.values.join(' · ')}</p>
        </div>
      ))}
    </>
  );
}

function displayAnswer(value: string, block: Pick<Activity, 'datasets' | 'calculations'>) {
  try {
    return resolveCalculations(value, block);
  } catch {
    return value + '\n[Calculation needs correction — see Review course.]';
  }
}

export default function Studio() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [course, setCourse] = useState<Course | null>(null);
  const [selected, setSelected] = useState('');
  const [panel, setPanel] = useState<'lesson' | 'sources' | 'review' | 'materials'>('lesson');
  const [exporting, setExporting] = useState(false);
  const [audience, setAudience] = useState<'student' | 'teacher'>('student');
  const [description, setDescription] = useState('');
  const [setup, setSetup] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [readingFiles, setReadingFiles] = useState(false);
  const [learner, setLearner] = useState('Beginners with no prior knowledge of the subject');
  const [language, setLanguage] = useState<'en' | 'zh'>('en');
  const [lessonCount, setLessonCount] = useState(4);
  const [minutes, setMinutes] = useState(50);
  const [sources, setSources] = useState<Source[]>([]);
  const [sourceText, setSourceText] = useState('');
  const [allowFictional, setAllowFictional] = useState(true);
  const [route, setRoute] = useState<'server' | 'browser'>('server');
  const [serverReady, setServerReady] = useState<boolean | null>(null);
  const [serverMessage, setServerMessage] = useState('');
  const [serverModel, setServerModel] = useState('Gemma 4');
  const [adultEducator, setAdultEducator] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [editing, setEditing] = useState<Lesson | null>(null);
  const [sourceEditing, setSourceEditing] = useState<{ id: string; text: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const current = useRef<Course | null>(null);
  const persistedRevision = useRef<number | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listCourses()
      .then((savedCourses) => {
        setCourses(savedCourses);
        const match = location.hash.match(/^#\/course\/([^?]+)(?:\?(.*))?$/);
        if (!match) return;
        const found = savedCourses.find((c) => c.id === match[1]);
        if (!found) {
          setError('This course is not saved in this browser. Open its exported course file to restore it.');
          return;
        }
        current.current = found;
        persistedRevision.current = found.revision;
        setCourse(found);
        const requested = new URLSearchParams(match[2]).get('lesson') ?? '';
        setSelected(found.lessonOrder.includes(requested) ? requested : (found.lessonOrder[0] ?? ''));
        setSaved('Saved on this device');
      })
      .catch((e) => setError(e.message));
    return () => {
      controller.current?.abort();
      void unloadLocalScion();
    };
  }, []);

  const needsOnline = route === 'server' && (setup || course?.status === 'paused' || course?.status === 'building');
  useEffect(() => {
    if (!needsOnline) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      if (document.hidden) {
        timer = setTimeout(() => void check(), 120000);
        return;
      }
      try {
        const response = await fetch(`${SCION_ENDPOINT}/health`, {
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]),
        });
        const health = await response.json();
        if (!abort.signal.aborted) {
          setServerReady(response.ok && health.ready === true);
          setServerMessage(health.error ?? '');
          if (typeof health.model === 'string') setServerModel(health.model.replace(/^google\//, ''));
        }
      } catch {
        if (!abort.signal.aborted) setServerReady(false);
      }
      if (!abort.signal.aborted) timer = setTimeout(() => void check(), 120000);
    };
    void check();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [needsOnline]);

  useEffect(() => {
    if (route === 'server') void unloadLocalScion().catch((e) => setError(e.message));
  }, [route]);

  const courseId = course?.id;
  useEffect(() => {
    if (courseId)
      history.replaceState(
        null,
        '',
        `#/course/${courseId}${selected ? `?lesson=${encodeURIComponent(selected)}` : ''}`,
      );
  }, [courseId, selected]);

  useEffect(() => {
    if (!editing && !sourceEditing) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('.studio-modal');
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, select, [tabindex="0"]') ?? [],
      );
    focusable()[0]?.focus();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEditing(null);
        setSourceEditing(null);
      }
      if (event.key !== 'Tab') return;
      const fields = focusable();
      const first = fields[0];
      const last = fields.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
    // The focus boundary changes when a dialog opens or closes, not on each edit.
  }, [Boolean(editing), Boolean(sourceEditing)]);

  const update = (next: Course) => {
    current.current = next;
    setCourse(next);
    setCourses((previous) => [next, ...previous.filter((c) => c.id !== next.id)]);
  };
  const persist = async (next: Course) => {
    setSaved('Saving…');
    try {
      await saveCourse(next, persistedRevision.current);
    } catch (error) {
      setSaved('Could not save — keep a course file');
      throw error;
    }
    persistedRevision.current = next.revision;
    update(next);
    setSaved('Saved on this device');
  };
  const open = (next: Course) => {
    current.current = next;
    persistedRevision.current = next.revision;
    setCourse(next);
    setSelected(next.lessonOrder[0] ?? '');
    setPanel('lesson');
    setError('');
    setSaved('Saved on this device');
  };
  const act = async (action: () => Promise<void>) => {
    setError('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  async function generate(existing?: Course) {
    if (route === 'server' && !adultEducator) {
      setError('Online generation is for educators aged 18 or older. Confirm this before building.');
      return;
    }
    setError('');
    setBusy(true);
    setProgress('Preparing your course…');
    controller.current = new AbortController();
    try {
      let initial = existing;
      if (!initial) {
        const allSources = [...sources];
        if (sourceText.trim())
          allSources.push({
            id: newId('source'),
            title: 'Provided reading',
            text: sourceText.trim(),
            version: 1,
            kind: 'provided',
          });
        initial = createCourse(
          { description, audience: learner, language, lessonCount, minutesPerLesson: minutes, allowFictional },
          allSources,
        );
        persistedRevision.current = undefined;
        await persist(initial);
      }
      update(initial);
      const inference =
        route === 'browser' ? browserInference(setProgress) : serverInference(SCION_ENDPOINT, {}, setProgress);
      const { buildCourse } = await import('./engine');
      await buildCourse(initial, {
        inference,
        signal: controller.current.signal,
        checkpoint: persist,
        onProgress(message, snapshot) {
          setProgress(message);
          setSelected((previous) => previous || snapshot.lessonOrder[0] || '');
        },
      });
    } catch (e) {
      setError(
        (e as Error).name === 'AbortError'
          ? 'Build paused. Completed lessons are saved; resume whenever you are ready.'
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
      controller.current = null;
    }
  }

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const inputs = Array.from(files);
    setReadingFiles(true);
    try {
      const { readSourceFile } = await import('./sources');
      const parsed: Source[] = [];
      for (const file of inputs) parsed.push(...(await readSourceFile(file)));
      if ([...sources, ...parsed].reduce((n, s) => n + s.text.length, 0) > 60000)
        throw new Error('Select the relevant source excerpts; combined source text exceeds 60,000 characters.');
      setSources((previous) => [...previous, ...parsed]);
    } finally {
      setReadingFiles(false);
    }
  }

  const lesson = course?.lessons[selected];
  const issues = course ? auditCourse(course) : [];
  const completed = course ? Object.keys(course.lessons).length : 0;
  const zh = course?.brief.language === 'zh';
  const text = (en: string, cn: string) => (zh ? cn : en);
  const canExport = Boolean(course?.plan && completed === course.lessonOrder.length && completed > 0);

  return (
    <div className={`studio ${!course ? 'studio-home-screen' : ''}`}>
      <header className="studio-header">
        <button
          className="studio-brand"
          onClick={() => {
            if (!busy) {
              setCourse(null);
              history.replaceState(null, '', '#/');
              setSelected('');
              setError('');
            }
          }}
          aria-label="EduTool home"
        >
          <span className="studio-mark">e.</span> edutool<span className="studio-beta">STUDIO</span>
        </button>
        <nav aria-label="Main navigation">
          {course && (
            <button
              className="quiet"
              disabled={busy}
              onClick={() => {
                setCourse(null);
                history.replaceState(null, '', '#/');
                setSelected('');
                setError('');
              }}
            >
              All courses
            </button>
          )}
          <button className="quiet" disabled={busy} onClick={() => importInput.current?.click()}>
            Open course
          </button>
          <a className="quiet" href="#/legacy">
            Previous workspace ↗
          </a>
        </nav>
        <input
          hidden
          ref={importInput}
          type="file"
          accept=".json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file)
              void act(async () => {
                const imported = importCourse(await file.text());
                const fork = { ...imported, id: newId('course'), revision: 1 };
                persistedRevision.current = undefined;
                await persist(fork);
                open(fork);
              });
          }}
        />
      </header>

      {error && (
        <div className="studio-alert" role="alert">
          {error}
          <button aria-label="Dismiss message" onClick={() => setError('')}>
            ×
          </button>
        </div>
      )}

      {!course ? (
        <main className="chalk-home">
          <h1>What do you want to teach/learn?</h1>
          <form
            className={`chalk-composer ${dragging ? 'dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void act(() => addFiles(e.dataTransfer.files));
            }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!description.trim() && sources.length)
                setDescription(
                  `Create a course based on these supplied readings: ${sources.map((s) => s.title).join(', ')}`,
                );
              setSetup(true);
            }}
          >
            <textarea
              aria-label="What do you want to teach or learn?"
              required={!sources.length}
              minLength={2}
              maxLength={8000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="An idea, a question, a whole course…"
            />
            {sources.length > 0 && (
              <div className="composer-files">
                {sources.map((source) => (
                  <div className="source-chip" key={source.id}>
                    <span>{source.title}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${source.title}`}
                      onClick={() => setSources((previous) => previous.filter((s) => s.id !== source.id))}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="composer-actions">
              <button
                type="button"
                className="attach-file"
                aria-label="Attach source files"
                disabled={readingFiles}
                onClick={() => fileInput.current?.click()}
              >
                <span aria-hidden="true">＋</span>
              </button>
              <span>
                {readingFiles
                  ? 'Reading your files…'
                  : dragging
                    ? 'Drop your readings here'
                    : 'or drop your files here'}
              </span>
              <button className="chalk-send" type="submit" aria-label="Prepare materials" disabled={readingFiles}>
                ↗
              </button>
            </div>
            <input
              hidden
              ref={fileInput}
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md,.csv"
              onChange={(e) => {
                void act(() => addFiles(e.target.files));
                e.target.value = '';
              }}
            />
          </form>
          {setup && (
            <form
              className="course-setup"
              onSubmit={(e) => {
                e.preventDefault();
                void generate();
              }}
            >
              <div className="setup-heading">
                <h2>A few details before we begin.</h2>
                <button type="button" className="quiet" onClick={() => setSetup(false)}>
                  Close
                </button>
              </div>
              <label>
                Who is learning?
                <input required value={learner} maxLength={500} onChange={(e) => setLearner(e.target.value)} />
              </label>
              <div className="brief-row">
                <label>
                  Lessons
                  <input
                    type="number"
                    min={2}
                    max={12}
                    value={lessonCount}
                    onChange={(e) => setLessonCount(Number(e.target.value))}
                  />
                </label>
                <label>
                  Minutes / lesson
                  <input
                    type="number"
                    min={30}
                    max={120}
                    value={minutes}
                    onChange={(e) => setMinutes(Number(e.target.value))}
                  />
                </label>
                <label>
                  Content language
                  <select value={language} onChange={(e) => setLanguage(e.target.value as 'en' | 'zh')}>
                    <option value="en">English</option>
                    <option value="zh">简体中文</option>
                  </select>
                </label>
              </div>
              <details className="source-setup">
                <summary>Paste a source reading</summary>
                <textarea
                  aria-label="Source text"
                  rows={5}
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  maxLength={20000}
                  placeholder="Paste a reading, reference or labelled dataset…"
                />
              </details>
              <label className="checkbox">
                <input type="checkbox" checked={allowFictional} onChange={(e) => setAllowFictional(e.target.checked)} />
                Allow clearly labelled fictional examples and practice data
              </label>
              <label>
                Run Scion
                <select value={route} onChange={(e) => setRoute(e.target.value as 'server' | 'browser')}>
                  <option value="server">Online · no model download</option>
                  <option value="browser">On this device · 3.35 GB download</option>
                </select>
              </label>
              <p className="setup-disclosure">
                {route === 'browser'
                  ? 'Your materials stay in this browser. Requires a compatible GPU and enough memory.'
                  : serverReady === false
                    ? serverMessage || 'Online generation is temporarily unavailable.'
                    : 'Free shared Gemma generation. Google may use submitted content to improve its products; use non-sensitive materials. Builds can take tens of minutes. Progress is saved so you can pause and resume.'}
              </p>
              <details className="model-detail">
                <summary>About the model</summary>
                <p>
                  {route === 'browser' ? 'Gemma 4 E2B' : serverModel}. Scion’s course engine adds source binding, checks
                  and revision. No custom adapter is active.
                </p>
              </details>
              {route === 'server' && (
                <label className="checkbox">
                  <input
                    type="checkbox"
                    required
                    checked={adultEducator}
                    onChange={(e) => setAdultEducator(e.target.checked)}
                  />
                  I am 18 or older and will use non-sensitive teaching or learning materials.
                </label>
              )}
              <button
                className="primary create-button"
                type="submit"
                disabled={busy || readingFiles || (route === 'server' && (serverReady === false || !adultEducator))}
              >
                Build my course <span>↗</span>
              </button>
            </form>
          )}
          <div className="home-library">
            <button className="quiet" onClick={() => importInput.current?.click()}>
              Open course
            </button>
            {courses.length > 0 && (
              <details>
                <summary>
                  My materials <span>{courses.length}</span>
                </summary>
                <div className="saved-courses">
                  {courses.map((savedCourse) => (
                    <button key={savedCourse.id} onClick={() => open(savedCourse)}>
                      <b>{savedCourse.plan?.title ?? savedCourse.brief.description}</b>
                      <span>
                        {Object.keys(savedCourse.lessons).length}/{savedCourse.brief.lessonCount} lessons ·{' '}
                        {savedCourse.status === 'ready' ? 'Reviewed' : 'Draft'}
                      </span>
                    </button>
                  ))}
                </div>
              </details>
            )}
          </div>
        </main>
      ) : (
        <main className="studio-workspace">
          <aside className="studio-outline">
            <div className="eyebrow">YOUR COURSE</div>
            <h1>{course.plan?.title ?? 'Planning your course'}</h1>
            <p className="course-meta">
              {course.brief.lessonCount} lessons · {course.brief.lessonCount * course.brief.minutesPerLesson} min
              <br />
              {course.brief.language === 'zh' ? '简体中文' : 'English'}
            </p>
            <nav aria-label="Lesson outline">
              {course.lessonOrder.map((id, index) => (
                <button
                  key={id}
                  className={selected === id && panel === 'lesson' ? 'active' : ''}
                  onClick={() => {
                    setSelected(id);
                    setPanel('lesson');
                  }}
                >
                  <span className="outline-number">{String(index + 1).padStart(2, '0')}</span>
                  <span>
                    {course.lessons[id]?.title ??
                      course.plan?.lessons[course.planLessonIds.indexOf(id)]?.title ??
                      'Preparing lesson'}
                    <small>
                      {course.lessons[id]
                        ? course.lessons[id].review === 'approved'
                          ? 'Reviewed'
                          : 'Needs review'
                        : 'Waiting'}
                    </small>
                  </span>
                  {course.lessons[id]?.review === 'approved' && <span className="approved-dot">✓</span>}
                </button>
              ))}
            </nav>
            <div className="outline-tools">
              <button
                className={panel === 'materials' ? 'active' : ''}
                disabled={!course.plan}
                onClick={() => setPanel('materials')}
              >
                All materials <span>13</span>
              </button>
              <button className={panel === 'sources' ? 'active' : ''} onClick={() => setPanel('sources')}>
                Source readings <span>{Object.keys(course.sources).length}</span>
              </button>
              <button className={panel === 'review' ? 'active' : ''} onClick={() => setPanel('review')}>
                Review course <span>{issues.length}</span>
              </button>
            </div>
            <div className="outline-bottom">
              <span className="saved-indicator">● {saved}</span>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  download(
                    new Blob([JSON.stringify(course, null, 2)], { type: 'application/json' }),
                    `${course.plan?.title ?? 'course'}.edutool.json`,
                  )
                }
              >
                Save course file ↓
              </button>
            </div>
          </aside>
          <section className="studio-content">
            <div className="workspace-toolbar">
              <div className="view-switch" role="group" aria-label="Material audience">
                <button className={audience === 'student' ? 'active' : ''} onClick={() => setAudience('student')}>
                  Student view
                </button>
                <button className={audience === 'teacher' ? 'active' : ''} onClick={() => setAudience('teacher')}>
                  Instructor view
                </button>
              </div>
              <button className="primary" disabled={!canExport || busy} onClick={() => setExporting(true)}>
                Export course ↓
              </button>
            </div>
            {(busy || completed < course.brief.lessonCount) && (
              <div className="build-progress" role="status">
                <div>
                  <b>{busy ? progress : 'Your course is saved. Continue building.'}</b>
                  <span>
                    {completed} of {course.brief.lessonCount} lessons saved
                  </span>
                </div>
                {busy ? (
                  <button className="secondary" onClick={() => controller.current?.abort()}>
                    Pause build
                  </button>
                ) : (
                  <>
                    <select
                      aria-label="Inference location"
                      value={route}
                      onChange={(e) => setRoute(e.target.value as 'server' | 'browser')}
                    >
                      <option value="server">Online</option>
                      <option value="browser">On this device</option>
                    </select>
                    {route === 'server' && (
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={adultEducator}
                          onChange={(e) => setAdultEducator(e.target.checked)}
                        />
                        I am aged 18 or older and my material is non-sensitive.
                      </label>
                    )}
                    {route === 'server' && serverReady === false && (
                      <p>{serverMessage || 'Online generation is temporarily unavailable.'}</p>
                    )}
                    <button
                      className="primary"
                      disabled={route === 'server' && (!adultEducator || serverReady === false)}
                      onClick={() => void generate(course)}
                    >
                      Resume
                    </button>
                  </>
                )}
              </div>
            )}
            {panel === 'materials' && course.plan ? (
              <Suspense fallback={<p role="status">Opening materials…</p>}>
                <MaterialStudio course={course} audience={audience} busy={busy} onSave={persist} />
              </Suspense>
            ) : panel === 'sources' ? (
              <div className="reading-page">
                <div className="eyebrow">EVIDENCE</div>
                <h2>Source readings</h2>
                <p>Editing a reading marks only its dependent lessons for review.</p>
                {Object.values(course.sources).map((s) => (
                  <article className="source-card" key={s.id}>
                    <div className="section-heading">
                      <h3>{s.title}</h3>
                      <button
                        disabled={busy}
                        className="quiet"
                        onClick={() => setSourceEditing({ id: s.id, text: s.text })}
                      >
                        Edit
                      </button>
                    </div>
                    <small>
                      {s.kind === 'fictional' ? 'Fictional teaching material' : 'Provided material'} · Version{' '}
                      {s.version}
                    </small>
                    <p className="prose">{s.text}</p>
                  </article>
                ))}
                {!Object.keys(course.sources).length && (
                  <p>No external readings were provided. Check invented examples and subject claims before teaching.</p>
                )}
              </div>
            ) : panel === 'review' ? (
              <div className="reading-page">
                <div className="eyebrow">BEFORE TEACHING</div>
                <h2>Check what students will learn.</h2>
                <p>
                  Automated checks cover structure, exact quotations and selected numerical answers. Instructor review
                  covers correctness, challenge, progression and whether the lesson can work in a classroom.
                </p>
                <div className="review-summary">
                  <strong>
                    {Object.values(course.lessons).filter((l) => l.review === 'approved').length} /{' '}
                    {course.lessonOrder.length}
                  </strong>
                  <span>lessons reviewed by an instructor</span>
                </div>
                <details>
                  <summary>Generation record · {course.runs.length} responses</summary>
                  <p>
                    Critical review uses the same model in a separate pass. Its suggestions are not independent proof of
                    correctness.
                  </p>
                  {course.runs.map((run) => (
                    <div className="run-record" key={run.id}>
                      <b>{run.stage}</b>
                      <p>
                        {run.model} · {run.promptVersion} · {(run.elapsedMs / 1000).toFixed(1)} seconds ·{' '}
                        {run.inputTokens + run.outputTokens} tokens
                      </p>
                      {run.issues.length > 0 && <p>Rejected: {run.issues.join(' ')}</p>}
                    </div>
                  ))}
                </details>
                {issues.map((issue, i) => (
                  <button
                    className={`review-issue ${issue.severity}`}
                    key={`${issue.code}-${i}`}
                    onClick={() => {
                      if (issue.lessonId) {
                        setSelected(issue.lessonId);
                        setPanel('lesson');
                        setAudience('teacher');
                      }
                    }}
                  >
                    <span>{issue.severity === 'block' ? 'Needs correction' : 'Review'}</span>
                    <p>{issue.message}</p>
                    <b>→</b>
                  </button>
                ))}
                {!issues.length && (
                  <p>
                    All recorded checks and instructor reviews are complete. This does not measure student learning
                    outcomes.
                  </p>
                )}
              </div>
            ) : lesson ? (
              <article className="reading-page">
                <div className="eyebrow">
                  LESSON {course.lessonOrder.indexOf(selected) + 1}{' '}
                  <span className="duration">{lessonMinutes(lesson)} MIN</span>
                </div>
                <div className="lesson-title-row">
                  <h2>{lesson.title}</h2>
                  <button className="quiet" disabled={busy} onClick={() => setEditing(structuredClone(lesson))}>
                    Edit lesson
                  </button>
                </div>
                <p className="lesson-objective">{lesson.objective}</p>
                {lesson.review === 'stale' && (
                  <div className="teacher-note">
                    <p>
                      The source reading changed. Rebuild this lesson to use the current material. The previous lesson
                      remains in the project’s edit history.
                    </p>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          const next = rebuildLesson(course, lesson.id, course.revision);
                          await persist(next);
                          await generate(next);
                        })
                      }
                    >
                      Rebuild from current sources
                    </button>
                  </div>
                )}
                {audience === 'teacher' && (
                  <div className="teacher-note">
                    <h3>{text('Before class', '课前准备')}</h3>
                    <p className="prose">{lesson.preparation}</p>
                  </div>
                )}
                <section>
                  <div className="section-heading">
                    <h3>{text('Understand the idea', '概念讲解')}</h3>
                    <small>
                      {lesson.teachingMinutes} min · {text('includes example', '含示例')}
                    </small>
                  </div>
                  <p className="prose">{lesson.explanation}</p>
                </section>
                <section className="worked-example">
                  <div className="eyebrow">{text('WORKED EXAMPLE', '完整示例')}</div>
                  <p className="material-origin">
                    {materialLabel(lesson.workedExample.materialOrigin, course.sources, course.brief.language)}
                  </p>
                  <p className="prose material">{lesson.workedExample.material}</p>
                  <DatasetList datasets={lesson.workedExample.datasets} />
                  <p className="prose">
                    <b>{lesson.workedExample.prompt}</b>
                  </p>
                  <ol>
                    {lesson.workedExample.steps.map((step, i) => (
                      <li key={i}>{displayAnswer(step, lesson.workedExample)}</li>
                    ))}
                  </ol>
                  <p className="worked-answer">{displayAnswer(lesson.workedExample.answer, lesson.workedExample)}</p>
                </section>
                {lesson.activities.map((task, i) => (
                  <section className="activity" key={task.id}>
                    <div className="section-heading">
                      <div className="eyebrow">
                        {task.kind === 'guided'
                          ? text('PRACTICE WITH SUPPORT', '有支持的练习')
                          : text('TRY IT YOURSELF', '独立完成')}{' '}
                        · {i + 1}
                      </div>
                      <small>{task.minutes} min</small>
                    </div>
                    <h3>{task.title}</h3>
                    <div className="task-material">
                      <span className="eyebrow">{text('YOUR MATERIAL', '任务材料')}</span>
                      <p className="material-origin">
                        {materialLabel(task.materialOrigin, course.sources, course.brief.language)}
                      </p>
                      <p className="prose">{task.material}</p>
                      <DatasetList datasets={task.datasets} />
                    </div>
                    <p className="task-prompt prose">{task.prompt}</p>
                    <div className="submission">
                      <b>{text('What to submit', '提交要求')}</b>
                      <p className="prose">{task.product}</p>
                    </div>
                    <details>
                      <summary>{text('Assessment criteria', '评价标准')}</summary>
                      {task.rubric.map((r, j) => (
                        <div className="rubric-row" key={j}>
                          <b>
                            {r.criterion} · {r.points} pts
                          </b>
                          <p>
                            <b>{text('Full credit: ', '满分：')}</b>
                            {r.fullCredit}
                          </p>
                          <p>
                            <b>{text('Partial credit: ', '部分得分：')}</b>
                            {r.partialCredit}
                          </p>
                          <p>
                            <b>{text('No credit: ', '不得分：')}</b>
                            {r.noCredit}
                          </p>
                        </div>
                      ))}
                    </details>
                    {audience === 'teacher' && (
                      <div className="teacher-answer">
                        <h4>{text('Answer & reasoning', '答案与推理')}</h4>
                        <p className="prose">{displayAnswer(task.answer, task)}</p>
                        <ol>
                          {task.reasoning.map((s, j) => (
                            <li key={j}>{displayAnswer(s, task)}</li>
                          ))}
                        </ol>
                        <h4>{text('A useful hint', '可用提示')}</h4>
                        <p>{displayAnswer(task.hint, task)}</p>
                        <h4>{text('Respond to these errors', '针对错误的反馈')}</h4>
                        {task.feedback.map((f, j) => (
                          <div className="feedback-item" key={j}>
                            <b>{displayAnswer(f.error, task)}</b>
                            <p>{displayAnswer(f.diagnosis, task)}</p>
                            <p className="feedback-next">↳ {displayAnswer(f.nextStep, task)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {task.evidence.length > 0 && (
                      <details className="evidence">
                        <summary>
                          {text('Source references', '原文依据')} · {task.evidence.length}
                        </summary>
                        {task.evidence.map((ref, j) => (
                          <blockquote key={j}>
                            <small>{course.sources[ref.sourceId]?.title}</small>
                            <p>{ref.quote}</p>
                          </blockquote>
                        ))}
                      </details>
                    )}
                  </section>
                ))}
                {audience === 'teacher' && (
                  <section>
                    <h3>
                      {text('Debrief', '课堂回顾')} <small>{lesson.debriefMinutes} min</small>
                    </h3>
                    <p className="prose">{lesson.debrief}</p>
                  </section>
                )}
                <section className="exit-ticket">
                  <div className="eyebrow">
                    {text('BEFORE YOU LEAVE', '离堂检测')} · {lesson.exitTicket.minutes} MIN
                  </div>
                  <h3>{text('Show what you understand.', '展示你的理解。')}</h3>
                  <DatasetList datasets={lesson.exitTicket.datasets} />
                  <p className="prose">{lesson.exitTicket.prompt}</p>
                  {audience === 'teacher' && (
                    <>
                      <p className="prose">
                        <b>{displayAnswer(lesson.exitTicket.answer, lesson.exitTicket)}</b>
                      </p>
                      <p className="prose">{lesson.exitTicket.nextLessonDecision}</p>
                    </>
                  )}
                </section>
                <footer className="lesson-footer">
                  <div className="reorder">
                    <button
                      className="secondary"
                      disabled={busy || course.lessonOrder.indexOf(selected) === 0}
                      onClick={() =>
                        void act(async () => {
                          const order = [...course.lessonOrder];
                          const i = order.indexOf(selected);
                          [order[i - 1], order[i]] = [order[i], order[i - 1]];
                          await persist(reorderLessons(course, order, course.revision));
                        })
                      }
                    >
                      ↑ Move earlier
                    </button>
                    <button
                      className="secondary"
                      disabled={busy || course.lessonOrder.indexOf(selected) === course.lessonOrder.length - 1}
                      onClick={() =>
                        void act(async () => {
                          const order = [...course.lessonOrder];
                          const i = order.indexOf(selected);
                          [order[i + 1], order[i]] = [order[i], order[i + 1]];
                          await persist(reorderLessons(course, order, course.revision));
                        })
                      }
                    >
                      ↓ Move later
                    </button>
                  </div>
                  <button
                    className="primary"
                    disabled={busy || lesson.review === 'approved'}
                    onClick={() =>
                      void act(async () => {
                        const approved = approveLesson(course, lesson);
                        const next = revise(course, { lessons: { ...course.lessons, [lesson.id]: approved } });
                        next.status = auditCourse(next).length ? 'review' : 'ready';
                        await persist(next);
                      })
                    }
                  >
                    {lesson.review === 'approved' ? '✓ Instructor reviewed' : 'Mark instructor reviewed'}
                  </button>
                </footer>
              </article>
            ) : (
              <div className="empty-lesson">
                <div className="empty-orbit">e.</div>
                <h2>{busy ? 'Your course is taking shape.' : 'Ready when you are.'}</h2>
                <p>
                  {busy
                    ? 'Each complete lesson appears here as it is saved.'
                    : 'Resume the build to create this lesson.'}
                </p>
                {course.plan && <p>{course.plan.overview}</p>}
              </div>
            )}
          </section>
        </main>
      )}

      {editing && (
        <LessonEditor
          lesson={editing}
          onClose={() => setEditing(null)}
          onSave={async (next) => {
            await persist(editLesson(current.current!, next, current.current!.revision));
            setEditing(null);
          }}
        />
      )}
      {exporting && course && (
        <Suspense fallback={<p role="status">Opening export options…</p>}>
          <ExportPanel course={course} audience={audience} onClose={() => setExporting(false)} />
        </Suspense>
      )}
      {sourceEditing && (
        <div className="studio-modal-backdrop">
          <section className="studio-modal" role="dialog" aria-modal="true" aria-labelledby="source-edit-heading">
            <h2 id="source-edit-heading">Edit source reading</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void act(async () => {
                  await persist(
                    editSource(current.current!, sourceEditing.id, sourceEditing.text, current.current!.revision),
                  );
                  setSourceEditing(null);
                });
              }}
            >
              <textarea
                aria-label="Source reading text"
                rows={16}
                value={sourceEditing.text}
                onChange={(e) => setSourceEditing({ ...sourceEditing, text: e.target.value })}
              />
              <div className="modal-actions">
                <button type="button" className="secondary" onClick={() => setSourceEditing(null)}>
                  Cancel
                </button>
                <button className="primary">Save & flag dependent lessons</button>
              </div>
            </form>
          </section>
        </div>
      )}
      <footer className="studio-site-footer">
        <span>
          {course ? 'Made for the work of teaching.' : 'edutool'} · v
          {typeof __STUDIO_VERSION__ === 'undefined' ? 'development' : __STUDIO_VERSION__}
        </span>
        <span>
          <a href="#/privacy">Privacy</a>
          <a href="#/terms">Terms</a>
          <a href="#/contact">Contact</a>
        </span>
      </footer>
    </div>
  );
}
