/**
 * scripts/prof/personaEngine.mjs — persona cards → prompts → structured
 * verdicts (design doc §6). The Artifact Bridge rule is enforced at this
 * boundary: personas receive extracted export TEXT slices, never internal
 * JSON. Verdicts are validated against the adoption schema; one retry on
 * invalid structure; findings then pass through the ledger's
 * quote-or-discard screen.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callModel, parseModelJson } from './modelClient.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export const ADOPTION_TIER_IDS = [
  'blocked',
  'export-safe',
  'structured-complete',
  'classroom-ready-draft',
  'adoption-ready',
  'university-proofed',
];

export const REJECTION_TAXONOMY = [
  'templated-prose',
  'discipline-mismatch',
  'workload-unrealistic',
  'assessment-invalid',
  'alignment-broken',
  'factually-wrong',
  'instructions-ambiguous',
  'accessibility-gap',
  'other',
];

export async function loadPersona(personaId) {
  const raw = await fs.readFile(path.join(moduleDir, 'personas', `${personaId}.json`), 'utf8');
  return JSON.parse(raw);
}

export async function loadAllPersonas() {
  const dir = path.join(moduleDir, 'personas');
  const names = (await fs.readdir(dir)).filter((name) => name.endsWith('.json'));
  return Promise.all(names.map((name) => fs.readFile(path.join(dir, name), 'utf8').then(JSON.parse)));
}

function personaSystemPrompt(persona) {
  return [
    `You are a real university instructor evaluating a course package for adoption. You are not an assistant; you are a busy professional with your own standards, and you are free to reject the package.`,
    `Profile: ${persona.archetype}, ${persona.discipline}, ${persona.institution}, ${persona.experienceYears} years teaching. Tech comfort: ${persona.techComfort}.`,
    `Your standards: ${persona.standards}`,
    `Your pet peeves: ${persona.petPeeves.join('; ')}.`,
    `Your voice: ${persona.voice}.`,
    `You have ${persona.timeBudgetMinutes} minutes; review the way YOU would — skim what you'd skim, dig where you'd dig.`,
    `HARD RULE: every finding must include a VERBATIM quote copied exactly from the provided documents. Findings without an exact quote are discarded unread. Never paraphrase inside the quote field.`,
  ].join('\n');
}

function verdictInstruction() {
  // The teach-as-is scale is behaviorally ANCHORED (instrument calibration:
  // the first N=9 run bottom-compressed — every harsh persona floored both
  // calibration fixtures at 1, destroying discrimination). Anchors define
  // scale points by the work required, not by mood.
  return `Return ONLY a JSON object:
{
  "tier": one of ${JSON.stringify(ADOPTION_TIER_IDS)},
  "teachAsIs": integer 1-10 anchored as follows —
    1: actively harmful or empty; adopting it would damage the course,
    2: generic filler; nothing here is specific enough to salvage,
    3: a few salvageable pieces, but I would rebuild most of it,
    4: usable skeleton; I would rewrite most student-facing prose,
    5: teachable after a full weekend of edits,
    6: teachable after several evenings of targeted edits,
    7: teachable with light edits in the weak spots,
    8: minor polish only,
    9: I would teach it as-is and adjust live,
    10: better than what I would have written,
  "summary": "2-3 sentences in your own voice",
  "minimumEdits": ["what I would HAVE to change before week 1", ...] (empty array if none),
  "findings": [
    {
      "taxonomy": one of ${JSON.stringify(REJECTION_TAXONOMY)},
      "severity": "P0" | "P1" | "P2",
      "file": "which document (as labeled in the materials)",
      "quote": "EXACT text copied verbatim from the document",
      "objection": "why this matters to you, one sentence"
    }, ...
  ]
}`;
}

/** Assemble the reading packet per the universe's reading order. */
export function buildReadingPacket({ extracted, readingOrder, hotSpot, charBudget = 60_000 }) {
  const files = extracted.files || [];
  const byFeature = (featureId) => files.filter((file) => file.featureId === featureId);
  const firstOf = (featureId, count = 1) => byFeature(featureId).slice(0, count);

  const openers = {
    'syllabus-first': [...firstOf('syllabus'), ...firstOf('lessonPlans'), ...firstOf('slideDecks')],
    'exam-first': [...byFeature('quizBank').slice(-1), ...firstOf('quizBank'), ...firstOf('syllabus')],
    'lesson-plan-first': [...firstOf('lessonPlans', 2), ...firstOf('syllabus')],
  };
  const hotSpotFiles = (hotSpot || []).flatMap((featureId) => firstOf(featureId, 2));
  const ordered = [...(openers[readingOrder] || openers['syllabus-first']), ...hotSpotFiles];
  const seen = new Set();
  const packet = [];
  let used = 0;
  for (const file of ordered) {
    if (!file || seen.has(file.path)) continue;
    seen.add(file.path);
    const text = String(file.text || '');
    const slice = text.slice(0, Math.max(0, Math.min(text.length, charBudget - used)));
    if (slice.length < 200) continue;
    packet.push({ path: file.path, text: slice });
    used += slice.length;
    if (used >= charBudget) break;
  }
  return packet;
}

