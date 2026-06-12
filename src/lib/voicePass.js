/**
 * voicePass.js — v0.14.7 WS-D2: the voice pass.
 *
 * The deterministic compiler produces structurally perfect but templated
 * text (the judge's "too templated to teach as-is" 5–6/10). This module pays
 * a model to rewrite ONLY the high-read connective prose — assignment brief
 * overviews, discussion prompt framings, study-guide narrative intros —
 * grounded in the package's own data, behind a flag, with hard per-surface
 * contracts and per-item fallback to the compiled text.
 *
 * Laws:
 *  - DEFAULT OFF. The flag flip is gated on D3's live proof rounds.
 *  - Fallback, never block: a lint violation, parse failure, model error, or
 *    exhausted budget keeps the compiled text for that surface. A voice-pass
 *    failure can never produce a worse package than no voice pass.
 *  - Pure module: the model call is INJECTED (`callModel`) — no provider
 *    imports, so the contract logic tests without a network.
 *  - Provenance (D4): the run's outcome is stashed for the manifest/digest
 *    disclosure — our own rewrites get the same honesty as enrichment.
 */

// ── The flag (same channel discipline as readAuthoringMode) ────────────────
export const VOICE_PASS_STORAGE_KEY = 'coursemapper-voice-pass';

export function readVoicePassMode() {
  try {
    return localStorage.getItem(VOICE_PASS_STORAGE_KEY) === 'on' ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

export function saveVoicePassMode(mode) {
  try {
    if (mode === 'on') localStorage.setItem(VOICE_PASS_STORAGE_KEY, 'on');
    else localStorage.removeItem(VOICE_PASS_STORAGE_KEY);
  } catch {
    /* storage unavailable — the default ('off') applies */
  }
}

// ── Surface selection ───────────────────────────────────────────────────────
// EXACTLY three surface kinds (WS-D2): the high-read connective prose slots
// the compiler stamps. Field names verified against the compiled shapes:
//  - assignments → assignments[].overview        (the brief's context paragraph)
//  - discussions → discussions[].prompt          (the framing; any sentence
//    carrying "Anchor your post in" is FROZEN TEXT — voice wraps it, never
//    rewrites it)
//  - studyGuides → studyGuides[].summary         (the narrative intro)
const VOICE_SURFACE_KINDS = [
  { featureId: 'assignments', arrayKey: 'assignments', field: 'overview', slot: 'overview' },
  { featureId: 'discussions', arrayKey: 'discussions', field: 'prompt', slot: 'prompt' },
  { featureId: 'studyGuides', arrayKey: 'studyGuides', field: 'summary', slot: 'summary' },
];

export const VOICE_BATCH_SIZE = 12;
// Hard lint bounds are looser than the prompt's 60–140-word target so an
// honest short surface doesn't churn fallbacks; runaway outputs still reject.
export const VOICE_REWRITE_MIN_WORDS = 30;
export const VOICE_REWRITE_MAX_WORDS = 170;
// When callModel reports no usage, each batch is assumed to cost this much.
export const VOICE_ASSUMED_BATCH_COST_USD = 0.01;

const REGISTRY_ID_RE = /\b[AR]\d+\.\d+\b/g;
const FROZEN_LINE_MARKER = 'Anchor your post in';

// Store-shaped entries are { status, data }; compiler output is the data itself.
function isWrappedDeliverable(entry) {
  return Boolean(entry && typeof entry === 'object' && 'data' in entry && 'status' in entry);
}

function unwrapDeliverableData(entry) {
  if (!entry || typeof entry !== 'object') return null;
  return isWrappedDeliverable(entry) ? entry.data || null : entry;
}

function firstLine(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)[0];
}

function lessonGrounding(courseMap, lessonNumber) {
  const lesson = courseMap?.lessons?.[lessonNumber - 1] || null;
  const sections = Array.isArray(lesson?.sections) ? lesson.sections : [];
  const keyConcepts = [];
  const readings = [];
  let assessmentTitle = '';
  for (const section of sections) {
    if (section?.topicSection) keyConcepts.push(String(section.topicSection).trim());
    for (const objective of String(section?.learningObjectives || '').split('\n')) {
      const cleaned = objective.trim();
      if (cleaned) keyConcepts.push(cleaned);
    }
    const resource = firstLine(section?.supportingResources);
    if (resource) readings.push(resource);
    if (!assessmentTitle) assessmentTitle = firstLine(section?.weeklyAssessments) || '';
  }
  return {
    lessonTitle: lesson?.title ? String(lesson.title) : '',
    keyConcepts: keyConcepts.slice(0, 6),
    readings: readings.slice(0, 4),
    assessmentTitle,
  };
}

/**
 * Walk the compiled deliverables and return one descriptor per voiceable
 * surface. Accepts either raw compiled data ({ assignments: [...] }) or
 * store-shaped entries ({ status, data }).
 */
export function selectVoiceSurfaces({ deliverables = {}, courseMap = null } = {}) {
  const surfaces = [];
  for (const kind of VOICE_SURFACE_KINDS) {
    const data = unwrapDeliverableData(deliverables[kind.featureId]);
    const items = Array.isArray(data?.[kind.arrayKey]) ? data[kind.arrayKey] : [];
    items.forEach((item, itemIndex) => {
      const originalText = typeof item?.[kind.field] === 'string' ? item[kind.field].trim() : '';
      if (!originalText) return;
      const lessonNumber = Number.isFinite(item?.lessonNumber) ? item.lessonNumber : itemIndex + 1;
      const grounding = lessonGrounding(courseMap, lessonNumber);
      if (!grounding.lessonTitle && item?.lessonTitle) grounding.lessonTitle = String(item.lessonTitle);
      if (!grounding.lessonTitle && Array.isArray(item?.relatedLessons) && item.relatedLessons[0]) {
        grounding.lessonTitle = String(item.relatedLessons[0]);
      }
      if (kind.featureId === 'assignments' && item?.title) grounding.assessmentTitle = String(item.title);
      surfaces.push({
        surfaceId: `${kind.featureId}:lesson-${lessonNumber}:${kind.slot}`,
        featureId: kind.featureId,
        itemIndex,
        field: kind.field,
        originalText,
        grounding,
      });
    });
  }
  return surfaces;
}

// ── The batched prompt ──────────────────────────────────────────────────────
export function buildVoicePrompt(surfaces = [], courseContext = {}) {
  const batch = surfaces.slice(0, VOICE_BATCH_SIZE);
  const courseName = courseContext.courseName || 'this course';
  const semester = courseContext.semester ? ` (${courseContext.semester})` : '';
  const systemPrompt = [
    `You are the instructor of record for "${courseName}"${semester}, revising your own course materials.`,
    'You rewrite short connective paragraphs in a direct instructor voice — specific, warm, unhedged — without inventing anything.',
    'You never add facts, names, numbers, citations, or readings that are not in the supplied text or grounding.',
  ].join(' ');
  const payload = batch.map((surface) => ({
    surfaceId: surface.surfaceId,
    text: surface.originalText,
    grounding: surface.grounding,
  }));
  const userPrompt = [
    "Rewrite the text of each surface below in a direct instructor voice, grounded ONLY in that surface's own text and grounding.",
    '',
    'Hard rules for every rewrite:',
    `- Preserve VERBATIM every registry id (patterns like A1.2 or R3.1) that appears in the original text.`,
    '- Preserve VERBATIM every quoted or italicized title from the original text.',
    `- Any sentence containing "${FROZEN_LINE_MARKER}" is FROZEN TEXT: reproduce that sentence verbatim and unchanged inside your rewrite. Never reword it.`,
    '- Add NO new facts, names, numbers, citations, or readings beyond the grounding provided.',
    '- 60-140 words. Sentence case prose only — no markdown headers, no bullets.',
    '',
    'Surfaces (JSON):',
    JSON.stringify(payload, null, 2),
    '',
    'Respond with JSON only, exactly this shape:',
    '{"rewrites":[{"surfaceId":"<surfaceId>","text":"<rewritten text>"}]}',
  ].join('\n');
  return { systemPrompt, userPrompt, surfaceIds: payload.map((item) => item.surfaceId) };
}

/** Tolerant parse of the model's JSON reply. Returns rewrites array or null. */
export function parseVoiceResponse(fullText) {
  const text = String(fullText || '').replace(/```(?:json)?/gi, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(parsed?.rewrites)) return null;
    return parsed.rewrites
      .filter((rewrite) => rewrite && typeof rewrite.surfaceId === 'string' && typeof rewrite.text === 'string')
      .map((rewrite) => ({ surfaceId: rewrite.surfaceId, text: rewrite.text }));
  } catch {
    return null;
  }
}

// ── The contract lint ───────────────────────────────────────────────────────
function extractRegistryIds(text) {
  return [...new Set(String(text || '').match(REGISTRY_ID_RE) || [])];
}

function extractFrozenLines(text) {
  const matches = String(text || '').match(/[^.!?\n]*Anchor your post in[^.!?\n]*[.!?]?/g) || [];
  return matches.map((line) => line.trim()).filter(Boolean);
}

// Cheap no-new-facts proxy: capitalized multi-word sequences ("Professor
// Quantumfield", "Modern Sedimentology Quarterly") in the rewrite must
// already exist in the original text or the grounding.
function extractCapitalizedSequences(text) {
  return String(text || '').match(/\b[A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+)+\b/g) || [];
}

export function lintVoiceResult(surface, rewrittenText) {
  const originalText = String(surface?.originalText || '');
  const text = typeof rewrittenText === 'string' ? rewrittenText.trim() : '';
  if (!text) return { ok: false, reason: 'empty rewrite' };
  if (/^#{1,6}\s/m.test(text)) return { ok: false, reason: 'markdown header in rewrite' };
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount < VOICE_REWRITE_MIN_WORDS) {
    return { ok: false, reason: `rewrite too short (${wordCount} words < ${VOICE_REWRITE_MIN_WORDS})` };
  }
  if (wordCount > VOICE_REWRITE_MAX_WORDS) {
    return { ok: false, reason: `rewrite too long (${wordCount} words > ${VOICE_REWRITE_MAX_WORDS})` };
  }
  for (const registryId of extractRegistryIds(originalText)) {
    if (!text.includes(registryId)) return { ok: false, reason: `dropped registry id ${registryId}` };
  }
  for (const frozenLine of extractFrozenLines(originalText)) {
    if (!text.includes(frozenLine)) {
      return { ok: false, reason: `dropped frozen requirement line ("${FROZEN_LINE_MARKER} …")` };
    }
  }
  const corpus = `${originalText}\n${JSON.stringify(surface?.grounding || {})}`.toLowerCase();
  for (const sequence of new Set(extractCapitalizedSequences(text))) {
    if (!corpus.includes(sequence.toLowerCase())) {
      return { ok: false, reason: `new entity not in original or grounding: "${sequence}"` };
    }
  }
  return { ok: true, reason: '' };
}

// ── Application (immutable; per-item fallback) ──────────────────────────────
/**
 * results: [{ surface, text }] — pairs of surface descriptor + rewrite.
 * Returns NEW deliverable objects; never mutates inputs. Surfaces failing
 * lint (or no longer present) keep the compiled text and land in fallbacks.
 */
export function applyVoiceResults({ deliverables = {}, results = [] } = {}) {
  const next = { ...deliverables };
  const voiced = [];
  const fallbacks = [];
  for (const result of results) {
    const surface = result?.surface;
    if (!surface) continue;
    const verdict = lintVoiceResult(surface, result.text);
    if (!verdict.ok) {
      fallbacks.push({ surfaceId: surface.surfaceId, reason: verdict.reason });
      continue;
    }
    const kind = VOICE_SURFACE_KINDS.find((candidate) => candidate.featureId === surface.featureId);
    const entry = next[surface.featureId];
    const wrapped = isWrappedDeliverable(entry);
    const data = wrapped ? entry.data : entry;
    const items = kind && Array.isArray(data?.[kind.arrayKey]) ? data[kind.arrayKey] : null;
    if (!items || !items[surface.itemIndex]) {
      fallbacks.push({ surfaceId: surface.surfaceId, reason: 'surface no longer present in deliverable data' });
      continue;
    }
    const nextItems = items.map((item, index) =>
      index === surface.itemIndex ? { ...item, [surface.field]: result.text.trim() } : item,
    );
    const nextData = { ...data, [kind.arrayKey]: nextItems };
    next[surface.featureId] = wrapped ? { ...entry, data: nextData } : nextData;
    voiced.push(surface.surfaceId);
  }
  return { deliverables: next, voiced, fallbacks };
}

// ── Orchestration ───────────────────────────────────────────────────────────
/**
 * Runs batches sequentially until done or the budget is exhausted. The model
 * call is injected: callModel({ systemPrompt, userPrompt }) → { fullText,
 * usage? } (usage.costUsd preferred; otherwise each batch is assumed to cost
 * VOICE_ASSUMED_BATCH_COST_USD). AbortError propagates (user stop); every
 * other failure degrades to per-surface fallbacks.
 */
export async function runVoicePass({ deliverables = {}, courseMap = null, callModel, budgetUsd = 0.05, onEvent } = {}) {
  const emit = (event) => {
    try {
      if (typeof onEvent === 'function') onEvent(event);
    } catch {
      /* a listener failure never blocks the pass */
    }
  };
  const surfaces = selectVoiceSurfaces({ deliverables, courseMap });
  const surfaceById = new Map(surfaces.map((surface) => [surface.surfaceId, surface]));
  const courseContext = { courseName: courseMap?.courseName || '', semester: courseMap?.semester || '' };
  let current = deliverables;
  const voiced = [];
  const fallbacks = [];
  let spentUsd = 0;
  let exhausted = false;
  const batches = [];
  for (let start = 0; start < surfaces.length; start += VOICE_BATCH_SIZE) {
    batches.push(surfaces.slice(start, start + VOICE_BATCH_SIZE));
  }
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    if (typeof callModel !== 'function') {
      for (const surface of batch) fallbacks.push({ surfaceId: surface.surfaceId, reason: 'no model call available' });
      continue;
    }
    if (spentUsd >= budgetUsd) {
      exhausted = true;
      for (const surface of batch) {
        fallbacks.push({ surfaceId: surface.surfaceId, reason: 'voice budget exhausted — compiled text kept' });
      }
      continue;
    }
    const prompt = buildVoicePrompt(batch, courseContext);
    emit({
      type: 'voicePassCall',
      detail: `batch ${batchIndex + 1}/${batches.length}: ${batch.length} surface(s)`,
    });
    let response = null;
    try {
      response = await callModel(prompt);
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      spentUsd += VOICE_ASSUMED_BATCH_COST_USD;
      for (const surface of batch) {
        fallbacks.push({ surfaceId: surface.surfaceId, reason: `model call failed: ${err?.message || 'error'}` });
      }
      continue;
    }
    const usageCost = Number(response?.usage?.costUsd);
    spentUsd += Number.isFinite(usageCost) && usageCost > 0 ? usageCost : VOICE_ASSUMED_BATCH_COST_USD;
    const fullText = typeof response === 'string' ? response : response?.fullText || '';
    const rewrites = parseVoiceResponse(fullText);
    if (!rewrites) {
      for (const surface of batch) {
        fallbacks.push({ surfaceId: surface.surfaceId, reason: 'unparseable voice response — compiled text kept' });
      }
      continue;
    }
    const batchIds = new Set(batch.map((surface) => surface.surfaceId));
    const seen = new Set();
    const results = [];
    for (const rewrite of rewrites) {
      const surface = surfaceById.get(rewrite.surfaceId);
      if (!surface || !batchIds.has(rewrite.surfaceId) || seen.has(rewrite.surfaceId)) continue;
      seen.add(rewrite.surfaceId);
      results.push({ surface, text: rewrite.text });
    }
    for (const surface of batch) {
      if (!seen.has(surface.surfaceId)) {
        fallbacks.push({ surfaceId: surface.surfaceId, reason: 'no rewrite returned for this surface' });
      }
    }
    const applied = applyVoiceResults({ deliverables: current, results });
    current = applied.deliverables;
    voiced.push(...applied.voiced);
    fallbacks.push(...applied.fallbacks);
  }
  emit({
    type: 'voicePassDone',
    detail: `voiced ${voiced.length} surface(s), ${fallbacks.length} fallback(s) (~$${spentUsd.toFixed(3)})${
      exhausted ? ' — budget exhausted' : ''
    }`,
  });
  return { deliverables: current, voiced, fallbacks, spentUsd, exhausted };
}

// ── D4 disclosure stash ─────────────────────────────────────────────────────
// Single-run outcome, read by the PACKAGE_MANIFEST assembly (provenance
// discipline applies to our own rewrites too). The integration clears it at
// every compile so a toggled-off run never inherits a stale claim.
let lastVoicePassOutcome = null;

export function recordVoicePassOutcome(outcome) {
  lastVoicePassOutcome = outcome && typeof outcome === 'object' ? { ...outcome } : null;
}

export function peekVoicePassOutcome() {
  return lastVoicePassOutcome ? { ...lastVoicePassOutcome } : null;
}

export function clearVoicePassOutcome() {
  lastVoicePassOutcome = null;
}
