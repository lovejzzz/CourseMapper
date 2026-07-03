#!/usr/bin/env node
// The human blind-review packet (item 7b) — the verdict the constitution
// actually accepts. Assembles matched artifact sets from both pipelines for
// the SAME course, anonymized as Package A / Package B (assignment
// randomized at build time, sealed in base64 so nobody reads it by
// accident), plus reviewer instructions modeled on the Reality Anchor
// template's questions. Humans complete it; nothing here claims their
// verdict in advance.
//
//   npx vite-node trellis/humanPacket.mjs <currentExtractedDir> <trellisPackageDir> <outDir>

import { writeFile, mkdir, readdir, copyFile } from 'node:fs/promises';
import { join, basename } from 'node:path';

const [currentDir, trellisDir, outDir = 'verification-output/trellis/human-blind-packet'] = process.argv.slice(2);
if (!currentDir || !trellisDir) {
  console.error('usage: humanPacket.mjs <currentExtractedDir> <trellisPackageDir> [outDir]');
  process.exit(1);
}

const WANTED = [
  { folder: 'Syllabus', pick: /syllabus/i },
  { folder: 'Lesson Plans', pick: /lesson 07/i },
  { folder: 'Quiz & Exam Bank', pick: /lesson 07/i },
  { folder: 'Study Guides', pick: /lesson 07/i },
  { folder: 'Course FAQ', pick: /faq/i },
];

async function collect(sourceDir, destDir) {
  await mkdir(destDir, { recursive: true });
  const copied = [];
  for (const want of WANTED) {
    const folder = join(sourceDir, want.folder);
    const names = await readdir(folder).catch(() => []);
    const match = names.find((n) => want.pick.test(n)) ?? names[0];
    if (!match) continue;
    const dest = join(destDir, `${want.folder.replace(/[^A-Za-z]+/g, '-')}${match.slice(match.lastIndexOf('.'))}`);
    await copyFile(join(folder, match), dest);
    copied.push(basename(dest));
  }
  return copied;
}

const flip = Math.random() < 0.5;
const a = flip ? { label: 'current-pipeline', dir: currentDir } : { label: 'trellis', dir: trellisDir };
const b = flip ? { label: 'trellis', dir: trellisDir } : { label: 'current-pipeline', dir: currentDir };

const copiedA = await collect(a.dir, join(outDir, 'package-A'));
const copiedB = await collect(b.dir, join(outDir, 'package-B'));

await writeFile(
  join(outDir, 'README.md'),
  [
    '# Blind review — two course packages, one course',
    '',
    'You are looking at teaching materials for the same course produced two',
    'different ways. You do not know which is which, and please do not try to',
    'guess — judge only what you would teach from.',
    '',
    '**Time: ~30 minutes.** Read the matching files in `package-A/` and',
    '`package-B/` (syllabus, one lesson plan, its quiz, its study guide, the',
    'course FAQ). Then answer, for EACH package:',
    '',
    '1. Teach-as-is (1–10): could you walk into class with this, unmodified?',
    '   (5 = teachable after a full weekend of edits; 7 = light edits.)',
    '2. Would you adopt it as your starting point next term? (yes / no)',
    '3. Your top 3 objections, quoting the line that bothered you.',
    '4. One thing it does better than the other package.',
    '',
    'Return your answers in `RESPONSE.md` (template below). The assignment',
    'key is sealed in `sealed-key.b64` — decode it only after both reviewers',
    'have submitted.',
    '',
    '## RESPONSE.md template',
    '```',
    'Reviewer: <initials>  Discipline familiarity: <none/some/expert>',
    'Package A — teach-as-is: _/10 · adopt: yes/no',
    '  objections: 1) … 2) … 3) …',
    '  does better: …',
    'Package B — teach-as-is: _/10 · adopt: yes/no',
    '  objections: 1) … 2) … 3) …',
    '  does better: …',
    '```',
  ].join('\n'),
);
await writeFile(
  join(outDir, 'sealed-key.b64'),
  Buffer.from(JSON.stringify({ A: a.label, B: b.label, aSource: a.dir, bSource: b.dir })).toString('base64'),
);
console.log(`packet at ${outDir}: A=${copiedA.length} files, B=${copiedB.length} files (assignment sealed)`);
