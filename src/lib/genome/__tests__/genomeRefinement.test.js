/**
 * CurriculumOS V1 refinement loop — iteration 1.
 *
 * Red-team targets:
 *  1. Resolver precision: ambiguous vocabulary across disciplines must not
 *     produce false resolutions ("demand characteristics" in psych is not
 *     the econ demand curve).
 *  2. Genome-linked output through the full compile: citations, provenance,
 *     and substance quality must survive real compilation, not just unit
 *     composition.
 *  3. Storage round-trip: conceptProvenance and citations survive the
 *     JSON compaction every saved project goes through.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createKernelLibrary } from '../kernelLibrary.js';
import { runGenomeLinker } from '../runGenomeLinker.js';
import { resolveLessonConcepts } from '../conceptResolver.js';
import { buildQuizItemPlan } from '../../blueprintEnrichmentPass.js';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../../courseBlueprintCompiler.js';
import { auditSubstance } from '../../contentQualityChecks.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
  };
}

function genesisLibrary() {
  const library = createKernelLibrary({ storage: memoryStorage() });
  const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/manifest.json'), 'utf8'));
  for (const shard of manifest.shards) {
    const body = JSON.parse(readFileSync(join(process.cwd(), 'public/genome', shard.path), 'utf8'));
    library.addKernels(body.kernels, { source: 'shard' });
  }
  return library;
}

describe('iteration 1 — resolver precision (false-positive red team)', () => {
  const library = genesisLibrary();
  const index = library.getIndex();

  it('does not resolve psych "demand characteristics" to the econ demand curve', () => {
    const lesson = {
      title: 'Lesson 4: Demand Characteristics in Experiments',
      sections: [
        {
          topicSection: '4.1: Participant expectancy and demand characteristics',
          learningObjectives:
            'Students will be able to:\n1. Identify demand characteristics in study designs\n2. Design procedures that reduce participant expectancy bias',
        },
      ],
    };
    const { conceptRefs } = resolveLessonConcepts(lesson, index, { level: 'intro' });
    expect(conceptRefs.map((ref) => ref.id)).not.toContain('econ/demand-curve');
    expect(conceptRefs.map((ref) => ref.id)).not.toContain('econ/price-elasticity-of-demand');
  });

  it('does not resolve a film course to any genesis concept', () => {
    const lesson = {
      title: 'Lesson 2: Mise-en-scene and the Long Take',
      sections: [
        {
          topicSection: '2.1: Composition within the frame',
          learningObjectives: 'Students will be able to:\n1. Analyze blocking, lighting, and depth in a sequence',
        },
      ],
    };
    const { conceptRefs } = resolveLessonConcepts(lesson, index, { level: 'intro' });
    expect(conceptRefs).toEqual([]);
  });

  it('still resolves the true positives with multi-word specificity', () => {
    const lesson = {
      title: 'Lesson 6: Hypothesis Testing and the p-value',
      sections: [
        {
          topicSection: '6.1: Interpreting p-values',
          learningObjectives: 'Students will be able to:\n1. Interpret a p-value correctly in a published study',
        },
      ],
    };
    const { conceptRefs } = resolveLessonConcepts(lesson, index, { level: 'intro' });
    expect(conceptRefs.map((ref) => ref.id)).toContain('stats/p-value');
  });
});

describe('iteration 1 — genome-linked output through full compilation', () => {
  const library = genesisLibrary();
  const STATS_COURSE = {
    courseName: 'Introduction to Statistics',
    semester: 'Fall 2026',
    lessons: [
      {
        title: 'Lesson 1: Sampling Distributions and the Central Limit Theorem',
        sections: [
          {
            topicSection: '1.1: The sampling distribution of the mean',
            learningObjectives:
              'Students will be able to:\n1. Describe the sampling distribution of the sample mean\n2. Apply the central limit theorem',
            learningGoals: 'Build inferential foundations.',
            weeklyAssessments: '1. Concept check: sampling distribution behavior',
            asyncActivities: '1. Read: sampling distribution chapter',
            syncActivities: '1. Simulation: dice-roll averages',
            supportingResources: '1. OpenStax Introductory Statistics, Ch. 7',
          },
        ],
      },
      {
        title: 'Lesson 2: Hypothesis Testing and p-values',
        sections: [
          {
            topicSection: '2.1: Interpreting the p-value',
            learningObjectives:
              'Students will be able to:\n1. Interpret p-values in published research\n2. Evaluate common p-value misinterpretations',
            learningGoals: 'Read research critically.',
            weeklyAssessments: '1. Data response: interpret a reported p-value',
            asyncActivities: '1. Read: hypothesis testing chapter',
            syncActivities: '1. Workshop: misinterpretation hunt',
            supportingResources: '1. OpenStax Introductory Statistics, Ch. 9',
          },
        ],
      },
    ],
  };

  function linkedEnrichment() {
    const linked = runGenomeLinker({
      courseMap: STATS_COURSE,
      lessonIndices: [0, 1],
      library,
      itemPlan: buildQuizItemPlan(6),
    });
    return { linked, enrichment: { source: 'genome-test', lessonContent: linked.lessonContent } };
  }

  it('links both stats lessons from the genesis genome with citations', () => {
    const { linked } = linkedEnrichment();
    expect(linked.telemetry.resolvedFromGenome).toBe(2);
    expect(linked.telemetry.citationsRendered).toBeGreaterThan(0);
    // v0.14.1 (4.5): both lessons matched a single kernel, so they are
    // PARTIAL links — the cited compositions ship (lessonContent), and the
    // lessons also stay on the model path so augmentation can fill key
    // terms to par.
    expect(linked.missingIndices).toEqual([0, 1]);
    expect(Object.keys(linked.partialOverlays)).toEqual(['lesson-1', 'lesson-2']);
  });

  it('orders prerequisites correctly and reports no findings for the right sequence', () => {
    const { linked } = linkedEnrichment();
    expect(linked.prerequisiteFindings).toEqual([]);
    expect(linked.glossary.length).toBeGreaterThanOrEqual(2);
  });

  it('flags the gap when the same course teaches p-values without sampling distributions', () => {
    const gapped = { ...STATS_COURSE, lessons: [STATS_COURSE.lessons[1]] };
    const linked = runGenomeLinker({
      courseMap: gapped,
      lessonIndices: [0],
      library,
      itemPlan: buildQuizItemPlan(6),
    });
    expect(linked.prerequisiteFindings.some((finding) => finding.type === 'missing-prerequisite')).toBe(true);
  });

  it('compiles genome-linked lessons with citations surviving into the study guide', () => {
    const { enrichment } = linkedEnrichment();
    const blueprint = JSON.parse(JSON.stringify(buildCourseBlueprint(STATS_COURSE, { enrichment })));
    const compiled = compileBlueprintDeliverables(blueprint, ['quizBank', 'studyGuides', 'slideDecks'], {});

    const guide = compiled.studyGuides.studyGuides[0];
    const citedTerm = guide.keyTerms.find((term) => term.source);
    expect(citedTerm).toBeTruthy();
    expect(citedTerm.source).toContain('§');
    expect(citedTerm.enrichmentSource).toBe('genome-linked');

    const quiz = compiled.quizBank.quizzes[0];
    const enrichedQuestion = quiz.questions.find((question) => question.enrichmentSource);
    expect(enrichedQuestion).toBeTruthy();
    expect(['A', 'B', 'C', 'D']).toContain(enrichedQuestion.answer);
  });

  it('keeps genome-linked quiz surfaces low-meta in the substance audit', () => {
    const { enrichment } = linkedEnrichment();
    const blueprint = JSON.parse(JSON.stringify(buildCourseBlueprint(STATS_COURSE, { enrichment })));
    const compiled = compileBlueprintDeliverables(blueprint, ['quizBank'], {});
    const linkedAudit = auditSubstance('quizBank', compiled.quizBank);

    const baselineBlueprint = JSON.parse(JSON.stringify(buildCourseBlueprint(STATS_COURSE, {})));
    const baseline = auditSubstance(
      'quizBank',
      compileBlueprintDeliverables(baselineBlueprint, ['quizBank'], {}).quizBank,
    );
    // v0.14.1: the deterministic quiz frames became content-bearing (item 1.7),
    // so the un-linked baseline's meta share dropped to match the linked run.
    // Linked output must never be MORE meta than baseline; equality is fine.
    expect(linkedAudit.metaShare).toBeLessThanOrEqual(baseline.metaShare);
  });
});
