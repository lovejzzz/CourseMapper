/**
 * scripts/prof/arenas/classroomMouth.mjs — A2's mouth layer (P2): confusion
 * heatmap → FAQ hit rate, TA round-trip with rubric discrimination, and the
 * discussion seminar (failure-direction scoring only). Mouths run on the
 * cheap tier under knowledge quarantine; leakage is measured on every
 * rendered performance.
 */

import { sampleCohort } from '../student/cohortFactory.mjs';
import { buildMisconceptionCast, normalizeTerm } from '../student/misconceptionCast.mjs';
import { createMind, applyExposure } from '../student/studentMind.mjs';
import { buildKnowledgeCard, renderPerformance, detectLeakage } from '../student/performanceEngine.mjs';
import { callModel, parseModelJson } from '../modelClient.mjs';
import { seededRandom } from '../universe.mjs';

const MOUTH_MODEL = 'gpt-5.4-mini';

function tokenJaccard(a, b) {
  const setA = new Set(
    normalizeTerm(a)
      .split(' ')
      .filter((t) => t.length > 3),
  );
  const setB = new Set(
    normalizeTerm(b)
      .split(' ')
      .filter((t) => t.length > 3),
  );
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared += 1;
  return shared / (setA.size + setB.size - shared);
}

/** Build minds mid-course (partial exposure) for a stratified sample. */
function buildSampleMinds({ structured, cast, sampleStudents, uptoLesson, rng }) {
  const conceptIds = structured.lessons.flatMap((lesson) => lesson.concepts.map((c) => c.id));
  return sampleStudents.map((student) => {
    const mind = createMind({
      studentId: student.studentId,
      traits: student.traits,
      conceptIds,
      seededMisconceptions: cast.seededByStudent.get(student.studentId) || new Map(),
      rng,
    });
    for (const lesson of structured.lessons.filter((l) => l.lesson <= uptoLesson)) {
      for (const concept of lesson.concepts) {
        applyExposure(mind, { conceptId: concept.id, kind: 'session', tick: lesson.lesson });
        if (student.traits.conscientiousness > 0.5) {
          applyExposure(mind, { conceptId: concept.id, kind: 'reading', tick: lesson.lesson });
        }
      }
    }
    return mind;
  });
}

/**
 * Confusion heatmap: sampled students ask their real questions per lesson;
 * clusters compared against the generated FAQ = the FAQ hit rate (design
 * §3e, "the crown jewel").
 */
export async function runConfusionHeatmap({
  structured,
  faqQuestions,
  cast,
  cohort,
  lessons,
  sampleSize,
  meter,
  seed,
}) {
  const rng = seededRandom(seed * 17 + 3);
  const sampleStudents = cohort.students.slice(0, sampleSize);
  const conceptsById = new Map(structured.lessons.flatMap((l) => l.concepts.map((c) => [c.id, c])));
  const courseTerms = [...conceptsById.values()].map((c) => c.term);
  const questions = [];
  let leakedResponses = 0;
  let totalResponses = 0;

  for (const lessonNumber of lessons) {
    const lesson = structured.lessons.find((l) => l.lesson === lessonNumber);
    if (!lesson) continue;
    const minds = buildSampleMinds({ structured, cast, sampleStudents, uptoLesson: lessonNumber, rng });
    for (const mind of minds) {
      const card = buildKnowledgeCard({
        mind,
        conceptsById,
        misconceptionsByConcept: cast.byConcept,
        tick: lessonNumber,
      });
      const task = `You just finished week ${lessonNumber} ("${lesson.concepts.map((c) => c.term).join(', ')}"). Write the ONE question you would actually ask the instructor — the thing that confused you most this week. Just the question, one sentence.`;
      try {
        const response = await renderPerformance({
          card,
          task,
          register: 'a real student typing quickly, informal, brief',
          model: MOUTH_MODEL,
          meter,
          role: `heatmap:${mind.studentId}:L${lessonNumber}`,
          maxTokens: 120,
        });
        totalResponses += 1;
        const leaked = detectLeakage({ responseText: response.text, card, courseTerms, taskText: task });
        if (leaked.length > 0) leakedResponses += 1;
        questions.push({ lesson: lessonNumber, studentId: mind.studentId, question: response.text.trim(), leaked });
      } catch {
        /* one mouth failing is not a term failure */
      }
    }
  }

  // Cluster lexically; compare clusters to the FAQ.
  const clusters = [];
  for (const entry of questions) {
    const match = clusters.find((cluster) => tokenJaccard(cluster.exemplar, entry.question) >= 0.4);
    if (match) {
      match.members.push(entry);
    } else {
      clusters.push({ exemplar: entry.question, lesson: entry.lesson, members: [entry] });
    }
  }
  for (const cluster of clusters) {
    cluster.faqHit = faqQuestions.some((faq) => tokenJaccard(faq, cluster.exemplar) >= 0.3);
  }
  const demandClusters = clusters.filter((cluster) => cluster.members.length >= 2);
  return {
    questionsAsked: questions.length,
    clusters: clusters.length,
    demandClusters: demandClusters.length,
    faqHitRate:
      demandClusters.length > 0
        ? Math.round((demandClusters.filter((c) => c.faqHit).length / demandClusters.length) * 100) / 100
        : null,
    unansweredDemand: demandClusters
      .filter((c) => !c.faqHit)
      .map((c) => ({ lesson: c.lesson, question: c.exemplar, askedBy: c.members.length })),
    leakage: {
      leakedResponses,
      totalResponses,
      rate: totalResponses > 0 ? Math.round((leakedResponses / totalResponses) * 1000) / 1000 : null,
    },
  };
}

