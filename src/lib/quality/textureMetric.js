/**
 * textureMetric.js — V0.14.7 WS-D D1: templated-ness becomes MEASURABLE.
 *
 * The advisory AI judge has been scoring packages 5–6/10 for "too templated"
 * — fifteen instances of one template family read as a stamp in seconds. The
 * refine loop never applied pressure here because texture was never a scored
 * dimension. This module computes a deterministic 0–100 texture score
 * (100 = varied / human-textured, 0 = one skeleton, N stamps) from the
 * extracted document texts the grader already has, grouped by feature.
 *
 * Pure ESM, no fs, no node builtins — importable from the browser grader and
 * from vitest. Three signals, each a 0–100 sub-score:
 *
 *   1. SAMENESS (weight 0.5) — slot-masked cross-document skeleton
 *      similarity. For each same-feature group (all lesson plans, all
 *      briefs…) we mask the variable tokens — known slot values (course /
 *      lesson / registry titles) when provided, plus capitalized multiword
 *      runs and digits as the general heuristic — then compute the average
 *      pairwise 12-word-shingle Jaccard overlap (|A∩B| / |A∪B|).
 *      Slot variation alone earns NO texture credit: a template sentence
 *      that is identical once its slots are masked counts as identical.
 *      sameness = 100 × (1 − avg overlap), doc-count-weighted across groups.
 *
 *   2. OPENERS (weight 0.25) — sentence-opener variety. Per document, the
 *      ratio of distinct first-3-token sentence openers to total sentences
 *      (masked text, so "1. Identify…" / "2. Identify…" count as the same
 *      opener), averaged over documents with enough sentences to mean
 *      anything. Uniform "Students will…" drumbeats score low.
 *
 *   3. TAILS (weight 0.25) — template-tail frequency. Masked 12-word shingles
 *      appearing in ≥60% of a same-feature group are template tails (the
 *      phrases a professor senses on page two). tails = 100 × (1 − tail
 *      shingle density over the group's distinct shingles).
 *
 * Composite = weighted mean over the MEASURABLE sub-scores (weights
 * renormalized when a signal has no eligible data; a package of single-doc
 * features has no cross-document signal). No signal at all → score 100 with
 * measured: false, so unmeasurable input is not penalized.
 *
 * Worst-evidence examples (the actual repeated shingle strings, max 5) ride
 * along so reports can quote the template verbatim.
 *
 * Calibration (tests/v0147-texture-metric.test.js): a 10-doc slot-varied
 * template set must score ≥20 points below the same facts written with
 * varied structures, and per-doc DISTINCT real reading anchors must outrank
 * identical generic anchors. The grader gives the metric a small weight and
 * turns low texture into an actionable finding.
 */

export const TEXTURE_VERSION = '1.0.0';

export const TEXTURE_SUBSCORE_WEIGHTS = { sameness: 0.5, openers: 0.25, tails: 0.25 };

const SHINGLE_SIZE = 12;
const TAIL_DOC_RATIO = 0.6;
const MAX_EVIDENCE = 5;
const MIN_OPENER_SENTENCES = 4;
const MIN_OPENER_TOKENS = 4;
const STRUCTURAL_HEADING_PATTERN =
  /^(?:overview|objectives?|materials?|outline|agenda|activity|activities|closing activity|purpose|prompt|deliverables?|grading criteria|rubric|criteria|criterion|question|answer|sample answer|explanation|scoring guidance|rubric hints|intended use|objective aligned|difficulty|points|estimated minutes|tags|speaker notes|suggested visual|discussion prompt|instructor notes|course faq|faq|key terms?|review questions?|practice activities|concept connections|summary|assignment brief|lesson plan|slide deck|study guide)$/i;
const STRUCTURAL_PREFIX_PATTERN =
  /^(?:overview|objectives?|materials?|outline|agenda|activity|activities|closing activity|purpose|prompt|deliverables?|grading criteria|rubric|criteria|criterion|exemplary|proficient|developing|beginning|question|answer|sample answer|explanation|scoring guidance|rubric hints|intended use|objective aligned|blooms? level|difficulty|points|estimated minutes|tags|speaker notes|suggested visual|discussion prompt|instructor notes|course faq|faq|key terms?|review questions?|practice activities|concept connections|summary|calibration check|bias check|source check|student transparency|post-score review|post score review|revision prompt|scorer calibration use|student-facing use|student facing use|grade policy connection|accessibility and udl|teacher notes|assessment cadence)\s*:?\s*/i;
