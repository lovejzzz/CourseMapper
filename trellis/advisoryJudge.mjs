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

async function judgeOnce(prompt, apiKey) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }),
  });
  const data = await response.json();
  const parsed = parseJudgeResponse(data?.choices?.[0]?.message?.content || '');
  const cost = estimateUsageCost({ provider: 'openai', modelId: JUDGE_MODEL, usage: data?.usage });
  return { parsed, costUsd: cost?.costUsd ?? 0 };
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

  const results = await Promise.all(Array.from({ length: seats }, () => judgeOnce(prompt, apiKey)));
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
  return {
    seats,
    model: `${JUDGE_MODEL} (same-family seats — cross-family key-gated)`,
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

// CLI — guarded so importing this module never runs it (the profBridge lesson).
import { pathToFileURL } from 'node:url';
const executedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executedDirectly && process.argv[2]) {
  const result = await judgePackage(process.argv[2], {
    title: process.argv[3] ?? 'this course',
    lessonCount: Number(process.argv[4] ?? 15),
    seats: Number(process.argv[5] ?? 2),
  });
  console.log(JSON.stringify(result, null, 2));
}
