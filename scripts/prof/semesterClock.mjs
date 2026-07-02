/**
 * scripts/prof/semesterClock.mjs — week ticks + the seeded disruption deck
 * (design §2 A3). Events are expressed as concrete course-map cell edits so
 * the live driver can apply them through the real UI; each class names the
 * product surface it stresses.
 */

import { seededRandom } from './universe.mjs';

export const DISRUPTION_DECK = [
  {
    class: 'schedule-shock',
    description: 'Snow day: fold review time into the following week',
    stresses: 'sync recompile, registry integrity',
    edit: {
      fieldKey: 'syncActivities',
      mode: 'append',
      text: 'Compressed session: combine with the snow-day makeup review.',
    },
  },
  {
    class: 'content-pivot',
    description: 'Students are lost: add an in-class re-teach checkpoint',
    stresses: 'agent edits, cascade',
    edit: {
      fieldKey: 'asyncActivities',
      mode: 'append',
      text: 'Added re-teach checkpoint: revisit last week’s core concept before new material.',
    },
  },
  {
    class: 'assessment-change',
    description: 'Reweight: the weekly check becomes a graded milestone',
    stresses: 'weight hygiene, grading table, reconciliation',
    edit: { fieldKey: 'weeklyAssessments', mode: 'append', text: 'Now graded as a milestone checkpoint (10%).' },
  },
  {
    class: 'material-swap',
    description: 'Replace a reading with an OER alternative',
    stresses: 'readings registry, verbatim-title contract',
    // supportingResources cells render citation lists without the editable
    // span — the swap is expressed through the async-work cell instead (the
    // registry-verbatim stress moves to a P3 harness item).
    edit: {
      fieldKey: 'asyncActivities',
      mode: 'append',
      text: 'Reading swapped: use the Open Intro Reader (OER) chapter 3 instead of the original.',
    },
  },
];

/**
 * Deal a timeline: `count` events at distinct lesson indices, seeded and
 * replayable. Lessons 2..n-1 only (never the first or exam week by default).
 */
export function dealTimeline({ seed, count = 2, lessonCount = 14 }) {
  const rng = seededRandom(seed * 2711 + 17);
  const events = [];
  const usedLessons = new Set();
  let deckIndex = Math.floor(rng() * DISRUPTION_DECK.length);
  while (events.length < count && usedLessons.size < lessonCount - 2) {
    const lessonIndex = 1 + Math.floor(rng() * Math.max(1, lessonCount - 2));
    if (usedLessons.has(lessonIndex)) continue;
    usedLessons.add(lessonIndex);
    const card = DISRUPTION_DECK[deckIndex % DISRUPTION_DECK.length];
    deckIndex += 1;
    events.push({ week: events.length + 1, lessonIndex, ...card });
  }
  return events;
}
