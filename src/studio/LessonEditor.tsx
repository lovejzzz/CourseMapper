import { useState } from 'react';
import { LessonSchema, type Lesson, type Activity } from './domain';
import { joinAnswerParts, responseLength } from './answer';
import { lessonMinutes } from './verify';

type Path = (string | number)[];
function replaceAt<T>(value: T, path: Path, next: unknown): T {
  const copy = structuredClone(value);
  let target = copy as Record<string | number, unknown>;
  for (const key of path.slice(0, -1)) target = target[key] as Record<string | number, unknown>;
  target[path.at(-1)!] = next;
  return copy;
}

export default function LessonEditor({
  lesson,
  onSave,
  onClose,
}: {
  lesson: Lesson;
  onSave: (lesson: Lesson) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(lesson));
  const [dataText, setDataText] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const update = (path: Path, value: unknown) => setDraft((current) => replaceAt(current, path, value));
  const text = (label: string, path: Path, value: string, rows = 3) => (
    <label key={path.join('.')}>
      {label}
      <textarea value={value} rows={rows} onChange={(e) => update(path, e.target.value)} />
    </label>
  );
  const number = (label: string, path: Path, value: number) => (
    <label key={path.join('.')}>
      {label}
      <input type="number" step="any" value={value} onChange={(e) => update(path, Number(e.target.value))} />
    </label>
  );
  function numeric(block: Pick<Activity, 'datasets' | 'calculations'>, path: Path) {
    if (!block.datasets.length) return null;
    return (
      <details>
        <summary>Data and answer checks</summary>
        <p>
          After changing data, update the written answer and expected results. Independent calculation checks run again
          when you save and review.
        </p>
        {block.datasets.map((data, i) => {
          const valuesPath = [...path, 'datasets', i, 'values'];
          const key = JSON.stringify(valuesPath);
          return (
            <fieldset key={data.id}>
              <legend>{data.label}</legend>
              {text('Data label', [...path, 'datasets', i, 'label'], data.label, 2)}
              <label>
                Values, separated by commas
                <textarea
                  rows={2}
                  value={dataText[key] ?? data.values.join(', ')}
                  onChange={(e) => setDataText((old) => ({ ...old, [key]: e.target.value }))}
                />
              </label>
            </fieldset>
          );
        })}
        {block.calculations.map((check, i) =>
          number(
            `Expected ${check.operation} · ${block.datasets.find((d) => d.id === check.dataset)?.label ?? check.dataset}`,
            [...path, 'calculations', i, 'expected'],
            check.expected,
          ),
        )}
      </details>
    );
  }
  async function save() {
    setError('');
    setSaving(true);
    try {
      let next = draft;
      for (const [path, input] of Object.entries(dataText)) {
        const tokens = input.split(/[,，\s]+/u).filter(Boolean);
        if (!tokens.length || tokens.some((t) => !/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(t)))
          throw new Error('Data values must be numbers separated by commas.');
        next = replaceAt(next, JSON.parse(path), tokens.map(Number));
      }
      next = {
        ...next,
        activities: next.activities.map((a) => (a.answerParts ? { ...a, answer: joinAnswerParts(a.answerParts) } : a)),
      };
      await onSave(LessonSchema.parse(next));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="studio-modal-backdrop">
      <section className="studio-modal" role="dialog" aria-modal="true" aria-labelledby="edit-heading">
        <h2 id="edit-heading">Edit lesson</h2>
        <p>
          Every saved edit preserves its previous version and requires a new review. Editing a supplied passage
          identifies it as an instructor adaptation.
        </p>
        {error && (
          <p className="studio-alert" role="alert">
            {error}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label>
            Title
            <input value={draft.title} onChange={(e) => update(['title'], e.target.value)} />
          </label>
          {text('Objective', ['objective'], draft.objective, 2)}
          {text('Preparation', ['preparation'], draft.preparation)}
          {text('Concept explanation', ['explanation'], draft.explanation, 8)}
          {number('Explanation and example minutes', ['teachingMinutes'], draft.teachingMinutes)}
          <details>
            <summary>Worked example</summary>
            {text('Example material', ['workedExample', 'material'], draft.workedExample.material, 5)}
            {text('Example question', ['workedExample', 'prompt'], draft.workedExample.prompt)}
            {draft.workedExample.steps.map((step, i) =>
              text(`Worked step ${i + 1}`, ['workedExample', 'steps', i], step),
            )}
            {text('Worked answer', ['workedExample', 'answer'], draft.workedExample.answer, 5)}
            {numeric(draft.workedExample, ['workedExample'])}
          </details>
          {draft.activities.map((activity, i) => {
            const path: Path = ['activities', i];
            return (
              <details key={activity.id}>
                <summary>
                  {activity.kind === 'guided' ? 'Guided practice' : 'Independent practice'} · {activity.title}
                </summary>
                {text('Activity title', [...path, 'title'], activity.title, 2)}
                {number('Activity minutes', [...path, 'minutes'], activity.minutes)}
                {text('Material', [...path, 'material'], activity.material, 5)}
                {text('Student task', [...path, 'prompt'], activity.prompt, 4)}
                {text('What to submit', [...path, 'product'], activity.product)}
                {text('Hint', [...path, 'hint'], activity.hint)}
                {activity.answerParts
                  ? activity.answerParts.map((part, n) => (
                      <fieldset key={n}>
                        <legend>Answer part {n + 1}</legend>
                        {text('Part title', [...path, 'answerParts', n, 'title'], part.title, 1)}
                        {text('Model response', [...path, 'answerParts', n, 'text'], part.text, 6)}
                        <label>
                          Response length
                          <select
                            value={part.length?.unit ?? ''}
                            onChange={(e) =>
                              update(
                                [...path, 'answerParts', n, 'length'],
                                e.target.value
                                  ? { unit: e.target.value, min: part.length?.min ?? 100, max: part.length?.max ?? 150 }
                                  : null,
                              )
                            }
                          >
                            <option value="">No word or character limit</option>
                            <option value="words">Words</option>
                            <option value="characters">Characters (excluding punctuation)</option>
                          </select>
                        </label>
                        {part.length && (
                          <>
                            {number('Minimum length', [...path, 'answerParts', n, 'length', 'min'], part.length.min)}
                            {number('Maximum length', [...path, 'answerParts', n, 'length', 'max'], part.length.max)}
                            <p>
                              Current response: {responseLength(part.text, part.length.unit)} {part.length.unit}. Keep
                              this range consistent with the student task.
                            </p>
                          </>
                        )}
                      </fieldset>
                    ))
                  : text('Answer', [...path, 'answer'], activity.answer, 6)}
                {activity.reasoning.map((step, n) => text(`Reasoning ${n + 1}`, [...path, 'reasoning', n], step))}
                {numeric(activity, path)}
                <details>
                  <summary>Feedback and scoring</summary>
                  {activity.feedback.map((feedback, n) => (
                    <fieldset key={n}>
                      <legend>Error pattern {n + 1}</legend>
                      {text('Likely error', [...path, 'feedback', n, 'error'], feedback.error)}
                      {text('Diagnosis', [...path, 'feedback', n, 'diagnosis'], feedback.diagnosis)}
                      {text('Next teaching action', [...path, 'feedback', n, 'nextStep'], feedback.nextStep)}
                    </fieldset>
                  ))}
                  {activity.rubric.map((rubric, n) => (
                    <fieldset key={n}>
                      <legend>Scoring criterion {n + 1}</legend>
                      {text('Criterion', [...path, 'rubric', n, 'criterion'], rubric.criterion)}
                      {number('Points', [...path, 'rubric', n, 'points'], rubric.points)}
                      {text('Full credit', [...path, 'rubric', n, 'fullCredit'], rubric.fullCredit)}
                      {text('Partial credit', [...path, 'rubric', n, 'partialCredit'], rubric.partialCredit)}
                      {text('No credit', [...path, 'rubric', n, 'noCredit'], rubric.noCredit)}
                    </fieldset>
                  ))}
                </details>
              </details>
            );
          })}
          <details>
            <summary>Debrief and exit ticket</summary>
            {text('Debrief', ['debrief'], draft.debrief, 5)}
            {number('Debrief minutes', ['debriefMinutes'], draft.debriefMinutes)}
            {text('Exit question', ['exitTicket', 'prompt'], draft.exitTicket.prompt)}
            {text('Exit answer', ['exitTicket', 'answer'], draft.exitTicket.answer)}
            {text('Next lesson decision', ['exitTicket', 'nextLessonDecision'], draft.exitTicket.nextLessonDecision)}
            {number('Exit ticket minutes', ['exitTicket', 'minutes'], draft.exitTicket.minutes)}
            {numeric(draft.exitTicket, ['exitTicket'])}
          </details>
          <p>Total lesson time: {lessonMinutes(draft)} minutes.</p>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button className="primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
