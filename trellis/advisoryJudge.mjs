// Advisory judge for a Trellis package — the crucible's judge verbatim
// (same sampling, same prompt builder, same model), borrowed by import so
// the score is comparable to crucible --judge output. ADVISORY, never a
// gate; the paired protocols remain the ruler.
//
// v0.1.2 (roadmap item 5): multi-SEAT — N independent same-family calls,
// reported as per-artifact mean ± range. More seats reduce sampling
// noise; they do NOT fix family bias (cross-family judging stays
// key-gated, disclosed). Usage:
//
//   npx vite-node trellis/advisoryJudge.mjs <packageDir> [title] [lessons] [seats]

import {
  JUDGE_MODEL,
  sampleJudgeArtifacts,
  buildJudgePrompt,
  parseJudgeResponse,
} from '../scripts/lib/crucibleRound.mjs';
import { extractPackage } from '../src/lib/quality/deepQualityGrader.js';
import { createFsFileProvider } from '../src/lib/quality/fsFileProvider.node.js';
import { loadApiKey } from '../scripts/lib/crucibleBrowser.mjs';
import { estimateUsageCost } from '../src/lib/apiUsageCost.js';

// Judge families (owner decision 2026-07-04: DeepSeek joins as the
// CROSS-FAMILY seat — same prompt, same rubric, different model family,
// which is the honest fix for same-family bias at DeepSeek prices).
const FAMILIES = {
  openai: { endpoint: 'https://api.openai.com/v1/chat/completions', model: () => JUDGE_MODEL },
  deepseek: { endpoint: 'https://api.deepseek.com/v1/chat/completions', model: () => 'deepseek-v4-pro' },
};

async function judgeOnce(prompt, apiKey, family = 'openai') {
  const spec = FAMILIES[family];
  const model = spec.model();
  const response = await fetch(spec.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }),
  });
  if (!response.ok) {
    // A failed seat must be VISIBLE in the output, never an empty family
    // (the first cross-family smoke lost its deepseek seat silently).
    const text = await response.text().catch(() => '');
    return { parsed: null, family, costUsd: 0, error: `HTTP ${response.status}: ${text.slice(0, 140)}` };
  }
  const data = await response.json();
  const parsed = parseJudgeResponse(data?.choices?.[0]?.message?.content || '');
  const cost = estimateUsageCost({ provider: family, modelId: model, usage: data?.usage });
  // deepseek-v4 has no canonical pricing row yet — fall back to chat-tier rates.
  const fallback =
    family === 'deepseek' && !cost
      ? ((data?.usage?.prompt_tokens ?? 0) * 0.27 + (data?.usage?.completion_tokens ?? 0) * 1.1) / 1e6
      : 0;
  return { parsed, family, costUsd: cost?.costUsd ?? fallback };
}

function artifactScores(parsed) {
  return parsed?.scores?.artifacts ?? parsed?.artifacts ?? [];
}

export async function judgePackage(packageDir, { title = 'this course', lessonCount = 15, seats = 2 } = {}) {
  const pkg = await extractPackage(createFsFileProvider(packageDir));
  const artifacts = sampleJudgeArtifacts(pkg.files, lessonCount);
  if (artifacts.length === 0) throw new Error('no sampleable artifacts');
  const prompt = buildJudgePrompt({ id: 'trellis', title }, artifacts);
  const apiKey = await loadApiKey(undefined, 'openai');
  const dsKey = await loadApiKey(undefined, 'deepseek').catch(() => '');

  // Panel: `seats` openai seats + (when the key exists) one deepseek
  // cross-family seat. Disclosed per family in the output.
  const calls = Array.from({ length: seats }, () => judgeOnce(prompt, apiKey, 'openai'));
  if (dsKey) calls.push(judgeOnce(prompt, dsKey, 'deepseek'));
  const results = await Promise.all(calls);
  const spendUsd = results.reduce((sum, r) => sum + r.costUsd, 0);

  const perArtifact = artifacts.map((artifact, index) => {
    const scores = results.map((r) => artifactScores(r.parsed)[index]?.score).filter((s) => typeof s === 'number');
    return {
      name: artifact.name,
      mean: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null,
      range: scores.length ? [Math.min(...scores), Math.max(...scores)] : null,
      seats: scores,
    };
  });
  const overalls = results
    .map((r) => r.parsed?.overall ?? r.parsed?.scores?.overall)
    .filter((s) => typeof s === 'number');
  const perFamily = {};
  for (const family of new Set(results.map((r) => r.family))) {
    const overallScores = results
      .filter((r) => r.family === family)
      .map((r) => r.parsed?.overall ?? r.parsed?.scores?.overall)
      .filter((s) => typeof s === 'number');
    perFamily[family] = overallScores;
  }
  const seatErrors = results.filter((r) => r.error).map((r) => `${r.family}: ${r.error}`);
  return {
    seats: results.length,
    families: perFamily,
    ...(seatErrors.length > 0 ? { seatErrors } : {}),
    model: `${JUDGE_MODEL} + ${results.some((r) => r.family === 'deepseek') ? 'deepseek-v4 cross-family seat' : 'NO cross-family seat (deepseek key missing)'}`,
    overall: {
      mean: overalls.length ? Math.round((overalls.reduce((a, b) => a + b, 0) / overalls.length) * 100) / 100 : null,
      range: overalls.length ? [Math.min(...overalls), Math.max(...overalls)] : null,
      seats: overalls,
    },
    artifacts: perArtifact,
    notes: results.map((r) => artifactScores(r.parsed).map((a) => a?.notes?.slice(0, 220) ?? '')),
    spendUsd,
  };
}

// CLI — guarded so importing this module never runs it (the profBridge
// lesson). vite-node strips the script path from argv, so the guard is
// content-based: argv[2] must be an existing package directory.
import { existsSync, statSync } from 'node:fs';
const packageDirArg = process.argv[2];
if (packageDirArg && existsSync(packageDirArg) && statSync(packageDirArg).isDirectory()) {
  const result = await judgePackage(packageDirArg, {
    title: process.argv[3] ?? 'this course',
    lessonCount: Number(process.argv[4] ?? 15),
    seats: Number(process.argv[5] ?? 2),
  });
  console.log(JSON.stringify(result, null, 2));
}