const STRUCTURAL_REFERENCE_PATTERN = /\b(?:doi\b|et al\.?|https?:\/\/|isbn\b|retrieved from)\b/i;
const STRUCTURAL_LEDGER_REFERENCE_PATTERN = /\b(?:course\s+map\s+l\d+|a\d+\.\d+)\b/i;
const STRUCTURAL_LEDGER_NUMERIC_PATTERN = /\b(?:week\s+\d+|\d+(?:\.\d+)?\s*(?:pts?|points|%|hours?|hrs?))\b/i;
const STRUCTURAL_LEDGER_SEPARATOR_PATTERN = /[·|•]|\s+-\s+/;
const STRUCTURAL_QUESTION_METADATA_PATTERN =
  /^q\s*\d+\s*:\s*\((?:remember|understand|apply|analyze|evaluate|create)\s*,\s*(?:easy|medium|hard)\)\s*$/i;
const STRUCTURAL_QUESTION_PREFIX_PATTERN = /^q\s*\d+\s*(?:\([^)]*\))?\s*:\s*/i;
const STRUCTURAL_DOCUMENT_CHROME_PATTERN =
  /^(?:.+?\s+-\s+)?lesson\s+\d{1,3}\s*(?::|-)\s*[^.!?]+(?:\s+—\s+.+\s+page\s+of)?$/i;

// Internal mask tokens survive word tokenization as plain words; evidence
// rendering maps them back to readable placeholders.
const MASK_SLOT = 'xslotx';
const MASK_NUM = 'xnumx';
const MASK_DISPLAY = { [MASK_SLOT]: '[slot]', [MASK_NUM]: '[n]' };

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Mask the variable tokens out of a document so only the SKELETON remains:
 *   - every provided slot value (longest first, case-insensitive),
 *   - capitalized multiword runs ("Igneous Rocks", "The Norton Anthology"),
 *   - digit runs (lesson numbers, weights, dates).
 * Single capitalized words (sentence starts, one-word titles) are NOT masked
 * — masking them would erase honest specificity like distinct reading
 * anchors ("Anchor your post in Antigone").
 */
export function maskSlots(text, slotValues = []) {
  let masked = String(text || '');
  const slots = [...new Set(slotValues.filter(Boolean).map((value) => String(value).trim()))]
    .filter((value) => value.length >= 3)
    .sort((a, b) => b.length - a.length);
  for (const slot of slots) {
    masked = masked.replace(new RegExp(escapeRegExp(slot), 'gi'), ` ${MASK_SLOT} `);
  }
  masked = masked.replace(/\b[A-Z][A-Za-z'’-]*(?:\s+[A-Z][A-Za-z'’-]*)+\b/g, ` ${MASK_SLOT} `);
  masked = masked.replace(/\d+(?:[.,:/-]\d+)*/g, ` ${MASK_NUM} `);
  return masked;
}

