#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  PIPELINE_FEATURES,
  closeHybridPipelineAuditRuntime,
  loadHybridPipelineAuditRuntime,
} from './hybridPipelineAudit.mjs';
import { buildProfessorAdoptionDecision } from './professor-adoption/decision.mjs';
import { scoreProfessorAdoptionCase, summarizeProfessorAdoptionResults } from './professor-adoption/scorer.mjs';
import {
  PROFESSOR_ADOPTION_MANIFESTS,
  selectProfessorAdoptionManifests,
  validateProfessorAdoptionManifest,
} from './professor-adoption/sourceManifests.mjs';
import { buildProfessorAdoptionCoverage } from './professor-adoption/coverage.mjs';
import { writeProfessorAdoptionReport } from './professor-adoption/reportWriter.mjs';

const ROOT = process.cwd();
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'verification-output', 'professor-adoption');
const MUTATIONS = [
  {
    id: 'base-repeat',
    label: 'Base manifest replay',
    apply: () => {},
  },
  {
    id: 'sparse-operations',
    label: 'Sparse operations pressure',
    apply: (manifest) => {
      manifest.courseMap.lessons[0].sections[0].topics +=
        '; local support calendar has incomplete details that must stay visible as review-needed operations.';
    },
  },
  {
    id: 'source-artifact-omission',
    label: 'Source artifact omission pressure',
    apply: (manifest) => {
      manifest.courseMap.lessons[0].sections[0].activities +=
        '; students must name the exact source artifact, not just generic evidence wording.';
    },
  },
  {
    id: 'discipline-family-collision',
    label: 'Discipline family collision pressure',
    apply: (manifest) => {
      manifest.courseMap.lessons[0].sections[0].assessment +=
        '; reject cross-domain substitutions that do not match this discipline family.';
    },
  },
  {
    id: 'large-course-map',
    label: 'Large course map pressure',
    apply: (manifest, roundNumber) => {
      const base = manifest.courseMap.lessons;
      const template = base[roundNumber % base.length];
      manifest.courseMap.lessons.push({
        title: `Mutation Week ${roundNumber}: ${template.title.replace(/^Week\s+\d+:\s*/i, '')}`,
        sections: JSON.parse(JSON.stringify(template.sections || [])),
      });
    },
  },
  {
    id: 'claim-boundary',
    label: 'Public-source claim boundary pressure',
    apply: (manifest) => {
      manifest.courseMap.lessons[0].sections[0].activities +=
        '; public source benchmark evidence must not be described as professor approval or author endorsement.';
    },
  },
];

