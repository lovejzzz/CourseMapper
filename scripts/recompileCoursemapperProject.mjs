#!/usr/bin/env node

import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';

import JSZip from 'jszip';

import {
  BLUEPRINT_COMPILE_CONTEXT,
  compactBlueprintForStorage,
  compileBlueprintDeliverables,
  getBlueprintCompiledFeatures,
} from '../src/lib/courseBlueprintCompiler.js';
import {
  attachAuthenticLanguageDataTransactionToGraph,
  attachEnrichmentToGraph,
  buildBlueprintFromGraph,
  enrichmentFromGraph,
} from '../src/lib/courseGraph/blueprintFromGraph.js';
import { deriveCourseGraphFromCourseMap } from '../src/lib/courseGraph/deriveFromCourseMap.js';
import { revalidatePersistedLessonContent } from '../src/lib/compiledLessonSync.js';
import { hydrateSavedGenomeEvidence } from '../src/lib/genomeEvidenceHydration.js';
import { runDeterministicPackageFinalizer } from '../src/lib/packageFinalizer.js';
import { verifyPackageExports } from '../src/lib/packageExportVerifier.js';
import { buildCourseMaterialsZip } from '../src/lib/packageZipExporter.js';
import { backfillReplayInstructionalPlanLineage } from '../src/lib/replayInstructionalPlanLineage.js';
import { validateProspectiveInstructionalPlanLineageForReplay } from '../src/lib/instructionalPlanLineage.js';
import { synchronizeCourseMapWithInstructionalPlan } from '../src/lib/instructionalPlanCurriculumSync.js';
import { assessRecompiledCheckpointReadiness } from './lib/recompileCheckpointReadiness.mjs';
import { buildGoverningSourceCourseContract } from './lib/governingSourceCourseContract.mjs';
import {
  recoverExplicitCourseGradingPolicy,
  recoverExplicitCoursePolicies,
  recoverExplicitCoursePrerequisites,
  recoverExplicitCourseWorkload,
  recoverExplicitRequiredCourseMaterials,
} from '../src/lib/nativeGraphAuthoring.js';

const VERIFIED_COHERENT_DRAFT_FEATURES = [
  'syllabus',
  'lessonPlans',
  'slideDecks',
  'assignments',
  'rubrics',
  'discussions',
  'quizBank',
  'studyGuides',
  'courseFaq',
];

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function canonicalSha256(value) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function usage() {
  return [
    'Usage: npx vite-node scripts/recompileCoursemapperProject.mjs',
    '  --project <saved.coursemapper> --output <package.zip> [--extract <directory>]',
    '  [--checkpoint verified-coherent-draft-v1] [--project-output <rebuilt.coursemapper>]',
    '  [--source-pdf <governing-source.pdf>]',
    '  [--allow-blocked-diagnostic]',
    '',
    'Recompiles a saved CourseMapper project with the current repository tree.',
    'The saved model-authored Course Map and graph are preserved; deliverables,',
    'Office files, manifest, quality report, and package ZIP are rebuilt.',
  ].join('\n');
}

async function extractPdfText(pdfPath) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const bytes = await fs.readFile(pdfPath);
  const document = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => item.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    );
  }
  return { text: pages.join('\n'), bytes };
}

