// Synthetic mechanics fixture, not evidence of educational quality.
import { createCourse, materializeLesson, newId, revise, type Course, type LessonDraft } from '../domain';
export const source = {
  id: 'reference',
  version: 1,
  title: 'Trip records',
  kind: 'fictional' as const,
  text: 'The four fictional delays in minutes are 1, 2, 3 and 10.',
};
export function draft(): LessonDraft {
  const numeric = {
    datasets: [
      { id: 'delays', label: 'Fictional trip delays in minutes', kind: 'observations' as const, values: [1, 2, 3, 10] },
    ],
    calculations: [
      { dataset: 'delays', operation: 'mean' as const, expected: 4 },
      { dataset: 'delays', operation: 'median' as const, expected: 2.5 },
    ],
  };
  return {
    title: 'Mean and median',
    objective: 'Compare how mean and median respond to an extreme delay.',
    preparation: 'Provide paper and a calculator.',
    explanation: 'The mean uses every value. The median depends on sorted position.',
    teachingMinutes: 12,
    workedExample: {
      material: source.text,
      prompt: 'Find the mean and median.',
      steps: [
        'Sort the four observations.',
        'Add all observations and divide by four: {{delays.mean}}.',
        'Average the two central values: {{delays.median}}.',
      ],
      answer: 'Mean {{delays.mean}} minutes; median {{delays.median}} minutes.',
      evidence: [{ sourceId: source.id, quote: source.text }],
      ...numeric,
    },
    activities: [0, 1].map((i) => ({
      title: i ? 'Independent comparison' : 'Guided comparison',
      kind: i ? ('independent' as const) : ('guided' as const),
      minutes: i ? 16 : 14,
      material: source.text,
      prompt: i
        ? 'Explain why the large delay changes the mean more than the median.'
        : 'Calculate the two measures and name the data each uses.',
      product: 'Submit the calculations and a two-sentence comparison.',
      hint: 'Locate the two central observations.',
      answer:
        'Mean {{delays.mean}} and median {{delays.median}} minutes. The mean is affected by the value of every observation.',
      reasoning: ['The sum includes the largest delay.', 'The median uses the second and third sorted values.'],
      feedback: [
        {
          error: 'Median is the second value only.',
          diagnosis: 'There are an even number of observations.',
          nextStep: 'Average the two central values.',
        },
        {
          error: 'Discard the long delay.',
          diagnosis: 'An unusual value is still an observation.',
          nextStep: 'Keep it unless investigation establishes an error.',
        },
      ],
      rubric: [
        {
          criterion: 'Calculation',
          fullCredit: 'Both measures correct with work.',
          partialCredit: 'One measure correct with work.',
          noCredit: 'Neither measure correct.',
          points: 2,
        },
        {
          criterion: 'Interpretation',
          fullCredit: 'Explains the difference using all values versus position.',
          partialCredit: 'Names the effect without its reason.',
          noCredit: 'Claims the two measures use the same rule.',
          points: 2,
        },
      ],
      evidence: [{ sourceId: source.id, quote: source.text }],
      ...numeric,
    })),
    debrief: 'Ask which measure changes when the largest value changes.',
    debriefMinutes: 5,
    exitTicket: {
      prompt: 'Does increasing the largest observation change the median?',
      answer: 'No, its sorted position is still last.',
      nextLessonDecision: 'If the learner says yes, have them mark the middle two positions.',
      minutes: 3,
      datasets: [],
      calculations: [],
    },
  };
}
export function completeCourse(): Course {
  let c = createCourse(
    {
      description: 'Teach the difference between mean and median.',
      audience: 'Adult beginners',
      language: 'en',
      lessonCount: 2,
      minutesPerLesson: 50,
      allowFictional: true,
    },
    [source],
  );
  const ids = [newId('lesson'), newId('lesson')];
  c = revise(c, {
    plan: {
      title: 'Understanding delay data',
      overview: 'A short course in interpreting variation.',
      prerequisites: 'Addition and division',
      finalProduct: 'A justified comparison of two numerical summaries.',
      goals: ['Calculate summaries.', 'Interpret sensitivity.'],
      lessons: ids.map((_, i) => ({
        title: `Part ${i + 1}`,
        objective: 'Compare mean and median.',
        scope: 'Use trip delay data.',
        goalIndices: [i],
        sourceIds: [source.id],
        buildsOn: i ? [0] : [],
      })),
    },
    planLessonIds: [...ids],
    lessonOrder: [...ids],
    status: 'review',
  });
  return revise(c, { lessons: Object.fromEntries(ids.map((id) => [id, materializeLesson(draft(), id, c)])) });
}
