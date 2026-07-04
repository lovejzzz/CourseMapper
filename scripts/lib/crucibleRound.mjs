// Crucible round logic — the PURE half of scripts/crucible.mjs (V0.14.3 WS-E).
//
// Everything here is deliberately fs/network-free so the spend-guard accounting,
// retry bookkeeping, verdict-ledger diffing, history shaping, and round-diff
// sectionization can be unit-tested (tests/crucible-round-logic.test.js) without
// a browser or a stored round on disk. scripts/crucible.mjs owns all I/O.
import crypto from 'node:crypto';

// ── E2: spend guard ─────────────────────────────────────────────────────────

export const DEFAULT_MAX_SPEND_USD = 2.5;
// Conservative per-course estimate used to decide whether STARTING the next
// course could blow the cap (observed live range is $0.08–0.15/course).
export const NEXT_COURSE_ESTIMATE_USD = 0.2;

export function digestCostUsd(digest) {
  const value = digest?.cost?.totalUsd;
  return Number.isFinite(value) ? value : 0;
}

/**
 * Decide whether the round may START another generation. Pure: the caller sums
 * completed-course spend (including failed attempts) and asks before each pull.
 * In-flight generations are never killed — this only gates new starts.
 */
export function spendGuardDecision({
  spentUsd,
  maxSpendUsd = DEFAULT_MAX_SPEND_USD,
  estimateUsd = NEXT_COURSE_ESTIMATE_USD,
}) {
  const spent = Number.isFinite(spentUsd) ? spentUsd : 0;
  const cap = Number(maxSpendUsd);
  if (!Number.isFinite(cap) || cap <= 0) return { abort: false, reason: null };
  if (spent >= cap) {
    return { abort: true, reason: `spend cap hit: $${spent.toFixed(2)} already spent >= $${cap.toFixed(2)} cap` };
  }
  if (spent + estimateUsd > cap) {
    return {
      abort: true,
      reason:
        `spend cap guard: $${spent.toFixed(2)} spent + ~$${estimateUsd.toFixed(2)} ` +
        `next-course estimate would exceed the $${cap.toFixed(2)} cap`,
    };
  }
  return { abort: false, reason: null };
}

// ── E3: retry bookkeeping ───────────────────────────────────────────────────

/**
 * Summarize 1–2 generation attempts for one course. Spend counts EVERY
 * attempt's digest (a failed attempt may still have billed provider calls);
 * status comes from the final attempt; the round table label says
 * 'passed (retry)' when the second attempt rescued the course.
 */
export function summarizeCourseAttempts(attempts) {
  const list = (Array.isArray(attempts) ? attempts : []).filter(Boolean);
  const finalAttempt = list[list.length - 1] || null;
  const passed = finalAttempt?.status === 'passed';
  const retried = list.length > 1;
  return {
    attemptCount: list.length,
    passed,
    retried,
    status: finalAttempt?.status || 'failed',
    statusLabel: passed ? (retried ? 'passed (retry)' : 'passed') : finalAttempt?.status || 'failed',
    spendUsd: list.reduce((sum, attempt) => sum + digestCostUsd(attempt?.digest), 0),
    durationMs: list.reduce((sum, attempt) => sum + (Number.isFinite(attempt?.durationMs) ? attempt.durationMs : 0), 0),
    finalAttempt,
  };
}

// ── V0.14.3 WS-B / A5(4): in-app vs Crucible score cross-check ──────────────

export const INAPP_SCORE_DRIFT_LIMIT = 3;

/**
 * Read the in-app quality score from a downloaded package's manifest.quality
 * block (WS-A writes it at finalize). Returns null when the block is absent or
 * not a successful grade — older artifacts and timeout grades are skipped, not
 * failed.
 *
 * @param {object|null} manifest the parsed PACKAGE_MANIFEST.json
 * @returns {number|null} the in-app overall score, or null when unavailable
 */
export function inAppScoreFromManifest(manifest) {
  const quality = manifest?.quality;
  if (!quality || quality.status !== 'graded') return null;
  const score = Number(quality.score);
  return Number.isFinite(score) ? score : null;
}

/**
 * A5(4): decide whether the in-app and Crucible scores have drifted apart. The
 * two graders run the SAME code over the SAME artifacts, so any gap beyond the
 * documented tolerance means they diverged silently — the round must fail.
 * Returns { skip } when the in-app score is absent (older artifact), else
 * { drift, ok } where ok is true within INAPP_SCORE_DRIFT_LIMIT points.
 *
 * @param {number|null} crucibleScore the Crucible's overall for this course
 * @param {number|null} inAppScore manifest.quality.score (null → skip)
 * @param {number} limit drift tolerance in points (default 3)
 */
export function inAppDriftDecision(crucibleScore, inAppScore, limit = INAPP_SCORE_DRIFT_LIMIT) {
  if (!Number.isFinite(inAppScore)) return { skip: true, drift: null, ok: true };
  if (!Number.isFinite(crucibleScore)) return { skip: true, drift: null, ok: true };
  const drift = Math.abs(crucibleScore - inAppScore);
  return { skip: false, drift, ok: drift <= limit };
}

// ── E1: bounded-concurrency pool with deterministic result order ────────────

/**
 * Run worker(item, index) over items with at most `concurrency` in flight.
 * Results come back in ITEM order (course-list order), never finish order.
 * Single-threaded JS guarantees the cursor read+increment below is atomic
 * (no await between them), so two lanes can never claim the same index.
 */
export async function runPool(items, concurrency, worker) {
  const list = Array.isArray(items) ? items : [];
  const limit = Math.max(1, Math.min(Math.floor(Number(concurrency) || 1), Math.max(list.length, 1)));
  const results = new Array(list.length);
  let cursor = 0;
  const lanes = Array.from({ length: limit }, async () => {
    for (;;) {
      const index = cursor;
      if (index >= list.length) return;
      cursor += 1;
      results[index] = await worker(list[index], index);
    }
  });
  await Promise.all(lanes);
  return results;
}

export function clampConcurrency(raw, { fallback = 2, max = 3 } = {}) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(value)));
}

// ── V0.14.5 WS-E (E1): provider breadth — flag parsing + course expansion ───

