#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { buildOpenAIResponsesBody, extractOpenAIResponsesText } from '../src/lib/openaiProvider.js';
import {
  assessPublicScionKernelResponse,
  buildPublicScionRetryFeedback,
  mergePublicScionKernelAttempts,
  repairPublicScionJson,
  shufflePublicScionKernelOptions,
} from '../src/lib/publicScionProvider.js';
import { resolveItemsRuntime, sGenerate, stopS } from '../trellis/tendril/sModel.mjs';
import { loadApiKey } from './lib/crucibleBrowser.mjs';
import {
  SCION_LESSON_KERNEL_CAMPAIGN_PROTOCOL,
  SCION_LESSON_KERNEL_CAPTURE_PROTOCOL,
  buildScionLessonKernelCampaign,
  buildScionLessonKernelResponseSchema,
  scionLessonKernelSha256,
  stableScionLessonKernelJson,
  validateScionLessonKernelCampaign,
} from './lib/scionLessonKernelCampaign.mjs';

const DEFAULT_CAMPAIGN = 'evaluation/scion-adapters/lesson-kernel-campaign-v0.16.54.json';
const DEFAULT_CHECKPOINT_DIR = 'verification-output/scion-lesson-kernel-capture-v0.16.54';
const DEFAULT_REPORT = `${DEFAULT_CHECKPOINT_DIR}/latest.json`;
const BASE_CONTRACT = 'evaluation/scion-adapters/base-contracts/gemma-4-e2b.json';
const LOCAL_TIMEOUT_MS = 2_400_000;
const MAX_ATTEMPTS = 3;
const CAPTURE_COMPILER_FILES = Object.freeze([
  'scripts/scionLessonKernelCapture.mjs',
  'scripts/lib/scionLessonKernelCampaign.mjs',
  'src/lib/publicScionProvider.js',
  'src/lib/scionAnswerKeyAlignment.js',
  'src/lib/scionKeyTermContract.js',
  'src/lib/scenarioContract.js',
]);

function parseArgs(argv) {
  const args = {
    build: false,
    audit: false,
    capture: false,
    verify: false,
    fresh: false,
    arm: '',
    limit: 0,
    caseId: '',
    campaign: DEFAULT_CAMPAIGN,
    checkpointDir: DEFAULT_CHECKPOINT_DIR,
    report: DEFAULT_REPORT,
    generatedAt: '2026-07-18T07:30:00.000Z',
    referenceModel: 'gpt-5.4-mini',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--build') args.build = true;
    else if (token === '--audit') args.audit = true;
    else if (token === '--capture') args.capture = true;
    else if (token === '--verify') args.verify = true;
    else if (token === '--fresh') args.fresh = true;
    else if (token === '--arm') args.arm = argv[++index] || '';
    else if (token === '--limit') args.limit = Number(argv[++index] || 0);
    else if (token === '--case-id') args.caseId = argv[++index] || '';
    else if (token === '--campaign') args.campaign = argv[++index] || args.campaign;
    else if (token === '--checkpoints') args.checkpointDir = argv[++index] || args.checkpointDir;
    else if (token === '--report') args.report = argv[++index] || args.report;
    else if (token === '--generated-at') args.generatedAt = argv[++index] || args.generatedAt;
    else if (token === '--reference-model') args.referenceModel = argv[++index] || args.referenceModel;
    else if (token === '--help' || token === '-h') args.help = true;
    else throw new Error(`Unknown Scion lesson-kernel capture option: ${token}`);
  }
  if (args.arm && !['local', 'reference'].includes(args.arm)) throw new Error('--arm must be local or reference');
  if (args.capture && !args.arm) throw new Error('--capture requires --arm local or --arm reference');
  if (!Number.isInteger(args.limit) || args.limit < 0) throw new Error('--limit must be a non-negative integer');
  if (![args.build, args.audit, args.capture, args.verify].some(Boolean) && !args.help) args.audit = true;
  return args;
}

