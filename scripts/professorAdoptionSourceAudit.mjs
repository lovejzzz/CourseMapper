#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';

import { buildProfessorAdoptionDecision } from './professor-adoption/decision.mjs';
import { writeProfessorSourceReport } from './professor-adoption/sourceReportWriter.mjs';
import {
  SOURCE_AUDIT_OUTPUT_DIR,
  summarizeProfessorSourceResults,
  verifyProfessorAdoptionSource,
} from './professor-adoption/sourceVerifier.mjs';
import {
  PROFESSOR_ADOPTION_MANIFESTS,
  selectProfessorAdoptionManifests,
} from './professor-adoption/sourceManifests.mjs';

const ROOT = process.cwd();
const DEFAULT_OUTPUT_DIR = path.join(ROOT, SOURCE_AUDIT_OUTPUT_DIR);

function parseArgs(argv) {
  const args = {
    profile: 'full',
    outputDir: DEFAULT_OUTPUT_DIR,
    caseIds: [],
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
    } else if (arg === '--allow-repair-required') {
      args.allowRepairRequired = true;
    }
  }
  if (!['smoke', 'full'].includes(args.profile)) throw new Error('--profile must be smoke or full');
  return args;
}

export async function buildProfessorAdoptionSourceAudit(options = {}) {
  const profile = options.profile || 'full';
  const manifests = selectProfessorAdoptionManifests({ profile, caseIds: options.caseIds || [] });
  const results = [];
  for (const manifest of manifests) {
    results.push(await verifyProfessorAdoptionSource(manifest, { fetchText: options.fetchText }));
  }
  const summary = summarizeProfessorSourceResults(results);
  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      profile,
      selectedCaseIds: manifests.map((manifest) => manifest.id),
      manifestCount: PROFESSOR_ADOPTION_MANIFESTS.length,
      note: 'Live public-source provenance audit. This does not claim professor approval or endorsement.',
    },
    summary,
    manifests,
    results,
  };
  return {
    ...payload,
    autonomousDecision: buildProfessorAdoptionDecision({ profile, summary, results }),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = await buildProfessorAdoptionSourceAudit(args);
  const paths = await writeProfessorSourceReport(payload, args.outputDir);
  console.log(`Professor source provenance audit: ${payload.summary.status}`);
  console.log(`Profile: ${payload.meta.profile}`);
  console.log(`Cases: ${payload.summary.caseCount}`);
  console.log(`Average score: ${payload.summary.averageScore}`);
  console.log(`Minimum score: ${payload.summary.minimumScore}`);
  console.log(`Decision: ${payload.autonomousDecision.status}`);
  console.log(`Next action: ${payload.autonomousDecision.nextAction}`);
  console.log(`Report: ${paths.markdownPath}`);
  console.log(`Ledger: ${paths.ledgerPath}`);
  if (payload.summary.status !== 'pass' && !args.allowRepairRequired) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
