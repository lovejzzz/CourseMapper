#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { buildOpenAIResponsesBody, extractOpenAIResponsesText } from '../src/lib/openaiProvider.js';
import { sGenerate, stopS } from '../trellis/tendril/sModel.mjs';
import { loadApiKey } from './lib/crucibleBrowser.mjs';
import {
  SOURCE_ATOM_SCHEMA,
  SOURCE_RECOVERY_PROTOCOL,
  SOURCE_RECOVERY_SCHEMA,
  assessSourceAtomResponse,
  buildSourceRecoveryPrompt,
  buildSourceCaptureProject,
  canonicalJson,
  materializeSourceCaptureCampaign,
  parseSourceAtomResponse,
  sourceCaptureCompletedAt,
  sourceCaptureSha256,
  summarizeSourceCaptureBurden,
  verifySourceCaptureProject,
} from './lib/scionSourceCapture.mjs';

const DEFAULT_CAMPAIGN = 'evaluation/scion-source-capture-campaign.json';
const DEFAULT_OUTPUT = 'evaluation/scion-source-capture-evidence';
const DEFAULT_CHECKPOINTS = 'verification-output/scion-source-capture/checkpoints';
const DEFAULT_REPORT = 'verification-output/scion-source-capture/latest.json';
const BASE_CONTRACT = 'evaluation/scion-adapters/base-contracts/gemma-4-e2b.json';
const LOCAL_CAPTURE_TIMEOUT_MS = 2_400_000;

function parseArgs(argv) {
  const args = {
    campaign: DEFAULT_CAMPAIGN,
    outputDir: DEFAULT_OUTPUT,
    checkpointDir: DEFAULT_CHECKPOINTS,
    report: DEFAULT_REPORT,
    arm: '',
    verify: false,
    recover: false,
    fresh: false,
    limit: 0,
    referenceModel: 'gpt-5.4-mini',
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--campaign') args.campaign = argv[++index] || args.campaign;
    else if (argv[index] === '--output') args.outputDir = argv[++index] || args.outputDir;
    else if (argv[index] === '--checkpoints') args.checkpointDir = argv[++index] || args.checkpointDir;
    else if (argv[index] === '--report') args.report = argv[++index] || args.report;
    else if (argv[index] === '--arm') args.arm = argv[++index] || '';
    else if (argv[index] === '--reference-model') args.referenceModel = argv[++index] || args.referenceModel;
    else if (argv[index] === '--verify') args.verify = true;
    else if (argv[index] === '--recover') args.recover = true;
    else if (argv[index] === '--fresh') args.fresh = true;
    else if (argv[index] === '--limit') args.limit = Number(argv[++index] || 0);
    else if (argv[index] === '--help' || argv[index] === '-h') args.help = true;
    else throw new Error(`Unknown Scion source-capture option: ${argv[index]}`);
  }
  if (args.arm && !['local', 'reference'].includes(args.arm)) {
    throw new Error('--arm must be local or reference');
  }
  if (args.recover && !args.arm) throw new Error('--recover requires --arm local or --arm reference');
  if (!Number.isInteger(args.limit) || args.limit < 0) throw new Error('--limit must be a non-negative integer');
  return args;
}

