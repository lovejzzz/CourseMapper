/**
 * v0.13.3 astronomy proof — every educational gap from the v0.13.1 live
 * audit, verified end-to-end against the new OpenStax Astronomy 2e shard:
 *
 *  G1 citations: lessons resolve from the genome with source labels
 *  G2 worked examples: quantitative lessons carry a numeric walkthrough
 *  G3 teaching script: warm-up is a misconception poll, mini-lesson works
 *     the example, guided analysis is content-driven
 *  G4 corrections: misconception corrections are corrective statements
 *     (the seasons correction names the January perihelion), never the
 *     definition restated
 *  G5 visuals: the key-term slide descriptor carries hub/spokes the PPTX
 *     exporter can render natively
 *  G6 signature pedagogy: sky-observation courses get a concrete observing
 *     protocol with weekly focus and a cloudy-night alternative
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createKernelLibrary } from '../src/lib/genome/kernelLibrary.js';
import { runGenomeLinker } from '../src/lib/genome/runGenomeLinker.js';
import { buildQuizItemPlan } from '../src/lib/blueprintEnrichmentPass.js';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler.js';
import { inferCourseDisciplines } from '../src/lib/genome/libraryShardLoader.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v) };
}

function genomeLibrary() {
  const library = createKernelLibrary({ storage: memoryStorage() });
  const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/manifest.json'), 'utf8'));
  for (const shard of manifest.shards) {
    const body = JSON.parse(readFileSync(join(process.cwd(), 'public/genome', shard.path), 'utf8'));
    library.addKernels(body.kernels, { source: 'shard' });
  }
  const archetypeShard = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/archetypes.json'), 'utf8'));
  library.addArchetypes(archetypeShard.archetypes);
  return library;
}

// The v0.13.1 live-run course, reconstructed as a fixture.
const ASTRONOMY_COURSE = {
  courseName: 'Introduction to Astronomy',
  lessons: [
    ['Astronomy as a Science and the Celestial Sphere', 'celestial sphere sky dome observation'],
    ['Motions of the Sky, Seasons, and Observing', 'diurnal motion seasons axial tilt night-sky observing'],
    ['Light, Telescopes, and Spectra', 'electromagnetic spectrum telescope light gathering spectral lines'],
    ['Origin of the Solar System', 'solar nebula accretion planetesimals frost line'],
    ['Orbits and Kepler’s Laws', 'Kepler third law orbital period semimajor axis'],
    ['The Moon and Eclipses', 'phases of the moon lunar cycle'],
    ['Measuring the Stars', 'apparent magnitude brightness of stars magnitude scale'],
    ['Stellar Distances', 'stellar parallax parsec celestial distances'],
    ['Galaxies and the Expanding Universe', 'Hubble law expanding universe recession velocity'],
  ].map(([title, topics], index) => {
    // Mirror the real audited course shape: two topic sections per lesson.
    const tokens = topics.split(' ');
    const mid = Math.ceil(tokens.length / 2);
    const sectionTopics = [tokens.slice(0, mid).join(' '), tokens.slice(mid).join(' ')];
    return {
      title: `Lesson ${index + 1}: ${title}`,
      sections: sectionTopics.map((topic, sectionIndex) => ({
        topicSection: `${index + 1}.${sectionIndex + 1}: ${topic}`,
        learningObjectives: `Analyze ${topic} using observations.`,
        weeklyAssessments: `Quiz ${index + 1} and night-sky observation log entry.`,
        asyncActivities: 'Read the assigned OpenStax Astronomy chapter.',
        syncActivities: 'Planetarium practice and guided sky-chart work.',
      })),
    };
  }),
};

const library = genomeLibrary();

describe('astronomy shard proof (v0.13.3)', () => {
  const linked = runGenomeLinker({
    courseMap: ASTRONOMY_COURSE,
    lessonIndices: ASTRONOMY_COURSE.lessons.map((_, i) => i),
    library,
    itemPlan: buildQuizItemPlan(6),
  });
  const blueprint = buildCourseBlueprint(ASTRONOMY_COURSE, {
    enrichment: { lessonContent: linked.lessonContent, quality: { source: 'genome-only' } },
  });
  const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'studyGuides', 'slideDecks', 'quizBank']);

  it('routes astronomy courses to the astro shard and resolves most lessons (G1)', () => {
    expect(inferCourseDisciplines(ASTRONOMY_COURSE)).toContain('astro');
    expect(linked.telemetry.resolvedFromGenome).toBeGreaterThanOrEqual(7);
  });

  it('carries OpenStax citations into study-guide key terms (G1)', () => {
    const allTerms = compiled.studyGuides.studyGuides.flatMap((guide) => guide.keyTerms || []);
    const cited = allTerms.filter((term) => /openstax/i.test(term.source || ''));
    expect(cited.length).toBeGreaterThanOrEqual(5);
  });

  it('projects a numeric worked example into the Kepler lesson plan and study guide (G2)', () => {
    const kepler = compiled.lessonPlans.lessonPlans.find((plan) => /kepler/i.test(plan.lessonTitle));
    expect(kepler.workedExample?.problem).toMatch(/1\.88/);
    expect(kepler.workedExample.steps.length).toBeGreaterThanOrEqual(2);
    expect(kepler.workedExample.result).toMatch(/1\.52\s*AU/);
    const keplerGuide = compiled.studyGuides.studyGuides.find((guide) => /kepler/i.test(guide.lessonTitle));
    expect(keplerGuide.workedExample?.result).toMatch(/1\.52/);
  });

  it('teaches the kernel content in the lesson-plan script (G3)', () => {
    const seasons = compiled.lessonPlans.lessonPlans.find((plan) => /seasons/i.test(plan.lessonTitle));
    const outlineText = JSON.stringify(seasons.outline);
    // Warm-up is a misconception poll, not the generic process prompt.
    expect(outlineText).toMatch(/Misconception poll/);
    // The mini-lesson starts from real subject matter.
    expect(outlineText).not.toMatch(/concise worked example that shows how/);
    // The study guide review question asks about the subject.
    const seasonsGuide = compiled.studyGuides.studyGuides.find((guide) => /seasons/i.test(guide.lessonTitle));
    const questions = (seasonsGuide.reviewQuestions || []).map((entry) => entry.question).join(' ');
    expect(questions).not.toMatch(/what would strong work/i);
  });

  it('pairs the seasons misconception with the real corrective, not the definition (G4)', () => {
    const seasonsGuide = compiled.studyGuides.studyGuides.find((guide) => /seasons/i.test(guide.lessonTitle));
    const seasonsEntry = (seasonsGuide.commonMisconceptions || []).find((entry) =>
      /distance from the sun/i.test(entry.misconception || ''),
    );
    expect(seasonsEntry).toBeTruthy();
    expect(seasonsEntry.correction).toMatch(/January|sun angle|day length/i);
    // The correction must not be the bare "term: definition" glossary form.
    expect(seasonsEntry.correction).not.toMatch(/^[A-Za-z\s-]+:\s/);
  });

  it('attaches renderable hub/spokes to the key-term slide visual (G5)', () => {
    const decks = compiled.slideDecks.decks;
    const keyTermVisuals = decks
      .flatMap((deck) => deck.slides)
      .filter((slide) => slide.visual?.kind === 'concept map' && Array.isArray(slide.visual?.spokes));
    expect(keyTermVisuals.length).toBeGreaterThanOrEqual(3);
    for (const slide of keyTermVisuals.slice(0, 3)) {
      expect(slide.visual.spokes.length).toBeGreaterThanOrEqual(2);
      expect(slide.visual.hub.length).toBeLessThanOrEqual(36);
    }
  });

  it('ships the observing protocol with weekly focus and cloudy-night alternative (G6)', () => {
    const plans = compiled.lessonPlans.lessonPlans;
    expect(plans.every((plan) => plan.observationProtocol)).toBe(true);
    const moon = plans.find((plan) => /moon/i.test(plan.lessonTitle));
    expect(moon.observationProtocol.weeklyFocus).toMatch(/Moon/);
    const seasons = plans.find((plan) => /seasons/i.test(plan.lessonTitle));
    // The motions+seasons lesson legitimately draws the star-tracking focus.
    expect(seasons.observationProtocol.weeklyFocus).toMatch(/bright star|Sun sets|sunset/i);
    expect(moon.observationProtocol.cloudyAlternative).toMatch(/Stellarium/);
    expect(moon.observationProtocol.logFields.length).toBeGreaterThanOrEqual(5);
  });

  it('keeps quiz items source-grounded with the shard mcBank (G1)', () => {
    const quizzes = compiled.quizBank.quizzes;
    const allQuestions = quizzes.flatMap((quiz) => quiz.questions || []);
    expect(
      allQuestions.some((question) =>
        /parallax of 0\.05|0\.1 arcsecond|semimajor axis of 4 AU|five magnitudes|magnitude 2|closest to the Sun/i.test(
          `${question.question} ${(question.options || []).join(' ')}`,
        ),
      ),
    ).toBe(true);
  });
});
