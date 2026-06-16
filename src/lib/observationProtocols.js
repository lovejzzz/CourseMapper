/**
 * observationProtocols.js — v0.13.3 G6: the signature-pedagogy layer for
 * sky-observation courses.
 *
 * The v0.13.1 astronomy audit found the course's own promised pedagogy
 * (night-sky observation logs, planetarium practice) referenced by name but
 * never specified: no observing protocol, no weekly targets, no cloudy-night
 * alternative. Kernels author subject matter, not activity design — so this
 * module authors the activity design ONCE, as data, the way throughline
 * profiles author case framing.
 *
 * Scope discipline: this covers sky-observation courses (the vocabulary
 * below). Other field-observation families (ecology transects, clinical
 * shadowing) get their own profiles when their disciplines join the genome.
 */

const SKY_CONTEXT_RE =
  /\b(?:astronom(?:y|ical)?|night[\s-]?sky|sky[\s-]?watch|celestial|planetarium|telescope|stargaz(?:e|ing)?|naked[\s-]?eye|moon|lunar|constellation|star\s+chart|stars?|solar system|galax(?:y|ies)|cosmolog(?:y|ical)?)\b/i;
const OBSERVING_INTENT_RE =
  /\b(?:observ(?:e|ing|ation)|log(?:s|ging)?|field\s+note|sky\s+chart|planetarium|telescope|stargaz(?:e|ing)?|naked[\s-]?eye)\b/i;
const SKY_PROTOCOL_LEAK_RE =
  /\b(?:Stellarium|planetarium|night[\s-]?sky|naked[\s-]?eye|light[\s-]?pollution|limiting magnitude|telescope|binoculars|dark adaptation|red light|sky conditions|star chart|celestial|constellation|altitude-in-fists)\b/i;
const LESSON_PLAN_CONTAINER_KEYS = ['lessonPlans', 'plans', 'lessons'];

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function objectHasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function protocolText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return cleanText(value);
  try {
    return cleanText(JSON.stringify(value));
  } catch {
    return cleanText(value);
  }
}

function isLeakedSkyProtocol(value) {
  return SKY_PROTOCOL_LEAK_RE.test(protocolText(value));
}

/** Does this course's own language promise sky observation work? */
export function detectSkyObservationCourse({ courseName = '', lessons = [] } = {}) {
  const text = [
    courseName,
    ...lessons.flatMap((lesson) => [
      lesson?.title,
      lesson?.activityPattern,
      lesson?.studentArtifact,
      ...(lesson?.readings || []),
      ...(lesson?.sections || []).flatMap((section) => [
        section?.topicSection,
        section?.learningObjectives,
        section?.weeklyAssessments,
        section?.asyncActivities,
        section?.syncActivities,
        section?.supportingResources,
      ]),
    ]),
  ]
    .map(cleanText)
    .join(' ');
  return SKY_CONTEXT_RE.test(text) && OBSERVING_INTENT_RE.test(text);
}

// The log fields every entry records — real observing-log practice.
const LOG_FIELDS = [
  'Date, time, and observing location',
  'Sky conditions: cloud cover, and limiting magnitude (faintest star you can see) as a light-pollution estimate',
  'Instrument: naked eye, binoculars, or telescope (with aperture if known)',
  'Each object observed: name, compass direction, and estimated altitude (one fist at arm’s length ≈ 10°)',
  'A labeled sketch of what you actually saw — drawing forces careful looking',
  'One question the observation raised for you',
];