async function atomicWrite(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(temporary, filePath);
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function modelIdentity({ arm, referenceModel }) {
  if (arm === 'reference') {
    return {
      provider: 'openai',
      id: referenceModel,
      name: referenceModel,
      route: 'responses-api',
      reasoningEffort: 'low',
      maxOutputTokens: 4000,
    };
  }
  const contract = JSON.parse(await fs.readFile(BASE_CONTRACT, 'utf8'));
  const base = contract.trainingBase || {};
  process.env.HF_HUB_CACHE ||= path.join(os.homedir(), '.cache', 'coursemapper', 'scion-models');
  process.env.HF_HUB_OFFLINE = '1';
  process.env.SCION_MODEL = base.modelId;
  process.env.SCION_MODEL_REVISION = base.revision;
  delete process.env.SCION_ADAPTERS;
  delete process.env.G4_ADAPTERS;
  return {
    provider: 'local',
    id: base.modelId,
    name: 'Scion base (Gemma 4 E2B)',
    revision: base.revision,
    route: 'mlx-vlm-base-only',
    decoding: 'greedy-json-schema',
    maxOutputTokens: 2200,
  };
}

async function callLocal(prompt, model, schema = SOURCE_ATOM_SCHEMA) {
  const text = await sGenerate(
    {
      system: prompt.system,
      user: prompt.user,
      task: 'items',
      maxTokens: model.maxOutputTokens,
      schema,
    },
    { timeoutMs: LOCAL_CAPTURE_TIMEOUT_MS },
  );
  return { text, receipt: { provider: 'local', constrained: 'json-schema', adapterActive: false } };
}

async function callReference(prompt, model, schema = SOURCE_ATOM_SCHEMA) {
  const key = String(process.env.OPENAI_API_KEY || '').trim() || (await loadApiKey(undefined, 'openai'));
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify(
      buildOpenAIResponsesBody({
        model: model.id,
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        maxOutputTokens: model.maxOutputTokens,
        responseFormat: {
          type: 'json_schema',
          json_schema: { name: 'scion_source_atoms', strict: true, schema },
        },
        reasoning: { enabled: true, control: 'reasoning_effort', effort: model.reasoningEffort },
        stream: false,
      }),
    ),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`OpenAI ${response.status}: ${detail}`);
  }
  const json = await response.json();
  const text = extractOpenAIResponsesText(json);
  if (!text.trim()) {
    throw new Error(
      `OpenAI response contained no output text: ${JSON.stringify({
        status: json.status || null,
        incompleteDetails: json.incomplete_details || null,
        outputTypes: (json.output || []).map((item) => item?.type || 'unknown'),
        usage: json.usage || null,
      })}`,
    );
  }
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

async function capturePromptCall({
  basePrompt,
  generationPrompt = basePrompt,
  arm,
  model,
  rawCall = null,
  schema = SOURCE_ATOM_SCHEMA,
}) {
  const startedAt = new Date().toISOString();
  const start = Date.now();
  const promptSha256 = sourceCaptureSha256({ system: basePrompt.system, user: basePrompt.user });
  const generationPromptSha256 = sourceCaptureSha256({
    system: generationPrompt.system,
    user: generationPrompt.user,
  });
  let result;
  try {
    result =
      arm === 'local'
        ? await callLocal(generationPrompt, model, schema)
        : await callReference(generationPrompt, model, schema);
  } catch (error) {
    return {
      promptId: basePrompt.id,
      kernelId: basePrompt.kernelId,
      promptSha256,
      generationPromptSha256,
      ...(rawCall ? { rawCallSha256: sourceCaptureSha256(rawCall) } : {}),
      assessment: {
        eligible: false,
        issues: ['model-call-failed'],
        counts: { generatedMcItems: 0, admittedMcItems: 0, generatedKeyTerms: 0, admittedKeyTerms: 0 },
      },
      error: String(error?.message || error).slice(0, 1000),
      startedAt,
      durationMs: Date.now() - start,
    };
  }
  let response;
  let assessment;
  try {
    response = parseSourceAtomResponse(result.text);
    assessment = assessSourceAtomResponse(response, { sourceClaimCount: basePrompt.sourceClaims.length });
  } catch (error) {
    return {
      promptId: basePrompt.id,
      kernelId: basePrompt.kernelId,
      promptSha256,
      generationPromptSha256,
      ...(rawCall ? { rawCallSha256: sourceCaptureSha256(rawCall) } : {}),
      rawResponseSha256: sourceCaptureSha256(result.text),
      assessment: {
        eligible: false,
        issues: ['invalid-model-response'],
        counts: { generatedMcItems: 0, admittedMcItems: 0, generatedKeyTerms: 0, admittedKeyTerms: 0 },
      },
      receipt: result.receipt,
      error: String(error?.message || error).slice(0, 1000),
      startedAt,
      durationMs: Date.now() - start,
    };
  }
  return {
    promptId: basePrompt.id,
    kernelId: basePrompt.kernelId,
    promptSha256,
    generationPromptSha256,
    ...(rawCall ? { rawCallSha256: sourceCaptureSha256(rawCall) } : {}),
    response,
    responseSha256: sourceCaptureSha256(response),
    admittedResponse: assessment.admittedResponse,
    admittedResponseSha256: sourceCaptureSha256(assessment.admittedResponse),
    assessment: { eligible: assessment.eligible, issues: assessment.issues, counts: assessment.counts },
    receipt: result.receipt,
    startedAt,
    durationMs: Date.now() - start,
  };
}