async function atomicWrite(filePath, value) {
  const absolute = path.resolve(filePath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(temporary, absolute);
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function buildCampaign(args) {
  const campaign = await buildScionLessonKernelCampaign({ generatedAt: args.generatedAt });
  const validation = validateScionLessonKernelCampaign(campaign);
  if (!validation.valid) throw new Error(`Built lesson-kernel campaign is invalid: ${validation.issues.join(', ')}`);
  await atomicWrite(args.campaign, campaign);
  return campaign;
}

async function auditCampaign(args) {
  const tracked = await readJson(args.campaign);
  if (!tracked) throw new Error(`Missing lesson-kernel campaign: ${args.campaign}`);
  const validation = validateScionLessonKernelCampaign(tracked);
  if (!validation.valid) throw new Error(`Lesson-kernel campaign is invalid: ${validation.issues.join(', ')}`);
  const rebuilt = await buildScionLessonKernelCampaign({ generatedAt: tracked.generatedAt });
  if (stableScionLessonKernelJson(rebuilt) !== stableScionLessonKernelJson(tracked)) {
    throw new Error('Tracked lesson-kernel campaign does not match a fresh deterministic rebuild');
  }
  return tracked;
}

async function modelIdentity(arm, referenceModel) {
  if (arm === 'reference') {
    return {
      provider: 'openai',
      id: referenceModel,
      route: 'responses-api-json-schema',
      reasoningEffort: 'low',
      maxOutputTokens: 3000,
    };
  }
  const contract = JSON.parse(await fs.readFile(BASE_CONTRACT, 'utf8'));
  const base = contract.trainingBase;
  process.env.HF_HUB_CACHE ||= path.join(os.homedir(), '.cache', 'coursemapper', 'scion-models');
  process.env.HF_HUB_OFFLINE = '1';
  process.env.SCION_MODEL = base.modelId;
  process.env.SCION_MODEL_REVISION = base.revision;
  delete process.env.SCION_ADAPTERS;
  delete process.env.G4_ADAPTERS;
  const runtime = resolveItemsRuntime();
  return {
    provider: 'local',
    id: base.modelId,
    revision: base.revision,
    route: 'mlx-vlm-base-only',
    decoding: 'greedy-json-schema',
    maxOutputTokens: 2400,
    runtime: { python: runtime.python, script: runtime.script },
  };
}

async function preflight(arm, model) {
  if (arm === 'reference') {
    const apiEnvPath = String(process.env.COURSEMAPPER_API_ENV || '').trim() || undefined;
    await loadApiKey(apiEnvPath, 'openai');
    return;
  }
  const snapshot = path.join(
    process.env.HF_HUB_CACHE,
    `models--${model.id.replaceAll('/', '--')}`,
    'snapshots',
    model.revision,
  );
  const files = await fs.readdir(snapshot).catch(() => []);
  if (!files.includes('config.json') || !files.some((name) => /^model(?:-[^.]+)?\.safetensors$/.test(name))) {
    throw new Error(`Pinned local Scion snapshot is unavailable: ${snapshot}`);
  }
  await fs.access(model.runtime.python, fs.constants.X_OK);
  await fs.access(model.runtime.script, fs.constants.R_OK);
}

async function referenceApiKey() {
  const fromEnv = String(process.env.COURSEMAPPER_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  if (fromEnv) return fromEnv;
  const apiEnvPath = String(process.env.COURSEMAPPER_API_ENV || '').trim() || undefined;
  return loadApiKey(apiEnvPath, 'openai');
}

async function callLocal(messages, model, schema, attempt) {
  const result = await sGenerate(
    {
      system: messages[0].content,
      user: messages[1].content,
      task: 'items',
      maxTokens: model.maxOutputTokens,
      temperature: attempt > 1 ? 0.15 : 0,
      schema,
    },
    { timeoutMs: LOCAL_TIMEOUT_MS, includeMetadata: true },
  );
  return {
    text: result.text,
    receipt: { provider: 'local', constrained: result.constrained || 'unknown', adapterActive: false },
  };
}

async function callReference(messages, model, schema) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${await referenceApiKey()}` },
    body: JSON.stringify(
      buildOpenAIResponsesBody({
        model: model.id,
        systemPrompt: messages[0].content,
        userPrompt: messages[1].content,
        maxOutputTokens: model.maxOutputTokens,
        responseFormat: {
          type: 'json_schema',
          json_schema: { name: 'scion_lesson_kernel', strict: true, schema },
        },
        reasoning: { enabled: true, control: 'reasoning_effort', effort: model.reasoningEffort },
        stream: false,
      }),
    ),
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 500)}`);
  const json = await response.json();
  const text = extractOpenAIResponsesText(json);
  if (!text.trim()) throw new Error(`OpenAI response contained no lesson-kernel output (${json.status || 'unknown'})`);
  return {
    text,
    receipt: {
      provider: 'openai',
      responseId: json.id || null,
      model: json.model || model.id,
      usage: json.usage || null,
    },
  };
}

function parseAttempt(result, entry, priorText = '') {
  const repaired = repairPublicScionJson(result.text);
  const merged = priorText ? mergePublicScionKernelAttempts(priorText, repaired.text, entry.userPrompt) : null;
  const text = merged?.text || repaired.text;
  try {
    const assessment = assessPublicScionKernelResponse(text, entry.userPrompt, 'blueprintEnrichment');
    const shuffled = assessment.needsRetry ? { text, repairs: [] } : shufflePublicScionKernelOptions(text);
    const parsed = JSON.parse(shuffled.text);
    const lesson =
      (parsed.lessons || []).find((candidate) => candidate?.lessonId === entry.lessonInput.lessonId) || null;
    return {
      validJson: true,
      text: shuffled.text,
      response: parsed,
      artifact: lesson,
      assessment,
      repairs: [...repaired.repairs, ...(merged?.repairs || []), ...shuffled.repairs],
    };
  } catch (error) {
    return {
      validJson: false,
      text,
      response: null,
      artifact: null,
      assessment: { needsRetry: true, issues: ['invalid-json'] },
      repairs: repaired.repairs,
      error: String(error?.message || error),
    };
  }
}

async function captureCase(entry, arm, model) {
  const startedAt = new Date().toISOString();
  const start = Date.now();
  const schema = buildScionLessonKernelResponseSchema(entry.lessonInput.lessonId);
  const attempts = [];
  let priorText = '';
  let final = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const messages =
      attempt === 1 || !final?.assessment?.needsRetry
        ? entry.messages
        : entry.messages.map((message, index) =>
            index === entry.messages.length - 1
              ? { ...message, content: `${message.content}\n\n${buildPublicScionRetryFeedback(final.assessment)}` }
              : message,
          );
    const callStart = Date.now();
    try {
      const result =
        arm === 'local'
          ? await callLocal(messages, model, schema, attempt)
          : await callReference(messages, model, schema);
      const parsed = parseAttempt(result, entry, priorText);
      attempts.push({
        attempt,
        messagesSha256: scionLessonKernelSha256(messages),
        rawResponseSha256: scionLessonKernelSha256(result.text),
        responseSha256: parsed.response ? scionLessonKernelSha256(parsed.response) : null,
        artifactSha256: parsed.artifact ? scionLessonKernelSha256(parsed.artifact) : null,
        assessment: parsed.assessment,
        repairs: parsed.repairs,
        receipt: result.receipt,
        durationMs: Date.now() - callStart,
      });
      final = parsed;
      priorText = parsed.text;
      if (!parsed.assessment.needsRetry) break;
    } catch (error) {
      attempts.push({
        attempt,
        messagesSha256: scionLessonKernelSha256(messages),
        error: String(error?.message || error).slice(0, 1000),
        durationMs: Date.now() - callStart,
      });
      final = null;
    }
  }
  return {
    caseId: entry.caseId,
    caseSha256: entry.caseSha256,
    messagesSha256: entry.messagesSha256,
    sourceContextSha256: scionLessonKernelSha256(entry.sourceContext),
    arm,
    model,
    attempts,
    artifact: final?.artifact || null,
    artifactSha256: final?.artifact ? scionLessonKernelSha256(final.artifact) : null,
    response: final?.response || null,
    responseSha256: final?.response ? scionLessonKernelSha256(final.response) : null,
    admission: final?.assessment || { needsRetry: true, issues: ['model-call-failed'] },
    compilerRepairs: final?.repairs || [],
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
  };
}