async function extractZip(blob, destination) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });
  for (const [entryPath, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const target = path.join(destination, entryPath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, await entry.async('nodebuffer'));
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const projectPath = valueAfter(argv, '--project');
  const outputPath = valueAfter(argv, '--output');
  const extractPath = valueAfter(argv, '--extract');
  const checkpoint = valueAfter(argv, '--checkpoint');
  const projectOutputPath = valueAfter(argv, '--project-output');
  const sourcePdfPath = valueAfter(argv, '--source-pdf');
  const allowBlockedDiagnostic = argv.includes('--allow-blocked-diagnostic');
  if (!projectPath || !outputPath) throw new Error(usage());

  const project = JSON.parse(await fs.readFile(path.resolve(projectPath), 'utf8'));
  if (!project?.courseMap || !Array.isArray(project.courseMap.lessons) || project.courseMap.lessons.length === 0) {
    throw new Error('The saved project has no course map lessons.');
  }
  if (!project?.courseGraph || !Array.isArray(project.courseGraph.sessions)) {
    throw new Error('The saved project has no reusable course graph.');
  }

  if (checkpoint && checkpoint !== 'verified-coherent-draft-v1') {
    throw new Error(`Unsupported checkpoint: ${checkpoint}`);
  }
  if (checkpoint && !projectOutputPath) {
    throw new Error('--project-output is required for checkpoint recompiles so saved state is bound to exports.');
  }
  let governingSourceReceipt = null;
  let courseMap = project.courseMap;
  const genomeManifest = JSON.parse(
    await fs.readFile(new URL('../public/genome/manifest.json', import.meta.url), 'utf8'),
  );
  const savedCourseGraph = hydrateSavedGenomeEvidence(project.courseGraph, genomeManifest);
  const savedProspectiveLineage = checkpoint
    ? validateProspectiveInstructionalPlanLineageForReplay({
        courseGraph: savedCourseGraph,
        courseMap,
        sourceBrief: project.promptText || '',
      })
    : null;
  // The Course Map is the instructor-visible instructional plan and owns
  // lesson identity during replay. Older saved projects can contain a graph
  // from a prior plan revision; compiling it positionally produced correctly
  // named files whose bodies taught the following lesson. Re-derive the graph
  // from the visible map, then admit only enrichment that still belongs to
  // the same lesson under today's semantic policy.
  let courseGraph =
    savedProspectiveLineage?.status === 'valid'
      ? structuredClone(savedCourseGraph)
      : deriveCourseGraphFromCourseMap(courseMap);
  const savedEnrichment = enrichmentFromGraph(savedCourseGraph);
  let replayEnrichmentRevalidation =
    savedProspectiveLineage?.status === 'valid'
      ? {
          protocol: 'coursemapper-replay-enrichment-revalidation-v1',
          status: 'preserved-by-verified-prospective-lineage',
          retainedLessonCount: Object.keys(savedEnrichment?.lessonContent || {}).length,
        }
      : null;
  if (savedProspectiveLineage?.status !== 'valid' && savedEnrichment?.lessonContent) {
    const revalidated = revalidatePersistedLessonContent(savedEnrichment.lessonContent, courseMap);
    replayEnrichmentRevalidation = revalidated.receipt;
    if (Object.keys(revalidated.lessonContent).length > 0) {
      attachEnrichmentToGraph(courseGraph, {
        ...savedEnrichment,
        lessonContent: revalidated.lessonContent,
      });
    }
  }
  if (
    savedProspectiveLineage?.status !== 'valid' &&
    (savedCourseGraph?.authenticLanguageData || savedCourseGraph?.authenticLanguageDataCoverage)
  ) {
    courseGraph = attachAuthenticLanguageDataTransactionToGraph(courseGraph, {
      authenticLanguageDataPacket: savedCourseGraph.authenticLanguageData || null,
      authenticLanguageDataCoverage: savedCourseGraph.authenticLanguageDataCoverage || null,
    });
  }
  if (sourcePdfPath) {
    const absoluteSourcePath = path.resolve(sourcePdfPath);
    const extracted = await extractPdfText(absoluteSourcePath);
    const prerequisites = recoverExplicitCoursePrerequisites(extracted.text);
    const gradingPolicy = recoverExplicitCourseGradingPolicy(extracted.text);
    const requiredMaterials = recoverExplicitRequiredCourseMaterials(extracted.text);
    const policies = recoverExplicitCoursePolicies(extracted.text);
    const workloadPolicy = recoverExplicitCourseWorkload(extracted.text);
    const orderedLessonContract = buildGoverningSourceCourseContract(extracted.text, courseMap.lessons);
    if (
      prerequisites.length === 0 &&
      !gradingPolicy &&
      requiredMaterials.length === 0 &&
      !policies &&
      !workloadPolicy &&
      !orderedLessonContract
    ) {
      throw new Error(
        'The governing source PDF contained no recoverable course-level authority or ordered course contract.',
      );
    }
    if (checkpoint && !orderedLessonContract) {
      throw new Error('The governing source PDF does not prove the saved lesson sequence in source order.');
    }
    if (checkpoint && orderedLessonContract?.continuity?.status !== 'continuous') {
      const firstGap = orderedLessonContract.continuity.discontinuities?.[0];
      throw new Error(
        `The governing source sequence is discontinuous between lessons ${firstGap?.fromLessonNumber || '?'} and ${firstGap?.toLessonNumber || '?'}; repair the course plan before drafting.`,
      );
    }
    const courseMetadata = {
      ...(courseGraph.course?.meta || {}),
      ...(prerequisites.length > 0 ? { prerequisites } : {}),
      ...(gradingPolicy ? { gradingPolicy } : {}),
      ...(requiredMaterials.length > 0 ? { requiredMaterials } : {}),
      ...(policies ? { policies } : {}),
      ...(workloadPolicy ? { workloadPolicy } : {}),
    };
    courseMap = {
      ...courseMap,
      ...(prerequisites.length > 0 ? { prerequisites } : {}),
      ...(gradingPolicy ? { gradingPolicy } : {}),
      ...(requiredMaterials.length > 0 ? { requiredMaterials } : {}),
      ...(policies ? { policies } : {}),
      ...(workloadPolicy ? { workloadPolicy } : {}),
    };
    courseGraph = {
      ...courseGraph,
      course: {
        ...(courseGraph.course || {}),
        meta: courseMetadata,
      },
    };
    governingSourceReceipt = {
      protocol: 'coursemapper-governing-source-recovery-v1',
      path: absoluteSourcePath,
      sha256: crypto.createHash('sha256').update(extracted.bytes).digest('hex'),
      extractedTextSha256: crypto.createHash('sha256').update(extracted.text).digest('hex'),
      prerequisiteCount: prerequisites.length,
      gradingCategoryCount: gradingPolicy?.categories?.length || 0,
      gradeBandCount: gradingPolicy?.gradeBands?.length || 0,
      requiredMaterialCount: requiredMaterials.length,
      recoveredPolicyKeys: policies ? Object.keys(policies).filter((key) => key !== 'sourceStatus') : [],
      weeklyHours: workloadPolicy?.weeklyHours ?? null,
      baseTotalPct: gradingPolicy?.baseTotalPct ?? null,
      extraCreditTotalPct: gradingPolicy?.extraCreditTotalPct ?? null,
      orderedLessonContract,
    };
  }
  let replayPlanningLineage = null;
  if (checkpoint) {
    const migrated = await backfillReplayInstructionalPlanLineage({
      courseMap,
      courseGraph,
      sourceBrief: project.promptText || '',
      sessionMinutes: project.generationConstraints?.sessionMinutes ?? null,
      researchEnabled: true,
    });
    courseMap = migrated.courseMap;
    courseGraph = migrated.courseGraph;
    replayPlanningLineage = {
      protocol: migrated.protocol,
      validation: migrated.validation,
      evidenceHandoff: migrated.evidenceHandoff,
    };
  }
  const requested = Array.isArray(project.selectedFeatures) ? project.selectedFeatures : [];
  const requestedCompiledFeatures = checkpoint
    ? [...new Set([...requested.filter((id) => id !== 'courseMap'), ...VERIFIED_COHERENT_DRAFT_FEATURES])]
    : requested.filter((id) => id !== 'courseMap');
  const compiledFeatureIds = getBlueprintCompiledFeatures(requestedCompiledFeatures);
  const blueprint = compactBlueprintForStorage(
    buildBlueprintFromGraph(courseGraph, {
      sourceBrief: project.promptText || '',
    }),
  );
  let compiled;
  try {
    compiled = compileBlueprintDeliverables(blueprint, compiledFeatureIds, {
      configMap: project.deliverableConfig || {},
    });
  } catch (error) {
    if (!allowBlockedDiagnostic || !/instructional plan blocked drafting/i.test(String(error?.message || error))) {
      throw error;
    }
    const diagnostic = {
      protocol: 'coursemapper-blocked-instructional-plan-diagnostic-v1',
      status: 'plan-blocked',
      sourceProject: path.resolve(projectPath),
      courseName: courseMap.courseName,
      lessonCount: courseMap.lessons.length,
      error: String(error?.message || error),
      admission: blueprint?.instructionalIntentGraph?.admission || null,
      authenticLanguageDataCoverage: blueprint?.authenticLanguageDataCoverage || null,
      lessonIntents: (blueprint?.instructionalIntentGraph?.lessonIntents || []).map((intent) => ({
        lessonNumber: intent.lessonNumber,
        title: intent.title,
        targetObjectives: intent.targetObjectives,
        learnerAction: intent.learnerAction,
        expectedEvidence: intent.expectedEvidence,
        evidenceBoundary: intent.evidenceBoundary,
        clarificationQuestions: intent.clarificationQuestions,
        authenticDataTaskPlan:
          blueprint?.lessons?.find((lesson) => Number(lesson.lessonNumber) === Number(intent.lessonNumber))
            ?.authenticDataTaskPlan || null,
      })),
    };
    const diagnosticPath = `${path.resolve(outputPath).replace(/\.zip$/i, '')}.plan-blocked.json`;
    await fs.mkdir(path.dirname(diagnosticPath), { recursive: true });
    await fs.writeFile(diagnosticPath, JSON.stringify(diagnostic, null, 2));
    process.stdout.write(`${JSON.stringify({ ...diagnostic, diagnosticPath }, null, 2)}\n`);
    return;
  }
  const compiledDeliverables = Object.fromEntries(
    compiledFeatureIds.map((featureId) => [featureId, { status: 'done', data: compiled[featureId] }]),
  );
  const compilerBlueprint = compiled[BLUEPRINT_COMPILE_CONTEXT] || blueprint;
  // Compilation may authorize a repaired, evidence-bound objective after the
  // saved Course Map was written. Package identity, instruction, and the
  // manifest must use that same final plan; otherwise the ZIP can grade an
  // older map sentence against newer lesson plans and slide decks.
  courseMap = synchronizeCourseMapWithInstructionalPlan(courseMap, compilerBlueprint.instructionalIntentGraph);
  const featureIds = ['courseMap', ...compiledFeatureIds];
  const finalizer = runDeterministicPackageFinalizer({
    courseMap,
    sourceBrief: project.promptText || '',
    deliverables: compiledDeliverables,
    selectedFeatures: featureIds,
    columns: Array.isArray(project.columns) ? project.columns : [],
    deliverableConfig: project.deliverableConfig || {},
    courseGraph,
    blueprint: compilerBlueprint,
    expectedSessionMinutes:
      project.generationConstraints?.sessionMinutes ?? blueprint.generationConstraints?.sessionMinutes ?? null,
  });
  const finalCourseMap = finalizer.courseMap || courseMap;
  const deliverables = finalizer.deliverables || compiledDeliverables;
  const exportVerification = await verifyPackageExports({
    courseMap: finalCourseMap,
    deliverables,
    selectedFeatures: featureIds,
    columns: Array.isArray(project.columns) ? project.columns : [],
    slideTheme: project.slideTheme || 0,
  });
  const replayCoverage = courseGraph.enrichmentOverlay?.coverage || null;
  const replayRequestedLessons = Number(replayCoverage?.requestedLessons) || courseMap.lessons.length;
  const replayLessonContent = courseGraph.enrichmentOverlay?.lessonContent || {};
  const replayEnrichedLessons = Number.isFinite(Number(replayCoverage?.enrichedLessons))
    ? Number(replayCoverage.enrichedLessons)
    : Object.keys(replayLessonContent).length;
  const replayMissingLessons = Array.isArray(replayCoverage?.missingLessons)
    ? replayCoverage.missingLessons.map(Number).filter(Number.isInteger)
    : Array.from({ length: replayRequestedLessons }, (_, index) => index + 1).filter(
        (lessonNumber) => !replayLessonContent[`lesson-${lessonNumber}`],
      );
  const replayEnrichmentLabel =
    replayRequestedLessons > 0 && replayEnrichedLessons >= replayRequestedLessons
      ? `ran (${replayEnrichedLessons} lessons enriched)`
      : `ran (${replayEnrichedLessons}/${replayRequestedLessons} — lesson${replayMissingLessons.length === 1 ? '' : 's'} ${replayMissingLessons.join(', ')} fell back to template)`;
  const replayPipeline = {
    ...(project.lastRunDigest?.pipeline || {}),
    enrichment: replayEnrichmentLabel,
    enrichmentModelStage: replayEnrichmentLabel,
  };
  const quality = {
    checkpoint: checkpoint || null,
    budget: project.apiCallBudgetReceipt || null,
    digest: {
      ...(project.lastRunDigest || {}),
      gates: {
        exportStatus: exportVerification.status,
        exportContentDisposition: exportVerification.contentDisposition,
        exportChecked: exportVerification.checked,
        exportFailed: exportVerification.failed,
        exportWarnings: exportVerification.warningCount,
      },
      pipeline: {
        ...replayPipeline,
        exportVerification,
      },
    },
    coursePrompt: project.promptText || '',
    expectedSessionMinutes:
      project.generationConstraints?.sessionMinutes ?? blueprint.generationConstraints?.sessionMinutes ?? null,
    orderedLessonContract: governingSourceReceipt?.orderedLessonContract || null,
    timeoutMs: 120000,
  };
  const result = await buildCourseMaterialsZip({
    courseMap: finalCourseMap,
    columns: Array.isArray(project.columns) ? project.columns : [],
    courseName: courseMap.courseName,
    deliverables,
    featureIds,
    courseGraph,
    pipelineState: replayPipeline,
    readiness: finalizer.readiness || null,
    quality,
    generatedAt: new Date().toISOString(),
  });
  const absoluteOutput = path.resolve(outputPath);
  const packageBytes = Buffer.from(await result.blob.arrayBuffer());
  await fs.mkdir(path.dirname(absoluteOutput), { recursive: true });
  await fs.writeFile(absoluteOutput, packageBytes);
  if (extractPath) await extractZip(result.blob, path.resolve(extractPath));

  let rebuiltProject = null;
  let rebuiltProjectSha256 = null;
  if (projectOutputPath) {
    // A prior project's terminal quality pass and run digest describe the
    // package that entered this recompile, not the package produced below.
    // Carrying them into the rebuilt file can resurrect stale finding quotes
    // or source claims even when the newly compiled artifacts are clean.
    const projectWithoutStalePackageEvidence = { ...project };
    delete projectWithoutStalePackageEvidence.packageQualityPass;
    delete projectWithoutStalePackageEvidence.lastRunDigest;
    const compilationState = {
      courseMap: finalCourseMap,
      courseGraph,
      blueprint: compilerBlueprint,
      deliverables,
      selectedFeatures: featureIds,
    };
    rebuiltProject = {
      ...projectWithoutStalePackageEvidence,
      courseMap: finalCourseMap,
      courseGraph,
      blueprint: compilerBlueprint,
      deliverables,
      selectedFeatures: featureIds,
      savedAt: new Date().toISOString(),
      compilationReceipt: {
        protocol: 'coursemapper-saved-state-export-join-v1',
        selectedFeatures: featureIds,
        compilationStateSha256: canonicalSha256(compilationState),
        sourceProjectSha256: crypto
          .createHash('sha256')
          .update(await fs.readFile(path.resolve(projectPath)))
          .digest('hex'),
        packageSha256: crypto.createHash('sha256').update(packageBytes).digest('hex'),
        ...(governingSourceReceipt ? { governingSourceReceipt } : {}),
      },
    };
    const rebuiltBytes = Buffer.from(JSON.stringify(rebuiltProject, null, 2));
    rebuiltProjectSha256 = crypto.createHash('sha256').update(rebuiltBytes).digest('hex');
    const absoluteProjectOutput = path.resolve(projectOutputPath);
    await fs.mkdir(path.dirname(absoluteProjectOutput), { recursive: true });
    await fs.writeFile(absoluteProjectOutput, rebuiltBytes);
  }

  const checkpointReadiness = checkpoint
    ? assessRecompiledCheckpointReadiness(
        result.packageReadinessReceipt,
        result.quality,
        result.manifest?.instructionalPlanLineage || courseGraph?.instructionalPlanLineage || null,
      )
    : null;
  const checkpointBlocked = checkpointReadiness?.status === 'blocked';
  const summary = {
    status: checkpointBlocked ? 'rebuilt-blocked' : 'rebuilt',
    project: path.resolve(projectPath),
    output: absoluteOutput,
    extract: extractPath ? path.resolve(extractPath) : null,
    courseName: courseMap.courseName,
    lessonCount: courseMap.lessons.length,
    featureIds,
    checkpoint: checkpoint || null,
    governingSource: governingSourceReceipt,
    replayPlanningLineage,
    replayEnrichmentRevalidation,
    rebuiltProject: projectOutputPath
      ? {
          path: path.resolve(projectOutputPath),
          sha256: rebuiltProjectSha256,
          compilationStateSha256: rebuiltProject?.compilationReceipt?.compilationStateSha256,
        }
      : null,
    finalizer: {
      status: finalizer.status,
      applied: finalizer.applied,
      blockerCount: finalizer.readiness?.blockers?.length || 0,
      warningCount: finalizer.readiness?.warnings?.length || 0,
    },
    exportVerification,
    packageReadiness: result.packageReadinessReceipt || null,
    checkpointReadiness,
    automatedConformance: result.quality
      ? {
          score: result.quality.score,
          findingCounts: result.quality.findingCounts,
          evidenceClass: result.quality.evidenceClass,
          validationTier: result.quality.validationTier,
          construct: result.quality.construct,
          claimBoundary: result.quality.claimBoundary,
          readiness: result.quality.readiness
            ? {
                score: result.quality.readiness.score,
                maxScore: result.quality.readiness.maxScore,
                positiveValidationEarned: result.quality.readiness.positiveValidationEarned,
                negativeEvidenceEarned: result.quality.readiness.negativeEvidenceEarned,
                points: result.quality.readiness.points,
                claimBoundary: result.quality.readiness.claimBoundary,
              }
            : null,
        }
      : null,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (checkpointBlocked && !allowBlockedDiagnostic) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
});