function checkpointIdentity(campaign, arm, model) {
  return sourceCaptureSha256({
    protocol: campaign.protocol,
    manifestSha256: campaign.manifestSha256,
    promptSetSha256: campaign.promptSetSha256,
    arm,
    model,
    schema: SOURCE_ATOM_SCHEMA,
  });
}

function campaignPrompt(campaign, promptId) {
  for (const group of campaign.groups) {
    const prompt = group.prompts.find((entry) => entry.id === promptId);
    if (prompt) return prompt;
  }
  return null;
}

function reassessCapturedCall(call, prompt, rawCall = null) {
  if (!call?.response || !prompt) return rawCall ? { ...call, rawCallSha256: sourceCaptureSha256(rawCall) } : call;
  const assessment = assessSourceAtomResponse(call.response, { sourceClaimCount: prompt.sourceClaims.length });
  return {
    ...call,
    responseSha256: sourceCaptureSha256(call.response),
    admittedResponse: assessment.admittedResponse,
    admittedResponseSha256: sourceCaptureSha256(assessment.admittedResponse),
    assessment: { eligible: assessment.eligible, issues: assessment.issues, counts: assessment.counts },
    ...(rawCall ? { rawCallSha256: sourceCaptureSha256(rawCall) } : {}),
  };
}

function reassessCheckpointCalls(campaign, checkpoint, rawCalls = null) {
  const rawByPrompt = rawCalls ? new Map(rawCalls.map((call) => [call.promptId, call])) : null;
  return (checkpoint?.calls || []).map((call) =>
    reassessCapturedCall(call, campaignPrompt(campaign, call.promptId), rawByPrompt?.get(call.promptId) || null),
  );
}

function existingValidCall(checkpoint, prompt) {
  const call = (checkpoint.calls || []).find((entry) => entry.promptId === prompt.id);
  if (!call || !call.assessment?.eligible) return null;
  const expectedPromptSha256 = sourceCaptureSha256({ system: prompt.system, user: prompt.user });
  if (call.promptSha256 !== expectedPromptSha256) return null;
  if (call.responseSha256 !== sourceCaptureSha256(call.response)) return null;
  if (call.admittedResponseSha256 !== sourceCaptureSha256(call.admittedResponse)) return null;
  return call;
}

