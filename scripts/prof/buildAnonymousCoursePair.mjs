#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

const leftPath = argValue('--left');
const rightPath = argValue('--right');
const outDir = argValue('--out');
if (!leftPath || !rightPath || !outDir) {
  throw new Error('Usage: --left <twin.json> --right <twin.json> --out <directory>');
}

const selectedLessons = new Set([3, 12]);
const selectedFeatures = new Set([
  'syllabus',
  'lessonPlans',
  'slideDecks',
  'assignments',
  'rubrics',
  'discussions',
  'quizBank',
  'studyGuides',
]);

function loadTwin(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function selectedFiles(twin) {
  return (twin.files || []).filter((file) => {
    if (!selectedFeatures.has(file.featureId)) return false;
    if (file.featureId === 'syllabus') return true;
    return selectedLessons.has(Number(file.lessonNumber));
  });
}

function normalizedArtifactLabel(file, index) {
  const lesson = Number(file.lessonNumber) > 0 ? ` · lesson ${file.lessonNumber}` : '';
  return `${file.featureId || 'package'}${lesson} · artifact ${index + 1}`;
}

function renderCandidate(label, twin) {
  const files = selectedFiles(twin);
  const sections = files.map(
    (file, index) => `### ${normalizedArtifactLabel(file, index)}\n\n${String(file.text || '').trim()}\n`,
  );
  return `## Candidate ${label}\n\n${sections.join('\n')}`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function renderPacket(candidateA, candidateB) {
  return [
    '# Anonymous course-package comparison',
    '',
    'Evaluate only the two candidates below. They were compiled for the same course request and include the same representative artifact types and lessons. Provider, model, cost, and internal scores are intentionally absent.',
    '',
    renderCandidate('A', candidateA),
    renderCandidate('B', candidateB),
  ].join('\n');
}

const left = loadTwin(leftPath);
const right = loadTwin(rightPath);
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(path.join(outDir, 'judge-a-b'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'judge-b-a'), { recursive: true });

const packetAB = renderPacket(left, right);
const packetBA = renderPacket(right, left);
fs.writeFileSync(path.join(outDir, 'judge-a-b', 'packet.md'), packetAB);
fs.writeFileSync(path.join(outDir, 'judge-b-a', 'packet.md'), packetBA);
fs.writeFileSync(
  path.join(outDir, 'mapping.json'),
  `${JSON.stringify(
    {
      protocol: 'anonymous-order-reversed-v1',
      selectedLessons: [...selectedLessons],
      selectedFeatures: [...selectedFeatures],
      packetAB: { A: leftPath, B: rightPath, sha256: sha256(packetAB) },
      packetBA: { A: rightPath, B: leftPath, sha256: sha256(packetBA) },
    },
    null,
    2,
  )}\n`,
);

console.log(`[anonymous-pair] ${selectedFiles(left).length} + ${selectedFiles(right).length} artifacts → ${outDir}`);
