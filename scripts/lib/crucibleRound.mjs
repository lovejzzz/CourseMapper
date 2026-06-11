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

/**
 * Diff current (re-graded) findings against the verdict ledger.
 *
 * @param {object} input
 * @param {Array} input.ledger entries { checkId, courseId, roundId, evidenceHash, verdict, note }
 * @param {Array} input.findings current findings { roundId, courseId, checkId, evidenceHash, severity, detail, file }
 * @param {Iterable<string>} input.storedRoundIds round dirs actually present on disk
 * @returns {{ verified: Array, missingTruePositives: Array, resurfacedFalsePositives: Array,
 *   quietFalsePositives: Array, skipped: Array, unvetted: Array, ok: boolean }}
 *
 * Rules:
 * - true-positive entry: a current finding in the same round+course with the
 *   same checkId must exist; exact evidenceHash match = 'ok', checkId-only
 *   match = 'ok (evidence drifted)'. Neither = CALIBRATION FAILURE.
 * - false-positive entry: ANY current finding in the same round+course with
 *   the same checkId = CALIBRATION FAILURE (the FP pattern resurfaced).
 *   Reconstructed entries carry approximate hashes, so FP matching is by
 *   checkId, never by hash.
 * - findings not consumed by a ledger entry are 'unvetted (add a verdict)',
 *   collapsed by round+course+checkId.
 */
export function diffLedger({ ledger, findings, storedRoundIds }) {
  const stored = new Set(storedRoundIds || []);
  const pools = new Map();
  for (const finding of findings || []) {
    const key = `${finding.roundId}|${finding.courseId}`;
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
    const pool = pools.get(`${entry.roundId}|${entry.courseId}`) || [];
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
    const key = `${finding.roundId}|${finding.courseId}|${finding.checkId}`;
    if (!unvettedMap.has(key)) {
      unvettedMap.set(key, {
        roundId: finding.roundId,
        courseId: finding.courseId,
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
        return `${course.overall} · ${p0}/${p1}`;
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
