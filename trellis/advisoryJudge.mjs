// Advisory judge for a Trellis package — the crucible's judge verbatim
// (same sampling, same prompt builder, same model), borrowed by import so
// the score is comparable to crucible --judge output. ADVISORY: single
// seat, single run, never a gate; the paired protocols remain the ruler.

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

const packageDir = process.argv[2];
const title = process.argv[3] ?? 'this course';
const lessonCount = Number(process.argv[4] ?? 15);

const pkg = await extractPackage(createFsFileProvider(packageDir));
const artifacts = sampleJudgeArtifacts(pkg.files, lessonCount);
if (artifacts.length === 0) {
  console.log('no sampleable artifacts');
  process.exit(1);
}
const prompt = buildJudgePrompt({ id: 'trellis', title }, artifacts);
const apiKey = await loadApiKey(undefined, 'openai');
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
console.log(
  JSON.stringify({ judge: parsed, spendUsd: cost?.costUsd ?? null, artifacts: artifacts.map((a) => a.name) }, null, 2),
);
