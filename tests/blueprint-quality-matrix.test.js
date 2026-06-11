import { describe, expect, it } from 'vitest';
import {
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  getBlueprintCompiledFeatures,
  hydrateBlueprintForCompilation,
  validateBlueprintSemanticContract,
  validateCompilerOutputContract,
} from '../src/lib/courseBlueprintCompiler.js';
import { scoreHeuristic } from '../src/lib/deliverableQualityScorer.js';
import { validateDeliverableGeneration } from '../src/lib/deliverablePostProcess.js';
import { verifyPackageExports } from '../src/lib/packageExportVerifier.js';
import {
  COMPILER_OWNED_STORAGE_FIELDS,
  MESSY_UPLOAD_QUALITY_SCENARIOS,
  REAL_COURSE_QUALITY_SCENARIOS,
  SPARSE_SOURCE_BOUNDARY_SCENARIOS,
  makeMissingSourceBlueprint,
} from './lib/realCourseQualityScenarios.js';

const FEATURE_CONFIG_MAP = {
  courseFaq: { questionsPerLesson: 5 },
};

const CORE_SCENARIO_NAMES = new Set([
  'single lesson seminar source analysis',
  'three lesson policy memo studio',
  'biology lab methods',
  'large data science lab',
  'performing arts studio',
  'online writing workshop',
  'business case method',
  'world language proficiency',
  'constitutional law doctrine',
  'clinical caution counseling practice',
  'quantitative problem set',
  'capstone project progress',
]);

const MATRIX_MODE = process.env.BLUEPRINT_QUALITY_MATRIX || 'full';
const SELECTED_SCENARIOS =
  MATRIX_MODE === 'core'
    ? REAL_COURSE_QUALITY_SCENARIOS.filter((scenario) => CORE_SCENARIO_NAMES.has(scenario.name))
    : REAL_COURSE_QUALITY_SCENARIOS;

function byteLength(value) {
  return Buffer.byteLength(JSON.stringify(value));
}

function averageQuality(score) {
  return (score.bloomsAlignment + score.specificity + score.actionability + score.qmAlignment) / 4;
}

function assertCompilerOwnedFieldsAreNotStored(storedBlueprint, scenarioName) {
  for (const field of COMPILER_OWNED_STORAGE_FIELDS) {
    expect(storedBlueprint[field], `${scenarioName}: stored blueprint should omit ${field}`).toBeUndefined();
  }
}

function assertAssessmentAnchorsStayCompact(storedBlueprint, scenarioName) {
  for (const assessment of storedBlueprint.assessments || []) {
    // v0.14.1 (3.2): weight/weightPercent joined the persisted anchor keys —
    // registry-path grading weights must survive storage. These scenarios
    // compile the legacy path (no registry), so kind/registryId/dueSession
    // stay absent.
    expect(Object.keys(assessment).sort(), `${scenarioName}: stored assessment should only keep anchors`).toEqual(
      ['artifact', 'id', 'lessonNumbers', 'relatedLessons', 'source', 'title', 'weight', 'weightPercent'].sort(),
    );
    expect(assessment.criteria, `${scenarioName}: stored assessment criteria are compiler-owned`).toBeUndefined();
    expect(
      assessment.criterionObjectiveAlignment,
      `${scenarioName}: stored assessment objective alignment is compiler-owned`,
    ).toBeUndefined();
    expect(
      assessment.anchorExampleSet,
      `${scenarioName}: stored assessment examples are compiler-owned`,
    ).toBeUndefined();
  }
}

