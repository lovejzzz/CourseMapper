#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { buildLessonKernelPrompt, parseLessonKernelResponse } from '../src/lib/blueprintEnrichmentPass.js';
import { buildExperientialActivityPacket } from '../src/lib/compilerExperientialActivity.js';
import {
  assessPublicScionKernelResponse,
  buildPublicScionMessages,
  repairPublicScionJson,
} from '../src/lib/publicScionProvider.js';
import { compactLessonKernelSchemaProfile } from '../src/lib/scionContracts.js';
import { sGenerate, stopS } from '../trellis/tendril/sModel.mjs';

const BASE_CONTRACT = 'evaluation/scion-adapters/base-contracts/gemma-4-e2b.json';
const DEFAULT_OUTPUT = 'verification-output/scion-v01677-experiential-model-probe/latest.json';
const TIMEOUT_MS = 2_400_000;

const courseMap = {
  courseName: 'Introduction to International Relations',
  sessionMinutes: 75,
  lessons: [
    {
      title: 'Lesson 9: Maritime Crisis Simulation — Signaling and De-escalation',
      sections: [
        {
          topicSection: 'Crisis bargaining, signaling under uncertainty, de-escalation, and international monitoring',
          learningObjectives:
            'Use incomplete patrol and convoy records to distinguish signaling, commitment, and escalation risk. Revise a negotiated response after synchronized evidence updates change the credible risks and constraints.',
          weeklyAssessments: 'Evidence-traceable de-escalation protocol',
          asynchronousActivities:
            'Compare two short accounts of a fictional patrol collision and mark each unresolved attribution claim.',
          synchronousActivities:
            'Run a multi-round maritime crisis simulation with constrained roles, synchronized updates, and a negotiated protocol.',
          supportingResources: 'Fictional patrol log; civilian convoy notice; neutral monitoring mandate; decision log',
        },
      ],
    },
  ],
};

function sha256(value) {
  return crypto
    .createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
}

async function atomicWrite(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(temporary, filePath);
}

function parseArgs(argv) {
  const args = { output: DEFAULT_OUTPUT };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--output') args.output = argv[++index] || args.output;
    else if (argv[index] === '--help' || argv[index] === '-h') args.help = true;
    else throw new Error(`Unknown experiential probe option: ${argv[index]}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/scionExperientialActivityProbe.mjs [--output path]');
    return;
  }

  const baseContract = JSON.parse(await fs.readFile(BASE_CONTRACT, 'utf8'));
  const base = baseContract.trainingBase;
  process.env.HF_HUB_CACHE ||= path.join(os.homedir(), '.cache', 'coursemapper', 'scion-models');
  process.env.HF_HUB_OFFLINE = '1';
  process.env.SCION_MODEL = base.modelId;
  process.env.SCION_MODEL_REVISION = base.revision;
  delete process.env.SCION_ADAPTERS;
  delete process.env.G4_ADAPTERS;

  const prompt = buildLessonKernelPrompt(courseMap, [0], {
    questionsPerLesson: 4,
    keyTermsPerLesson: 3,
  });
  const expectedLessonIds = prompt.lessons.map((lesson) => lesson.lessonId);
  const schemaProfile = compactLessonKernelSchemaProfile({
    expectedLessonIds,
    activityLessonIds: prompt.activityLessonIds,
  });
  const messages = buildPublicScionMessages(prompt.systemPrompt, prompt.userPrompt, {
    schema: schemaProfile.schema,
    task: 'blueprintEnrichment',
  });

  const startedAt = new Date().toISOString();
  const started = Date.now();
  const generation = await sGenerate(
    {
      system: messages[0].content,
      user: messages.at(-1).content,
      task: 'items',
      maxTokens: 2400,
      temperature: 0,
      schema: schemaProfile.schema,
      adapterMode: 'base-only',
    },
    { timeoutMs: TIMEOUT_MS, includeMetadata: true },
  );
  const repaired = repairPublicScionJson(generation.text, { userPrompt: prompt.userPrompt });
  const assessment = assessPublicScionKernelResponse(repaired.text, prompt.userPrompt, 'blueprintEnrichment');
  const generatedObject = JSON.parse(repaired.text);
  const parsed = parseLessonKernelResponse(repaired.text, { prompt });
  const lesson = parsed.lessons[expectedLessonIds[0]] || null;
  const activity = lesson?.experientialActivity || null;
  const activityIssues = parsed.issues.filter((issue) => issue?.surface === 'experientialActivity');
  const packet = buildExperientialActivityPacket({
    activity,
    sessionMinutes: courseMap.sessionMinutes,
  });
  const clockMinutes = packet?.timing?.reduce((sum, row) => sum + row.minutes, 0) || 0;
  const checks = {
    qualifyingLessonDetected:
      prompt.activityLessonIds.length === 1 && prompt.activityLessonIds[0] === expectedLessonIds[0],
    schemaIncludesActivity: schemaProfile.schema.required.includes('activityBlueprints'),
    activityGroupHasNoParserIssues: activityIssues.length === 0,
    normalizedActivityAdmitted: Boolean(activity),
    rolesRunnable: (packet?.roles?.length || 0) >= 2,
    evidenceInspectable: (packet?.evidence?.length || 0) >= 2,
    updatesEvolve: (packet?.phases?.length || 0) >= 1,
    artifactInspectable: (packet?.artifact?.requirements?.length || 0) >= 3,
    debriefStructured: (packet?.debriefPrompts?.length || 0) >= 2,
    exactSessionClock: clockMinutes === courseMap.sessionMinutes,
    adapterInactive: generation.nativeAdapterActive !== true,
  };
  const passed = Object.values(checks).every(Boolean);
  const receipt = {
    protocol: 'scion-experiential-activity-live-probe-v1',
    generatedAt: new Date().toISOString(),
    startedAt,
    status: passed ? 'passed' : 'failed',
    course: courseMap.courseName,
    lesson: courseMap.lessons[0].title,
    sessionMinutes: courseMap.sessionMinutes,
    model: {
      id: base.modelId,
      revision: base.revision,
      route: 'mlx-vlm-base-only',
      constrained: generation.constrained || null,
      adapterMode: generation.adapterMode || 'base-only',
      nativeAdapterActive: generation.nativeAdapterActive === true,
    },
    durationMs: Date.now() - started,
    prompt: {
      expectedLessonIds,
      activityLessonIds: prompt.activityLessonIds,
      lessonInputs: prompt.lessons,
      messagesSha256: sha256(messages),
      schemaSha256: sha256(schemaProfile.schema),
    },
    response: {
      rawSha256: sha256(generation.text),
      repairedSha256: sha256(repaired.text),
      repairs: repaired.repairs,
      generatedObject,
      assessment,
      parserIssues: parsed.issues,
      activityIssues,
    },
    checks,
    nonBlockingObservations: {
      wholeKernelNeedsRetry: assessment.needsRetry,
      wholeKernelIssueCount: assessment.issues.length,
      note: 'Unrelated fact, key-term, scenario, or quiz issues remain subject to the existing bounded lesson-kernel retry and atomic-retention path; they do not count as activity-contract failures in this scoped probe.',
    },
    activity: packet,
    claimBoundary:
      'This is one fresh base-only local model probe of the conditional activity contract. It does not establish universal factual correctness, classroom outcomes, instructor adoption, adapter superiority, or paid-reference parity.',
  };
  await atomicWrite(path.resolve(args.output), receipt);
  console.log(JSON.stringify(receipt, null, 2));
  if (!passed) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    stopS();
  });