function tokensOf(maskedText) {
  return (
    String(maskedText || '')
      .toLowerCase()
      .match(/[a-z][a-z'’-]*/g) || []
  );
}

function shinglesOf(tokens, size = SHINGLE_SIZE) {
  const shingles = new Set();
  for (let i = 0; i + size <= tokens.length; i += 1) {
    shingles.add(tokens.slice(i, i + size).join(' '));
  }
  return shingles;
}

function displayShingle(shingle) {
  return shingle
    .split(' ')
    .map((token) => MASK_DISPLAY[token] || token)
    .join(' ');
}

// Sentence units for the opener signal: terminal punctuation or line breaks
// (docx paragraphs and pptx bullets arrive newline-joined).
function sentencesOf(maskedText) {
  return String(maskedText || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function isStructuralLedgerLine(line) {
  const text = String(line || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text || text.length > 240) return false;
  const sentenceText = text.replace(/\ba\d+\.\d+\b/gi, '');
  const hasSentencePunctuation = /[.!?](?:\s|$)/.test(sentenceText);
  if (hasSentencePunctuation) return false;

  const numericMatches = text.match(new RegExp(STRUCTURAL_LEDGER_NUMERIC_PATTERN.source, 'gi')) || [];
  const hasCourseMapLedger = STRUCTURAL_LEDGER_REFERENCE_PATTERN.test(text);
  const hasSeparatedMeta = STRUCTURAL_LEDGER_SEPARATOR_PATTERN.test(text);

  return (hasCourseMapLedger && numericMatches.length >= 1) || (hasSeparatedMeta && numericMatches.length >= 3);
}

/**
 * computeTexture(docs, { slotValues }) → the package texture result.
 *
 * docs: [{ id, feature, text }] — extracted document texts grouped by their
 * feature id (the grader's featureId; any stable group key works).
 *
 * Returns {
 *   score,                       // 0–100, 100 = varied
 *   measured,                    // false when no signal had eligible data
 *   subScores: { sameness, openers, tails },   // 0–100 or null
 *   evidence: [{ shingle, feature, docCount, docTotal }],  // worst, ≤5
 *   groups: [{ feature, docCount, avgOverlap, tailCount, tailDensity }],
 * }
 */
export function computeTexture(docs = [], { slotValues = [] } = {}) {
  const prepared = (Array.isArray(docs) ? docs : [])
    .map((doc, index) => {
      const masked = maskSlots(doc?.text, slotValues);
      const tokens = tokensOf(masked);
      return {
        id: doc?.id || `doc-${index + 1}`,
        feature: doc?.feature || 'unknown',
        masked,
        tokens,
        shingles: shinglesOf(tokens),
      };
    })
    .filter((doc) => doc.tokens.length > 0);

  // ── Signal 1 + 3: cross-document sameness and template tails, per group ──
  const byFeature = new Map();
  for (const doc of prepared) {
    if (doc.shingles.size === 0) continue;
    if (!byFeature.has(doc.feature)) byFeature.set(doc.feature, []);
    byFeature.get(doc.feature).push(doc);
  }

  const groups = [];
  const evidenceCandidates = [];
  let overlapWeighted = 0;
  let tailWeighted = 0;
  let groupWeight = 0;
  for (const [feature, groupDocs] of byFeature) {
    if (groupDocs.length < 2) continue;
    let pairSum = 0;
    let pairCount = 0;
    for (let i = 0; i < groupDocs.length; i += 1) {
      for (let j = i + 1; j < groupDocs.length; j += 1) {
        const [small, large] =
          groupDocs[i].shingles.size <= groupDocs[j].shingles.size
            ? [groupDocs[i].shingles, groupDocs[j].shingles]
            : [groupDocs[j].shingles, groupDocs[i].shingles];
        let intersection = 0;
        for (const shingle of small) if (large.has(shingle)) intersection += 1;
        const union = groupDocs[i].shingles.size + groupDocs[j].shingles.size - intersection;
        pairSum += union > 0 ? intersection / union : 0;
        pairCount += 1;
      }
    }
    const avgOverlap = pairCount > 0 ? pairSum / pairCount : 0;

    const docFrequency = new Map();
    for (const doc of groupDocs) {
      for (const shingle of doc.shingles) {
        docFrequency.set(shingle, (docFrequency.get(shingle) || 0) + 1);
      }
    }
    const tailThreshold = Math.max(2, Math.ceil(TAIL_DOC_RATIO * groupDocs.length));
    let tailCount = 0;
    for (const [shingle, frequency] of docFrequency) {
      if (frequency < tailThreshold) continue;
      tailCount += 1;
      evidenceCandidates.push({
        shingle,
        feature,
        docCount: frequency,
        docTotal: groupDocs.length,
      });
    }
    const tailDensity = docFrequency.size > 0 ? tailCount / docFrequency.size : 0;

    groups.push({
      feature,
      docCount: groupDocs.length,
      avgOverlap: round1(avgOverlap * 100) / 100,
      tailCount,
      tailDensity: round1(tailDensity * 100) / 100,
    });
    overlapWeighted += avgOverlap * groupDocs.length;
    tailWeighted += tailDensity * groupDocs.length;
    groupWeight += groupDocs.length;
  }

  const sameness = groupWeight > 0 ? Math.max(0, Math.min(100, 100 * (1 - overlapWeighted / groupWeight))) : null;
  const tails = groupWeight > 0 ? Math.max(0, Math.min(100, 100 * (1 - tailWeighted / groupWeight))) : null;

  // ── Signal 2: sentence-opener variety per document ────────────────────────
  let openerRatioSum = 0;
  let openerDocCount = 0;
  for (const doc of prepared) {
    const sentences = sentencesOf(doc.masked)
      .map((sentence) => tokensOf(sentence))
      .filter((sentenceTokens) => sentenceTokens.length >= MIN_OPENER_TOKENS);
    if (sentences.length < MIN_OPENER_SENTENCES) continue;
    const openers = new Set(sentences.map((sentenceTokens) => sentenceTokens.slice(0, 3).join(' ')));
    openerRatioSum += openers.size / sentences.length;
    openerDocCount += 1;
  }
  const openers = openerDocCount > 0 ? Math.max(0, Math.min(100, 100 * (openerRatioSum / openerDocCount))) : null;

  // ── Composite: renormalized over the measurable signals ──────────────────
  const subScores = {
    sameness: sameness === null ? null : Math.round(sameness),
    openers: openers === null ? null : Math.round(openers),
    tails: tails === null ? null : Math.round(tails),
  };
  let weightSum = 0;
  let scoreSum = 0;
  for (const [name, weight] of Object.entries(TEXTURE_SUBSCORE_WEIGHTS)) {
    const value = { sameness, openers, tails }[name];
    if (value === null) continue;
    weightSum += weight;
    scoreSum += value * weight;
  }
  const measured = weightSum > 0;
  const score = measured ? Math.max(0, Math.min(100, Math.round(scoreSum / weightSum))) : 100;

  // Worst evidence: the most package-wide template tails first.
  evidenceCandidates.sort(
    (a, b) =>
      b.docCount / b.docTotal - a.docCount / a.docTotal ||
      b.docCount - a.docCount ||
      a.shingle.localeCompare(b.shingle),
  );
  const evidence = evidenceCandidates.slice(0, MAX_EVIDENCE).map((candidate) => ({
    ...candidate,
    shingle: displayShingle(candidate.shingle),
  }));

  return { score, measured, subScores, evidence, groups };
}

/**
 * Adapter for the grader's extracted file objects → metric docs. Text files,
 * docx, and pptx carry prose texture; xlsx workbooks (quiz bank, course map)
 * are structural grids and are excluded. Paragraph/bullet boundaries are
 * preserved as newlines for the sentence splitter.
 */
export function textureDocsFromFiles(files = []) {
  return (Array.isArray(files) ? files : [])
    .filter((file) => file && file.featureId && file.kind !== 'xlsx')
    .map((file) => ({
      id: file.path,
      feature: file.featureId,
      text: normalizeTextureText(
        Array.isArray(file.paragraphs) && file.paragraphs.length > 0 ? file.paragraphs.join('\n') : file.text || '',
      ),
    }))
    .filter((doc) => doc.text.trim().length > 0);
}

export function normalizeTextureText(text) {
  return String(text || '')
    .split(/\n+/)
    .map((line) => {
      let cleaned = line.replace(/\s+/g, ' ').trim();
      if (STRUCTURAL_DOCUMENT_CHROME_PATTERN.test(cleaned)) return '';
      if (STRUCTURAL_QUESTION_METADATA_PATTERN.test(cleaned)) return '';
      // Question numbers, type/point/time badges, and Bloom/difficulty rows
      // are export structure. Strip them before measuring sentence openers so
      // six genuinely different stems do not all look like “Q [n] multiple”.
      cleaned = cleaned.replace(STRUCTURAL_QUESTION_PREFIX_PATTERN, '').trim();
      for (let index = 0; index < 3; index += 1) {
        const next = cleaned.replace(STRUCTURAL_PREFIX_PATTERN, '').trim();
        if (next === cleaned) break;
        cleaned = next;
      }
      return cleaned;
    })
    .filter(
      (line) =>
        line &&
        !STRUCTURAL_HEADING_PATTERN.test(line) &&
        !STRUCTURAL_REFERENCE_PATTERN.test(line) &&
        !isStructuralLedgerLine(line),
    )
    .join('\n');
}

/**
 * Backwards-compatible P2-style advisory records for the texture result.
 * The grader creates the score-bearing finding itself; these remain separate
 * under result.texture.advisories for older report surfaces.
 */
export function buildTextureAdvisories(texture) {
  if (!texture || !texture.measured) return [];
  const advisories = [];
  const { sameness, openers } = texture.subScores || {};
  if (sameness !== null && sameness !== undefined && sameness < 60) {
    advisories.push({
      severity: 'P2',
      dimension: 'texture',
      advisory: true,
      file: '',
      detail: `advisory: high cross-document skeleton similarity (sameness ${sameness}/100) — same-feature documents share their slot-masked structure (roadmap WS-D D1)`,
      evidence: texture.evidence?.[0]?.shingle || '',
    });
  }
  if (openers !== null && openers !== undefined && openers < 50) {
    advisories.push({
      severity: 'P2',
      dimension: 'texture',
      advisory: true,
      file: '',
      detail: `advisory: low sentence-opener variety (openers ${openers}/100) — repeated first-words drumbeat reads as a stamp (roadmap WS-D D1)`,
      evidence: '',
    });
  }
  for (const item of texture.evidence || []) {
    advisories.push({
      severity: 'P2',
      dimension: 'texture',
      advisory: true,
      file: '',
      detail: `advisory: template tail shared by ${item.docCount}/${item.docTotal} ${item.feature} documents (roadmap WS-D D1)`,
      evidence: item.shingle,
    });
  }
  return advisories;
}