/**
 * Per-provider default generation models for `--provider` rounds. Chosen as
 * the CHEAPEST generation-capable model the app itself recognizes:
 * - openai  gpt-5.4-mini — the existing Crucible default ($0.75/$4.50 per M,
 *   src/lib/apiUsageCost.js:60); full structured-output + reasoning support.
 * - anthropic claude-haiku-4-5 — cheapest current Anthropic model ($1/$5 per
 *   M); matches the app's structured-output gate
 *   (modelCapabilities.js inferStructuredOutputControls:
 *   /claude-(?:fable|opus|sonnet|haiku)-(?:[4-9]|\d{2,})/) and its
 *   thinking-budget reasoning gate. Sonnet/Opus cost 3–10×.
 * - google  gemini-2.5-flash-lite — cheapest current-generation Gemini the
 *   app lists ($0.10/$0.40 per M, apiUsageCost.js; in the
 *   GOOGLE_VERTEX_EXPRESS_TEXT_MODEL_FALLBACKS catalog) with json-schema
 *   structured outputs and the gemini-2.5 thinking-budget profile. The 2.0
 *   flash-lite line is marginally cheaper but a generation older.
 * `--model` still overrides.
 */
export const PROVIDER_DEFAULT_MODELS = {
  openai: 'gpt-5.4-mini',
  anthropic: 'claude-haiku-4-5',
  google: 'gemini-2.5-flash-lite',
};

export const SUPPORTED_PROVIDERS = Object.keys(PROVIDER_DEFAULT_MODELS);

/** --provider openai|anthropic|google (default 'openai'); anything else throws. */
export function parseProviderFlag(raw) {
  if (raw === undefined || raw === null || raw === true || raw === '') return 'openai';
  const value = String(raw).toLowerCase();
  if (SUPPORTED_PROVIDERS.includes(value)) return value;
  throw new Error(`--provider must be ${SUPPORTED_PROVIDERS.join(', ')} (got "${raw}")`);
}

/**
 * Suffix run-dir/course ids with the provider for non-openai rounds
 * (cs-python → cs-python--anthropic) so provider rounds NEVER collide with
 * the openai history in stored-round scans, baselines, or history columns.
 * Default openai rounds keep today's naming exactly. Composes with
 * expandCoursesForAuthoring (apply AFTER it): baseId stays the ORIGINAL
 * course id, so baseline lookups and authoring pairing keep working.
 */
export function expandCoursesForProvider(courses, provider = 'openai') {
  const list = Array.isArray(courses) ? courses : [];
  if (provider === 'openai') return list.map((course) => ({ ...course, provider: 'openai' }));
  return list.map((course) => ({
    ...course,
    id: `${course.id}--${provider}`,
    baseId: course.baseId || course.id,
    provider,
  }));
}

// ── E1: provider-aware API key shapes (pure half; fs/env half lives in ──────
// crucibleBrowser.mjs loadApiKey). Key shapes: OpenAI sk-… (but NEVER
// sk-ant-…), Anthropic sk-ant-…, Google AIza…. File lines may be named
// (ANTHROPIC_API_KEY=…) or bare values.
export const PROVIDER_KEY_RULES = {
  openai: {
    envVars: ['COURSEMAPPER_OPENAI_API_KEY', 'OPENAI_API_KEY'],
    keyNameRe: /OPENAI|^API_KEY$/i,
    valueShape: (value) => value.startsWith('sk-') && !value.startsWith('sk-ant-'),
    shapeHint: 'sk-… (not sk-ant-…)',
  },
  anthropic: {
    envVars: ['COURSEMAPPER_ANTHROPIC_API_KEY', 'ANTHROPIC_API_KEY'],
    keyNameRe: /ANTHROPIC/i,
    valueShape: (value) => value.startsWith('sk-ant-'),
    shapeHint: 'sk-ant-…',
  },
  google: {
    envVars: ['COURSEMAPPER_GOOGLE_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY'],
    keyNameRe: /GOOGLE|GEMINI/i,
    valueShape: (value) => /^AIza[0-9A-Za-z_-]+$/.test(value),
    shapeHint: 'AIza…',
  },
  deepseek: {
    envVars: ['COURSEMAPPER_DEEPSEEK_API_KEY', 'DEEPSEEK_API_KEY'],
    keyNameRe: /DEEPSEEK/i,
    valueShape: (value) => value.length > 20,
    shapeHint: 'sk-…',
  },
};

/**
 * Pick the requested provider's key out of an api.ev-style text blob
 * (KEY=value lines, optional export prefix/quotes, bare-value lines).
 * The three shapes are mutually exclusive (sk-… minus sk-ant-, sk-ant-…,
 * AIza…), so the VALUE shape alone discriminates providers — an
 * ANTHROPIC_API_KEY=sk-ant-… line can never be returned for openai, and a
 * mislabeled line (OPENAI_API_KEY=AIza…) is rejected by shape. A line whose
 * NAME clearly belongs to a different provider is skipped even when the
 * shape matched. Returns '' when absent.
 */