function assertLessonStorageStaysAtomic(storedBlueprint, scenarioName) {
  for (const lesson of storedBlueprint.lessons || []) {
    expect(lesson.compilerDecision, `${scenarioName}: stored lesson compiler decision is hydrated`).toBeUndefined();
    expect(lesson.sourceRisk, `${scenarioName}: stored lesson source risk is proof-owned`).toBeUndefined();
    expect(
      lesson.sourceEvidenceTrace?.sectionCoverage,
      `${scenarioName}: section coverage belongs in generated proof surfaces`,
    ).toBeUndefined();
    expect(
      lesson.sourceEvidenceTrace?.preservedSignals,
      `${scenarioName}: preserved signals belong in generated proof surfaces`,
    ).toBeUndefined();
    expect(
      lesson.sourceEvidenceTrace?.reviewerUse,
      `${scenarioName}: reviewer prose belongs in generated proof surfaces`,
    ).toBeUndefined();
    expect(
      lesson.sourceEvidenceTrace?.sourceFields?.length,
      `${scenarioName}: source fields stay inspectable`,
    ).toBeGreaterThanOrEqual(4);
    expect(
      lesson.sourceEvidenceTrace?.unsupportedInferencePolicy,
      `${scenarioName}: no-invention policy is required`,
    ).toMatch(/do not invent|local review|source/i);
    expect(lesson.sourceUsePlan?.noInventedSources, `${scenarioName}: source-use boundary is required`).toMatch(
      /do not invent|approved source|source/i,
    );
  }
}

function buildDeliverableEntries(compiled, featureIds) {
  return Object.fromEntries(
    featureIds
      .filter((featureId) => compiled[featureId])
      .map((featureId) => [featureId, { status: 'done', data: compiled[featureId] }]),
  );
}