function parseArgs(argv) {
  const args = {
    profile: 'full',
    outputDir: DEFAULT_OUTPUT_DIR,
    caseIds: [],
    rounds: null,
    allowRepairRequired: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--profile') args.profile = argv[++index] || args.profile;
    else if (arg === '--output') args.outputDir = path.resolve(argv[++index]);
    else if (arg === '--case' || arg === '--cases') {
      args.caseIds.push(
        ...(argv[++index] || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      );
    } else if (arg === '--rounds') {
      const rounds = Number(argv[++index]);
      if (!Number.isInteger(rounds) || rounds < 1) throw new Error('--rounds must be a positive integer');
      args.rounds = rounds;
    } else if (arg === '--allow-repair-required') {
      args.allowRepairRequired = true;
    }
  }
  if (!['smoke', 'full'].includes(args.profile)) throw new Error('--profile must be smoke or full');
  return args;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function prepareManifestRuns({ manifests, rounds = null }) {
  if (!rounds) {
    return manifests.map((manifest, index) => ({
      manifest: clone(manifest),
      sourceManifest: manifest,
      roundNumber: index + 1,
      mutation: MUTATIONS[0],
    }));
  }
  return Array.from({ length: rounds }, (_, index) => {
    const sourceManifest = manifests[index % manifests.length];
    const manifest = clone(sourceManifest);
    const mutation = MUTATIONS[index % MUTATIONS.length];
    mutation.apply(manifest, index + 1);
    manifest.id = `${sourceManifest.id}--round-${String(index + 1).padStart(3, '0')}--${mutation.id}`;
    manifest.sourceCaseId = sourceManifest.id;
    return { manifest, sourceManifest, roundNumber: index + 1, mutation };
  });
}

function compileManifest(manifest, runtime) {
  const blueprint = runtime.buildCourseBlueprint(manifest.courseMap, {});
  const compiledFeatures = runtime.getBlueprintCompiledFeatures(PIPELINE_FEATURES);
  const compiled = runtime.compileBlueprintDeliverables(blueprint, compiledFeatures, { configMap: {} });
  return { blueprint, compiledFeatures, compiled };
}

export function buildProfessorAdoptionCaseResult({ manifest, runtime, roundNumber = 1, mutation = MUTATIONS[0] }) {
  const validation = validateProfessorAdoptionManifest(manifest);
  if (!validation.valid) {
    const findings = validation.blockers.map((message) => ({
      caseId: manifest.id || 'unknown',
      sourceUrl: manifest.sourceUrl || '',
      dimension: 'sourceFidelity',
      severity: 'P0',
      scoreImpact: 20,
      artifact: 'source manifest',
      sourceExpectation: 'A complete source manifest is required.',
      observedOutput: message,
      failureClass: 'source-manifest-gap',
      suspectedOwner: 'scripts/professor-adoption/sourceManifests.mjs',
      requiredRepairAction: 'repair-source-manifest-pack',
      acceptanceCriteria: ['Every professor-adoption manifest validates before compilation.'],
      proofCommands: ['npm run audit:professor-adoption:smoke'],
      message,
      evidence: message,
      hardBlocker: true,
    }));
    return {
      caseId: manifest.id || 'unknown',
      sourceCaseId: manifest.sourceCaseId || manifest.id || 'unknown',
      title: manifest.title || 'Unknown source manifest',
      sourceUrl: manifest.sourceUrl || '',
      publicInstructorNames: manifest.publicInstructorNames || [],
      disciplineFamily: manifest.disciplineFamily || '',
      modality: manifest.modality || '',
      status: 'blocked',
      score: 0,
      dimensionScores: {},
      findingCount: findings.length,
      hardBlockerCount: findings.length,
      p1FindingCount: 0,
      compiledFeatureCount: 0,
      compiledFeatures: [],
      compiledTextLength: 0,
      findings,
      roundNumber,
      mutation,
    };
  }
  try {
    const { compiledFeatures, compiled } = compileManifest(manifest, runtime);
    return {
      ...scoreProfessorAdoptionCase({ manifest, compiled, compiledFeatures }),
      sourceCaseId: manifest.sourceCaseId || manifest.id,
      roundNumber,
      mutation,
    };
  } catch (error) {
    const message = error?.message || String(error);
    return {
      caseId: manifest.id,
      sourceCaseId: manifest.sourceCaseId || manifest.id,
      title: manifest.title,
      sourceUrl: manifest.sourceUrl,
      publicInstructorNames: manifest.publicInstructorNames,
      disciplineFamily: manifest.disciplineFamily,
      modality: manifest.modality,
      status: 'blocked',
      score: 0,
      dimensionScores: {},
      findingCount: 1,
      hardBlockerCount: 1,
      p1FindingCount: 0,
      compiledFeatureCount: 0,
      compiledFeatures: [],
      compiledTextLength: 0,
      roundNumber,
      mutation,
      findings: [
        {
          caseId: manifest.id,
          sourceUrl: manifest.sourceUrl,
          dimension: 'deliverableAuthenticity',
          severity: 'P0',
          scoreImpact: 20,
          artifact: 'compiler',
          sourceExpectation: 'The professor-adoption source case compiles successfully.',
          observedOutput: message,
          failureClass: 'compiler-failure',
          suspectedOwner: 'src/lib/courseBlueprintCompiler.js',
          requiredRepairAction: 'repair-professor-adoption-compiler-failure',
          acceptanceCriteria: ['The source case compiles without throwing.'],
          proofCommands: [`npm run audit:professor-adoption:smoke -- --case ${manifest.sourceCaseId || manifest.id}`],
          message: `Compiler failed for ${manifest.id}: ${message}`,
          evidence: message,
          hardBlocker: true,
        },
      ],
    };
  }
}

export async function buildProfessorAdoptionAudit(options = {}) {
  const profile = options.profile || 'full';
  const runtime = options.runtime || (await loadHybridPipelineAuditRuntime());
  const manifests = selectProfessorAdoptionManifests({ profile, caseIds: options.caseIds || [] });
  const runs = prepareManifestRuns({ manifests, rounds: options.rounds || null });
  const results = runs.map((run) =>
    buildProfessorAdoptionCaseResult({
      manifest: run.manifest,
      runtime,
      roundNumber: run.roundNumber,
      mutation: run.mutation,
    }),
  );
  const summary = summarizeProfessorAdoptionResults(results);
  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      profile,
      roundsRequested: options.rounds || runs.length,
      selectedCaseIds: manifests.map((manifest) => manifest.id),
      manifestCount: PROFESSOR_ADOPTION_MANIFESTS.length,
      note: 'Public-source professor-adoption benchmark. This does not claim professor approval or endorsement.',
    },
    summary,
    coverage: buildProfessorAdoptionCoverage(manifests),
    manifests,
    results,
  };
  return {
    ...payload,
    autonomousDecision: buildProfessorAdoptionDecision({ summary, results, profile }),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    const payload = await buildProfessorAdoptionAudit(args);
    const paths = await writeProfessorAdoptionReport(payload, args.outputDir);
    console.log(`Professor adoption audit: ${payload.summary.status}`);
    console.log(`Profile: ${payload.meta.profile}`);
    console.log(`Cases: ${payload.summary.caseCount}`);
    console.log(`Average score: ${payload.summary.averageScore}`);
    console.log(`Minimum score: ${payload.summary.minimumScore}`);
    console.log(`Decision: ${payload.autonomousDecision.status}`);
    console.log(`Next action: ${payload.autonomousDecision.nextAction}`);
    console.log(`Report: ${paths.markdownPath}`);
    console.log(`Ledger: ${paths.ledgerPath}`);
    if (payload.summary.status !== 'pass' && !args.allowRepairRequired) process.exitCode = 1;
  } finally {
    await closeHybridPipelineAuditRuntime();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