export async function generateSourceCapture({ campaign, arm, model, checkpointPath, outputDir, limit = 0 }) {
  const identitySha256 = checkpointIdentity(campaign, arm, model);
  const stored = await readJson(checkpointPath, null);
  if (stored && stored.identitySha256 !== identitySha256) {
    throw new Error(`Checkpoint identity mismatch at ${checkpointPath}; use --fresh to start a new exact campaign`);
  }
  const checkpoint = stored || {
    schemaVersion: 1,
    protocol: campaign.protocol,
    identitySha256,
    manifestSha256: campaign.manifestSha256,
    promptSetSha256: campaign.promptSetSha256,
    arm,
    model,
    calls: [],
  };
  checkpoint.calls = reassessCheckpointCalls(campaign, checkpoint);
  let newCalls = 0;
  for (const group of campaign.groups) {
    for (const prompt of group.prompts) {
      if (existingValidCall(checkpoint, prompt)) continue;
      if (limit > 0 && newCalls >= limit) break;
      const startedAt = new Date().toISOString();
      const start = Date.now();
      let result;
      try {
        result = arm === 'local' ? await callLocal(prompt, model) : await callReference(prompt, model);
      } catch (error) {
        const call = {
          promptId: prompt.id,
          kernelId: prompt.kernelId,
          promptSha256: sourceCaptureSha256({ system: prompt.system, user: prompt.user }),
          assessment: {
            eligible: false,
            issues: ['model-call-failed'],
            counts: { generatedMcItems: 0, admittedMcItems: 0, generatedKeyTerms: 0, admittedKeyTerms: 0 },
          },
          error: String(error?.message || error).slice(0, 1000),
          startedAt,
          durationMs: Date.now() - start,
        };
        checkpoint.calls = (checkpoint.calls || []).filter((entry) => entry.promptId !== prompt.id);
        checkpoint.calls.push(call);
        checkpoint.calls.sort((left, right) => left.promptId.localeCompare(right.promptId));
        checkpoint.updatedAt = new Date().toISOString();
        await atomicWrite(checkpointPath, checkpoint);
        newCalls += 1;
        console.error(`[scion-source-capture] ${arm} ${prompt.id}: model-call-failed (${call.error})`);
        continue;
      }
      let response;
      let assessment;
      try {
        response = parseSourceAtomResponse(result.text);
        assessment = assessSourceAtomResponse(response, { sourceClaimCount: prompt.sourceClaims.length });
      } catch (error) {
        const call = {
          promptId: prompt.id,
          kernelId: prompt.kernelId,
          promptSha256: sourceCaptureSha256({ system: prompt.system, user: prompt.user }),
          rawResponseSha256: sourceCaptureSha256(result.text),
          assessment: {
            eligible: false,
            issues: ['invalid-model-response'],
            counts: { generatedMcItems: 0, admittedMcItems: 0, generatedKeyTerms: 0, admittedKeyTerms: 0 },
          },
          receipt: result.receipt,
          error: String(error?.message || error).slice(0, 1000),
          startedAt,
          durationMs: Date.now() - start,
        };
        checkpoint.calls = (checkpoint.calls || []).filter((entry) => entry.promptId !== prompt.id);
        checkpoint.calls.push(call);
        checkpoint.calls.sort((left, right) => left.promptId.localeCompare(right.promptId));
        checkpoint.updatedAt = new Date().toISOString();
        await atomicWrite(checkpointPath, checkpoint);
        newCalls += 1;
        console.error(`[scion-source-capture] ${arm} ${prompt.id}: invalid-model-response (${call.error})`);
        continue;
      }
      const call = {
        promptId: prompt.id,
        kernelId: prompt.kernelId,
        promptSha256: sourceCaptureSha256({ system: prompt.system, user: prompt.user }),
        response,
        responseSha256: sourceCaptureSha256(response),
        admittedResponse: assessment.admittedResponse,
        admittedResponseSha256: sourceCaptureSha256(assessment.admittedResponse),
        assessment: { eligible: assessment.eligible, issues: assessment.issues, counts: assessment.counts },
        receipt: result.receipt,
        startedAt,
        durationMs: Date.now() - start,
      };
      checkpoint.calls = (checkpoint.calls || []).filter((entry) => entry.promptId !== prompt.id);
      checkpoint.calls.push(call);
      checkpoint.calls.sort((left, right) => left.promptId.localeCompare(right.promptId));
      checkpoint.updatedAt = new Date().toISOString();
      await atomicWrite(checkpointPath, checkpoint);
      newCalls += 1;
      console.log(
        `[scion-source-capture] ${arm} ${prompt.id}: ${assessment.eligible ? `eligible ${assessment.counts.admittedMcItems}mc/${assessment.counts.admittedKeyTerms}kt` : assessment.issues.join(', ')}`,
      );
      if (!assessment.eligible) {
        console.error(
          `[scion-source-capture] retained diagnostic rejection for ${arm} ${prompt.id}; continuing the campaign`,
        );
      }
    }
    if (limit > 0 && newCalls >= limit) break;
  }

  const projects = [];
  for (const group of campaign.groups) {
    const calls = group.prompts
      .map((prompt) => (checkpoint.calls || []).find((call) => call.promptId === prompt.id))
      .filter(Boolean);
    if (calls.length !== group.prompts.length || calls.filter((call) => call.assessment?.eligible).length < 2) continue;
    const project = buildSourceCaptureProject({
      campaign,
      group,
      arm,
      model,
      calls,
      generatedAt: sourceCaptureCompletedAt(calls),
    });
    const verification = verifySourceCaptureProject(project, { campaign, group, arm, model });
    if (!verification.valid)
      throw new Error(`${group.id} project verification failed: ${verification.issues.join(', ')}`);
    const projectPath = path.resolve(outputDir, `${group.id}-${arm}.json`);
    await atomicWrite(projectPath, project);
    projects.push({
      groupId: group.id,
      path: path.relative(process.cwd(), projectPath),
      sha256: sourceCaptureSha256(await fs.readFile(projectPath, 'utf8')),
    });
  }
  return {
    arm,
    model,
    newCalls,
    totalCalls: checkpoint.calls.length,
    eligibleCalls: checkpoint.calls.filter((call) => call.assessment?.eligible).length,
    ineligibleCalls: checkpoint.calls
      .filter((call) => !call.assessment?.eligible)
      .map((call) => ({ promptId: call.promptId, issues: call.assessment?.issues || [] })),
    admittedAtoms: checkpoint.calls.reduce(
      (sum, call) =>
        sum +
        Number(call.assessment?.counts?.admittedMcItems || 0) +
        Number(call.assessment?.counts?.admittedKeyTerms || 0),
      0,
    ),
    completeProjects: projects.length,
    projects,
    complete: projects.length === campaign.groups.length,
  };
}

