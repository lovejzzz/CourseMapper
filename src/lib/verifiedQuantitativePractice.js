// Bounded arithmetic on explicitly supplied inputs. No eval, inferred data,
// source admission, or general scientific/financial advice.
const numberPattern = '-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)';
const round = (n) => String(Number(n.toPrecision(10)));
const term = (term, definition) => ({ term, definition });
const item = (question, answer, explanation) => ({ question, answer: String(answer), explanation });
export function describeNumericSample(values) {
  if (
    !Array.isArray(values) ||
    values.length < 2 ||
    values.length > 40 ||
    values.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e9)
  )
    return null;
  const sorted = [...values].sort((a, b) => a - b);
  const n = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const squaredDeviations = values.reduce((s, v) => s + (v - mean) ** 2, 0);
  return {
    n,
    sum,
    mean,
    median: n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2,
    min: sorted[0],
    max: sorted[n - 1],
    range: sorted[n - 1] - sorted[0],
    squaredDeviations,
    populationVariance: squaredDeviations / n,
    sampleVariance: squaredDeviations / (n - 1),
  };
}
function packet(kind, problem, questions, terms, table) {
  return {
    kind,
    provenance: 'Exercise inputs; results apply to the stated values and assumptions.',
    workedExample: {
      problem,
      steps: questions.slice(0, 4).map((q) => q.explanation),
      result: questions
        .slice(0, 4)
        .map((q) => q.answer)
        .join('; '),
    },
    questions,
    terms,
    table,
    practice: questions[4],
    objective: problem,
  };
}
export function buildVerifiedQuantitativePractice(lesson, brief = '') {
  const context = String(lesson.title || '').toLowerCase();
  const text = String(brief);
  if (/\b(?:mean|median|variance|outliers|descriptive statistics)\b/.test(context)) {
    const lists = [...text.matchAll(/\b(?:data|dataset|observations)\s*[:=]?\s*\[([^\]]+)\]/gi)];
    if (lists.length !== 1) return null;
    const parts = lists[0][1].split(',').map((v) => v.trim());
    if (!parts.every((v) => new RegExp(`^${numberPattern}$`).test(v))) return null;
    const values = parts.map(Number),
      s = describeNumericSample(values);
    if (!s) return null;
    const label = `[${values.join(', ')}]`,
      stem = `For data ${label}, `;
    const spread = /variance|outliers/.test(context);
    const center = [
      item(
        stem + 'calculate the arithmetic mean.',
        round(s.mean),
        `Sum ${round(s.sum)} divided by n=${s.n} gives ${round(s.mean)}.`,
      ),
      item(
        stem + 'calculate the median.',
        round(s.median),
        `Sort the ${s.n} observations numerically; ${s.n % 2 ? 'take the middle value' : 'average the two middle values'} to obtain ${round(s.median)}.`,
      ),
      item(
        stem + 'calculate the range.',
        round(s.range),
        `Maximum ${s.max} minus minimum ${s.min} equals ${round(s.range)}.`,
      ),
      item(
        stem + 'how many observations are in the dataset? Count repeated values separately.',
        s.n,
        `There are ${s.n} entries; duplicates are still observations.`,
      ),
    ];
    const variance = [
      item(
        stem + 'calculate the sum of squared deviations from the mean.',
        round(s.squaredDeviations),
        `Use mean ${round(s.mean)} and sum (x-mean)^2 to get ${round(s.squaredDeviations)}.`,
      ),
      item(
        stem + 'calculate population variance when these observations are the entire population.',
        round(s.populationVariance),
        `Divide squared-deviation sum ${round(s.squaredDeviations)} by n=${s.n}: ${round(s.populationVariance)}.`,
      ),
      item(
        stem + 'calculate sample variance using the n-1 convention.',
        round(s.sampleVariance),
        `Divide ${round(s.squaredDeviations)} by n-1=${s.n - 1}: ${round(s.sampleVariance)}.`,
      ),
      item(
        stem + 'why is the sample variance at least as large as the population variance for the same values?',
        'The numerator is identical, but n-1 is smaller than n; equality occurs when all values are equal.',
        `The two denominators are ${s.n - 1} and ${s.n}; compare ${round(s.sampleVariance)} with ${round(s.populationVariance)}.`,
      ),
    ];
    const outliers = [...text.matchAll(new RegExp(`(?:adding|add)(?: an?)? outlier\\s+(${numberPattern})`, 'gi'))];
    if (outliers.length === 1) {
      const value = Number(outliers[0][1]);
      const extended = describeNumericSample([...values, value]);
      if (extended)
        variance[3] = item(
          `${stem}add the stated outlier ${value} and calculate the new mean and median.`,
          `Mean ${round(extended.mean)}; median ${round(extended.median)}.`,
          `The new sum is ${round(extended.sum)} over ${extended.n} entries; sorting gives median ${round(extended.median)}. Compare the original mean ${round(s.mean)} and median ${round(s.median)}.`,
        );
    }
    return packet(
      'numeric-sample',
      `Calculate ${spread ? 'spread with explicit population/sample conventions' : 'center and range'} for data ${label}.`,
      spread ? [...variance, ...center] : [...center, ...variance],
      [
        term('Mean', 'Sum divided by the number of observations.'),
        term('Median', 'Middle ordered value, or mean of the two middle values.'),
        term('Population variance', 'Sum of squared deviations divided by n.'),
        term('Sample variance', 'Sum of squared deviations divided by n-1.'),
      ],
      {
        columnLabels: ['Quantity', 'Value'],
        rows: [
          ['n', String(s.n)],
          ['Mean', round(s.mean)],
          ['Median', round(s.median)],
          ['Population variance', round(s.populationVariance)],
          ['Sample variance', round(s.sampleVariance)],
        ],
      },
    );
  }
  if (/\b(?:market equilibrium|price ceilings|supply and demand)\b/.test(context)) {
    const ds = [...text.matchAll(new RegExp(`Qd\\s*=\\s*(${numberPattern})\\s*-\\s*(${numberPattern})\\s*P\\b`, 'gi'))];
    const ss = [
      ...text.matchAll(new RegExp(`Qs\\s*=\\s*(${numberPattern})\\s*\\+\\s*(${numberPattern})\\s*P\\b`, 'gi')),
    ];
    const caps = [
      ...text.matchAll(new RegExp(`(?:price ceiling|ceiling)\\s*(?:of\\s*)?P\\s*=\\s*(${numberPattern})`, 'gi')),
    ];
    if (ds.length !== 1 || ss.length !== 1 || caps.length !== 1) return null;
    const [a, b] = ds[0].slice(1).map(Number),
      [c, d] = ss[0].slice(1).map(Number),
      cap = Number(caps[0][1]);
    const p = (a - c) / (b + d),
      q = a - b * p,
      qd = a - b * cap,
      qs = c + d * cap;
    if (
      ![a, b, c, d, cap, p, q, qd, qs].every(Number.isFinite) ||
      b <= 0 ||
      d <= 0 ||
      cap < 0 ||
      p < 0 ||
      q < 0 ||
      qd < 0 ||
      qs < 0
    )
      return null;
    const binding = cap < p,
      shortage = binding ? qd - qs : 0;
    const stem = `In the hypothetical market Qd=${a}-${b}P and Qs=${c}+${d}P, `;
    const equilibrium = [
      item(
        stem + 'solve the equilibrium price.',
        round(p),
        `${a}-${b}P=${c}+${d}P gives (${b + d})P=${a - c}, hence P=${round(p)}.`,
      ),
      item(
        stem + 'calculate equilibrium quantity.',
        round(q),
        `Substitute P=${round(p)} into either curve: Q=${round(q)}.`,
      ),
      item(stem + `calculate demand at P=${cap}.`, round(qd), `Qd=${a}-${b}(${cap})=${round(qd)}.`),
      item(stem + `calculate supply at P=${cap}.`, round(qs), `Qs=${c}+${d}(${cap})=${round(qs)}.`),
    ];
    const ceiling = [
      item(
        stem + `is a ceiling P=${cap} binding?`,
        binding ? 'Yes.' : 'No.',
        `Compare ceiling ${cap} with equilibrium price ${round(p)}. A ceiling below equilibrium is binding.`,
      ),
      item(
        stem + `find the shortage caused by a ceiling P=${cap}.`,
        round(shortage),
        binding
          ? `At the binding ceiling demand minus supply is ${round(qd)}-${round(qs)}=${round(shortage)}.`
          : 'A ceiling at or above equilibrium does not force the market price upward, so it creates no shortage in this model.',
      ),
      item(
        stem + `under the ceiling P=${cap}, with no outside supply, what is the maximum quantity available for trade?`,
        round(binding ? qs : q),
        binding
          ? `Supply at the ceiling limits trades to ${round(qs)}; desired demand is not available supply.`
          : `The ceiling is not binding; equilibrium quantity remains ${round(q)}.`,
      ),
      item(
        stem + 'what assumption makes this a simplified exercise rather than a forecast?',
        'Both curves are fixed linear relationships; other determinants are held constant.',
        'Changing income, costs or other determinants would require new curves; these hypothetical equations alone cannot establish real outcomes.',
      ),
    ];
    const questions = /ceiling/.test(context) ? [...ceiling, ...equilibrium] : [...equilibrium, ...ceiling];
    return packet(
      'linear-market',
      stem + `analyze equilibrium and a price ceiling P=${cap}.`,
      questions,
      [
        term('Equilibrium', 'Price at which quantity demanded equals quantity supplied.'),
        term('Binding ceiling', 'Maximum legal price below the unconstrained equilibrium.'),
        term('Shortage', 'At a binding ceiling, quantity demanded minus quantity supplied.'),
      ],
      {
        columnLabels: ['Quantity', 'Value'],
        rows: [
          ['Equilibrium price', round(p)],
          ['Equilibrium quantity', round(q)],
          ['Demand at ceiling', round(qd)],
          ['Supply at ceiling', round(qs)],
        ],
      },
    );
  }
  return null;
}
export function buildVerifiedQuantitativeQuiz(lesson, count) {
  const p = lesson.verifiedQuantitativePractice;
  if (!p) return null;
  return p.questions.slice(0, count).map((q, i) => ({
    id: `L${lesson.lessonNumber}-Q${i + 1}`,
    type: 'short_answer',
    ...q,
    sampleAnswer: q.answer,
    scoringGuidance: `Award credit for the result and reasoning; accept equivalent fractions and appropriately rounded values. ${q.explanation}`,
    points: 2,
    estimatedMinutes: 3,
    bloomsLevel: 'Apply',
    difficulty: i < 2 ? 'easy' : 'medium',
    objectiveAligned: p.objective,
    enrichmentSource: 'compiler-checked-explicit-inputs',
    quizPlan: { role: 'explicit-numeric-calculation', bloom: 'Apply', bloomSource: 'supplied inputs' },
    sourceReviewRequired: false,
    verification: { method: p.kind, inputs: p.workedExample.problem },
    practiceRecord: {
      protocol: 'coursemapper-explicit-quantitative-inputs-v1',
      title: 'Supplied hypothetical inputs',
      context: p.provenance,
      records: [p.workedExample.problem],
      studentUse: 'Use the stated inputs and show calculations.',
    },
  }));
}
export function projectVerifiedQuantitativePractice(feature, data, blueprint) {
  const key = {
    lessonPlans: 'lessonPlans',
    studyGuides: 'studyGuides',
    slideDecks: 'decks',
    assignments: 'assignments',
    rubrics: 'rubrics',
  }[feature];
  if (!data?.[key]) return data;
  return {
    ...data,
    [key]: data[key].map((row) => {
      const lesson = blueprint.lessons.find(
        (l) =>
          l.lessonNumber === Number(row.lessonNumber) ||
          l.title === row.lessonTitle ||
          row.relatedLessons?.includes(l.title),
      );
      const p = lesson?.verifiedQuantitativePractice;
      if (!p) return row;
      const ex = p.workedExample,
        practice = p.practice;
      if (feature === 'studyGuides')
        return {
          ...row,
          summary: ex.problem,
          keyTerms: p.terms,
          workedExample: ex,
          objectivePractice: ['Record the given values and identify the required quantity before calculating.'],
          practiceActivities: [practice.question],
          reviewQuestions: [p.questions[5].question],
          conceptConnections: [ex.result],
        };
      if (feature === 'lessonPlans')
        return {
          ...row,
          objectives: [p.objective],
          workedExample: ex,
          studentFacingSummary: ex.problem,
          outline: row.outline.map((block, i) => ({
            ...block,
            activity:
              [
                'Identify inputs',
                'Worked calculation',
                'Explain the method',
                'Independent practice',
                'Compare reasoning',
                'Exit check',
              ][i] || block.activity,
            description: i === 0 ? ex.problem : i < 3 ? ex.steps.join(' ') : practice.question,
            instructorNotes: i < 3 ? ex.steps.join(' ') : practice.answer,
          })),
          formativeCheck: {
            type: 'Calculation',
            prompt: practice.question,
            expectedAnswer: practice.answer,
            instructorAction: 'Check the setup, calculation and interpretation separately.',
          },
          readyToTeachSupport: {
            ...row.readyToTeachSupport,
            workedExample: [ex.problem, ...ex.steps, ex.result].join(' '),
            studentHandout: practice.question,
            instructorPrep: p.provenance,
          },
        };
      if (feature === 'assignments')
        return {
          ...row,
          objectives: [p.objective],
          overview: practice.question,
          instructions: [
            practice.question,
            'Show the formula, substitution, calculation and interpretation. State any population or model assumptions.',
          ],
          deliverables: ['A calculation with labeled steps and a short interpretation.'],
          expectedSubmissionFormat: 'Written calculations and explanation.',
          citationAndSourceUse: p.provenance,
          gradingCriteria: [
            'Correct inputs',
            'Appropriate formula and assumptions',
            'Accurate calculation',
            'Interpretation within the model',
          ],
        };
      if (feature === 'rubrics')
        return {
          ...row,
          taskDirections: [practice.question],
          teacherNotes: practice.answer,
          criteria: (row.criteria || []).map((c, i) => ({
            ...c,
            criterion: ['Inputs', 'Method', 'Calculation', 'Interpretation'][i % 4],
            objectiveAligned: p.objective,
            evidenceSignal: [
              'Copies each given value accurately.',
              'Selects the appropriate formula and denominator.',
              'Shows arithmetic and the resulting value.',
              'Explains what the result means under the stated assumptions.',
            ][i % 4],
            exemplary: [
              'All values and labels correct.',
              'Correct formula, convention and justified substitution.',
              'All calculations shown and correct.',
              'Correct contextual interpretation and explicit limit.',
            ][i % 4],
            proficient: [
              'Values correct; one label omitted.',
              'Correct formula with brief justification.',
              'Correct result with one omitted intermediate step.',
              'Correct interpretation; limit implicit.',
            ][i % 4],
            developing: [
              'One input copied incorrectly.',
              'Formula or convention only partly appropriate.',
              'Arithmetic error affects the answer.',
              'Interpretation extends beyond the assumptions.',
            ][i % 4],
            beginning: [
              'No usable input record.',
              'No relevant formula.',
              'No checkable calculation.',
              'No interpretation of the result.',
            ][i % 4],
          })),
        };
      const body = [
        { title: 'Given inputs', bullets: [ex.problem, p.provenance] },
        ...p.terms.map((t) => ({ title: t.term, bullets: [t.definition] })),
        ...ex.steps.map((s, i) => ({ title: `Worked calculation ${i + 1}`, bullets: [s] })),
        { title: 'Independent practice', bullets: [practice.question] },
      ];
      return {
        ...row,
        slides: row.slides.map((s, i) => ({
          ...s,
          ...(i === 2 ? { type: 'content' } : {}),
          title:
            i === 0
              ? s.title
              : i === row.slides.length - 1
                ? 'Interpret the result'
                : body[
                    Math.min(body.length - 1, Math.floor(((i - 1) * body.length) / Math.max(1, row.slides.length - 2)))
                  ].title,
          bullets:
            i === 0
              ? [p.objective]
              : i === row.slides.length - 1
                ? [ex.result]
                : body[
                    Math.min(body.length - 1, Math.floor(((i - 1) * body.length) / Math.max(1, row.slides.length - 2)))
                  ].bullets,
          notes:
            i === 0
              ? `${ex.problem} ${p.provenance}`
              : i === row.slides.length - 1
                ? `${ex.result} ${practice.explanation}`
                : `${body[Math.min(body.length - 1, Math.floor(((i - 1) * body.length) / Math.max(1, row.slides.length - 2)))].bullets.join(' ')} ${ex.steps[(i - 1) % ex.steps.length]}`,
          visual:
            i === 2
              ? { kind: 'table', ...p.table, description: ex.problem, altText: ex.steps.join(' ') }
              : { kind: 'none', description: '', altText: 'Calculations are available as selectable text.' },
          objectiveLink: p.objective,
        })),
      };
    }),
  };
}
