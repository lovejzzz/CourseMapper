#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DEFAULT_MANIFEST = 'evaluation/model-comparison/gpt54mini-scion-algi-v1.json';

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    manifest: DEFAULT_MANIFEST,
    algiRound: '',
    scionRound: '',
    output: 'verification-output/model-comparison/gpt54mini-scion-algi-v1/blind-review',
    keyOutput: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index + 1];
    if (argv[index] === '--manifest') options.manifest = value || options.manifest;
    else if (argv[index] === '--algi-round') options.algiRound = value || '';
    else if (argv[index] === '--scion-round') options.scionRound = value || '';
    else if (argv[index] === '--output') options.output = value || options.output;
    else if (argv[index] === '--key-output') options.keyOutput = value || '';
  }
  return options;
}

function stableArmOrder(courseId) {
  const byte = crypto.createHash('sha256').update(courseId).digest()[0];
  return byte % 2 === 0 ? ['algi', 'scion'] : ['scion', 'algi'];
}

function boundedText(value, maximum) {
  const normalized = String(value || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (normalized.length <= maximum) return normalized;
  const boundary = normalized.lastIndexOf('\n', maximum);
  return `${normalized.slice(0, boundary > maximum * 0.75 ? boundary : maximum).trim()}\n[excerpt ends]`;
}

async function firstMatchingFile(directory, prefix) {
  const entries = await fs.readdir(directory);
  const match = entries.filter((entry) => entry.startsWith(prefix) && entry.endsWith('.docx')).sort()[0];
  if (!match) throw new Error(`No ${prefix}*.docx in ${directory}`);
  return path.join(directory, match);
}

function docxText(filePath, maximum) {
  return boundedText(
    execFileSync('/usr/bin/textutil', ['-convert', 'txt', '-stdout', filePath], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    }),
    maximum,
  );
}

async function armExcerpt(roundPath, courseId) {
  const root = path.join(roundPath, `${courseId}--public`, 'extracted');
  const lessonPlan = await firstMatchingFile(path.join(root, 'Lesson Plans'), 'Lesson 01');
  const quiz = await firstMatchingFile(path.join(root, 'Quiz & Exam Bank'), 'Lesson 03');
  return {
    lessonPlanLesson1: docxText(lessonPlan, 7_500),
    quizBankLesson3: docxText(quiz, 5_500),
  };
}

export async function buildBlindReviewPacket({
  root = process.cwd(),
  manifestPath = DEFAULT_MANIFEST,
  algiRound,
  scionRound,
} = {}) {
  const manifest = JSON.parse(await fs.readFile(path.resolve(root, manifestPath), 'utf8'));
  const packet = {
    protocol: 'course-route-blind-review-v1',
    benchmarkId: manifest.id,
    claimBoundary:
      'This is a model-assisted blind review, not expert or human validation. Route labels are withheld from the judge.',
    rubric: {
      factualAndSourceGrounding: 'Are factual claims concrete, bounded, and visibly tied to usable sources?',
      languageQuality: 'Is the prose grammatical, natural, precise, and free of template residue?',
      instructionalUsability: 'Could an instructor use the activities and assessments with limited revision?',
      promptFidelity: 'Does the material honor the exact course topic and stated constraints?',
      scale: 'Score each dimension from 1 (unusable) to 10 (excellent).',
    },
    cases: [],
  };
  const key = {
    protocol: 'course-route-blind-review-key-v1',
    benchmarkId: manifest.id,
    cases: [],
  };

  for (const course of manifest.courses) {
    const order = stableArmOrder(course.id);
    const source = {
      algi: await armExcerpt(path.resolve(root, algiRound), course.id),
      scion: await armExcerpt(path.resolve(root, scionRound), course.id),
    };
    packet.cases.push({
      id: course.id,
      domain: course.domain,
      prompt: course.prompt,
      candidateA: source[order[0]],
      candidateB: source[order[1]],
    });
    key.cases.push({
      id: course.id,
      candidateA: order[0],
      candidateB: order[1],
    });
  }
  return { packet, key };
}

async function main() {
  const options = parseArgs();
  if (!options.algiRound || !options.scionRound) {
    throw new Error('--algi-round and --scion-round are required');
  }
  const outputRoot = path.resolve(options.output);
  const keyPath = path.resolve(
    options.keyOutput ||
      path.join(
        process.env.HOME || process.cwd(),
        '.codex/scion-secrets/CourseMapper/gpt54mini-scion-algi-v1.key.json',
      ),
  );
  const { packet, key } = await buildBlindReviewPacket({
    manifestPath: options.manifest,
    algiRound: options.algiRound,
    scionRound: options.scionRound,
  });
  await fs.mkdir(outputRoot, { recursive: true });
  await fs.mkdir(path.dirname(keyPath), { recursive: true });
  await fs.writeFile(path.join(outputRoot, 'packet.json'), `${JSON.stringify(packet, null, 2)}\n`);
  await fs.writeFile(keyPath, `${JSON.stringify(key, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(
    `${JSON.stringify({ packet: path.join(outputRoot, 'packet.json'), key: keyPath, cases: packet.cases.length })}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