async function captureCompilerIdentity() {
  const files = Object.fromEntries(
    await Promise.all(
      CAPTURE_COMPILER_FILES.map(async (file) => [file, scionLessonKernelSha256(await fs.readFile(file, 'utf8'))]),
    ),
  );
  const policy = {
    keyTermSemanticProfile: 'source-strict-v5',
    maxAttempts: MAX_ATTEMPTS,
    answerPosition: 'compiler-deterministic-shuffle-after-admission',
    crossAttemptRetention: 'atomic-groups-only',
  };
  return {
    policy,
    files,
    identitySha256: scionLessonKernelSha256({ policy, files }),
  };
}

function checkpointIdentity(campaign, arm, model, compiler) {
  return scionLessonKernelSha256({
    protocol: SCION_LESSON_KERNEL_CAPTURE_PROTOCOL,
    campaignIdentity: campaign.identity,
    arm,
    model,
    compiler,
    maxAttempts: MAX_ATTEMPTS,
  });
}

function verifyCapturedCall(call, entry, arm, model) {
  const issues = [];
  if (call?.caseId !== entry.caseId || call?.caseSha256 !== entry.caseSha256) issues.push('case');
  if (call?.messagesSha256 !== entry.messagesSha256) issues.push('messages');
  if (call?.sourceContextSha256 !== scionLessonKernelSha256(entry.sourceContext)) issues.push('source-context');
  if (call?.arm !== arm || stableScionLessonKernelJson(call?.model) !== stableScionLessonKernelJson(model)) {
    issues.push('model');
  }
  if (call?.artifact && call.artifactSha256 !== scionLessonKernelSha256(call.artifact)) issues.push('artifact');
  if (call?.response && call.responseSha256 !== scionLessonKernelSha256(call.response)) issues.push('response');
  if (!Array.isArray(call?.attempts) || call.attempts.length < 1 || call.attempts.length > MAX_ATTEMPTS) {
    issues.push('attempts');
  }
  return { valid: issues.length === 0, issues };
}

