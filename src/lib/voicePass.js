/**
 * voicePass.js — voice v2 (post-mortem rebuild of v0.14.7 WS-D2).
 *
 * v1 failed its live bar (judge 3/10 voiced vs 4/10 quiet) and the autopsy
 * was mechanical: 38/52 surfaces fell back, the 14 "passes" were near-copies
 * with registry titles stuffed into template grammar, and the texture score
 * moved 76 → 75. Three causes, three design changes:
 *
 *  1. THE CONTRACT STRANGLED THE REWRITE. v1 demanded verbatim titles in
 *     prose; the only legal move was slot-stuffing. v2's rule is NEVER
 *     RENAME: prose may say "the Week 3 quiz" naturally (identity lives in
 *     the compiled header the pass never touches); the lint rejects only
 *     ids the original doesn't carry (invented/cross-wired identity) and
 *     genuinely new entities.
 *  2. STYLE WITHOUT SUBSTANCE IS PADDING. v1's grounding excluded the
 *     knowledge kernels, so rewrites could only re-arrange. v2 grounds each
 *     surface in its lesson kernel (terms, definitions, sources) and the
 *     no-new-facts proxy whitelists kernel content — verified substance in,
 *     invented substance still out.
 *  3. UNIFORM VOICE IS A NEW TEMPLATE. v2 voices FEW surfaces, asymmetrically
 *     (week-one brief, exam-prep guides, reading-anchored discussions),
 *     rotates per-surface register/length directives, rejects duplicate
 *     opening 3-grams across the package, and SELF-CHECKS: if the texture
 *     score of the touched features did not improve, the whole pass reverts
 *     and says so. The judge confirms improvement; it never discovers
 *     failure again.
 *
 * Standing laws unchanged: DEFAULT OFF (flip gated on live proof rounds,
 * bar met twice on different days); fallback never block; pure module with
 * the model call injected; D4 disclosure for manifest/digest.
 */
import { computeTexture } from './quality/textureMetric';

// ── The flag (same channel discipline as readAuthoringMode) ────────────────
export const VOICE_PASS_STORAGE_KEY = 'coursemapper-voice-pass';

export function readVoicePassMode() {
  // v0.15.1 F2 — THE FLIP, cashed June 12, 2026 at the user's direction
  // (different-day letter waived on the trail): across THREE de-confounded
  // same-generation rounds the record is 3 wins · 0 losses · 5 ties
  // (world-lit 5v4, 6v5, 6v6; econ 5v4, 4v4; cs 4v4 ×2; psych 4v4) with
  // structural 100/A held on every twin at ~$0.01 — voiced has never lost.
  // The texture self-check stays the safety: a pass that doesn't measurably
  // improve texture reverts itself. Explicit 'off' wins.
  try {
    return localStorage.getItem(VOICE_PASS_STORAGE_KEY) === 'off' ? 'off' : 'on';
  } catch {
    return 'on';
  }
}

export function saveVoicePassMode(mode) {
  try {
    if (mode === 'off') localStorage.setItem(VOICE_PASS_STORAGE_KEY, 'off');
    else localStorage.removeItem(VOICE_PASS_STORAGE_KEY);
  } catch {
    /* storage unavailable — the default ('on') applies */
  }
}

// ── Surface kinds ───────────────────────────────────────────────────────────
const VOICE_SURFACE_KINDS = [
  { featureId: 'assignments', arrayKey: 'assignments', field: 'overview', slot: 'overview' },
  { featureId: 'discussions', arrayKey: 'discussions', field: 'prompt', slot: 'prompt' },
  { featureId: 'studyGuides', arrayKey: 'studyGuides', field: 'summary', slot: 'summary' },
];

// v2: small batches — v1's 12-surface batches at 60-140 words each invited
// output-cap truncation (the likely bulk of the 38 'no rewrite returned'
// fallbacks). 5 × ~120 words ≈ 800 output tokens: comfortable everywhere.
export const VOICE_BATCH_SIZE = 5;
// v2: asymmetric selection cap — uneven emphasis is the point; voicing all
// 52 surfaces in one register was its own template.
export const VOICE_MAX_SURFACES = 8;
// v2: NO meaningful floor — padding is the enemy; voice may shorten. The
// tiny floor only rejects degenerate one-liners.
export const VOICE_REWRITE_MIN_WORDS = 20;
export const VOICE_REWRITE_MAX_WORDS = 170;
export const VOICE_ASSUMED_BATCH_COST_USD = 0.01;