export function pickApiKeyFromEnvText(content, provider = 'openai') {
  const rules = PROVIDER_KEY_RULES[provider];
  if (!rules) return '';
  for (const line of String(content || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/i);
    const key = match ? match[1] : '';
    let value = match ? match[2] : trimmed;
    value = value.trim().replace(/^['"]|['"]$/g, '');
    if (!value || !rules.valueShape(value)) continue;
    const namedForOtherProvider =
      key &&
      !rules.keyNameRe.test(key) &&
      Object.entries(PROVIDER_KEY_RULES).some(
        ([otherProvider, other]) => otherProvider !== provider && other.keyNameRe.test(key),
      );
    if (namedForOtherProvider) continue;
    return value;
  }
  return '';
}

// ── E4: verdict ledger — check ids, evidence hashing, calibration diff ──────

/**
 * Derive a STABLE check id from a finding by stripping the volatile specifics
 * the grader interpolates (quoted artifact titles, registry ids like A11.2,
 * parenthetical discipline/roadmap tags, lesson/week numbers). Two findings
 * from the same grader check on different artifacts share one checkId.
 */
export function deriveCheckId(finding) {
  const source = String(finding?.detail || finding?.title || finding?.id || '')
    .toLowerCase()
    .replace(/"[^"]*"/g, ' ')
    .replace(/“[^”]*”/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\ba\d+\.\d+\b/g, ' ')
    .replace(/\b(lesson|week|slide|chapter|unit|criterion|item)\s+\d+\b/g, '$1-n')
    .replace(/\b\d+(?:\.\d+)*\b/g, 'n');
  const slug = source
    .replace(/[^a-z-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'unknown-check';
}

/**
 * Normalized evidence for hashing: file + detail + evidence excerpt, lowercased
 * with whitespace collapsed. Detail is included so two findings from the same
 * check on the same file (e.g. exam entries A11.2 and A11.5 of one quiz bank)
 * hash differently and stay separately ledgerable.
 */
export function normalizeFindingEvidence(finding) {
  return [finding?.file || '', finding?.detail || finding?.title || '', finding?.evidence || '']
    .join(' | ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function findingEvidenceHash(finding) {
  return crypto.createHash('sha1').update(normalizeFindingEvidence(finding)).digest('hex');
}

/** E3: verdicts and findings recorded before provider rounds carry no
 *  provider field — they are ALL openai history. Defaulting here keeps the
 *  whole stored ledger valid without a rewrite. */
export function findingProvider(entryOrFinding) {
  return entryOrFinding?.provider || 'openai';
}

/**
 * Diff current (re-graded) findings against the verdict ledger.
 *
 * @param {object} input
 * @param {Array} input.ledger entries { checkId, courseId, roundId, evidenceHash, verdict, note, provider? }
 * @param {Array} input.findings current findings { roundId, courseId, checkId, evidenceHash, severity, detail, file, provider? }
 * @param {Iterable<string>} input.storedRoundIds round dirs actually present on disk
 * @returns {{ verified: Array, missingTruePositives: Array, resurfacedFalsePositives: Array,
 *   quietFalsePositives: Array, skipped: Array, unvetted: Array, ok: boolean }}
 *
 * Rules:
 * - V0.14.5 E3: matching is namespaced by (roundId, courseId, PROVIDER) —
 *   `provider` defaults to 'openai' when absent on either side (back
 *   compatible with the pre-provider ledger). An Anthropic-only finding can
 *   therefore never read as an OpenAI regression or vice versa.
 * - true-positive entry: a current finding in the same round+course+provider
 *   with the same checkId must exist; exact evidenceHash match = 'ok',
 *   checkId-only match = 'ok (evidence drifted)'. Neither = CALIBRATION FAILURE.
 * - false-positive entry: ANY current finding in the same
 *   round+course+provider with the same checkId = CALIBRATION FAILURE (the FP
 *   pattern resurfaced). Reconstructed entries carry approximate hashes, so
 *   FP matching is by checkId, never by hash.
 * - findings not consumed by a ledger entry are 'unvetted (add a verdict)',
 *   collapsed by round+course+provider+checkId and listing their provider.
 */
export function diffLedger({ ledger, findings, storedRoundIds }) {
  const stored = new Set(storedRoundIds || []);
  const pools = new Map();
  for (const finding of findings || []) {
    const key = `${finding.roundId}|${finding.courseId}|${findingProvider(finding)}`;
    if (!pools.has(key)) pools.set(key, []);
    pools.get(key).push(finding);
  }

  const verified = [];
  const missingTruePositives = [];
  const resurfacedFalsePositives = [];
  const quietFalsePositives = [];
  const skipped = [];
  const consumed = new Set();

  for (const entry of ledger || []) {
    if (!stored.has(entry.roundId)) {
      skipped.push({ entry, status: 'skipped (round not stored locally)' });
      continue;
    }
    const pool = pools.get(`${entry.roundId}|${entry.courseId}|${findingProvider(entry)}`) || [];
    if (entry.verdict === 'true-positive') {
      const exact = pool.find((f) => f.checkId === entry.checkId && f.evidenceHash === entry.evidenceHash);
      const drifted = exact || pool.find((f) => f.checkId === entry.checkId && !consumed.has(f));
      if (exact) {
        consumed.add(exact);
        verified.push({ entry, status: 'ok', finding: exact });
      } else if (drifted) {
        consumed.add(drifted);
        verified.push({ entry, status: 'ok (evidence drifted)', finding: drifted });
      } else {
        missingTruePositives.push({ entry, status: 'MISSING — known true positive no longer detected' });
      }
    } else if (entry.verdict === 'false-positive') {
      const hits = pool.filter((f) => f.checkId === entry.checkId);
      if (hits.length > 0) {
        for (const hit of hits) consumed.add(hit);
        resurfacedFalsePositives.push({ entry, status: 'RESURFACED — known false positive fired again', hits });
      } else {
        quietFalsePositives.push({ entry, status: 'ok (still quiet)' });
      }
    } else {
      skipped.push({ entry, status: `skipped (unknown verdict "${entry.verdict}")` });
    }
  }

  const unvettedMap = new Map();
  for (const finding of findings || []) {
    if (consumed.has(finding)) continue;
    const provider = findingProvider(finding);
    const key = `${finding.roundId}|${finding.courseId}|${provider}|${finding.checkId}`;
    if (!unvettedMap.has(key)) {
      unvettedMap.set(key, {
        roundId: finding.roundId,
        courseId: finding.courseId,
        // E3: unvetted findings name their provider so a verdict written from
        // this list lands in the right namespace.
        provider,
        checkId: finding.checkId,
        severity: finding.severity,
        count: 0,
        sampleDetail: finding.detail || '',
        sampleEvidenceHash: finding.evidenceHash,
      });
    }
    unvettedMap.get(key).count += 1;
  }

  return {
    verified,
    missingTruePositives,
    resurfacedFalsePositives,
    quietFalsePositives,
    skipped,
    unvetted: [...unvettedMap.values()],
    ok: missingTruePositives.length === 0 && resurfacedFalsePositives.length === 0,
  };
}

// ── E5: history shaping ─────────────────────────────────────────────────────

/** round-2026-06-11T06-39-33-774Z → 2026-06-11T06:39:33.774Z (else null). */
export function parseRoundDirTimestamp(dirName) {
  const match = /^round-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/.exec(String(dirName || ''));
  if (!match) return null;
  return `${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`;
}

/** Chronological sort key: baselines first (by name), then rounds by timestamp. */
export function historySortKey(summary) {
  const timestamp = summary.timestamp || parseRoundDirTimestamp(summary.dirName);
  return timestamp ? `1:${timestamp}` : `0:${summary.dirName}`;
}

/**
 * Shape round summaries into a history table. Returns { header, rows } of
 * plain strings; cell format is "overall · P0/P1" per course.
 *
 * @param {Array} summaries [{ dirName, timestamp, courses: [{ id, overall, p0, p1 }], costUsd }]
 * @param {Array<string>} courseOrder preferred course-column order (extras appended alphabetically)
 */
export function buildHistoryTable(summaries, courseOrder = []) {
  const sorted = [...(summaries || [])].sort((a, b) => historySortKey(a).localeCompare(historySortKey(b)));
  const seen = new Set();
  for (const summary of sorted) for (const course of summary.courses || []) seen.add(course.id);
  const columns = [
    ...courseOrder.filter((id) => seen.has(id)),
    ...[...seen].filter((id) => !courseOrder.includes(id)).sort(),
  ];

  const header = ['Round', ...columns, 'Cost'];
  const rows = sorted.map((summary) => {
    const byId = new Map((summary.courses || []).map((course) => [course.id, course]));
    return [
      summary.dirName,
      ...columns.map((id) => {
        const course = byId.get(id);
        if (!course || !Number.isFinite(course.overall)) return '—';
        const p0 = Number.isFinite(course.p0) ? course.p0 : '?';
        const p1 = Number.isFinite(course.p1) ? course.p1 : '?';
        // v0.15 T3: the advisory judge rides the trajectory when present.
        const judge = Number.isFinite(course.judge) ? ` · j${course.judge}` : '';
        return `${course.overall} · ${p0}/${p1}${judge}`;
      }),
      Number.isFinite(summary.costUsd) ? `$${summary.costUsd.toFixed(2)}` : '—',
    ];
  });
  return { header, rows, columns };
}

// ── E6: round diff — heading-level sectionization + comparison ──────────────

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

const DOCX_HEADING_STYLE = /^(?:Title|Heading[1-9])$/;

/**
 * Per-paragraph { style, text } pairs from a docx rawXml blob (the shape
 * deepQualityGrader's extractPackage attaches to each docx file). Paragraph
 * styles (Title / Heading2 / Heading3 / ListParagraph) survive in the rawXml
 * even though the flat `paragraphs` array drops them — this re-derives them.
 */
export function docxStyledParagraphs(rawXml) {
  const out = [];
  for (const chunk of String(rawXml || '').split(/<\/w:p>/)) {
    const styleMatch = /<w:pStyle[^>]*w:val="([^"]+)"/.exec(chunk);
    const text = (chunk.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) || [])
      .map((node) => decodeXmlEntities(node.replace(/<[^>]+>/g, '')))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) out.push({ style: styleMatch ? styleMatch[1] : null, text });
  }
  return out;
}

/**
 * Split one extracted file (deepQualityGrader extractPackage shape) into
 * heading-level sections [{ heading, content }].
 * - docx: new section at every Title/Heading* styled paragraph (from rawXml).
 * - pptx: one section per slide, headed by the slide title.
 * - md/txt: new section at every markdown heading line.
 * - xlsx: a single '(workbook)' section over the cell texts.
 */
export function sectionizeFile(file) {
  const sections = [];
  const open = (heading) => {
    sections.push({ heading, content: [] });
    return sections[sections.length - 1];
  };

  if (file?.kind === 'docx') {
    let current = null;
    for (const para of docxStyledParagraphs(file.rawXml)) {
      if (para.style && DOCX_HEADING_STYLE.test(para.style)) {
        current = open(para.text);
      } else {
        if (!current) current = open('(front matter)');
        current.content.push(para.text);
      }
    }
  } else if (file?.kind === 'pptx') {
    (file.slides || []).forEach((slide, index) => {
      const section = open(slide.title || `(slide ${index + 1})`);
      section.content.push(slide.text || '');
    });
  } else if (file?.kind === 'xlsx') {
    const section = open('(workbook)');
    section.content.push((file.cellTexts || file.cells || []).join('\n'));
  } else {
    let current = null;
    for (const rawLine of file?.paragraphs || String(file?.text || '').split('\n')) {
      const line = String(rawLine);
      const headingMatch = /^#{1,6}\s+(.*)$/.exec(line.trim());
      if (headingMatch) {
        current = open(headingMatch[1].trim());
      } else if (line.trim()) {
        if (!current) current = open('(front matter)');
        current.content.push(line.trim());
      }
    }
  }

  return sections.map((section) => ({
    heading: section.heading,
    content: section.content.join('\n').replace(/\s+/g, ' ').trim(),
  }));
}

function sectionKeyMap(sections) {
  const map = new Map();
  const counts = new Map();
  for (const section of sections) {
    const base = String(section.heading || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    const occurrence = counts.get(base) || 0;
    counts.set(base, occurrence + 1);
    map.set(`${base}#${occurrence}`, section);
  }
  return map;
}

/**
 * Heading-level diff of two section lists: { added, removed, changed } where
 * each item is the section heading. 'changed' = same heading (same occurrence
 * index), different normalized content.
 */
export function diffSections(sectionsA, sectionsB) {
  const mapA = sectionKeyMap(sectionsA || []);
  const mapB = sectionKeyMap(sectionsB || []);
  const added = [];
  const removed = [];
  const changed = [];
  for (const [key, section] of mapB) {
    if (!mapA.has(key)) added.push(section.heading);
    else if (mapA.get(key).content !== section.content) changed.push(section.heading);
  }
  for (const [key, section] of mapA) {
    if (!mapB.has(key)) removed.push(section.heading);
  }
  return { added, removed, changed };
}

// ── E7: the advisory judge (--judge) — pure halves ──────────────────────────
// The judge is an off-by-default LLM pass that scores the axis the
// deterministic grader can't: "would a professor teach from this as-is?" It is
// advisory ONLY — never gates, never touches the exit code. Everything here is
// fs/network-free so sampling, prompt shaping, defensive parsing, spend
// estimation, and report rendering are unit-tested; the fetch lives in
// scripts/crucible.mjs.

export const JUDGE_MODEL = 'gpt-5.4-mini';
// Per-artifact text budget so the bundled 3-artifact prompt stays bounded.
// v0.14.3 round-2 FIX-3: bumped 4000 → 6000. The judge reads excerpts; the
// 4000-char mid-sentence cut made it score documents as "truncated / cut off
// mid-sentence" — an instrumentation artifact contaminating the signal. 3
// artifacts × 6k ≈ 18k chars (~4.5k tokens) sits comfortably in context; at
// $0.75/M input the extra ~6k chars/course is a fraction of a cent — negligible.
export const JUDGE_TEXT_CHARS = 6000;
// gpt-5.4-mini published rates (mirror of src/lib/apiUsageCost.js:60 —
// $0.75/M input, $4.50/M output; hardcoded so this node script stays free of
// the browser-side cost module's transitive imports).
export const JUDGE_MODEL_RATES_USD = { inputPerMillion: 0.75, outputPerMillion: 4.5 };

/** Mid-lesson index per the roadmap: floor(lessonCount/2), 1-based lesson no. */
export function judgeSampleIndex(lessonCount) {
  const value = Number(lessonCount);
  return Number.isFinite(value) && value > 0 ? Math.floor(value / 2) : 1;
}

/**
 * Deterministically sample the mid-lesson lesson plan, quiz bank, and study
 * guide from the grader's extracted file list. Picks the file whose
 * lessonNumber is nearest floor(lessonCount/2) (deterministic tiebreak: the
 * lower lesson number). Returns up to 3 { name, path, text } in a stable order.
 */
export function sampleJudgeArtifacts(files, lessonCount) {
  const target = judgeSampleIndex(lessonCount);
  const FEATURES = [
    { featureId: 'lessonPlans', label: 'lesson plan' },
    { featureId: 'quizBank', label: 'quiz bank' },
    { featureId: 'studyGuides', label: 'study guide' },
  ];
  const picks = [];
  for (const { featureId, label } of FEATURES) {
    const candidates = (files || []).filter((file) => file.featureId === featureId && file.lessonNumber != null);
    if (candidates.length === 0) continue;
    const best = candidates
      .slice()
      .sort(
        (a, b) =>
          Math.abs(a.lessonNumber - target) - Math.abs(b.lessonNumber - target) || a.lessonNumber - b.lessonNumber,
      )[0];
    picks.push({ name: `Lesson ${best.lessonNumber} ${label}`, path: best.path, text: best.text || '' });
  }
  return picks;
}

/**
 * v0.14.3 round-2 FIX-3: truncate the artifact text for review at a PARAGRAPH
 * boundary (the last newline before the cap) instead of mid-sentence, and when
 * truncation actually happens append an explicit marker naming the cut. The
 * judge then knows it is reading an excerpt and must not score completeness.
 * Returns the (possibly marked) excerpt — collapsed whitespace is preserved as
 * single newlines so the paragraph boundary survives the cut.
 *
 * @returns {{ text: string, truncated: boolean }}
 */
export function truncateArtifactForJudge(rawText, cap = JUDGE_TEXT_CHARS) {
  // Collapse runs of spaces/tabs but KEEP newlines so paragraph boundaries
  // remain to cut on; then trim.
  const normalized = String(rawText || '')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .replace(/ *\n */g, '\n')
    .trim();
  const total = normalized.length;
  if (total <= cap) return { text: normalized, truncated: false };
  const hardSlice = normalized.slice(0, cap);
  // Cut at the last paragraph (newline) boundary inside the budget; fall back
  // to a word boundary if the first paragraph already exceeds the cap.
  const lastNewline = hardSlice.lastIndexOf('\n');
  const cutAt = lastNewline > Math.floor(cap * 0.5) ? lastNewline : hardSlice.lastIndexOf(' ');
  const kept = (cutAt > 0 ? hardSlice.slice(0, cutAt) : hardSlice).trimEnd();
  const marker = `\n[…document continues — truncated for this review at ${kept.length} of ${total} chars]`;
  return { text: `${kept}${marker}`, truncated: true };
}

/** Bundle the 3 artifact texts into ONE judge prompt (one provider call/course). */
export function buildJudgePrompt(course, artifacts) {
  const discipline = course?.title || course?.id || 'this discipline';
  const blocks = (artifacts || []).map(
    (artifact, index) =>
      `Artifact ${index + 1} — ${artifact.name}:\n` + `${truncateArtifactForJudge(artifact.text).text}`,
  );
  return [
    `You are a professor in ${discipline} reviewing teaching materials.`,
    // FIX-3: the judge reads EXCERPTS; tell it not to penalize the cut so an
    // instrumentation truncation never contaminates the "teach as-is?" signal.
    'Artifacts are excerpts truncated for review — do NOT penalize truncation or judge completeness beyond the excerpt; judge quality of what is shown.',
    `For each of the ${blocks.length} artifacts, score 1-10 on "would I teach from this as-is?" and give two sentences of reasoning.`,
    'Then give one overall 1-10 and a two-sentence verdict.',
    'Return JSON {"artifacts":[{"name","score","notes"}],"overall","verdict"}.',
    '',
    blocks.join('\n\n'),
  ].join('\n');
}

/**
 * Defensively parse the judge's response into
 * { artifacts:[{name,score,notes}], overall, verdict } or null. The judge
 * output is advisory, so ANY malformed response returns null (the caller logs
 * 'judge: unparseable' and nothing is affected). Tolerates code fences and
 * surrounding prose by extracting the outermost {...} object.
 */
export function parseJudgeResponse(raw) {
  if (raw == null) return null;
  const text = String(raw).trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let parsed;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const overall = Number(parsed.overall);
  const verdict = typeof parsed.verdict === 'string' ? parsed.verdict.trim() : '';
  const artifacts = Array.isArray(parsed.artifacts)
    ? parsed.artifacts
        .map((entry) => ({
          name: typeof entry?.name === 'string' ? entry.name.trim() : '',
          score: Number(entry?.score),
          notes: typeof entry?.notes === 'string' ? entry.notes.trim() : '',
        }))
        .filter((entry) => entry.name || Number.isFinite(entry.score) || entry.notes)
    : [];
  if (!Number.isFinite(overall) && artifacts.length === 0) return null;
  return { artifacts, overall: Number.isFinite(overall) ? overall : null, verdict };
}

/** Estimate the judge call cost from OpenAI usage tokens at gpt-5.4-mini rates. */
export function judgeSpendUsd(usage, rates = JUDGE_MODEL_RATES_USD) {
  const inputTokens = Number(usage?.prompt_tokens ?? usage?.promptTokens) || 0;
  const outputTokens = Number(usage?.completion_tokens ?? usage?.completionTokens) || 0;
  return (inputTokens / 1e6) * rates.inputPerMillion + (outputTokens / 1e6) * rates.outputPerMillion;
}

/**
 * The round-table 'judge' column value: "N/10" when parsed, else BLANK (off,
 * unparseable, or errored). The judge never overrides a deterministic receipt,
 * so an empty cell is the honest default.
 */
export function judgeOverallCell(judge) {
  if (!judge || !judge.parsed || !Number.isFinite(judge.parsed.overall)) return '';
  return `${judge.parsed.overall}/10`;
}

/** The "## Advisory judge (LLM, non-gating)" section for a course report.md. */
export function renderJudgeSection(judge) {
  const lines = ['## Advisory judge (LLM, non-gating)', ''];
  if (!judge || !judge.parsed) {
    lines.push(`_${judge?.note || 'judge: unparseable'} — advisory only, never gates._`, '');
    return lines.join('\n');
  }
  const parsed = judge.parsed;
  lines.push(
    `_LLM professor-read on ${parsed.artifacts.length} sampled artifact(s). Advisory only — never gates, never overrides the deterministic grade._`,
    '',
    `**Overall: ${Number.isFinite(parsed.overall) ? `${parsed.overall}/10` : 'n/a'}** — ${parsed.verdict || '(no verdict)'}`,
    '',
  );
  for (const artifact of parsed.artifacts) {
    lines.push(
      `- **${artifact.name || '(unnamed)'}: ${Number.isFinite(artifact.score) ? `${artifact.score}/10` : 'n/a'}** — ${artifact.notes || ''}`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

// ── v0.15.3 D2: the per-course-means ruler ──────────────────────────────────
// The variance note's verdict made per-course judge MEANS the real KPI (the
// band is 3–6; single readings are ±1 noise). These pure halves compute the
// means from stored round summaries and render the KPI section every
// ROUND_REPORT now carries below the trajectory table.

// The v0.15.2 characterization baseline (docs/JUDGE_VARIANCE_NOTE.md, 51
// artifacts / 11 rounds). Δ in the means table reads against these numbers;
// re-baseline only when the judge model or prompt changes.
export const JUDGE_MEANS_BASELINE = {
  label: 'v0.15.2 note (2026-06-12)',
  means: {
    'world-lit': 5.4,
    'world-lit-readings': 5.33,
    geology: 4.5,
    'econ-intro': 4.2,
    'cs-python': 4.08,
    mandarin: 3.86,
    'psych-101': 3.67,
  },
};

/** The named target on the wall: the weakest course mean crossing 5. */
export const JUDGE_MEANS_TARGET = 'mandarin 3.86 → 5+';

/**
 * Per-course judge means ± sd across stored round summaries
 * ([{ courses: [{ id, judge }] }]). Twin/tagged ids ("world-lit--voiced",
 * "cs-python--native") fold into their base course — the KPI tracks course
 * identity, not arm identity. Courses with fewer than `minN` readings are
 * excluded (a single reading is noise, per the note). Sorted by mean desc.
 */
export function computeJudgeMeans(summaries, { minN = 2 } = {}) {
  const byCourse = new Map();
  for (const summary of summaries || []) {
    for (const course of summary?.courses || []) {
      if (!Number.isFinite(course?.judge)) continue;
      const baseId = String(course.id).split('--')[0];
      if (!byCourse.has(baseId)) byCourse.set(baseId, []);
      byCourse.get(baseId).push(course.judge);
    }
  }
  const rows = [];
  for (const [id, values] of byCourse) {
    if (values.length < minN) continue;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const sd = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
    rows.push({
      id,
      n: values.length,
      mean: Math.round(mean * 100) / 100,
      sd: Math.round(sd * 100) / 100,
      min: Math.min(...values),
      max: Math.max(...values),
    });
  }
  return rows.sort((a, b) => b.mean - a.mean || a.id.localeCompare(b.id));
}

/** The "## Per-course judge means" KPI section (markdown). */
export function renderJudgeMeansSection(means, { baseline = JUDGE_MEANS_BASELINE } = {}) {
  const lines = [
    '## Per-course judge means (the KPI)',
    '',
    `_Single readings are ±1 noise — the teachability KPI is each course's MEAN moving (target: ${JUDGE_MEANS_TARGET}). Δ reads against the ${baseline.label} baseline; see docs/JUDGE_VARIANCE_NOTE.md._`,
    '',
  ];
  if (!means || means.length === 0) {
    lines.push('_No course has 2+ judge readings yet — run rounds with --judge to feed the ruler._', '');
    return lines.join('\n');
  }
  lines.push('| course | n | mean | sd | range | Δ vs baseline |', '| --- | --- | --- | --- | --- | --- |');
  for (const row of means) {
    const base = baseline.means?.[row.id];
    const delta = Number.isFinite(base) ? `${row.mean - base >= 0 ? '+' : ''}${(row.mean - base).toFixed(2)}` : '—';
    lines.push(
      `| ${row.id} | ${row.n} | ${row.mean.toFixed(2)} | ${row.sd.toFixed(2)} | ${row.min}–${row.max} | ${delta} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

// ── v0.14.5 WS-B (B3): authoring side-by-side (--authoring) ─────────────────
// Pure halves of the prose-vs-native paired round: course-list expansion,
// entry pairing, delta computation, and report rendering. scripts/crucible.mjs
// owns the flag parsing entry point and all I/O. The P0/drift gates apply to
// each run INDEPENDENTLY through the normal entry flow — nothing here gates.

// Acceptance bar (V0.14.5 B3): native within 2 points on every course and a
// cost cut of 20% or better. Report-only — the default flip is a human call
// after two consecutive clean rounds.
export const AUTHORING_SCORE_TOLERANCE = 2;
export const AUTHORING_COST_CUT_TARGET = 0.2;

/**
 * v0.14.7 WS-D3: --voice off|on|both; v0.14.9 C2 adds 'ab' — the
 * same-generation A/B (generate ONCE with the flag off, post-hoc voice the
 * same compiled state, export twin zips). Anything else throws.
 */
export function parseVoiceFlag(raw) {
  if (raw === undefined || raw === null || raw === true || raw === '') return 'off';
  const value = String(raw).toLowerCase();
  if (value === 'off' || value === 'on' || value === 'both' || value === 'ab') return value;
  throw new Error(`--voice must be off, on, both, or ab (got "${raw}")`);
}

/**
 * Expand the course list for a voice round (mirrors the authoring expansion:
 * default 'off' keeps run-dir naming EXACTLY; 'on'/'both' suffix the run
 * dirs — course--quiet / course--voiced — and carry { baseId, voice } so
 * twins stay pairable). Apply AFTER the authoring expansion.
 *
 * 'ab' deliberately does NOT expand: one browser run per course produces
 * BOTH arms (the driver exports quiet, runs the post-hoc voice pass, exports
 * voiced) — that is what de-confounds the comparison. The voiced twin entry
 * is fabricated by the round loop from the second zip.
 */
export function expandCoursesForVoice(courses, voice = 'off') {
  const list = Array.isArray(courses) ? courses : [];
  if (voice === 'off') {
    // v0.15.1 F2 (post-flip): the default round carries NO voice tag — the
    // app default (on) applies. An EXPLICIT quiet arm comes from 'both'/'ab'.
    return list.map((course) => ({ ...course }));
  }
  if (voice === 'ab') {
    return list.map((course) => ({ ...course, baseId: course.baseId || course.id, voice: 'ab', abArm: 'quiet' }));
  }
  const modes = voice === 'both' ? ['off', 'on'] : [voice];
  return list.flatMap((course) =>
    modes.map((mode) => ({
      ...course,
      id: `${course.id}--${mode === 'on' ? 'voiced' : 'quiet'}`,
      baseId: course.baseId || course.id,
      voice: mode,
    })),
  );
}

/**
 * v0.14.9 C2: pair the two arms of every --voice ab course in a finished
 * entry list. The quiet arm is the course's main entry (abArm 'quiet'); the
 * voiced twin was fabricated from the second zip (abArm 'voiced',
 * id `${baseId}--voiced`). Returns [{ baseId, quiet, voiced }].
 */
export function pairVoiceAbEntries(entries = []) {
  const arms = entries.filter((entry) => entry?.course?.abArm);
  const byBase = new Map();
  for (const entry of arms) {
    const baseId = entry.course.baseId || entry.course.id;
    const pair = byBase.get(baseId) || { baseId, quiet: null, voiced: null };
    pair[entry.course.abArm === 'voiced' ? 'voiced' : 'quiet'] = entry;
    byBase.set(baseId, pair);
  }
  return [...byBase.values()];
}

/**
 * The voice A/B verdict section for ROUND_REPORT.md. Reads each arm's judge
 * overall (advisory) and structural score; the per-course verdict is which
 * arm the judge preferred. The BAR (met twice on different days before any
 * default talk): judge prefers voiced on a majority of courses with the
 * voiced arm's structural grade held.
 */
export function renderVoiceAbSection(pairs = []) {
  if (pairs.length === 0) return '';
  const lines = ['## Voice A/B (same generation — de-confounded)', ''];
  let voicedWins = 0;
  let quietWins = 0;
  let ties = 0;
  for (const pair of pairs) {
    const quietJudge = pair.quiet?.judge?.parsed?.overall ?? null;
    const voicedJudge = pair.voiced?.judge?.parsed?.overall ?? null;
    const quietScore = pair.quiet?.gradeResult?.overallScore ?? pair.quiet?.gradeResult?.score ?? null;
    const voicedScore = pair.voiced?.gradeResult?.overallScore ?? pair.voiced?.gradeResult?.score ?? null;
    let verdict = 'no judge — structural only';
    if (Number.isFinite(quietJudge) && Number.isFinite(voicedJudge)) {
      if (voicedJudge > quietJudge) {
        verdict = 'judge prefers VOICED';
        voicedWins += 1;
      } else if (quietJudge > voicedJudge) {
        verdict = 'judge prefers QUIET';
        quietWins += 1;
      } else {
        verdict = 'judge tie';
        ties += 1;
      }
    }
    lines.push(
      `- **${pair.baseId}**: quiet ${quietScore ?? '—'}/judge ${quietJudge ?? '—'} vs voiced ${voicedScore ?? '—'}/judge ${voicedJudge ?? '—'} — ${verdict}`,
    );
  }
  const judged = voicedWins + quietWins + ties;
  if (judged > 0) {
    lines.push(
      '',
      `**Tally:** voiced ${voicedWins} · quiet ${quietWins} · ties ${ties} — bar (this round): voiced wins a majority with structural held.`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

/** --authoring prose|native|both. Omitted means the plain current-default app path. */
export function parseAuthoringFlag(raw) {
  if (raw === undefined || raw === null || raw === true || raw === '') return 'prose';
  const value = String(raw).toLowerCase();
  if (value === 'prose' || value === 'native' || value === 'both') return value;
  throw new Error(`--authoring must be prose, native, or both (got "${raw}")`);
}

/**
 * Expand the course list for an authoring round. Plain rounds keep today's
 * run-dir naming EXACTLY (course.id, no suffix) so stored history and
 * baselines stay comparable while still seeding no mode and testing current app
 * defaults. Explicit 'native' and 'both' suffix the run dirs
 * (course--prose / course--native) and carry { baseId, authoring } so every
 * downstream consumer (reports, gates, history columns) treats each run as
 * its own course while pairing can still find the twins.
 */
export function expandCoursesForAuthoring(courses, authoring = 'prose') {
  const list = Array.isArray(courses) ? courses : [];
  if (authoring === 'prose') {
    // v0.15.1 F1 (post-flip): PLAIN rounds carry NO authoring tag — the
    // driver seeds nothing and the app default (native) applies, so release
    // rounds test what users actually get. Explicit --authoring arms still
    // tag and seed their mode.
    return list.map((course) => ({ ...course, baseId: course.id }));
  }
  const modes = authoring === 'both' ? ['prose', 'native'] : [authoring];
  return list.flatMap((course) =>
    modes.map((mode) => ({ ...course, id: `${course.id}--${mode}`, baseId: course.id, authoring: mode })),
  );
}

/** digest.gates.enrichmentCoverage — the kernel-coverage fraction (or null). */
export function kernelCoverageFromDigest(digest) {
  const value = digest?.gates?.enrichmentCoverage;
  return Number.isFinite(value) ? value : null;
}

function entryDigest(entry) {
  return entry?.runResult?.digest || entry?.digest || null;
}

/** The comparable stats for one round entry (cost prefers spendUsd — it
 *  includes failed attempts — falling back to the digest). */
export function authoringEntryStats(entry) {
  if (!entry) return null;
  const digest = entryDigest(entry);
  const digestCost = digestCostUsd(digest);
  return {
    overall: Number.isFinite(entry.gradeResult?.overall) ? entry.gradeResult.overall : null,
    p0: Number.isFinite(entry.gradeResult?.p0Count) ? entry.gradeResult.p0Count : null,
    p1: Number.isFinite(entry.gradeResult?.p1Count) ? entry.gradeResult.p1Count : null,
    costUsd: Number.isFinite(entry.runResult?.spendUsd) ? entry.runResult.spendUsd : digestCost > 0 ? digestCost : null,
    durationMs: Number.isFinite(entry.runResult?.attemptsDurationMs)
      ? entry.runResult.attemptsDurationMs
      : Number.isFinite(entry.runResult?.durationMs)
        ? entry.runResult.durationMs
        : null,
    kernelCoverage: kernelCoverageFromDigest(digest),
  };
}

/**
 * Group round entries into prose/native twins by baseId. Entries without an
 * authoring tag (plain rounds, older course.json files) are ignored — there
 * is nothing to pair. Partial pairs (one side failed to produce an entry)
 * are kept so the report can say which side is missing.
 */
export function pairAuthoringEntries(entries) {
  const byBase = new Map();
  for (const entry of entries || []) {
    const authoring = entry?.course?.authoring;
    if (authoring !== 'prose' && authoring !== 'native') continue;
    const baseId = entry.course.baseId || entry.course.id;
    if (!byBase.has(baseId)) byBase.set(baseId, { courseId: baseId, prose: null, native: null });
    byBase.get(baseId)[authoring] = entry;
  }
  return [...byBase.values()].filter((pair) => pair.prose || pair.native);
}

/**
 * Per-course deltas against the B3 acceptance bar. Score delta is
 * native − prose (positive = native better); cost delta is the native cost
 * as a fraction change vs prose (−0.25 = 25% cheaper). Verdict flags are
 * REPORT-ONLY: the default flip needs them clean twice on different days.
 */
export function buildAuthoringComparison(
  pairs,
  { scoreTolerance = AUTHORING_SCORE_TOLERANCE, costCutTarget = AUTHORING_COST_CUT_TARGET } = {},
) {
  const rows = [];
  for (const pair of pairs || []) {
    const prose = authoringEntryStats(pair.prose);
    const native = authoringEntryStats(pair.native);
    const complete = Boolean(prose && native);
    const scoreDelta =
      complete && Number.isFinite(prose.overall) && Number.isFinite(native.overall)
        ? Math.round((native.overall - prose.overall) * 100) / 100
        : null;
    const costDeltaPct =
      complete && Number.isFinite(prose.costUsd) && prose.costUsd > 0 && Number.isFinite(native.costUsd)
        ? Math.round(((native.costUsd - prose.costUsd) / prose.costUsd) * 1000) / 1000
        : null;
    const durationDeltaMs =
      complete && Number.isFinite(prose.durationMs) && Number.isFinite(native.durationMs)
        ? native.durationMs - prose.durationMs
        : null;
    rows.push({
      courseId: pair.courseId,
      prose,
      native,
      complete,
      scoreDelta,
      costDeltaPct,
      durationDeltaMs,
      scoreWithinTolerance: scoreDelta === null ? null : scoreDelta >= -scoreTolerance,
      costCutMet: costDeltaPct === null ? null : costDeltaPct <= -costCutTarget,
    });
  }
  return rows;
}

const fmtScore = (value) => (Number.isFinite(value) ? String(value) : '—');
const fmtCost = (value) => (Number.isFinite(value) ? `$${value.toFixed(2)}` : '—');
const fmtSeconds = (ms) => (Number.isFinite(ms) ? `${Math.round(ms / 1000)}s` : '—');
const fmtCoverage = (value) => (Number.isFinite(value) ? `${Math.round(value * 100)}%` : '—');

/** "## Authoring side-by-side" markdown: paired columns + the delta block. */
export function renderAuthoringSection(comparison) {
  const rows = Array.isArray(comparison) ? comparison : [];
  if (rows.length === 0) return '';
  const lines = [
    '## Authoring side-by-side (prose vs native)',
    '',
    '_Same course, same model, both authoring paths. Gates (P0, in-app drift) apply to each run independently above; this section is the paired comparison for the B3 acceptance bar: native within ' +
      `${AUTHORING_SCORE_TOLERANCE} points, cost −${Math.round(AUTHORING_COST_CUT_TARGET * 100)}% or better._`,
    '',
    '| Course | Score (prose → native) | Cost (prose → native) | Wall-clock (prose → native) | Kernel coverage (prose → native) | P0/P1 (prose) | P0/P1 (native) |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const row of rows) {
    lines.push(
      `| ${row.courseId} | ${fmtScore(row.prose?.overall)} → ${fmtScore(row.native?.overall)} | ` +
        `${fmtCost(row.prose?.costUsd)} → ${fmtCost(row.native?.costUsd)} | ` +
        `${fmtSeconds(row.prose?.durationMs)} → ${fmtSeconds(row.native?.durationMs)} | ` +
        `${fmtCoverage(row.prose?.kernelCoverage)} → ${fmtCoverage(row.native?.kernelCoverage)} | ` +
        `${row.prose ? `${row.prose.p0 ?? '?'}/${row.prose.p1 ?? '?'}` : '—'} | ` +
        `${row.native ? `${row.native.p0 ?? '?'}/${row.native.p1 ?? '?'}` : '—'} |`,
    );
  }
  lines.push('', '### Deltas (native vs prose)', '');
  for (const row of rows) {
    if (!row.complete) {
      lines.push(`- **${row.courseId}**: incomplete pair (${row.prose ? 'native' : 'prose'} run missing)`);
      continue;
    }
    const scorePart =
      row.scoreDelta === null
        ? 'score n/a'
        : `score ${row.scoreDelta >= 0 ? '+' : ''}${row.scoreDelta} (within ${AUTHORING_SCORE_TOLERANCE}: ${row.scoreWithinTolerance ? 'yes' : 'NO'})`;
    const costPart =
      row.costDeltaPct === null
        ? 'cost n/a'
        : `cost ${row.costDeltaPct > 0 ? '+' : ''}${Math.round(row.costDeltaPct * 100)}% (≥${Math.round(AUTHORING_COST_CUT_TARGET * 100)}% cut: ${row.costCutMet ? 'yes' : 'NO'})`;
    const clockPart =
      row.durationDeltaMs === null
        ? 'wall-clock n/a'
        : `wall-clock ${row.durationDeltaMs >= 0 ? '+' : '−'}${Math.round(Math.abs(row.durationDeltaMs) / 1000)}s`;
    lines.push(`- **${row.courseId}**: ${scorePart} · ${costPart} · ${clockPart}`);
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Pair extracted files across two rounds. Filenames embed lesson TITLES (which
 * may change between generations), so pairing keys on the stable parts:
 * top folder + lesson number + file kind; ties broken by exact path, then by
 * within-group order.
 */
export function pairExtractedFiles(filesA, filesB) {
  const keyOf = (file) => `${file.top}|${file.lessonNumber ?? 'course'}|${file.kind}`;
  const groupBy = (files) => {
    const groups = new Map();
    for (const file of files || []) {
      const key = keyOf(file);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(file);
    }
    return groups;
  };
  const groupsA = groupBy(filesA);
  const groupsB = groupBy(filesB);
  const pairs = [];
  const onlyA = [];
  const onlyB = [];
  for (const [key, listA] of groupsA) {
    const listB = [...(groupsB.get(key) || [])];
    for (const fileA of listA) {
      const exactIndex = listB.findIndex((candidate) => candidate.path === fileA.path);
      const index = exactIndex >= 0 ? exactIndex : listB.length > 0 ? 0 : -1;
      if (index >= 0) pairs.push({ a: fileA, b: listB.splice(index, 1)[0] });
      else onlyA.push(fileA);
    }
    if (listB.length > 0) onlyB.push(...listB);
    groupsB.delete(key);
  }
  for (const listB of groupsB.values()) onlyB.push(...listB);
  return { pairs, onlyA, onlyB };
}