function existingValidRecoveryCall(checkpoint, prompt, rawCall) {
  const call = (checkpoint.calls || []).find((entry) => entry.promptId === prompt.id);
  if (!call || !call.assessment?.eligible) return null;
  const recoveryPrompt = buildSourceRecoveryPrompt(prompt, rawCall);
  if (call.promptSha256 !== sourceCaptureSha256({ system: prompt.system, user: prompt.user })) return null;
  if (call.generationPromptSha256 !== sourceCaptureSha256({ system: recoveryPrompt.system, user: recoveryPrompt.user }))
    return null;
  if (call.rawCallSha256 !== sourceCaptureSha256(rawCall)) return null;
  if (call.responseSha256 !== sourceCaptureSha256(call.response)) return null;
  if (call.admittedResponseSha256 !== sourceCaptureSha256(call.admittedResponse)) return null;
  return call;
}

export async function generateSourceRecovery({
  campaign,
  arm,
  model,
  rawCheckpointPath,
  recoveryCheckpointPath,
  outputDir,
  limit = 0,
}) {
  const rawCheckpoint = await readJson(rawCheckpointPath, null);
  if (!rawCheckpoint) throw new Error(`Missing raw ${arm} checkpoint at ${rawCheckpointPath}`);
  const expectedRawIdentity = checkpointIdentity(campaign, arm, model);
  if (rawCheckpoint.identitySha256 !== expectedRawIdentity) {
    throw new Error(`Raw ${arm} checkpoint identity mismatch; regenerate the exact source-capture arm first`);
  }
  const rawCallsBefore = sourceCaptureSha256(rawCheckpoint.calls || []);
  rawCheckpoint.calls = reassessCheckpointCalls(campaign, rawCheckpoint);
  if (sourceCaptureSha256(rawCheckpoint.calls) !== rawCallsBefore) await atomicWrite(rawCheckpointPath, rawCheckpoint);
  const rawCallsSha256 = sourceCaptureSha256(rawCheckpoint.calls || []);
  const recoveryPromptSetSha256 = sourceCaptureSha256(
    campaign.groups.flatMap((group) =>
      group.prompts
        .map((prompt) => ({ prompt, rawCall: (rawCheckpoint.calls || []).find((call) => call.promptId === prompt.id) }))
        .filter(({ rawCall }) => rawCall && !rawCall.assessment?.eligible)
        .map(({ prompt, rawCall }) => {
          const recoveryPrompt = buildSourceRecoveryPrompt(prompt, rawCall);
          return { id: prompt.id, system: recoveryPrompt.system, user: recoveryPrompt.user };
        }),
    ),
  );
  const identitySha256 = sourceCaptureSha256({
    protocol: SOURCE_RECOVERY_PROTOCOL,
    rawIdentitySha256: rawCheckpoint.identitySha256,
    rawCallsSha256,
    recoveryPromptSetSha256,
    arm,
    model,
    schema: SOURCE_RECOVERY_SCHEMA,
  });
  let stored = await readJson(recoveryCheckpointPath, null);
  if (stored) {
    stored.calls = reassessCheckpointCalls(campaign, stored, rawCheckpoint.calls || []);
    if (stored.identitySha256 !== identitySha256) {
      const requiredRecoveryCallsValid = (rawCheckpoint.calls || [])
        .filter((rawCall) => !rawCall.assessment?.eligible)
        .every((rawCall) => {
          const prompt = campaignPrompt(campaign, rawCall.promptId);
          const call = (stored.calls || []).find((entry) => entry.promptId === rawCall.promptId);
          if (!prompt || !call) return false;
          const recoveryPrompt = buildSourceRecoveryPrompt(prompt, rawCall);
          return (
            call.generationPromptSha256 ===
              sourceCaptureSha256({ system: recoveryPrompt.system, user: recoveryPrompt.user }) &&
            call.response?.mcItems?.length === 1 &&
            call.response?.keyTerms?.length === 1
          );
        });
      const migratable =
        stored.protocol === SOURCE_RECOVERY_PROTOCOL &&
        stored.rawIdentitySha256 === rawCheckpoint.identitySha256 &&
        requiredRecoveryCallsValid &&
        stored.arm === arm &&
        canonicalJson(stored.model) === canonicalJson(model);
      if (!migratable) {
        throw new Error(`Recovery checkpoint identity mismatch at ${recoveryCheckpointPath}; use --fresh --recover`);
      }
      stored = { ...stored, identitySha256, rawCallsSha256, recoveryPromptSetSha256 };
      await atomicWrite(recoveryCheckpointPath, stored);
    }
  }
  const checkpoint = stored || {
    schemaVersion: 1,
    protocol: SOURCE_RECOVERY_PROTOCOL,
    identitySha256,
    rawIdentitySha256: rawCheckpoint.identitySha256,
    rawCallsSha256,
    recoveryPromptSetSha256,
    arm,
    model,
    calls: [],
  };
  let newCalls = 0;
  for (const group of campaign.groups) {
    for (const prompt of group.prompts) {
      const rawCall = (rawCheckpoint.calls || []).find((call) => call.promptId === prompt.id);
      if (!rawCall || rawCall.assessment?.eligible) continue;
      if (existingValidRecoveryCall(checkpoint, prompt, rawCall)) continue;
      if (limit > 0 && newCalls >= limit) break;
      const recoveryPrompt = buildSourceRecoveryPrompt(prompt, rawCall);
      const call = await capturePromptCall({
        basePrompt: prompt,
        generationPrompt: recoveryPrompt,
        arm,
        model,
        rawCall,
        schema: SOURCE_RECOVERY_SCHEMA,
      });
      checkpoint.calls = (checkpoint.calls || []).filter((entry) => entry.promptId !== prompt.id);
      checkpoint.calls.push(call);
      checkpoint.calls.sort((left, right) => left.promptId.localeCompare(right.promptId));
      checkpoint.updatedAt = new Date().toISOString();
      await atomicWrite(recoveryCheckpointPath, checkpoint);
      newCalls += 1;
      console.log(
        `[scion-source-capture] ${arm} recovery ${prompt.id}: ${call.assessment?.eligible ? `eligible ${call.assessment.counts.admittedMcItems}mc/${call.assessment.counts.admittedKeyTerms}kt` : (call.assessment?.issues || []).join(', ')}`,
      );
    }
    if (limit > 0 && newCalls >= limit) break;
  }
  const effectiveCalls = (rawCheckpoint.calls || []).map((rawCall) => {
    if (rawCall.assessment?.eligible) return rawCall;
    return (checkpoint.calls || []).find((call) => call.promptId === rawCall.promptId) || rawCall;
  });
  const projects = [];
  for (const group of campaign.groups) {
    const groupRawCalls = group.prompts
      .map((prompt) => (rawCheckpoint.calls || []).find((call) => call.promptId === prompt.id))
      .filter(Boolean);
    const groupRecoveryCalls = group.prompts
      .map((prompt) => {
        const rawCall = groupRawCalls.find((call) => call.promptId === prompt.id);
        return rawCall && !rawCall.assessment?.eligible
          ? (checkpoint.calls || []).find((call) => call.promptId === prompt.id)
          : null;
      })
      .filter(Boolean);
    const groupEffectiveCalls = group.prompts
      .map((prompt) => effectiveCalls.find((call) => call.promptId === prompt.id))
      .filter(Boolean);
    if (
      groupEffectiveCalls.length !== group.prompts.length ||
      groupEffectiveCalls.filter((call) => call.assessment?.eligible).length < 2
    )
      continue;
    const project = buildSourceCaptureProject({
      campaign,
      group,
      arm,
      model,
      calls: groupEffectiveCalls,
      rawCalls: groupRawCalls,
      recoveryCalls: groupRecoveryCalls,
      generatedAt: sourceCaptureCompletedAt(groupEffectiveCalls),
    });
    const verification = verifySourceCaptureProject(project, { campaign, group, arm, model });
    if (!verification.valid)
      throw new Error(`${group.id} recovered project verification failed: ${verification.issues.join(', ')}`);
    const projectPath = path.resolve(outputDir, `${group.id}-${arm}.json`);
    await atomicWrite(projectPath, project);
    projects.push({
      groupId: group.id,
      path: path.relative(process.cwd(), projectPath),
      sha256: sourceCaptureSha256(await fs.readFile(projectPath, 'utf8')),
    });
  }
  const rawBurden = summarizeSourceCaptureBurden({
    calls: rawCheckpoint.calls || [],
    expectedCalls: campaign.summary.prompts,
    expectedAtoms: campaign.summary.expectedCandidates,
  });
  const compiledBurden = summarizeSourceCaptureBurden({
    calls: effectiveCalls,
    expectedCalls: campaign.summary.prompts,
    expectedAtoms: campaign.summary.expectedCandidates,
  });
  return {
    arm,
    protocol: SOURCE_RECOVERY_PROTOCOL,
    model,
    newCalls,
    recoveryCalls: checkpoint.calls.length,
    rawBurden,
    compiledBurden,
    completeProjects: projects.length,
    projects,
    complete: projects.length === campaign.groups.length,
  };
}