const REGISTRY_ID_RE = /\b[AR]\d+\.\d+\b/g;
const FROZEN_LINE_MARKER = 'Anchor your post in';
const EXAM_TITLE_RE = /\b(exam|midterm|final)\b/i;

// Rotated per-surface directives — variety by construction, not by hope.
export const VOICE_REGISTERS = [
  'direct and brisk — get to the task and what good work looks like',
  "cautionary — lead with the most common mistake students make here (use only the grounding's terms/definitions)",
  'example-led — open from the concrete case, term, or source named in the grounding',
  'connective — relate this work to the named concepts students already met',
];
export const VOICE_LENGTH_TARGETS = ['30-70 words', '70-120 words'];

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

/** Kernel slice for one lesson: the verified substance voice MAY commit to. */
function kernelGrounding(kernels, lessonNumber) {
  const payload = kernels?.[`lesson-${lessonNumber}`];
  if (!payload || typeof payload !== 'object') return null;
  const terms = (Array.isArray(payload.keyTerms) ? payload.keyTerms : [])
    .slice(0, 3)
    .map((entry) => ({
      term: String(entry?.term || '').trim(),
      definition: String(entry?.definition || '').trim(),
      source: String(entry?.source || '').trim(),
    }))
    .filter((entry) => entry.term);
  const sourceCue = firstLine(payload.sourceCue) || '';
  if (terms.length === 0 && !sourceCue) return null;
  return { terms, ...(sourceCue ? { sourceCue } : {}) };
}

function lessonGrounding(courseMap, lessonNumber, kernels) {
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
  const kernel = kernelGrounding(kernels, lessonNumber);
  return {
    lessonTitle: lesson?.title ? String(lesson.title) : '',
    keyConcepts: keyConcepts.slice(0, 6),
    readings: readings.slice(0, 4),
    assessmentTitle,
    ...(kernel ? { kernel } : {}),
  };
}

// ── Asymmetric selection ────────────────────────────────────────────────────
/**
 * Rank every candidate surface and keep the top maxSurfaces — uneven
 * emphasis by design. Priorities: the week-one brief (first impressions),
 * exam-prep guides (highest-stakes reading), reading-anchored discussions
 * (voice has real material), kernel-backed surfaces over bare ones, and a
 * spread across lessons (max one voiced surface per lesson per feature
 * falls out naturally; the cross-lesson penalty keeps clusters honest).
 */
export function selectVoiceSurfaces({
  deliverables = {},
  courseMap = null,
  kernels = null,
  maxSurfaces = VOICE_MAX_SURFACES,
} = {}) {
  const candidates = [];
  for (const kind of VOICE_SURFACE_KINDS) {
    const data = unwrapDeliverableData(deliverables[kind.featureId]);
    const items = Array.isArray(data?.[kind.arrayKey]) ? data[kind.arrayKey] : [];
    items.forEach((item, itemIndex) => {
      const originalText = typeof item?.[kind.field] === 'string' ? item[kind.field].trim() : '';
      if (!originalText) return;
      const lessonNumber = Number.isFinite(item?.lessonNumber) ? item.lessonNumber : itemIndex + 1;
      const grounding = lessonGrounding(courseMap, lessonNumber, kernels);
      if (!grounding.lessonTitle && item?.lessonTitle) grounding.lessonTitle = String(item.lessonTitle);
      if (kind.featureId === 'assignments' && item?.title) grounding.assessmentTitle = String(item.title);

      let priority = 0;
      if (kind.featureId === 'assignments' && lessonNumber === 1) priority += 5; // the door of the course
      const examFlavored = EXAM_TITLE_RE.test(String(item?.title || item?.lessonTitle || '') + (item?.examScope || ''));
      if (kind.featureId === 'studyGuides' && examFlavored) priority += 4; // highest-stakes reading
      if (kind.featureId === 'discussions' && originalText.includes(FROZEN_LINE_MARKER)) priority += 4; // real material
      if (grounding.kernel) priority += 2; // verified substance available
      if (kind.featureId === 'assignments' && lessonNumber > 1) priority += 1;

      candidates.push({
        surfaceId: `${kind.featureId}:lesson-${lessonNumber}:${kind.slot}`,
        featureId: kind.featureId,
        itemIndex,
        field: kind.field,
        originalText,
        grounding,
        priority,
        lessonNumber,
      });
    });
  }
  candidates.sort((a, b) => b.priority - a.priority || a.lessonNumber - b.lessonNumber);
  // Spread: at most one surface per (featureId, lessonNumber); then at most
  // two per lessonNumber overall, so emphasis lands on distinct weeks.
  const seenFeatureLesson = new Set();
  const perLesson = new Map();
  const picked = [];
  for (const candidate of candidates) {
    if (picked.length >= Math.max(1, maxSurfaces)) break;
    const featureLessonKey = `${candidate.featureId}:${candidate.lessonNumber}`;
    if (seenFeatureLesson.has(featureLessonKey)) continue;
    if ((perLesson.get(candidate.lessonNumber) || 0) >= 2) continue;
    seenFeatureLesson.add(featureLessonKey);
    perLesson.set(candidate.lessonNumber, (perLesson.get(candidate.lessonNumber) || 0) + 1);
    picked.push(candidate);
  }
  return picked;
}