async function captureArm(args, campaign) {
  const model = await modelIdentity(args.arm, args.referenceModel);
  const compiler = await captureCompilerIdentity();
  await preflight(args.arm, model);
  const checkpointPath = path.resolve(args.checkpointDir, `${args.arm}.json`);
  if (args.fresh) await fs.rm(checkpointPath, { force: true });
  const identitySha256 = checkpointIdentity(campaign, args.arm, model, compiler);
  const checkpoint = (await readJson(checkpointPath)) || {
    schemaVersion: 1,
    protocol: SCION_LESSON_KERNEL_CAPTURE_PROTOCOL,
    campaignIdentity: campaign.identity,
    identitySha256,
    arm: args.arm,
    model,
    compiler,
    calls: [],
  };
  if (checkpoint.identitySha256 !== identitySha256) {
    throw new Error(`Lesson-kernel ${args.arm} checkpoint identity mismatch; use --fresh only for a new campaign`);
  }
  let newCalls = 0;
  const selectedCases = args.caseId ? campaign.cases.filter((entry) => entry.caseId === args.caseId) : campaign.cases;
  if (args.caseId && selectedCases.length !== 1) throw new Error(`Unknown lesson-kernel case: ${args.caseId}`);
  for (const entry of selectedCases) {
    const existing = checkpoint.calls.find((call) => call.caseId === entry.caseId);
    if (existing && verifyCapturedCall(existing, entry, args.arm, model).valid) continue;
    if (args.limit > 0 && newCalls >= args.limit) break;
    const call = await captureCase(entry, args.arm, model);
    checkpoint.calls = checkpoint.calls.filter((candidate) => candidate.caseId !== entry.caseId);
    checkpoint.calls.push(call);
    checkpoint.calls.sort((left, right) => left.caseId.localeCompare(right.caseId));
    checkpoint.updatedAt = new Date().toISOString();
    await atomicWrite(checkpointPath, checkpoint);
    newCalls += 1;
    console.log(
      `[scion-lesson-kernel] ${args.arm} ${entry.caseId}: ${call.artifact ? (call.admission.needsRetry ? `retained with ${call.admission.issues.length} issue(s)` : 'admitted') : 'no artifact'} in ${Math.round(call.durationMs / 1000)}s`,
    );
  }
  return { checkpointPath, checkpoint, newCalls };
}