export async function verifySourceCaptureArtifacts({ campaign, outputDir, models = {} }) {
  const results = [];
  const callsByArm = {
    local: { raw: [], effective: [], recovery: [] },
    reference: { raw: [], effective: [], recovery: [] },
  };
  for (const group of campaign.groups) {
    for (const arm of ['local', 'reference']) {
      const projectPath = path.resolve(outputDir, `${group.id}-${arm}.json`);
      const project = await readJson(projectPath, null);
      if (!project) {
        results.push({
          groupId: group.id,
          arm,
          path: path.relative(process.cwd(), projectPath),
          valid: false,
          issues: ['missing-project'],
        });
        continue;
      }
      const verification = verifySourceCaptureProject(project, { campaign, group, arm, model: models[arm] || null });
      if (verification.valid) {
        const capture = project?.scionSourceCapture || {};
        callsByArm[arm].raw.push(...(capture.compilerRecovery?.rawCalls || capture.calls || []));
        callsByArm[arm].effective.push(...(capture.calls || []));
        callsByArm[arm].recovery.push(...(capture.compilerRecovery?.recoveryCalls || []));
      }
      results.push({
        groupId: group.id,
        arm,
        path: path.relative(process.cwd(), projectPath),
        valid: verification.valid,
        issues: verification.issues,
        sha256: sourceCaptureSha256(await fs.readFile(projectPath, 'utf8')),
      });
    }
  }
  const burden = Object.fromEntries(
    ['local', 'reference'].map((arm) => {
      const raw = summarizeSourceCaptureBurden({
        calls: callsByArm[arm].raw,
        expectedCalls: campaign.summary.prompts,
        expectedAtoms: campaign.summary.expectedCandidates,
      });
      const compiled = summarizeSourceCaptureBurden({
        calls: callsByArm[arm].effective,
        expectedCalls: campaign.summary.prompts,
        expectedAtoms: campaign.summary.expectedCandidates,
      });
      return [
        arm,
        {
          raw,
          compiled,
          recoveryCalls: callsByArm[arm].recovery.length,
          validProjects: results.filter((result) => result.arm === arm && result.valid).length,
          completeEvidence:
            results.filter((result) => result.arm === arm && result.valid).length === campaign.groups.length,
        },
      ];
    }),
  );
  const comparisonReady = burden.local.completeEvidence && burden.reference.completeEvidence;
  return {
    projects: results.length,
    validProjects: results.filter((result) => result.valid).length,
    status: results.every((result) => result.valid) ? 'pass' : 'incomplete',
    burden,
    comparison: {
      ready: comparisonReady,
      rawLocalBurdenDeltaAtoms: comparisonReady
        ? burden.local.raw.burdenAtoms - burden.reference.raw.burdenAtoms
        : null,
      rawLocalBurdenDeltaRate: comparisonReady
        ? Number((burden.local.raw.burdenRate - burden.reference.raw.burdenRate).toFixed(6))
        : null,
      compiledLocalBurdenDeltaAtoms: comparisonReady
        ? burden.local.compiled.burdenAtoms - burden.reference.compiled.burdenAtoms
        : null,
      compiledLocalBurdenDeltaRate: comparisonReady
        ? Number((burden.local.compiled.burdenRate - burden.reference.compiled.burdenRate).toFixed(6))
        : null,
      localRawHasLowerCompilerBurden: comparisonReady
        ? burden.local.raw.burdenAtoms < burden.reference.raw.burdenAtoms
        : null,
      claimBoundary:
        'Compiler burden counts requested atoms that were missing or deterministically rejected. It does not establish instructor preference or factual superiority.',
    },
    results,
  };
}

