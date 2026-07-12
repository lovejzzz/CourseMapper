#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DEFAULT_MANIFEST = 'evaluation/scion-factual-canaries.json';
const DEFAULT_OUTPUT = 'verification-output/scion-factual-canaries';

function rotateOptions(options, answerIndex, rotation) {
  const values = [...options];
  const offset = rotation % values.length;
  return {
    options: [...values.slice(offset), ...values.slice(0, offset)],
    answerIndex: (Number(answerIndex) - offset + values.length) % values.length,
  };
}

function kernelsFromShard(shard) {
  return Array.isArray(shard?.kernels) ? shard.kernels : Object.values(shard?.kernels || {});
}

function resolveCase(definition, domain, shard, ordinal) {
  const kernel = kernelsFromShard(shard).find((entry) => entry?.id === definition.kernelId);
  if (!kernel) throw new Error(`Missing kernel ${definition.kernelId} for ${domain.id}.`);
  const bankItem = Number.isInteger(definition.mcIndex) ? kernel.mcBank?.[definition.mcIndex] : null;
  const stem = String(definition.stem || bankItem?.stem || '').trim();
  const options = definition.options || bankItem?.options;
  const answerIndex = Number.isInteger(definition.answerIndex) ? definition.answerIndex : bankItem?.answerIndex;
  const factIndex = Number.isInteger(definition.factIndex)
    ? definition.factIndex
    : Number.isInteger(bankItem?.explanationFactRef)
      ? bankItem.explanationFactRef
      : 0;
  const fact = kernel.facts?.[factIndex];
  const anchor = fact?.anchor || kernel.definition?.anchor;
  if (!stem || !Array.isArray(options) || options.length !== 4 || !Number.isInteger(answerIndex)) {
    throw new Error(`Malformed canary ${domain.id}/${definition.kernelId}.`);
  }
  if (!fact?.text || !anchor?.src || !anchor?.quote) {
    throw new Error(`Canary ${domain.id}/${definition.kernelId} lacks an anchored supporting fact.`);
  }
  const rotated = rotateOptions(options, answerIndex, ordinal % 4);
  const worked = kernel.workedExamples?.[0];
  const supportContext = [
    kernel.definition?.text,
    fact.text,
    kernel.examples?.[0]?.text,
    worked?.problem,
    ...(Array.isArray(worked?.steps) ? worked.steps : []),
    worked?.result,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return {
    id: `${domain.id}:${definition.kernelId}:${definition.mcIndex ?? `fact-${factIndex}`}`,
    domain: domain.id,
    kernelId: definition.kernelId,
    question: stem,
    options: rotated.options,
    answerIndex: rotated.answerIndex,
    support: {
      fact: fact.text,
      source: anchor.src,
      location: anchor.loc || '',
      quote: anchor.quote,
      context: supportContext,
    },
  };
}

export function buildFactualCanaries(manifest, shardsByPath) {
  const cases = [];
  for (const domain of manifest.domains || []) {
    const shard = shardsByPath[domain.shard];
    if (!shard) throw new Error(`Missing factual-canary shard ${domain.shard}.`);
    for (const definition of domain.cases || []) {
      cases.push(resolveCase(definition, domain, shard, cases.length));
    }
  }
  const domainCounts = Object.fromEntries(
    (manifest.domains || []).map((domain) => [domain.id, cases.filter((entry) => entry.domain === domain.id).length]),
  );
  if (Object.values(domainCounts).some((count) => count !== 5)) {
    throw new Error('Every factual-canary domain must contain exactly five cases.');
  }
  return {
    version: manifest.version,
    minimumPassingShare: Number(manifest.minimumPassingShare ?? 1),
    claimBoundary: manifest.claimBoundary,
    recordedRuns: Array.isArray(manifest.recordedRuns) ? manifest.recordedRuns : [],
    cases,
    domainCounts,
  };
}

export function scoreFactualCanaries(packet, answers, { label = 'candidate', mode = 'cold' } = {}) {
  const normalized = Array.isArray(answers) ? answers.map(Number) : [];
  const validShape =
    normalized.length === packet.cases.length && normalized.every((answer) => Number.isInteger(answer));
  const records = packet.cases.map((entry, index) => ({
    id: entry.id,
    domain: entry.domain,
    expected: entry.answerIndex,
    actual: normalized[index],
    correct: normalized[index] === entry.answerIndex,
  }));
  const domains = [...new Set(packet.cases.map((entry) => entry.domain))];
  const byDomain = Object.fromEntries(
    domains.map((domain) => {
      const rows = records.filter((entry) => entry.domain === domain);
      const correct = rows.filter((entry) => entry.correct).length;
      return [domain, { correct, total: rows.length, share: rows.length > 0 ? correct / rows.length : 0 }];
    }),
  );
  const correct = records.filter((entry) => entry.correct).length;
  const share = records.length > 0 ? correct / records.length : 0;
  const passed =
    validShape && share >= packet.minimumPassingShare && Object.values(byDomain).every((row) => row.share === 1);
  return {
    label,
    mode,
    status: passed ? 'passed' : 'failed',
    validShape,
    correct,
    total: records.length,
    share,
    byDomain,
    records,
    claimBoundary: packet.claimBoundary,
  };
}

export async function loadFactualCanaryPacket(manifestPath = DEFAULT_MANIFEST) {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const shardPaths = [...new Set((manifest.domains || []).map((domain) => domain.shard))];
  const shards = Object.fromEntries(
    await Promise.all(
      shardPaths.map(async (shardPath) => [shardPath, JSON.parse(await fs.readFile(shardPath, 'utf8'))]),
    ),
  );
  return buildFactualCanaries(manifest, shards);
}

function responseSchema(cases) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      answers: {
        type: 'array',
        items:
          cases.length === 1
            ? { type: 'string', enum: cases[0].options }
            : { type: 'string', minLength: 1, maxLength: 200 },
        minItems: cases.length,
        maxItems: cases.length,
      },
    },
    required: ['answers'],
  };
}