// ── The batched prompt ──────────────────────────────────────────────────────
export function buildVoicePrompt(surfaces = [], courseContext = {}) {
  const batch = surfaces.slice(0, VOICE_BATCH_SIZE);
  const courseName = courseContext.courseName || 'this course';
  const semester = courseContext.semester ? ` (${courseContext.semester})` : '';
  const systemPrompt = [
    `You are the instructor of record for "${courseName}"${semester}, revising your own course materials.`,
    'You rewrite short connective paragraphs so they read like a real instructor wrote them: specific, warm, unhedged.',
    'You may commit to any fact in the supplied grounding (including kernel terms, definitions, and sources) — that material is verified.',
    'You never invent facts, names, numbers, citations, or readings beyond the text and grounding supplied.',
  ].join(' ');
  const payload = batch.map((surface, index) => ({
    surfaceId: surface.surfaceId,
    directive: {
      register: VOICE_REGISTERS[index % VOICE_REGISTERS.length],
      length: VOICE_LENGTH_TARGETS[index % VOICE_LENGTH_TARGETS.length],
    },
    text: surface.originalText,
    grounding: surface.grounding,
  }));
  const userPrompt = [
    "Rewrite each surface's text following ITS OWN directive (register + length). The directives differ on purpose — the rewrites must not sound alike.",
    '',
    'Hard rules for every rewrite:',
    '- Refer to assessments and readings NATURALLY ("the week 3 quiz", "the assigned chapter") — never introduce a name, title, or id that conflicts with the original text.',
    "- If you include a registry id (like A1.2 or R3.1), it must already appear in that surface's original text. Never borrow ids from other surfaces.",
    `- Any sentence containing "${FROZEN_LINE_MARKER}" is FROZEN TEXT: reproduce that sentence verbatim and unchanged inside your rewrite. Never reword it.`,
    '- Ground every specific in the supplied text or grounding (kernel terms/definitions/sources are fair game and ENCOURAGED — concrete beats generic).',
    '- NO two rewrites in this batch may begin with the same three words.',
    "- Follow each directive's length target. Sentence case prose only — no markdown headers, no bullets.",
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

// ── The contract lint (v2: never-rename, kernel-aware, no padding floor) ───
function extractRegistryIds(text) {
  return [...new Set(String(text || '').match(REGISTRY_ID_RE) || [])];
}

function extractFrozenLines(text) {
  const matches = String(text || '').match(/[^.!?\n]*Anchor your post in[^.!?\n]*[.!?]?/g) || [];
  return matches.map((line) => line.trim()).filter(Boolean);
}

function extractCapitalizedSequences(text) {
  return String(text || '').match(/\b[A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+)+\b/g) || [];
}

export function openingTrigram(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join(' ');
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
  // v2 NEVER-RENAME: the rewrite may OMIT ids (identity lives in the
  // compiled header), but any id it carries must come from its own original
  // — an id the original doesn't carry is invented or cross-wired identity.
  const originalIds = new Set(extractRegistryIds(originalText));
  for (const registryId of extractRegistryIds(text)) {
    if (!originalIds.has(registryId)) {
      return { ok: false, reason: `registry id not in this surface's original: ${registryId}` };
    }
  }
  for (const frozenLine of extractFrozenLines(originalText)) {
    if (!text.includes(frozenLine)) {
      return { ok: false, reason: `dropped frozen requirement line ("${FROZEN_LINE_MARKER} …")` };
    }
  }
  // No-new-facts proxy — the corpus includes the grounding (and through it
  // the kernel terms/definitions/sources), so verified substance passes and
  // "Professor Quantumfield" still rejects.
  const corpus = `${originalText}\n${JSON.stringify(surface?.grounding || {})}`.toLowerCase();
  for (const sequence of new Set(extractCapitalizedSequences(text))) {
    const lowered = sequence.toLowerCase();
    // Sentence-initial articles glue onto real entities ("The Bowen Reaction
    // Series") — strip them before declaring the entity new.
    const deArticled = lowered.replace(/^(?:the|a|an)\s+/, '');
    if (!corpus.includes(lowered) && !corpus.includes(deArticled)) {
      return { ok: false, reason: `new entity not in original or grounding: "${sequence}"` };
    }
  }
  return { ok: true, reason: '' };
}

// ── Application (immutable; per-item fallback) ──────────────────────────────
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

// ── Texture self-check (the gate the judge no longer has to be) ────────────
/** Doc set for the touched features: every item's voiceable field text. */
function textureDocsFor(deliverables, featureIds) {
  const docs = [];
  for (const kind of VOICE_SURFACE_KINDS) {
    if (!featureIds.has(kind.featureId)) continue;
    const data = unwrapDeliverableData(deliverables[kind.featureId]);
    const items = Array.isArray(data?.[kind.arrayKey]) ? data[kind.arrayKey] : [];
    items.forEach((item, index) => {
      const text = typeof item?.[kind.field] === 'string' ? item[kind.field] : '';
      if (text.trim()) docs.push({ id: `${kind.featureId}-${index}`, feature: kind.featureId, text });
    });
  }
  return docs;
}

function textureSlotValues(courseMap) {
  const values = [];
  for (const lesson of courseMap?.lessons || []) {
    if (lesson?.title) values.push(String(lesson.title));
    for (const section of lesson?.sections || []) {
      const assessment = firstLine(section?.weeklyAssessments);
      if (assessment) values.push(assessment);
    }
  }
  return values;
}

// ── Orchestration ───────────────────────────────────────────────────────────
export async function runVoicePass({
  deliverables = {},
  courseMap = null,
  kernels = null,
  callModel,
  budgetUsd = 0.05,
  maxSurfaces = VOICE_MAX_SURFACES,
  onEvent,
} = {}) {
  const emit = (event) => {
    try {
      if (typeof onEvent === 'function') onEvent(event);
    } catch {
      /* a listener failure never blocks the pass */
    }
  };
  const surfaces = selectVoiceSurfaces({ deliverables, courseMap, kernels, maxSurfaces });
  const surfaceById = new Map(surfaces.map((surface) => [surface.surfaceId, surface]));
  const courseContext = { courseName: courseMap?.courseName || '', semester: courseMap?.semester || '' };
  const touchedFeatures = new Set(surfaces.map((surface) => surface.featureId));
  const slotValues = textureSlotValues(courseMap);
  const preTexture = computeTexture(textureDocsFor(deliverables, touchedFeatures), { slotValues });

  let current = deliverables;
  const voiced = [];
  const fallbacks = [];
  const usedOpeners = new Map(); // trigram → surfaceId that claimed it
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
      // v2 cross-surface variety lint: a second rewrite claiming an already
      // used opening trigram falls back — sameness is rejected at the door.
      const opener = openingTrigram(rewrite.text);
      if (opener && usedOpeners.has(opener)) {
        fallbacks.push({
          surfaceId: rewrite.surfaceId,
          reason: `duplicate opening ("${opener} …") with ${usedOpeners.get(opener)}`,
        });
        continue;
      }
      if (opener) usedOpeners.set(opener, rewrite.surfaceId);
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

  // ── The self-check: texture must IMPROVE or the pass reverts loudly ──────
  let selfCheck = null;
  if (voiced.length > 0) {
    const postTexture = computeTexture(textureDocsFor(current, touchedFeatures), { slotValues });
    selfCheck = { pre: preTexture.score, post: postTexture.score };
    if (!(postTexture.score > preTexture.score)) {
      const reverted = voiced.splice(0, voiced.length);
      for (const surfaceId of reverted) {
        fallbacks.push({
          surfaceId,
          reason: `texture self-check: no measurable improvement (pre ${preTexture.score} / post ${postTexture.score}) — pass reverted`,
        });
      }
      current = deliverables;
      selfCheck.verdict = 'reverted';
    } else {
      selfCheck.verdict = 'improved';
    }
  }

  emit({
    type: 'voicePassDone',
    detail: `voiced ${voiced.length} surface(s), ${fallbacks.length} fallback(s) (~$${spentUsd.toFixed(3)})${
      selfCheck ? ` — texture ${selfCheck.pre}→${selfCheck.post} (${selfCheck.verdict})` : ''
    }${exhausted ? ' — budget exhausted' : ''}`,
  });
  return { deliverables: current, voiced, fallbacks, spentUsd, exhausted, selfCheck };
}

// ── D4 disclosure stash ─────────────────────────────────────────────────────
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