/**
 * One adoption review: persona reads the packet (+ workload account) and
 * returns a validated verdict. Invalid structure gets one repair retry.
 */
export async function runAdoptionReview({ persona, packet, workloadAccount, model, temperature, meter, courseBrief }) {
  const system = personaSystemPrompt(persona);
  const documents = packet.map((file) => `===== DOCUMENT: ${file.path} =====\n${file.text}`).join('\n\n');
  const workloadNote = workloadAccount
    ? `\n\nWORKLOAD ACCOUNT (computed, deterministic): expected ${workloadAccount.expectedWeeklyHours}h/week (${workloadAccount.expectedSource}); mean ratio ${workloadAccount.meanRatio}; overloaded lessons: ${
        workloadAccount.overloadedWeeks.join(', ') || 'none'
      }.`
    : '';
  const user = `You asked an AI course tool to build this course: "${courseBrief}"\n\nHere is the package it produced (extracted from the exported files):\n\n${documents}${workloadNote}\n\n${verdictInstruction()}`;

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await callModel({
      model,
      system,
      user:
        attempt === 0
          ? user
          : `${user}\n\nYour previous reply was not valid JSON matching the schema (${lastError}). Return ONLY the JSON object.`,
      maxTokens: 3500,
      temperature,
      meter,
      role: `adoption:${persona.id}`,
    });
    try {
      const verdict = parseModelJson(response.text);
      validateVerdict(verdict);
      return { verdict, usage: response.usage, costUsd: response.costUsd, model: response.model };
    } catch (error) {
      lastError = error.message;
    }
  }
  throw new Error(`Persona ${persona.id} failed to produce a valid verdict: ${lastError}`);
}

export function validateVerdict(verdict) {
  if (!ADOPTION_TIER_IDS.includes(verdict?.tier)) throw new Error(`invalid tier: ${verdict?.tier}`);
  if (!Number.isInteger(verdict?.teachAsIs) || verdict.teachAsIs < 1 || verdict.teachAsIs > 10) {
    throw new Error(`invalid teachAsIs: ${verdict?.teachAsIs}`);
  }
  if (typeof verdict?.summary !== 'string' || !verdict.summary.trim()) throw new Error('missing summary');
  if (!Array.isArray(verdict?.minimumEdits)) throw new Error('minimumEdits must be an array');
  if (!Array.isArray(verdict?.findings)) throw new Error('findings must be an array');
  for (const finding of verdict.findings) {
    if (!REJECTION_TAXONOMY.includes(finding?.taxonomy)) throw new Error(`invalid taxonomy: ${finding?.taxonomy}`);
    if (!['P0', 'P1', 'P2'].includes(finding?.severity)) throw new Error(`invalid severity: ${finding?.severity}`);
    if (typeof finding?.quote !== 'string') throw new Error('finding missing quote');
    if (typeof finding?.objection !== 'string' || !finding.objection.trim())
      throw new Error('finding missing objection');
  }
}