export async function queryFactualCanaryEndpoint(
  packet,
  { endpoint, model, apiKey = '', batchSize = 5, grounded = false },
) {
  const base = String(endpoint || '').replace(/\/$/, '');
  const url = /\/chat\/completions$/.test(base) ? base : `${base}${base.endsWith('/v1') ? '' : '/v1'}/chat/completions`;
  const answers = [];
  const rawAnswers = [];
  const size = Math.max(1, Math.min(25, Number(batchSize) || 5));
  for (let start = 0; start < packet.cases.length; start += size) {
    const chunk = packet.cases.slice(start, start + size);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: grounded
              ? 'Answer each multiple-choice question independently using its supplied verified context. Copy the exact text of the best option into the answers array in question order. Check every option against the context; return no labels, indices, or explanations.'
              : 'Answer each multiple-choice question independently. Copy the exact text of the best option into the answers array in question order. Check the meaning of every option; return no labels, indices, or explanations.',
          },
          {
            role: 'user',
            content: JSON.stringify(
              chunk.map(({ question, options, support }) => ({
                ...(grounded ? { verifiedContext: support.context } : {}),
                question,
                options,
              })),
            ),
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'factual_canary_answers', strict: true, schema: responseSchema(chunk) },
        },
        max_completion_tokens: Math.max(200, chunk.length * 40),
      }),
    });
    if (!response.ok) {
      throw new Error(`Factual canary endpoint returned HTTP ${response.status}: ${await response.text()}`);
    }
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    const parsed = typeof content === 'string' ? JSON.parse(content) : content;
    if (!Array.isArray(parsed?.answers) || parsed.answers.length !== chunk.length) {
      throw new Error(`Factual canary batch ${start / size + 1} returned a malformed answer vector.`);
    }
    rawAnswers.push(...parsed.answers);
    answers.push(
      ...parsed.answers.map((answer, answerIndex) => {
        const normalize = (value) =>
          String(value || '')
            .normalize('NFKC')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
        const value = normalize(answer);
        return chunk[answerIndex].options.findIndex((option) => normalize(option) === value);
      }),
    );
  }
  return { answers, rawAnswers };
}