async function run(args) {
  const campaign = await materializeSourceCaptureCampaign({ manifestPath: args.campaign });
  const models = {};
  if (args.verify || args.arm) {
    models.local = await modelIdentity({ arm: 'local', referenceModel: args.referenceModel });
    models.reference = await modelIdentity({ arm: 'reference', referenceModel: args.referenceModel });
  }
  let generation = null;
  if (args.arm) {
    const model = models[args.arm];
    const checkpointPath = path.resolve(args.checkpointDir, `${args.arm}.json`);
    const recoveryCheckpointPath = path.resolve(args.checkpointDir, `${args.arm}-recovery.json`);
    if (args.fresh) await fs.rm(args.recover ? recoveryCheckpointPath : checkpointPath, { force: true });
    try {
      generation = args.recover
        ? await generateSourceRecovery({
            campaign,
            arm: args.arm,
            model,
            rawCheckpointPath: checkpointPath,
            recoveryCheckpointPath,
            outputDir: args.outputDir,
            limit: args.limit,
          })
        : await generateSourceCapture({
            campaign,
            arm: args.arm,
            model,
            checkpointPath,
            outputDir: args.outputDir,
            limit: args.limit,
          });
    } finally {
      if (args.arm === 'local') stopS();
    }
  }
  const artifacts =
    args.verify || args.arm
      ? await verifySourceCaptureArtifacts({ campaign, outputDir: args.outputDir, models })
      : null;
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    campaign: {
      protocol: campaign.protocol,
      manifestPath: campaign.manifestPath,
      manifestSha256: campaign.manifestSha256,
      promptSetSha256: campaign.promptSetSha256,
      ...campaign.summary,
    },
    generation,
    artifacts,
    claimBoundary:
      'Source integrity and contract admission are mechanical gates. Every retained A/B atom remains neutral until blind instructor review.',
  };
  await atomicWrite(path.resolve(args.report), report);
  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'Usage: node scripts/scionSourceCapture.mjs [--verify] [--arm local|reference] [--recover] [--fresh] [--limit N]',
    );
    return;
  }
  const report = await run(args);
  console.log(
    `Scion source capture: ${report.campaign.groups} groups / ${report.campaign.prompts} prompts / ${report.campaign.expectedCandidates} expected neutral candidates`,
  );
  if (report.generation) {
    console.log(
      `${report.generation.arm}${report.generation.protocol === SOURCE_RECOVERY_PROTOCOL ? ' recovery' : ''}: ${report.generation.completeProjects}/${report.campaign.groups} projects complete (${report.generation.newCalls} new calls)`,
    );
    if (args.limit === 0 && !report.generation.complete) {
      const rejectedCalls =
        report.generation.ineligibleCalls?.length ?? report.generation.compiledBurden?.rejectedCalls ?? 0;
      throw new Error(
        `${report.generation.arm} source capture is incomplete: ${report.generation.completeProjects}/${report.campaign.groups} projects, ${rejectedCalls} rejected effective calls`,
      );
    }
  }
  if (report.artifacts) {
    console.log(
      `Artifacts: ${report.artifacts.validProjects}/${report.artifacts.projects} valid (${report.artifacts.status})`,
    );
    if (args.verify && report.artifacts.status !== 'pass') {
      throw new Error(
        `Scion source-capture verification failed: ${report.artifacts.validProjects}/${report.artifacts.projects} valid projects`,
      );
    }
  }
  console.log(`Report: ${args.report}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
    stopS();
  });
}