async function verifyCheckpoints(args, campaign) {
  const arms = args.arm ? [args.arm] : ['local', 'reference'];
  const results = {};
  for (const arm of arms) {
    const model = await modelIdentity(arm, args.referenceModel);
    const compiler = await captureCompilerIdentity();
    const checkpointPath = path.resolve(args.checkpointDir, `${arm}.json`);
    const checkpoint = await readJson(checkpointPath);
    if (!checkpoint) {
      results[arm] = { status: 'missing', calls: 0, validCalls: 0, issues: ['missing-checkpoint'] };
      continue;
    }
    const issues = [];
    if (checkpoint.identitySha256 !== checkpointIdentity(campaign, arm, model, compiler)) issues.push('identity');
    if (stableScionLessonKernelJson(checkpoint.compiler) !== stableScionLessonKernelJson(compiler)) {
      issues.push('compiler');
    }
    const byCase = new Map(campaign.cases.map((entry) => [entry.caseId, entry]));
    let validCalls = 0;
    for (const call of checkpoint.calls || []) {
      const entry = byCase.get(call.caseId);
      if (!entry) {
        issues.push(`unknown-case:${call.caseId}`);
        continue;
      }
      const verification = verifyCapturedCall(call, entry, arm, model);
      if (verification.valid) validCalls += 1;
      else issues.push(...verification.issues.map((issue) => `${call.caseId}:${issue}`));
    }
    const admitted = (checkpoint.calls || []).filter((call) => call.artifact && !call.admission?.needsRetry).length;
    const retained = (checkpoint.calls || []).filter((call) => call.artifact && call.admission?.needsRetry).length;
    results[arm] = {
      status:
        issues.length === 0
          ? (checkpoint.calls || []).length === campaign.cases.length
            ? 'complete'
            : 'partial'
          : 'invalid',
      calls: (checkpoint.calls || []).length,
      validCalls,
      admitted,
      retained,
      missingArtifacts: (checkpoint.calls || []).filter((call) => !call.artifact).length,
      retries: (checkpoint.calls || []).reduce((sum, call) => sum + Math.max(0, (call.attempts || []).length - 1), 0),
      durationMs: (checkpoint.calls || []).reduce((sum, call) => sum + Number(call.durationMs || 0), 0),
      issues: [...new Set(issues)],
    };
  }
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'Usage: node scripts/scionLessonKernelCapture.mjs [--build|--audit|--capture --arm local|reference|--verify] [--limit N] [--case-id ID] [--fresh]',
    );
    return;
  }
  let campaign;
  if (args.build) campaign = await buildCampaign(args);
  if (args.audit || args.capture || args.verify) campaign = await auditCampaign(args);
  let generation = null;
  try {
    if (args.capture) generation = await captureArm(args, campaign);
  } finally {
    if (args.arm === 'local') stopS();
  }
  const checkpoints = args.verify || args.capture ? await verifyCheckpoints(args, campaign) : null;
  const report = {
    schemaVersion: 1,
    protocol: SCION_LESSON_KERNEL_CAPTURE_PROTOCOL,
    generatedAt: new Date().toISOString(),
    campaign: {
      path: args.campaign,
      protocol: SCION_LESSON_KERNEL_CAMPAIGN_PROTOCOL,
      identity: campaign.identity,
      summary: campaign.summary,
    },
    generation: generation
      ? { arm: args.arm, newCalls: generation.newCalls, checkpointPath: generation.checkpointPath }
      : null,
    checkpoints,
    claimBoundary:
      'Capture receipts bind model outputs, production-prompt inputs, compiler admission, and retry burden. They create no preference, adapter win, human evidence, held-out result, or activation claim.',
  };
  if (args.verify || args.capture) await atomicWrite(args.report, report);
  console.log(
    `Scion lesson-kernel campaign: ${campaign.summary.cases} production-compatible cases / ${campaign.summary.courseGroups} groups / ${Object.keys(campaign.summary.domains).length} domains`,
  );
  if (checkpoints) console.log(JSON.stringify(checkpoints, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
    stopS();
  });
}