/** TA round-trip: strong/misconception-weak/lawyer submissions, graded with
 *  the rubric ONLY. Rubric discrimination requires ≥2 band separation. */
export async function runTaRoundTrip({ structured, cast, cohort, lessonNumber, briefText, rubricText, meter, seed }) {
  const rng = seededRandom(seed * 29 + 11);
  const conceptsById = new Map(structured.lessons.flatMap((l) => l.concepts.map((c) => [c.id, c])));
  const courseTerms = [...conceptsById.values()].map((c) => c.term);
  const byArchetype = {
    strong: {
      ...cohort.students[0],
      traits: { ...cohort.students[0].traits, aptitude: 1.5, conscientiousness: 0.95, misconceptionSusceptibility: 0 },
    },
    weak: { ...cohort.students[1], traits: { ...cohort.students[1].traits, aptitude: 0.7, conscientiousness: 0.4 } },
    lawyer: { ...cohort.students[2], traits: { ...cohort.students[2].traits, aptitude: 1.2, conscientiousness: 0.9 } },
  };
  const submissions = [];
  const leakageEvents = [];
  for (const [archetype, student] of Object.entries(byArchetype)) {
    const [mind] = buildSampleMinds({ structured, cast, sampleStudents: [student], uptoLesson: lessonNumber, rng });
    const card = buildKnowledgeCard({
      mind,
      conceptsById,
      misconceptionsByConcept: cast.byConcept,
      tick: lessonNumber,
    });
    const task =
      archetype === 'lawyer'
        ? `Assignment brief:\n${briefText}\n\nComplete this with the LEAST possible effort that still technically satisfies the literal words of the brief. Exploit any ambiguity. Write the submission only.`
        : `Assignment brief:\n${briefText}\n\nWrite your submission (short — a paragraph or two).`;
    const response = await renderPerformance({
      card,
      task,
      register: archetype === 'strong' ? 'a diligent student, clear but not polished' : 'a rushed student, informal',
      model: MOUTH_MODEL,
      meter,
      role: `ta-roundtrip:${archetype}`,
      maxTokens: 450,
    });
    const leaked = detectLeakage({ responseText: response.text, card, courseTerms, taskText: task });
    if (leaked.length > 0) leakageEvents.push({ archetype, leaked });
    submissions.push({ archetype, text: response.text.trim() });
  }

  const gradingPrompt = `You are a TA. Grade each submission using ONLY this rubric — no criteria of your own:\n\nRUBRIC:\n${rubricText}\n\n${submissions
    .map((s, i) => `SUBMISSION ${i + 1} (${s.archetype}):\n${s.text}`)
    .join(
      '\n\n',
    )}\n\nReturn ONLY JSON: {"grades":[{"submission":1,"band":"exemplary|proficient|developing|beginning","rationale":"..."}...],"missingCriteria":["criteria you NEEDED but the rubric lacks"],"ambiguityExploited":"what the lawyer submission got away with, or null"}`;
  const graded = await callModel({
    model: MOUTH_MODEL,
    system: 'You are a strict but fair teaching assistant.',
    user: gradingPrompt,
    maxTokens: 700,
    temperature: 0.2,
    meter,
    role: 'ta-roundtrip:grading',
  });
  const verdict = parseModelJson(graded.text);
  const bandRank = { beginning: 0, developing: 1, proficient: 2, exemplary: 3 };
  const bands = Object.fromEntries(
    (verdict.grades || []).map((g, i) => [submissions[g.submission - 1]?.archetype || `s${i}`, g.band]),
  );
  const separation = bands.strong && bands.weak ? (bandRank[bands.strong] ?? 0) - (bandRank[bands.weak] ?? 0) : null;
  return {
    lesson: lessonNumber,
    bands,
    discrimination: separation,
    discriminates: separation !== null ? separation >= 2 : null,
    missingCriteria: verdict.missingCriteria || [],
    ambiguityExploited: verdict.ambiguityExploited || null,
    leakageEvents,
  };
}