function renderMarkdown(packet, report, recordedReports = []) {
  const domainRows = report
    ? Object.entries(report.byDomain).map(
        ([domain, row]) => `| ${domain} | ${row.correct}/${row.total} | ${(row.share * 100).toFixed(1)}% |`,
      )
    : Object.entries(packet.domainCounts).map(([domain, count]) => `| ${domain} | ${count} | ready |`);
  return [
    '# Scion factual canaries',
    '',
    report ? `Status: ${report.status}` : 'Status: ready for a model run',
    report ? `Mode: ${report.mode}` : 'Modes: cold or source-grounded',
    report
      ? `Score: ${report.correct}/${report.total} (${(report.share * 100).toFixed(1)}%)`
      : `Cases: ${packet.cases.length}`,
    '',
    `> ${packet.claimBoundary}`,
    '',
    report ? '| Domain | Correct | Share |' : '| Domain | Cases | Status |',
    '| --- | ---: | ---: |',
    ...domainRows,
    '',
    ...(report
      ? report.records
          .filter((row) => !row.correct)
          .map((row) => `- MISS ${row.id}: expected ${row.expected}, received ${String(row.actual)}`)
      : ['- Run with `--endpoint` and `--model`, or score saved `--responses`, to produce a factual result.']),
    '',
    ...(recordedReports.length > 0
      ? [
          '## Recorded local comparisons',
          '',
          '| Run | Mode | Score | Status |',
          '| --- | --- | ---: | --- |',
          ...recordedReports.map(
            (entry) => `| ${entry.label} | ${entry.mode} | ${entry.correct}/${entry.total} | ${entry.status} |`,
          ),
        ]
      : []),
    '',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    manifestPath: DEFAULT_MANIFEST,
    outputDir: DEFAULT_OUTPUT,
    endpoint: '',
    model: '',
    label: 'candidate',
    responses: '',
    apiKeyEnv: 'OPENAI_API_KEY',
    batchSize: 5,
    grounded: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--manifest') args.manifestPath = argv[++index] || args.manifestPath;
    else if (argv[index] === '--output') args.outputDir = argv[++index] || args.outputDir;
    else if (argv[index] === '--endpoint') args.endpoint = argv[++index] || '';
    else if (argv[index] === '--model') args.model = argv[++index] || '';
    else if (argv[index] === '--label') args.label = argv[++index] || args.label;
    else if (argv[index] === '--responses') args.responses = argv[++index] || '';
    else if (argv[index] === '--api-key-env') args.apiKeyEnv = argv[++index] || args.apiKeyEnv;
    else if (argv[index] === '--batch-size') args.batchSize = Number(argv[++index]) || args.batchSize;
    else if (argv[index] === '--grounded') args.grounded = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const packet = await loadFactualCanaryPacket(args.manifestPath);
  let answers = null;
  let rawAnswers = null;
  if (args.responses) {
    const saved = JSON.parse(await fs.readFile(args.responses, 'utf8'));
    answers = saved.answers || saved;
  } else if (args.endpoint && args.model) {
    const live = await queryFactualCanaryEndpoint(packet, {
      endpoint: args.endpoint,
      model: args.model,
      apiKey: process.env[args.apiKeyEnv] || '',
      batchSize: args.batchSize,
      grounded: args.grounded,
    });
    answers = live.answers;
    rawAnswers = live.rawAnswers;
  }
  const report = answers
    ? scoreFactualCanaries(packet, answers, { label: args.label, mode: args.grounded ? 'source-grounded' : 'cold' })
    : null;
  const recordedReports = packet.recordedRuns.map((run) => {
    const recorded = scoreFactualCanaries(packet, run.answers, { label: run.id, mode: run.mode });
    if (recorded.correct !== run.expectedCorrect) {
      throw new Error(
        `Recorded factual result ${run.id} drifted: expected ${run.expectedCorrect}, scored ${recorded.correct}.`,
      );
    }
    return { ...recorded, model: run.model, protocol: run.protocol, artifactStatus: run.artifactStatus };
  });
  const outputDir = path.join(args.outputDir, args.label.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase());
  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(outputDir, 'packet.json'), `${JSON.stringify(packet, null, 2)}\n`),
    fs.writeFile(path.join(outputDir, 'latest.md'), `${renderMarkdown(packet, report, recordedReports)}\n`),
    fs.writeFile(path.join(outputDir, 'recorded-comparison.json'), `${JSON.stringify(recordedReports, null, 2)}\n`),
    ...(report
      ? [
          fs.writeFile(path.join(outputDir, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`),
          fs.writeFile(
            path.join(outputDir, 'answers.json'),
            `${JSON.stringify({ answers, ...(rawAnswers ? { rawAnswers } : {}) }, null, 2)}\n`,
          ),
        ]
      : []),
  ]);
  if (report) {
    console.log(`Scion factual canaries (${report.label}): ${report.correct}/${report.total} — ${report.status}`);
    console.log(`Report: ${path.join(outputDir, 'latest.md')}`);
    if (report.status !== 'passed') process.exitCode = 1;
  } else {
    console.log(`Scion factual canaries: ${packet.cases.length} source-anchored cases ready`);
    for (const recorded of recordedReports) {
      console.log(`${recorded.label} (${recorded.mode}): ${recorded.correct}/${recorded.total}`);
    }
    console.log(`Packet: ${path.join(outputDir, 'packet.json')}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
