#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || '') : fallback;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function writeJson(filePath, value) {
  const absolute = path.resolve(filePath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(temporary, absolute);
}

const sessionId = arg('session');
const endpoint = arg('endpoint', 'http://127.0.0.1:4323');
const outputPath = arg('out');
const bindingPath = arg('binding-out', outputPath ? `${outputPath}.binding.json` : '');
const token = String(process.env.ROUNDTABLE_BRIDGE_TOKEN || '');
const allowParticipantIssues = process.argv.includes('--allow-participant-issues');

if (!sessionId || !outputPath || !bindingPath || !token) {
  throw new Error(
    'Usage: ROUNDTABLE_BRIDGE_TOKEN=... node scripts/captureRoundtableSession.mjs --session ID --out FILE [--binding-out FILE] [--endpoint URL]',
  );
}

const response = await fetch(`${endpoint.replace(/\/$/, '')}/sessions/${encodeURIComponent(sessionId)}`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!response.ok) throw new Error(`Roundtable session fetch failed (${response.status}).`);

const session = await response.json();
if (session?.id !== sessionId) throw new Error('Roundtable returned a different session id.');
if (session?.phase !== 'complete' || Number(session?.completedTurns) !== Number(session?.totalTurns)) {
  throw new Error(
    `Roundtable session is not complete (${session?.phase || 'unknown'}, ${session?.completedTurns || 0}/${session?.totalTurns || 0}).`,
  );
}
if (session?.failedTurn) {
  throw new Error('Roundtable session contains a failed turn.');
}
if ((session?.participantIssues || []).length > 0 && !allowParticipantIssues) {
  throw new Error(
    'Roundtable session contains participant issues. Re-run with --allow-participant-issues to capture a truthful degraded-review record that is ineligible for promotion.',
  );
}

const captured = {
  protocol: 'coursemapper-roundtable-session-snapshot-v1',
  capturedAt: new Date().toISOString(),
  session,
};
const sessionSha256 = sha256(canonicalJson(session));
const binding = {
  protocol: 'coursemapper-roundtable-session-binding-v1',
  sessionId,
  sessionSha256,
  phase: session.phase,
  completedTurns: Number(session.completedTurns),
  totalTurns: Number(session.totalTurns),
  participantIssues: session.participantIssues || [],
  participantCoverageStatus: (session.participantIssues || []).length > 0 ? 'degraded' : 'complete',
  promotionEligible: (session.participantIssues || []).length === 0,
  failedTurn: session.failedTurn || null,
  decision: String(session?.outcome?.decision || ''),
  consensus: session?.outcome?.consensus === true,
  transcriptCharacters: Number(session?.outcome?.coverage?.totalCharacters || 0),
  snapshotPath: path.basename(outputPath),
  claimBoundary:
    'This digest binds the completed Roundtable transcript, final synthesis, brief audit, and disclosed participant availability. It proves review-session identity and completion, not the correctness of participant judgments. A degraded participant roster is report evidence only and is not promotion evidence.',
};

await writeJson(outputPath, captured);
await writeJson(bindingPath, { ...binding, bindingSha256: sha256(canonicalJson(binding)) });

console.log(
  JSON.stringify({
    sessionId,
    sessionSha256,
    completedTurns: binding.completedTurns,
    totalTurns: binding.totalTurns,
    decision: binding.decision,
    snapshot: path.resolve(outputPath),
    binding: path.resolve(bindingPath),
  }),
);