/** Discussion seminar — scored ONLY in the failure direction (design §2 A2):
 *  instant convergence with nothing to cite proves a dead prompt. */
export async function runSeminar({
  structured,
  cast,
  cohort,
  lessonNumber,
  discussionPrompt,
  positions,
  meter,
  seed,
  maxTurns = 12,
}) {
  const rng = seededRandom(seed * 41 + 19);
  const conceptsById = new Map(structured.lessons.flatMap((l) => l.concepts.map((c) => [c.id, c])));
  const participants = cohort.students.slice(0, 4);
  const minds = buildSampleMinds({ structured, cast, sampleStudents: participants, uptoLesson: lessonNumber, rng });
  const transcript = [];
  let citations = 0;
  let disagreements = 0;
  for (let turn = 0; turn < maxTurns; turn += 1) {
    const mind = minds[turn % minds.length];
    const card = buildKnowledgeCard({
      mind,
      conceptsById,
      misconceptionsByConcept: cast.byConcept,
      tick: lessonNumber,
    });
    const soFar = transcript.map((t) => `${t.studentId}: ${t.text}`).join('\n') || '(you speak first)';
    const task = `Seminar prompt: "${discussionPrompt}"${positions?.length ? `\nPositions on the table: ${positions.join(' — VERSUS — ')}` : ''}\n\nDiscussion so far:\n${soFar}\n\nYour turn. One short contribution (2-3 sentences). If you disagree with someone, say so and why. If you can cite something specific from the course materials you know, do. If you have nothing new to add, say "I agree" and nothing else.`;
    try {
      const response = await renderPerformance({
        card,
        task,
        register: 'a student speaking in seminar, natural, brief',
        model: MOUTH_MODEL,
        meter,
        role: `seminar:turn${turn + 1}`,
        maxTokens: 160,
        temperature: 0.8,
      });
      const text = response.text.trim();
      transcript.push({ studentId: mind.studentId, text });
      if (/disagree|but |however|actually|not sure that/i.test(text)) disagreements += 1;
      if (/according to|the reading|the study guide|lesson|as .* said|the materials/i.test(text)) citations += 1;
      // Convergence check: two consecutive bare agreements = dead.
      const lastTwo = transcript.slice(-2).map((t) => t.text.toLowerCase());
      if (lastTwo.length === 2 && lastTwo.every((t) => t.length < 30 && t.includes('agree'))) break;
    } catch {
      break;
    }
  }
  const dead = transcript.length <= 2 || (disagreements === 0 && citations === 0);
  return {
    lesson: lessonNumber,
    turns: transcript.length,
    disagreements,
    citations,
    deadPrompt: dead,
    note: dead
      ? 'DEAD PROMPT (failure-direction evidence): the seminar produced no disagreement and no citations'
      : 'lively — WEAK evidence only (LLMs never have dead air); not scored as success',
    transcript,
  };
}

export { buildSampleMinds };