describe('v0.8.4 blueprint/compiler real scenario quality matrix', () => {
  it('selects the intended scenario coverage tier', () => {
    const lessonScopes = new Set(REAL_COURSE_QUALITY_SCENARIOS.map((scenario) => scenario.lessonCount));
    const scenarioNames = REAL_COURSE_QUALITY_SCENARIOS.map((scenario) => scenario.name);

    expect(REAL_COURSE_QUALITY_SCENARIOS.length).toBeGreaterThanOrEqual(100);
    expect([...lessonScopes]).toEqual(expect.arrayContaining([1, 3, 8, 14]));
    expect(new Set(scenarioNames).size).toBe(scenarioNames.length);
    expect(SELECTED_SCENARIOS).toHaveLength(MATRIX_MODE === 'core' ? 12 : REAL_COURSE_QUALITY_SCENARIOS.length);
  });

  it.each(SELECTED_SCENARIOS)(
    '$name roundtrips compact storage, compiles, validates quality, and verifies package exports',
    async (scenario) => {
      const compilerOptions = { customDeliverables: scenario.customDeliverables };
      const compiledFeatureIds = getBlueprintCompiledFeatures(scenario.featureIds, compilerOptions);
      const modelFallbackFeatureIds = scenario.featureIds.filter(
        (featureId) => !compiledFeatureIds.includes(featureId),
      );
      const blueprint = buildCourseBlueprint(scenario.courseMap, compilerOptions);
      const storedBlueprint = JSON.parse(JSON.stringify(blueprint));
      const hydratedBlueprint = hydrateBlueprintForCompilation(storedBlueprint, compilerOptions);
      const semanticContract = validateBlueprintSemanticContract(storedBlueprint);
      const compiled = compileBlueprintDeliverables(storedBlueprint, scenario.featureIds, {
        ...compilerOptions,
        configMap: FEATURE_CONFIG_MAP,
      });
      const outputContract = validateCompilerOutputContract({
        blueprint: storedBlueprint,
        compiled,
        featureIds: scenario.featureIds,
        options: compilerOptions,
      });

      expect(storedBlueprint.blueprintStorageVersion, scenario.name).toBe(2);
      expect(byteLength(storedBlueprint), scenario.name).toBeLessThan(
        byteLength(hydratedBlueprint) * scenario.storageRatioLimit,
      );
      assertCompilerOwnedFieldsAreNotStored(storedBlueprint, scenario.name);
      assertAssessmentAnchorsStayCompact(storedBlueprint, scenario.name);
      assertLessonStorageStaysAtomic(storedBlueprint, scenario.name);

      expect(semanticContract.blockerCount, scenario.name).toBe(0);
      expect(hydratedBlueprint.compilerContract.blockerCount, scenario.name).toBe(0);
      expect(hydratedBlueprint.compilerProofBundle.proofSummary.verificationStatus, scenario.name).toBe(
        'verified-by-reading-derived-state',
      );
      expect(
        outputContract.status,
        `${scenario.name}: ${outputContract.findings.map((finding) => finding.code).join(', ')}`,
      ).toBe('pass');

      for (const featureId of compiledFeatureIds) {
        expect(compiled[featureId], `${scenario.name}: ${featureId} should compile`).toBeTruthy();
        const validation = validateDeliverableGeneration(featureId, compiled[featureId], {
          expectedLessonCount: storedBlueprint.lessons.length,
          config: FEATURE_CONFIG_MAP[featureId] || {},
        });
        const quality = scoreHeuristic(featureId, compiled[featureId]);

        expect(validation.valid, `${scenario.name} ${featureId}: ${validation.blockers.join('; ')}`).toBe(true);
        expect(averageQuality(quality), `${scenario.name} ${featureId}: heuristic quality`).toBeGreaterThanOrEqual(6);
      }

      for (const featureId of modelFallbackFeatureIds) {
        expect(compiled[featureId], `${scenario.name}: ${featureId} should stay on model fallback`).toBeUndefined();
      }

      const exportFeatureIds = scenario.exportFeatureIds.filter((featureId) => compiled[featureId]);
      const exportResult = await verifyPackageExports({
        courseMap: scenario.courseMap,
        deliverables: buildDeliverableEntries(compiled, exportFeatureIds),
        selectedFeatures: ['courseMap', ...exportFeatureIds],
      });

      expect(
        exportResult.status,
        `${scenario.name}: ${exportResult.checks
          .filter((check) => check.status !== 'passed')
          .map((check) => `${check.featureId}/${check.format}: ${check.message}`)
          .join('; ')}`,
      ).toBe('passed');
    },
    300_000,
  );

  it('keeps unknown custom deliverables on model fallback instead of creating ghost artifacts', () => {
    const scenario = REAL_COURSE_QUALITY_SCENARIOS.find((item) =>
      item.featureIds.includes('custom_clinicalPolicyBinder'),
    );
    const compiledFeatureIds = getBlueprintCompiledFeatures(scenario.featureIds, {
      customDeliverables: scenario.customDeliverables,
    });
    const blueprint = buildCourseBlueprint(scenario.courseMap, { customDeliverables: scenario.customDeliverables });
    const storedBlueprint = JSON.parse(JSON.stringify(blueprint));
    const compiled = compileBlueprintDeliverables(storedBlueprint, scenario.featureIds, {
      customDeliverables: scenario.customDeliverables,
    });

    expect(compiledFeatureIds).toContain('custom_observationChecklist');
    expect(compiledFeatureIds).not.toContain('custom_clinicalPolicyBinder');
    expect(compiled.custom_observationChecklist).toBeTruthy();
    expect(compiled.custom_clinicalPolicyBinder).toBeUndefined();
  });

  it('blocks compilation when minimum semantic blueprint evidence is missing', () => {
    const missingSourceBlueprint = makeMissingSourceBlueprint();
    const semanticContract = validateBlueprintSemanticContract(missingSourceBlueprint);

    expect(semanticContract.status).toBe('blocked');
    expect(semanticContract.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(['outcomes', 'keyConcepts', 'studentArtifact', 'sourceTrace', 'assessmentCoverage']),
    );
    expect(() => compileBlueprintDeliverables(missingSourceBlueprint, ['assignments'])).toThrow();
  });

  it.each(SPARSE_SOURCE_BOUNDARY_SCENARIOS)(
    '$name preserves review/blocking boundaries for sparse imported source',
    (scenario) => {
      const storedBlueprint = JSON.parse(JSON.stringify(buildCourseBlueprint(scenario.courseMap)));
      const hydratedBlueprint = hydrateBlueprintForCompilation(storedBlueprint);
      const semanticContract = validateBlueprintSemanticContract(storedBlueprint);
      const reviewText = JSON.stringify({
        qualitySignals: hydratedBlueprint.qualitySignals,
        compilerPath: hydratedBlueprint.compilerPath,
        decisions: hydratedBlueprint.lessons?.map((lesson) => lesson.compilerDecision),
      });

      expect(storedBlueprint.blueprintStorageVersion, scenario.name).toBe(2);
      assertCompilerOwnedFieldsAreNotStored(storedBlueprint, scenario.name);

      if (semanticContract.blockerCount > 0) {
        expect(scenario.expectedPath, scenario.name).toBe('review-or-block');
        expect(() => compileBlueprintDeliverables(storedBlueprint, ['lessonPlans', 'assignments'])).toThrow();
        return;
      }

      const compiled = compileBlueprintDeliverables(storedBlueprint, ['lessonPlans', 'assignments', 'rubrics']);
      const outputContract = validateCompilerOutputContract({
        blueprint: storedBlueprint,
        compiled,
        featureIds: ['lessonPlans', 'assignments', 'rubrics'],
      });

      expect(outputContract.status, scenario.name).toBe('pass');
      expect(reviewText, scenario.name).toMatch(/review|required|source|sparse|inferred|derived/i);
      expect(hydratedBlueprint.compilerPath.adaptiveRepairPlan.repairPolicy, scenario.name).toMatch(
        /source-marked repairs|preserve local-review gates/i,
      );
    },
  );

  it.each(MESSY_UPLOAD_QUALITY_SCENARIOS)(
    '$name roundtrips messy instructor-upload style source with visible review gates',
    async (scenario) => {
      const storedBlueprint = JSON.parse(JSON.stringify(buildCourseBlueprint(scenario.courseMap)));
      const hydratedBlueprint = hydrateBlueprintForCompilation(storedBlueprint);
      const semanticContract = validateBlueprintSemanticContract(storedBlueprint);
      const reviewText = JSON.stringify({
        qualitySignals: hydratedBlueprint.qualitySignals,
        sourceRiskRegister: hydratedBlueprint.compilerProofBundle?.sourceRiskRegister,
        compilerPath: hydratedBlueprint.compilerPath,
        decisions: hydratedBlueprint.lessons?.map((lesson) => lesson.compilerDecision),
      });

      expect(storedBlueprint.blueprintStorageVersion, scenario.name).toBe(2);
      expect(storedBlueprint.compilerPath, scenario.name).toBeUndefined();
      assertCompilerOwnedFieldsAreNotStored(storedBlueprint, scenario.name);
      assertLessonStorageStaysAtomic(storedBlueprint, scenario.name);
      expect(reviewText, scenario.name).toMatch(/review|source|policy|official|missing|local|inferred|derived/i);

      if (semanticContract.blockerCount > 0) {
        expect(() => compileBlueprintDeliverables(storedBlueprint, ['lessonPlans', 'assignments'])).toThrow();
        return;
      }

      const featureIds = ['lessonPlans', 'assignments', 'rubrics'];
      const compiled = compileBlueprintDeliverables(storedBlueprint, featureIds);
      const outputContract = validateCompilerOutputContract({
        blueprint: storedBlueprint,
        compiled,
        featureIds,
      });

      expect(outputContract.status, scenario.name).toBe('pass');
      for (const featureId of featureIds) {
        const validation = validateDeliverableGeneration(featureId, compiled[featureId], {
          expectedLessonCount: storedBlueprint.lessons.length,
        });
        expect(validation.valid, `${scenario.name} ${featureId}: ${validation.blockers.join('; ')}`).toBe(true);
      }

      const exportResult = await verifyPackageExports({
        courseMap: scenario.courseMap,
        deliverables: buildDeliverableEntries(compiled, ['lessonPlans', 'assignments']),
        selectedFeatures: ['courseMap', 'lessonPlans', 'assignments'],
      });
      expect(
        exportResult.status,
        `${scenario.name}: ${exportResult.checks
          .filter((check) => check.status !== 'passed')
          .map((check) => `${check.featureId}/${check.format}: ${check.message}`)
          .join('; ')}`,
      ).toBe('passed');
    },
  );

  it('keeps official dates, grading weights, readings, safety requirements, and institution policy behind review gates', () => {
    const scenario = REAL_COURSE_QUALITY_SCENARIOS.find((item) => item.name === 'nursing simulation caution');
    const compilerOptions = { customDeliverables: scenario.customDeliverables };
    const storedBlueprint = JSON.parse(JSON.stringify(buildCourseBlueprint(scenario.courseMap, compilerOptions)));
    const hydratedBlueprint = hydrateBlueprintForCompilation(storedBlueprint, compilerOptions);
    const compiled = compileBlueprintDeliverables(storedBlueprint, ['syllabus', 'assignments'], compilerOptions);
    const blockedFallbackText =
      hydratedBlueprint.compilerPath.adaptiveRepairPlan.modelFallbackPolicy.blockedFor.join(' ');
    const reviewPolicyText = JSON.stringify({
      reviewPolicy: hydratedBlueprint.compilerPath.reviewPolicy,
      adaptiveSafety: hydratedBlueprint.compilerPath.adaptiveSafety,
      decisions: hydratedBlueprint.lessons.map((lesson) => lesson.compilerDecision),
    });
    const syllabus = compiled.syllabus.syllabus;

    expect(blockedFallbackText).toMatch(/official dates/i);
    expect(blockedFallbackText).toMatch(/grading weights/i);
    expect(blockedFallbackText).toMatch(/readings/i);
    expect(blockedFallbackText).toMatch(/clinical\/safety requirements/i);
    expect(blockedFallbackText).toMatch(/institution policy/i);
    expect(reviewPolicyText).toMatch(/official dates/i);
    expect(reviewPolicyText).toMatch(/source permissions/i);
    expect(reviewPolicyText).toMatch(/institution policies/i);

    expect(syllabus.weeklySchedule.every((week) => /^Week \d+$/.test(week.dates))).toBe(true);
    expect(syllabus.importantDates.every((date) => /^Week \d+$/.test(date.date))).toBe(true);
    expect(syllabus.sourceUsePolicy.noInventedSources).toMatch(/Do not invent authors, titles, URLs, page numbers/i);
    expect(syllabus.sourceUsePolicy.localReview).toMatch(/official readings, copyrighted materials/i);
    expect(JSON.stringify(syllabus.assessmentCalendar)).toMatch(/gradingWeightProvenance/i);
    expect(JSON.stringify(compiled.assignments)).toMatch(/weightProvenance|gradingWeightProvenance/i);
  });

  it('regenerates affected artifacts from the changed blueprint instead of preserving stale wording', () => {
    const baseScenario = REAL_COURSE_QUALITY_SCENARIOS.find((item) => item.name === 'three lesson policy memo studio');
    const revisedCourseMap = JSON.parse(JSON.stringify(baseScenario.courseMap));
    revisedCourseMap.lessons[1].title = 'Lesson 2: Revised Equity Impact Sprint';
    revisedCourseMap.lessons[1].sections[0].topicSection =
      'Revised Equity Impact Sprint; implementation evidence; equity audit; stakeholder risk';
    revisedCourseMap.lessons[1].sections[0].weeklyAssessments =
      'Revised equity audit memo with stakeholder evidence, implementation risk, and feedback revision.';

    const originalBlueprint = JSON.parse(
      JSON.stringify(
        buildCourseBlueprint(baseScenario.courseMap, { customDeliverables: baseScenario.customDeliverables }),
      ),
    );
    const revisedBlueprint = JSON.parse(
      JSON.stringify(buildCourseBlueprint(revisedCourseMap, { customDeliverables: baseScenario.customDeliverables })),
    );
    const originalCompiled = compileBlueprintDeliverables(originalBlueprint, ['lessonPlans', 'assignments'], {
      customDeliverables: baseScenario.customDeliverables,
    });
    const revisedCompiled = compileBlueprintDeliverables(revisedBlueprint, ['lessonPlans', 'assignments'], {
      customDeliverables: baseScenario.customDeliverables,
    });
    const originalText = JSON.stringify(originalCompiled);
    const revisedText = JSON.stringify(revisedCompiled);

    expect(originalText).toContain('Alternatives and Evidence');
    expect(originalText).not.toContain('Revised Equity Impact Sprint');
    expect(revisedText).toContain('Revised Equity Impact Sprint');
    expect(revisedText).toContain('Revised equity audit memo');
  });
});