// Weekly naked-eye focus, keyed by the lesson's concept vocabulary. Each is
// a real, doable assignment for an intro student with no equipment.
const WEEKLY_FOCI = [
  {
    match: /motion|diurnal|rotation|celestial sphere|rise|set|sky above/i,
    focus:
      'Pick one bright star and record its position (direction + altitude) at the same clock time on two different nights, and twice in one night two hours apart. Describe how it moved.',
  },
  {
    match: /season|solstice|equinox|sun path|axial tilt/i,
    focus:
      'Record where the Sun sets (compass direction against a fixed landmark) twice this week. Note the sunset time each day — is it drifting earlier or later?',
  },
  {
    match: /moon|lunar|phase/i,
    focus:
      'Sketch the Moon’s shape and note its direction and altitude for at least four nights (they need not be consecutive). Label each sketch with date and time.',
  },
  {
    match: /planet|solar system|orbit|kepler/i,
    focus:
      'Use a sky chart or app to identify one visible planet this week. Observe it naked-eye: note its color and that it shines steadily compared to twinkling stars, and record its position against background stars.',
  },
  {
    match: /light|spectrum|spectra|radiation|color|telescope/i,
    focus:
      'Find one distinctly reddish star and one blue-white star (a sky app helps). Record both, and note which appears brighter — color differences are temperature differences you can see.',
  },
  {
    match: /star|magnitude|brightness|distance|parallax/i,
    focus:
      'Choose one constellation and rank its five brightest stars by apparent brightness. Estimate the limiting magnitude from your site and note how many of its catalog stars you can actually see.',
  },
  {
    match: /galaxy|universe|cosmolog|hubble|expansion/i,
    focus:
      'From the darkest site you can reach, look for the Milky Way band (or note why you cannot see it). Record your limiting magnitude and one deep-sky object you attempted, such as the Andromeda Galaxy.',
  },
];

const DEFAULT_FOCUS =
  'Spend 15 minutes naked-eye observing. Log at least three objects with direction and altitude, and note anything that changed since your last session.';

const CLOUDY_ALTERNATIVE =
  'Cloudy night: run the same session in Stellarium (free, stellarium.org) or a planetarium app set to your location and tonight’s date. Complete every log field from the simulation and mark the entry "simulated" — the practice of locating and recording is the skill.';

const OBSERVING_BASICS =
  'Allow 10 minutes for dark adaptation (no phone screens — use red light), dress warmer than you think you need, and observe with a partner when possible.';

/**
 * Build the lesson's observation protocol. Returns null when the course is
 * not a sky-observation course.
 */
export function buildObservationProtocol({ courseName = '', lessons = [], lesson = null } = {}) {
  if (!detectSkyObservationCourse({ courseName, lessons })) return null;
  const conceptText = [lesson?.title, ...(lesson?.keyConcepts || [])].map(cleanText).join(' ');
  const weekly = WEEKLY_FOCI.find((entry) => entry.match.test(conceptText));
  return {
    logFields: LOG_FIELDS,
    weeklyFocus: weekly ? weekly.focus : DEFAULT_FOCUS,
    cloudyAlternative: CLOUDY_ALTERNATIVE,
    observingBasics: OBSERVING_BASICS,
  };
}

function repairLessonPlanObservationProtocol(plan, stats) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return plan;
  if (!objectHasOwn(plan, 'observationProtocol') || !isLeakedSkyProtocol(plan.observationProtocol)) return plan;
  const { observationProtocol: _removedProtocol, ...nextPlan } = plan;
  stats.removedCount += 1;
  return nextPlan;
}

function repairLessonPlanArray(plans, stats) {
  let changed = false;
  const repaired = plans.map((plan) => {
    const nextPlan = repairLessonPlanObservationProtocol(plan, stats);
    if (nextPlan !== plan) changed = true;
    return nextPlan;
  });
  return changed ? repaired : plans;
}

/**
 * Remove stale astronomy observing protocols from non-sky lesson-plan data.
 * This is a deterministic legacy repair for packages generated before the
 * detector required both sky context and observing intent.
 */
export function repairMisappliedObservationProtocols({ courseName = '', lessons = [], data = null } = {}) {
  if (!data || typeof data !== 'object') return { data, changed: false, removedCount: 0 };
  if (detectSkyObservationCourse({ courseName, lessons })) return { data, changed: false, removedCount: 0 };

  const stats = { removedCount: 0 };
  if (Array.isArray(data)) {
    const repairedPlans = repairLessonPlanArray(data, stats);
    return { data: repairedPlans, changed: repairedPlans !== data, removedCount: stats.removedCount };
  }

  let changed = false;
  let nextData = data;

  for (const key of LESSON_PLAN_CONTAINER_KEYS) {
    if (!Array.isArray(data?.[key])) continue;
    const repairedPlans = repairLessonPlanArray(data[key], stats);
    if (repairedPlans === data[key]) continue;
    if (nextData === data) nextData = { ...data };
    nextData[key] = repairedPlans;
    changed = true;
  }

  const repairedRoot = repairLessonPlanObservationProtocol(nextData, stats);
  if (repairedRoot !== nextData) {
    nextData = repairedRoot;
    changed = true;
  }

  return { data: nextData, changed, removedCount: stats.removedCount };
}
