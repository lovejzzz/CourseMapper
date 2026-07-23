/**
 * Export slide decks as PowerPoint (.pptx) using pptxgenjs.
 * World-class educational slide design with universally-installed fonts,
 * assertion-evidence layouts, and rich visual hierarchy.
 *
 * Features:
 *   - Auto font sizing via Canvas API (prevents text overflow)
 *   - Slide element validation (out-of-bounds + overlap detection)
 *   - LaTeX rendering for STEM courses (Unicode + KaTeX image)
 *
 * Fonts: Georgia (headings) + Trebuchet MS (body). Until v0.12.0 this file
 * specced Montserrat + Open Sans, which are NOT installed on most machines:
 * PowerPoint and Keynote silently substituted their default faces, so the
 * downloaded deck lost the designed typography entirely ("dull font").
 * Georgia and Trebuchet MS ship with every Windows and macOS install AND are
 * native in Google Slides, so the deck renders as designed on every path.
 * pptxgenjs cannot embed fonts — only universally-present faces are safe.
 */

import { autoFitFontSize, autoFitBullets, createElementTracker, SLIDE_W, SLIDE_H } from './slideTextFit.js';
import { containsLatex, deckDataContainsLatex, processSlideText } from '../latexRenderer.js';
import { expandKeys } from '../keyMaps.js';
import { assertOfficeExportHasNoInternalText } from '../exportTextInspector.js';
import { safeImport } from '../safeImport.js';

let _PptxGenJS;

async function getPptxGen() {
  if (!_PptxGenJS) {
    const mod = await safeImport(() => import('pptxgenjs'));
    _PptxGenJS = mod.default || mod;
  }
  return _PptxGenJS;
}

// ── Font constants (installed on every Windows/macOS machine + Google
// Slides native — see header note; do not spec fonts that need installing) ──
const FONT_HEADING = 'Georgia';
const FONT_BODY = 'Trebuchet MS';
const FONT_LABEL = 'Trebuchet MS';

// ── Rich university color themes ───────────────────────────────────────────
export const THEMES = [
  {
    name: 'Navy & Gold',
    primary: '1E3A5F',
    secondary: '2E86AB',
    accent: 'F6C90E',
    light: 'EEF4FF',
    sideBar: '1E3A5F',
    body: 'FFFFFF',
    titleText: 'FFFFFF',
    bodyText: '1A1A2E',
    subtleText: '6B7FA3',
  },
  {
    name: 'Forest & Amber',
    primary: '1B4332',
    secondary: '52B788',
    accent: 'F4A261',
    light: 'F0FFF4',
    sideBar: '1B4332',
    body: 'FFFFFF',
    titleText: 'FFFFFF',
    bodyText: '1B2B1F',
    subtleText: '52796F',
  },
  {
    name: 'Purple & Orange',
    primary: '4A1C96',
    secondary: '7B2FBE',
    accent: 'FF6B35',
    light: 'FAF5FF',
    sideBar: '4A1C96',
    body: 'FFFFFF',
    titleText: 'FFFFFF',
    bodyText: '2D1B40',
    subtleText: '7C3AED',
  },
  {
    name: 'Crimson & Gold',
    primary: '8B0000',
    secondary: 'C62828',
    accent: 'FFD700',
    light: 'FFF9F9',
    sideBar: '8B0000',
    body: 'FFFFFF',
    titleText: 'FFFFFF',
    bodyText: '2D0A0A',
    subtleText: '9E3030',
  },
  {
    name: 'Ocean & Cyan',
    primary: '0C3547',
    secondary: '1565C0',
    accent: '00BCD4',
    light: 'F0FBFF',
    sideBar: '0C3547',
    body: 'FFFFFF',
    titleText: 'FFFFFF',
    bodyText: '0A1628',
    subtleText: '2196F3',
  },
];

// ── Per-course accent families (v0.12.1) ───────────────────────────────────
// The v0.12 audit found all four flagship courses shipping the identical
// navy/gold palette. Keep the navy base but derive a stable accent family
// from the course name so each course is visibly distinct in a thumbnail
// strip. Accents are applied ONLY to accent elements (tags, progress dots,
// highlight bands, label text) — body text colors are untouched. Every value
// keeps ≥4.5:1 contrast against the navy primary (1E3A5F) because the accent
// doubles as label text on dark slides.
export const ACCENT_FAMILIES = [
  { name: 'Gold', accent: 'F6C90E' }, // current default — family 0 keeps it
  { name: 'Sage', accent: 'A8C686' },
  { name: 'Teal', accent: '4FD1C5' },
  { name: 'Terracotta', accent: 'E89072' },
  { name: 'Plum', accent: 'C9A0DC' },
];

const VISUAL_NOTE_LABELS = [
  'Slide visual cue',
  'Teaching visual plan',
  'Instructor visual note',
  'Visual support note',
];
const ACCESSIBILITY_NOTE_LABELS = [
  'Accessibility note',
  'Alt-text cue',
  'Nonvisual access note',
  'Accessible reading note',
];

/**
 * FNV-1a over normalized text. Used for stable presentation variation —
 * same course/deck/slide input always maps to the same output.
 */
function stableHash(value) {
  const key = String(value || '')
    .trim()
    .toLowerCase();
  if (!key) return 0;
  let h = 0x811c9dc5; // FNV-1a 32-bit offset basis
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministically pick an accent family for a course name.
 * Same name always maps to the same family; no randomness, no ordering
 * dependence.
 */
export function accentFamilyForCourse(courseName) {
  return ACCENT_FAMILIES[stableHash(courseName) % ACCENT_FAMILIES.length];
}

/**
 * Apply the course-derived accent to a resolved theme. Only the default
 * Navy & Gold theme is re-accented — when an instructor explicitly picks a
 * non-default theme (Forest & Amber, …) their accent choice is respected.
 */
function themeWithCourseAccent(theme, courseName) {
  if (!theme || theme.name !== 'Navy & Gold') return theme;
  const family = accentFamilyForCourse(courseName);
  if (!family || family.accent === theme.accent) return theme;
  return { ...theme, accent: family.accent };
}

function noteLabel(labels, ...parts) {
  return labels[stableHash(parts.filter(Boolean).join(' | ')) % labels.length];
}

// ── Slide type detection ───────────────────────────────────────────────────
function getSlideType(slide) {
  if (slide.type) {
    const t = slide.type.toLowerCase();
    if (t === 'title') return 'title';
    if (t === 'agenda') return 'agenda';
    if (t === 'summary' || t === 'closing') return 'summary';
    if (t === 'activity' || t === 'exercise') return 'activity';
    if (t === 'question' || t === 'discussion') return 'question';
    if (t === 'objectives' || t === 'learning_objectives') return 'objectives';
    if (t === 'bridge') return 'bridge';
    if (t === 'example') return 'example';
    if (t === 'keyterm' || t === 'key_term' || t === 'definition') return 'keyTerm';
    // Explicit 'content' (the most common emitted type) was previously
    // missing from this list — the fallback heuristic below then
    // misclassified any content slide whose title happened to contain
    // words like "learn", "goal", "review", "agenda"… Now that slide.type
    // is respected authoritatively, the heuristic is a pure fallback for
    // slides with no type set.
    if (t === 'content') return 'content';
  }
  const t = (slide.title || '').toLowerCase();
  if (/welcome|intro|title|overview/i.test(t)) return 'title';
  if (/agenda|outline|today|roadmap/i.test(t)) return 'agenda';
  if (/summary|recap|takeaway|conclusion|wrap/i.test(t)) return 'summary';
  if (/activity|exercise|workshop|group|breakout|hands.?on/i.test(t)) return 'activity';
  if (/objective|goal|outcome|learn/i.test(t)) return 'objectives';
  if (/question|q\s*&\s*a|quiz|discuss/i.test(t)) return 'question';
  if (/bridge|last\s*time|previously|review/i.test(t)) return 'bridge';
  if (/example|case\s*study|scenario|illustration/i.test(t)) return 'example';
  if (/key\s*term|definition|concept|glossary/i.test(t)) return 'keyTerm';
  return 'content';
}

function getGeneratedVisualImage(visual) {
  return visual?.generatedImage || visual?.image || visual?.img || null;
}

function countSpeakerNoteWords(value) {
  return (String(value || '').match(/[A-Za-z][A-Za-z'-]*/g) || []).length;
}

function buildFallbackSpeakerNotes(deck, slide, slideIndex, totalSlides) {
  const lessonTitle = deck.lessonTitle || deck.title || `Lesson ${deck._deckIndex + 1 || 1}`;
  const slideTitle = slide.title || `Slide ${slideIndex + 1}`;
  const rawBullets = Array.isArray(slide.bullets) ? slide.bullets : Array.isArray(slide.content) ? slide.content : [];
  // Bullets are clause fragments inside this sentence — strip their terminal
  // periods (v0.14.3 punctuates long display bullets) so the join never
  // produces ".; " or ".." seams.
  const bullets = rawBullets
    .slice(0, 3)
    .map((bullet) => String(bullet).trim().replace(/\.+$/, ''))
    .filter(Boolean)
    .join('; ');
  const focus = bullets || 'the central concept on this slide';
  return [
    `Use this slide in ${lessonTitle} to frame "${slideTitle}" as part ${slideIndex + 1} of ${totalSlides}.`,
    `Connect the visual message to the lesson objective, then walk through ${focus}.`,
    'Ask students to name one implication, misconception, or application before moving to the next slide.',
  ].join(' ');
}

// ── Progress dot builder ───────────────────────────────────────────────────
function addProgressDots(pptx, slide, theme, slideIndex, totalSlides, isDark) {
  const W = 10,
    H = 5.625;
  const dotR = 0.06;
  const dotGap = 0.2;
  const maxDots = Math.min(totalSlides, 20);
  const totalW = maxDots * dotGap;
  const startX = 0.4;
  const y = H - 0.18;

  for (let i = 0; i < maxDots; i++) {
    const isCurrent = i === slideIndex;
    slide.addShape(pptx.ShapeType.ellipse, {
      x: startX + i * dotGap,
      y: y - dotR,
      w: dotR * 2,
      h: dotR * 2,
      fill: { color: isCurrent ? theme.accent : isDark ? 'FFFFFF' : theme.primary, transparency: isCurrent ? 0 : 70 },
      line: { width: 0 },
      altText: isCurrent ? `Current slide ${slideIndex + 1} of ${totalSlides}` : 'Decorative',
    });
  }
}

// Font-free seven-segment glyphs for the slide-number badge. A previous 5x7
// pixel implementation was technically complete in OOXML, but LibreOffice
// intermittently omitted individual 0.025-inch rectangles. Thick native lines
// need far fewer objects and survive both PowerPoint and LibreOffice rendering.
const SLIDE_COUNTER_SEGMENTS = {
  0: ['a', 'b', 'c', 'd', 'e', 'f'],
  1: ['b', 'c'],
  2: ['a', 'b', 'g', 'e', 'd'],
  3: ['a', 'b', 'g', 'c', 'd'],
  4: ['f', 'g', 'b', 'c'],
  5: ['a', 'f', 'g', 'c', 'd'],
  6: ['a', 'f', 'g', 'e', 'c', 'd'],
  7: ['a', 'b', 'c'],
  8: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  9: ['a', 'b', 'c', 'd', 'f', 'g'],
};

function addSlideCounterBadge(pptx, slide, label, backgroundColor, glyphColor, x, y, w, h) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    fill: { color: backgroundColor },
    line: { color: backgroundColor, transparency: 100 },
    altText: `Slide ${label.replace('/', ' of ')}`,
    objectName: `slide-counter-${label.replace('/', '-of-')}`,
  });
  const digitW = 0.105;
  const digitH = 0.205;
  const advance = 0.205;
  const slashW = 0.09;
  const slashAdvance = 0.17;
  const totalGlyphW = [...label].reduce((sum, character) => sum + (character === '/' ? slashAdvance : advance), 0);
  let cursorX = x + (w - totalGlyphW) / 2;
  const glyphY = y + (h - digitH) / 2;
  const segmentCoords = {
    a: [0, 0, digitW, 0],
    b: [digitW, 0, 0.001, digitH / 2],
    c: [digitW, digitH / 2, 0.001, digitH / 2],
    d: [0, digitH, digitW, 0],
    e: [0, digitH / 2, 0.001, digitH / 2],
    f: [0, 0, 0.001, digitH / 2],
    g: [0, digitH / 2, digitW, 0],
  };
  const addCounterLine = (shapeType, lineX, lineY, lineW, lineH) => {
    slide.addShape(shapeType, {
      x: lineX,
      y: lineY,
      w: lineW,
      h: lineH,
      line: { color: glyphColor, width: 2.25, beginArrowType: 'none', endArrowType: 'none' },
      altText: 'Decorative counter segment',
    });
  };
  [...label].forEach((character) => {
    if (character === '/') {
      addCounterLine(pptx.ShapeType.lineInv, cursorX, glyphY + 0.01, slashW, digitH - 0.02);
      cursorX += slashAdvance;
      return;
    }
    (SLIDE_COUNTER_SEGMENTS[character] || SLIDE_COUNTER_SEGMENTS[0]).forEach((segment) => {
      const [segmentX, segmentY, segmentW, segmentH] = segmentCoords[segment];
      addCounterLine(pptx.ShapeType.line, cursorX + segmentX, glyphY + segmentY, segmentW, segmentH);
    });
    cursorX += advance;
  });
}

// ── Native visual rendering (v0.12.1) ──────────────────────────────────────
// The v0.12 audit found 464/708 speaker notes carrying a "SUGGESTED VISUAL"
// descriptor and 0 native pictures/tables/charts on the slides themselves.
// For the three descriptor kinds with structured data behind them we now
// render real PPTX objects from the slide's own bullets: evidence-table-like
// kinds become a native table (content slides), decision matrices become a
// 2-column option grid (discussion slides), and concept maps become a
// hub-and-spoke shape group (key-concept slides). Clean visual guidance stays
// in the speaker notes either way. Rendering only happens when the data fits
// — short strings, enough bullets — otherwise the slide keeps its existing
// text layout.

const NATIVE_VISUAL_LIMITS = {
  tableLead: 220, // max chars for the lead assertion kept as text
  tableRow: 130, // max chars per table row bullet
  tableRowLead: 42, // max chars for the split-off first cell of a row
  // A pitfalls slide is a true two-column comparison, not a terse
  // claim/evidence index. It gets a wider first column, smaller type, and
  // taller rows below, so complete misconception/correction pairs can render
  // as a useful native visual instead of falling back to dense bullets.
  misconceptionRow: 200,
  misconceptionRowLead: 100,
  matrixCell: 140, // max chars per decision-matrix cell
  hubLabel: 48, // max chars for the concept-map hub label
  spokeLabel: 60, // max chars per concept-map spoke phrase
  definition: 260, // max chars for the concept-map definition card
};

// ── v0.14.5 WS-C (C1): concept-map shape geometry ───────────────────────────
// The keyTerm layout's visual zone sits right of the definition card (card
// ends at x 4.8) and above the slide-number chip (chip starts at y 5.185):
// x 4.95–9.6, y 1.05–5.15 on the 10 × 5.625in deck. The hub is a centered
// ellipse; spokes seat on a FIXED slot table keyed by spoke count — no
// auto-layout. Wide slots (2.05in) hold 1-2 per row; three-across rows
// (counts 5-6) use narrow slots (1.45in). Every slot clears the hub band
// (y 2.6–3.6) and the zone bounds — tests/v0145-deck-visuals.test.js proves
// the geometry for all six counts.
export const CONCEPT_MAP_GEOMETRY = {
  zone: { x: 4.95, y: 1.05, w: 4.65, h: 4.1 },
  hub: { x: 6.025, y: 2.6, w: 2.5, h: 1.0 },
  spokeH: 0.9,
  maxSpokes: 6,
  slots: {
    1: [{ x: 6.25, y: 1.1, w: 2.05 }],
    2: [
      { x: 6.25, y: 1.1, w: 2.05 },
      { x: 6.25, y: 4.2, w: 2.05 },
    ],
    3: [
      { x: 5.05, y: 1.1, w: 2.05 },
      { x: 7.5, y: 1.1, w: 2.05 },
      { x: 6.25, y: 4.2, w: 2.05 },
    ],
    4: [
      { x: 5.05, y: 1.1, w: 2.05 },
      { x: 7.5, y: 1.1, w: 2.05 },
      { x: 5.05, y: 4.2, w: 2.05 },
      { x: 7.5, y: 4.2, w: 2.05 },
    ],
    5: [
      { x: 4.95, y: 1.1, w: 1.45 },
      { x: 6.55, y: 1.1, w: 1.45 },
      { x: 8.15, y: 1.1, w: 1.45 },
      { x: 5.05, y: 4.2, w: 2.05 },
      { x: 7.5, y: 4.2, w: 2.05 },
    ],
    6: [
      { x: 4.95, y: 1.1, w: 1.45 },
      { x: 6.55, y: 1.1, w: 1.45 },
      { x: 8.15, y: 1.1, w: 1.45 },
      { x: 4.95, y: 4.2, w: 1.45 },
      { x: 6.55, y: 4.2, w: 1.45 },
      { x: 8.15, y: 4.2, w: 1.45 },
    ],
  },
};

// v0.14.5 WS-C (C2): the worked-example bar chart fills the same right-half
// visual zone the evidence table uses on content slides.
export const WE_PLOT_GEOMETRY = { x: 4.95, y: 1.35, w: 4.65, h: 3.45 };

// Concept-map spokes have enough room for short teaching phrases. Preserve up
// to seven words so labels such as "Triads and seventh chords" stay complete;
// genuinely long labels still use the deck's single-ellipsis discipline.
const SPOKE_TRAILING_CONNECTIVE = /^(?:and|or|of|to|in|on|for|with|the|a|an|vs|via|at|by|from)$/i;
function spokeShapeLabel(text, maxWords = 7) {
  const words = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  const kept = words.slice(0, maxWords);
  while (kept.length > 1 && SPOKE_TRAILING_CONNECTIVE.test(kept[kept.length - 1])) kept.pop();
  return `${kept.join(' ')}…`;
}

/** Shorten a bullet to a spoke-sized phrase, or null when it won't fit. */
function spokePhrase(bullet, maxLen = NATIVE_VISUAL_LIMITS.spokeLabel) {
  const clean = String(bullet || '')
    .trim()
    .replace(/[.!?]+\s*$/, '');
  if (!clean) return null;
  if (clean.length <= maxLen) return clean;
  const clause = clean.split(/[,;:—–]/)[0].trim();
  return clause.length >= 12 && clause.length <= maxLen ? clause : null;
}

function ensureTerminalPunctuation(text) {
  const clean = String(text || '').trim();
  if (!clean || /[.!?…;:]$/.test(clean)) return clean;
  return `${clean}.`;
}

const EXPORT_BULLET_PUNCTUATION_MIN_LENGTH = 60;
const EXPORT_BULLET_RELATIONSHIP_ARROW = /[↔→⟷⇄⇆➜➔]/;

function ensureExportBulletPunctuation(text) {
  const clean = String(text || '').trim();
  if (!clean || clean.length < EXPORT_BULLET_PUNCTUATION_MIN_LENGTH) return clean;
  if (EXPORT_BULLET_RELATIONSHIP_ARROW.test(clean)) return clean;
  if (/[.!?…;:]$/.test(clean) || !/[a-z]$/.test(clean)) return clean;
  return `${clean}.`;
}

function normalizeSlideForPptxExport(slide) {
  if (!Array.isArray(slide?.bullets)) return slide;
  return {
    ...slide,
    bullets: slide.bullets.map((bullet) =>
      typeof bullet === 'string' ? ensureExportBulletPunctuation(bullet) : bullet,
    ),
  };
}

/**
 * Decide whether this slide's visual descriptor can be rendered natively
 * from the data it already carries. Returns a render plan or null.
 */
function planNativeVisual(s, slideType, visKind, hasGeneratedImage, hasLatex) {
  if (!visKind || hasGeneratedImage) return null;
  const bullets = (Array.isArray(s.bullets) ? s.bullets : []).map((b) => String(b ?? '').trim()).filter(Boolean);
  if (bullets.length === 0) return null;
  // LaTeX bullets go through image rendering — keep the plain text layout.
  if (hasLatex && bullets.concat(s.title || '').some((t) => containsLatex(t))) return null;

  if (slideType === 'content' && /\b(table|organizer)\b/i.test(visKind)) {
    // Evidence table — v0.14.1 (5.2c): rows render ONLY when the compiler
    // shipped pre-paired claim/evidence rows on the descriptor (each pair
    // authored from the same source atom). The old fallback split display
    // bullets on ":"/"—", which fabricated rows pairing claims with
    // unrelated leftovers in all 58 audited decks; with no real rows the
    // slide keeps its plain text layout.
    const visual = s.visual || s.vi || {};
    const isMisconceptionComparison = /\bmisconception\b/i.test(visKind);
    const rowLeadLimit = isMisconceptionComparison
      ? NATIVE_VISUAL_LIMITS.misconceptionRowLead
      : NATIVE_VISUAL_LIMITS.tableRowLead;
    const rowLimit = isMisconceptionComparison ? NATIVE_VISUAL_LIMITS.misconceptionRow : NATIVE_VISUAL_LIMITS.tableRow;
    const rows = (Array.isArray(visual.rows) ? visual.rows : [])
      .map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? '').trim()) : []))
      .filter(
        (row) => row.length === 2 && row[0] && row[1] && row[0].length <= rowLeadLimit && row[1].length <= rowLimit,
      )
      .slice(0, 4);
    if (rows.length < 2) return null;
    const descriptorLead = String(visual.tableLead || '').trim();
    const lead = descriptorLead || bullets[0];
    if (!lead || lead.length > NATIVE_VISUAL_LIMITS.tableLead) return null;
    const columnLabels = (Array.isArray(visual.columnLabels) ? visual.columnLabels : [])
      .map((label) =>
        String(label || '')
          .trim()
          .toUpperCase(),
      )
      .filter((label) => label && label.length <= 24)
      .slice(0, 2);
    return {
      type: 'evidenceTable',
      lead,
      twoCol: true,
      rows,
      columnLabels: columnLabels.length === 2 ? columnLabels : ['CLAIM', 'EVIDENCE'],
      isMisconceptionComparison,
    };
  }

  if (slideType === 'question' && /\bmatrix\b/i.test(visKind)) {
    // Decision matrix: the competing options ARE the bullets — lay the first
    // four out as a 2-column grid so the comparison reads as a matrix.
    const cells = bullets.slice(0, 4);
    if (cells.length < 2) return null;
    if (cells.some((b) => b.length > NATIVE_VISUAL_LIMITS.matrixCell)) return null;
    return { type: 'decisionMatrix', cells };
  }

  if (slideType === 'keyTerm' && /\bconcept\s*map\b/i.test(visKind)) {
    // v0.13.3: the compiler can attach explicit hub/spokes (the lesson's
    // kernel key terms — short disciplinary phrases). Prefer them: bullet
    // sentences almost never fit the spoke guard, which is why no concept
    // map rendered in the v0.13.1 live audit.
    const visual = s.visual || s.vi || {};
    const descriptorHub = String(visual.hub || '').trim();
    const rawSpokes = (Array.isArray(visual.spokes) ? visual.spokes : [])
      .map((spoke) => String(spoke ?? '').trim())
      .filter(Boolean);
    // v0.14.5 (C1): more spokes than the fixed slot table seats → keep
    // today's text rendering rather than invent an auto-layout.
    if (rawSpokes.length > CONCEPT_MAP_GEOMETRY.maxSpokes) return null;
    const descriptorSpokes = rawSpokes
      .filter((spoke) => spoke.length <= NATIVE_VISUAL_LIMITS.spokeLabel)
      .slice(0, CONCEPT_MAP_GEOMETRY.maxSpokes);
    if (descriptorHub && descriptorHub.length <= NATIVE_VISUAL_LIMITS.hubLabel && descriptorSpokes.length >= 2) {
      const definition = bullets.find((b) => b.length <= NATIVE_VISUAL_LIMITS.definition) || '';
      if (definition) return { type: 'conceptMap', hub: descriptorHub, definition, spokes: descriptorSpokes };
    }
    // Fallback: hub = the slide title, spokes = short phrases from the
    // explanatory bullets, definition keeps the central card.
    const hub = String(s.title || '').trim();
    if (!hub || hub.length > NATIVE_VISUAL_LIMITS.hubLabel) return null;
    const definition = bullets[0];
    if (!definition || definition.length > NATIVE_VISUAL_LIMITS.definition) return null;
    const spokes = bullets
      .slice(1)
      .map((b) => spokePhrase(b))
      .filter(Boolean)
      .slice(0, 4);
    if (spokes.length < 2) return null;
    return { type: 'conceptMap', hub, definition, spokes };
  }

  if (slideType === 'content' && /\bworked\s*example\b/i.test(visKind)) {
    // v0.14.5 (C2): the compiler attaches a wePlot descriptor ONLY when the
    // worked example's own steps/result computed 2-6 labeled numbers
    // (extractWorkedExamplePairs — conservative, no fabrication). Re-validate
    // here so a hand-edited descriptor can never chart garbage; anything
    // short of 2 clean pairs keeps the step-by-step text layout.
    const visual = s.visual || s.vi || {};
    const pairs = (Array.isArray(visual.wePlot?.pairs) ? visual.wePlot.pairs : [])
      .map((pair) => ({
        label: String(pair?.label || '').trim(),
        value: Number(pair?.value),
        unit: String(pair?.unit || '').trim(),
      }))
      .filter((pair) => pair.label && Number.isFinite(pair.value));
    if (pairs.length >= 2 && pairs.length <= 6) return { type: 'wePlot', pairs };
    return null;
  }

  return null;
}

/** Render the evidence table on the right half of a content slide. */
function addEvidenceTable(pptx, slide, theme, plan, visKind, tracker) {
  const tableX = 4.95,
    tableY = 1.35;
  const tableW = SLIDE_W - tableX - 0.4;
  const leadColW = plan.isMisconceptionComparison ? 2.05 : 1.55;
  const bodyFontSize = plan.isMisconceptionComparison ? 8.5 : 10;
  const rowH = plan.isMisconceptionComparison ? 0.9 : 0.72;
  const headerOptions = {
    fill: { color: theme.primary },
    color: 'FFFFFF',
    bold: true,
    fontSize: 9,
    charSpacing: 2,
    align: 'left',
    valign: 'middle',
  };
  // v0.14.1 (5.2b/c): rows are always pre-paired claim/evidence cells, and
  // the old single colspan header (the uppercased visKind) shipped an hMerge
  // continuation that read as an EMPTY cell — the header now names the two
  // columns, so every emitted cell carries content. The visKind label stays
  // visible in the speaker notes' visual guidance block.
  const headerRow = [
    { text: plan.columnLabels?.[0] || 'CLAIM', options: { ...headerOptions } },
    { text: plan.columnLabels?.[1] || 'EVIDENCE', options: { ...headerOptions } },
  ];
  const bodyRows = plan.rows.map((cells) =>
    cells.map((cell, ci) => ({
      text: cell,
      options: {
        fill: { color: ci === 0 ? theme.light : 'FFFFFF' },
        color: theme.bodyText,
        bold: ci === 0,
        fontSize: bodyFontSize,
        align: 'left',
        valign: 'middle',
      },
    })),
  );
  slide.addTable([headerRow, ...bodyRows], {
    x: tableX,
    y: tableY,
    w: tableW,
    colW: [leadColW, tableW - leadColW],
    border: { type: 'solid', pt: 0.5, color: 'D5DEEA' },
    fontFace: FONT_BODY,
    margin: 0.06,
    // pptxgenjs otherwise chooses a single-line default row height even when
    // evidence wraps to 2-3 lines, which makes adjacent rows collide.
    rowH,
    autoPage: false,
    // v0.14.5 (C3): cmViz name — counts as a native visual in the grader bar.
    objectName: 'cmVizTable',
  });
  tracker.add({
    x: tableX,
    y: tableY,
    w: tableW,
    h: rowH * (bodyRows.length + 1),
    label: 'evidence-table',
  });
}

/** Render the decision matrix grid on a discussion slide. */
function addDecisionMatrix(pptx, slide, theme, plan, tracker) {
  const x = 0.7,
    y = 2.15;
  const w = SLIDE_W - 1.4;
  const rowH = 1.05;
  // v0.14.1 (5.2b): an odd option count used to ship as a colspan cell whose
  // hMerge continuation read as a trailing EMPTY cell in every audited deck
  // ("…: Reteach | <empty>"). Only complete pairs go into the two-column
  // grid; a leftover option renders as its own full-width single-cell row,
  // so every emitted cell carries content.
  const cellOptions = {
    fill: { color: 'FFFFFF' },
    color: theme.bodyText,
    fontSize: 11,
    align: 'left',
    valign: 'middle',
  };
  const tableOptions = {
    x,
    w,
    rowH,
    border: { type: 'solid', pt: 1, color: theme.accent },
    fontFace: FONT_BODY,
    margin: 0.08,
    autoPage: false,
    // v0.14.5 (C3): cmViz name — counts as a native visual in the grader bar.
    objectName: 'cmVizMatrix',
  };
  const pairs = [];
  for (let i = 0; i + 1 < plan.cells.length; i += 2) {
    pairs.push([plan.cells[i], plan.cells[i + 1]]);
  }
  const leftover = plan.cells.length % 2 === 1 ? plan.cells[plan.cells.length - 1] : null;
  if (pairs.length > 0) {
    slide.addTable(
      pairs.map((pair) => pair.map((cell) => ({ text: cell, options: { ...cellOptions } }))),
      { ...tableOptions, y, colW: [w / 2, w / 2] },
    );
  }
  if (leftover) {
    slide.addTable([[{ text: leftover, options: { ...cellOptions } }]], {
      ...tableOptions,
      y: y + pairs.length * rowH,
      colW: [w],
    });
  }
  tracker.add({ x, y, w, h: 2.4, label: 'decision-matrix' });
}

/**
 * Render the hub-and-spoke concept map group on a key-concept slide.
 * v0.14.5 (C1): real ellipses on the fixed CONCEPT_MAP_GEOMETRY slot table
 * (deterministic positions by spoke count, never auto-layout). The hub
 * carries the theme accent fill with dark primary text — the deck's
 * accent-chip rule (accent backgrounds always take theme.primary text, see
 * the ACTIVITY badge). Spokes are white ellipses with concise complete labels
 * under the ellipsis discipline. Every shape is named with the 'cmViz' prefix so
 * the package grader can tell feature-bearing decks from pre-v0.14.5
 * artifacts (the C3 arming rule). Shape text runs go through the same
 * fontFace pipeline as every text box, so stripLatinEastAsiaOverrides
 * cleans their <a:ea> overrides on the way out.
 */
function addConceptMapGroup(pptx, slide, theme, plan, tracker) {
  const { hub, spokeH, slots, maxSpokes } = CONCEPT_MAP_GEOMETRY;
  const slotRow = slots[Math.min(plan.spokes.length, maxSpokes)] || [];
  const spokes = plan.spokes
    .slice(0, slotRow.length)
    .map((text, index) => ({ text: spokeShapeLabel(text), ...slotRow[index] }));
  const hubCx = hub.x + hub.w / 2,
    hubCy = hub.y + hub.h / 2;

  // Connector lines first so the ellipses draw on top of them.
  for (const spoke of spokes) {
    const scx = spoke.x + spoke.w / 2,
      scy = spoke.y + spokeH / 2;
    slide.addShape(pptx.ShapeType.line, {
      x: Math.min(hubCx, scx),
      y: Math.min(hubCy, scy),
      w: Math.abs(scx - hubCx),
      h: Math.abs(scy - hubCy),
      flipH: (scx - hubCx) * (scy - hubCy) < 0,
      line: { color: theme.secondary, pt: 1.25 },
      objectName: 'cmVizConn',
      altText: 'Decorative',
    });
  }

  for (const spoke of spokes) {
    const spokeSize = autoFitFontSize(spoke.text, spoke.w - 0.3, spokeH - 0.25, FONT_BODY, 11, 8, 1.15);
    slide.addText(spoke.text, {
      shape: pptx.ShapeType.ellipse,
      x: spoke.x,
      y: spoke.y,
      w: spoke.w,
      h: spokeH,
      fill: { color: 'FFFFFF' },
      line: { color: theme.secondary, pt: 1 },
      fontSize: spokeSize,
      fontFace: FONT_BODY,
      color: theme.bodyText,
      align: 'center',
      valign: 'middle',
      lineSpacingMultiple: 1.15,
      objectName: 'cmVizSpoke',
      altText: `Related idea: ${spoke.text}`,
    });
    tracker.add({ x: spoke.x, y: spoke.y, w: spoke.w, h: spokeH, label: 'concept-spoke' });
  }

  // Hub on top — centered ellipse, accent fill, dark text.
  // Long hyphenated concepts can fool the width estimate and let PowerPoint
  // split a word across lines ("Human-center" / "ed design"). Cap the
  // starting size for long hubs so the rendered text remains word-shaped.
  const hubMaxSize = String(plan.hub || '').length > 24 ? 11 : 14;
  const hubSize = autoFitFontSize(plan.hub, hub.w - 0.35, hub.h - 0.25, FONT_HEADING, hubMaxSize, 8, 1.1);
  slide.addText(plan.hub, {
    shape: pptx.ShapeType.ellipse,
    x: hub.x,
    y: hub.y,
    w: hub.w,
    h: hub.h,
    fill: { color: theme.accent },
    line: { color: theme.primary, pt: 1.5 },
    fontSize: hubSize,
    fontFace: FONT_HEADING,
    color: theme.primary,
    bold: true,
    align: 'center',
    valign: 'middle',
    lineSpacingMultiple: 1.1,
    objectName: 'cmVizHub',
    altText: `Central concept: ${plan.hub}`,
  });
  tracker.add({ x: hub.x, y: hub.y, w: hub.w, h: hub.h, label: 'concept-hub' });
}

/**
 * Render the worked-example bar chart in the content slide's visual zone.
 * v0.14.5 (C2): a pptxgenjs NATIVE chart — pptxgenjs 4.0.1 ships its chart
 * writer inside the same prebuilt dist file the exporter already
 * lazy-loads, so addChart pulls no new module into the pptx chunk (the
 * chart-vs-bar-shapes decision: native charts work in the bundled build,
 * measured in tests/v0145-deck-visuals.test.js, so the dependency-free
 * rect fallback was not needed). Single series, theme colors, value labels
 * on, no legend; category labels are the extracted pair labels under the
 * 3-word ellipsis rule. Data is ONLY the descriptor's authored pairs.
 */
function addWorkedExamplePlot(pptx, slide, theme, plan, tracker) {
  const box = WE_PLOT_GEOMETRY;
  const labels = plan.pairs.map((pair) => spokeShapeLabel(pair.label, 3));
  const values = plan.pairs.map((pair) => pair.value);
  slide.addChart(pptx.ChartType.bar, [{ name: 'Worked example values', labels, values }], {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    barDir: 'col',
    chartColors: [theme.secondary],
    showLegend: false,
    showTitle: false,
    showValue: true,
    dataLabelColor: theme.bodyText,
    dataLabelFontFace: FONT_BODY,
    dataLabelFontSize: 10,
    catAxisLabelColor: theme.bodyText,
    catAxisLabelFontFace: FONT_BODY,
    catAxisLabelFontSize: 9,
    valAxisHidden: true,
    valGridLine: { style: 'none' },
    objectName: 'cmVizChart',
    altText: `Bar chart of worked-example values: ${plan.pairs
      .map((pair) => `${pair.label} ${pair.value}${pair.unit ? ` ${pair.unit}` : ''}`)
      .join(', ')}`,
  });
  tracker.add({ x: box.x, y: box.y, w: box.w, h: box.h, label: 'worked-example-plot' });
}

/**
 * Process text for LaTeX if applicable, returning { text, images }.
 * @param {string} text
 * @param {boolean} hasLatex - Whether deck data contains LaTeX
 * @param {Object} [opts] - { color, fontSizePt }
 * @returns {Promise<{ text: string, images: Array }>}
 */
async function maybeProcessLatex(text, hasLatex, { color = '000000', fontSizePt = 16 } = {}) {
  if (!hasLatex || !text || !containsLatex(text)) {
    return { text: text || '', images: [] };
  }
  return processSlideText(text, { color: `#${color}`, fontSizePt });
}

/**
 * Build a single slide into a pptx instance.
 * @param {Object} pptx - PptxGenJS instance
 * @param {Object} deck - Deck data
 * @param {Object} theme - Color theme
 * @param {number} slideIndex - Index of slide within deck
 * @param {number} totalSlides - Total slides in deck
 * @param {Object} [opts] - Options: { hasLatex: boolean }
 */
async function buildSlideForDeck(pptx, deck, theme, slideIndex, totalSlides, opts = {}) {
  const rawSlide = deck.slides?.[slideIndex];
  if (!rawSlide) return;
  const s = normalizeSlideForPptxExport(rawSlide);
  const slideType = getSlideType(s);
  const slide = pptx.addSlide();
  const W = SLIDE_W,
    H = SLIDE_H;
  const hasLatex = opts.hasLatex || false;
  const tracker = createElementTracker();

  // Visual descriptor — accepts both expanded (slide.visual) and abbreviated
  // (slide.vi) shapes from the generator. Hoisted above the layout branches
  // so they can render native visuals (v0.12.1) from the same descriptor the
  // speaker-notes block below has always used.
  const vis = s.visual || s.vi;
  const visKind = vis?.kind || vis?.k;
  const hasVisual = Boolean(vis && visKind && visKind !== 'none');
  const visDesc = hasVisual ? vis.description || vis.d || '' : '';
  const visAlt = hasVisual ? vis.altText || vis.at || '' : '';
  const generatedVisualImage = hasVisual ? getGeneratedVisualImage(vis) : null;
  const nativeVisual = hasVisual
    ? planNativeVisual(s, slideType, visKind, Boolean(generatedVisualImage), hasLatex)
    : null;

  if (slideType === 'title') {
    // ── TITLE SLIDE ─────────────────────────────────────────────────────
    slide.background = { color: theme.primary };

    // Large decorative circle (top right)
    slide.addShape(pptx.ShapeType.ellipse, {
      x: W - 3.2,
      y: -1.5,
      w: 4.5,
      h: 4.5,
      fill: { color: theme.secondary, transparency: 15 },
      line: { color: theme.secondary, transparency: 15 },
      altText: 'Decorative',
    });

    // Smaller accent circle (bottom left)
    slide.addShape(pptx.ShapeType.ellipse, {
      x: -1.2,
      y: H - 1.8,
      w: 3,
      h: 3,
      fill: { color: theme.accent, transparency: 30 },
      line: { color: theme.accent, transparency: 30 },
      altText: 'Decorative',
    });

    // Bottom accent bar
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: H - 0.6,
      w: W,
      h: 0.6,
      fill: { color: theme.accent, transparency: 20 },
      line: { color: theme.accent, transparency: 20 },
      altText: 'Decorative',
    });

    // Thin decorative line
    slide.addShape(pptx.ShapeType.line, {
      x: 0.7,
      y: 0.45,
      w: 2.5,
      h: 0,
      line: { color: theme.accent, pt: 1.5, transparency: 40 },
      altText: 'Decorative',
    });

    // Course/Lesson number badge
    const titleMatch = (deck.lessonTitle || '').match(/^(?:Lesson|Week)\s*(\d+)/i);
    const deckNum = titleMatch ? parseInt(titleMatch[1], 10) : deck._deckIndex !== undefined ? deck._deckIndex + 1 : 1;
    slide.addText(`LESSON ${deckNum}`, {
      x: 0.7,
      y: 0.6,
      w: 3,
      h: 0.4,
      fontSize: 11,
      fontFace: FONT_LABEL,
      color: theme.accent,
      bold: true,
      charSpacing: 4,
    });

    // Main title — large, bold (auto-fit from 40pt down to 24pt)
    const titleText = deck.lessonTitle || s.title || 'Untitled Lesson';
    const titleBoxW = W - 3.2,
      titleBoxH = 2.35;
    const titleFontSize = autoFitFontSize(titleText, titleBoxW, titleBoxH, FONT_HEADING, 36, 20, 1.1);
    const titleResult = await maybeProcessLatex(titleText, hasLatex, {
      color: theme.titleText,
      fontSizePt: titleFontSize,
    });
    slide.addText(titleResult.text, {
      x: 0.7,
      y: 1.15,
      w: titleBoxW,
      h: titleBoxH,
      fontSize: titleFontSize,
      fontFace: FONT_HEADING,
      color: theme.titleText,
      bold: true,
      align: 'left',
      valign: 'middle',
      lineSpacingMultiple: 1.1,
      fit: 'shrink',
    });
    tracker.add({ x: 0.7, y: 1.15, w: titleBoxW, h: titleBoxH, label: 'title' });
    // Add LaTeX display images for title if any
    for (const img of titleResult.images.filter((i) => i.displayMode)) {
      slide.addImage({ data: img.base64, x: (W - img.widthIn) / 2, y: 3.5, w: img.widthIn, h: img.heightIn });
    }

    // Accent line under title
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.7,
      y: 3.4,
      w: 2.2,
      h: 0.06,
      fill: { color: theme.accent },
      line: { color: theme.accent },
      altText: 'Decorative',
    });

    // Subtitle / first bullet (auto-fit from 16pt down to 12pt)
    if (s.bullets?.length > 0) {
      const subBoxW = W - 4.2,
        subBoxH = 0.6;
      const subFontSize = autoFitFontSize(s.bullets[0], subBoxW, subBoxH, FONT_BODY, 16, 12, 1.5);
      const subResult = await maybeProcessLatex(s.bullets[0], hasLatex, { color: 'D0DCF0', fontSizePt: subFontSize });
      slide.addText(subResult.text, {
        x: 0.7,
        y: 3.65,
        w: subBoxW,
        h: subBoxH,
        fontSize: subFontSize,
        fontFace: FONT_BODY,
        color: 'D0DCF0',
        align: 'left',
        italic: true,
        lineSpacingMultiple: 1.5,
        // v0.12.1: audited overflow box (subtitles up to ~107 chars in a
        // 0.6in box). The canvas pre-fit above gets the size close; the
        // normAutofit flag lets PowerPoint itself shrink-on-overflow when
        // the real font metrics differ from the canvas estimate.
        fit: 'shrink',
      });
      tracker.add({ x: 0.7, y: 3.65, w: subBoxW, h: subBoxH, label: 'subtitle' });
    }

    // Progress dots
    addProgressDots(pptx, slide, theme, slideIndex, totalSlides, true);
  } else if (slideType === 'objectives') {
    // ── LEARNING OBJECTIVES SLIDE ────────────────────────────────────────
    slide.background = { color: theme.light };

    // Left sidebar
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 0.12,
      h: H,
      fill: { color: theme.primary },
      line: { color: theme.primary },
      altText: 'Decorative',
    });

    // Header band
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.12,
      y: 0,
      w: W - 0.12,
      h: 1.15,
      fill: { color: theme.primary },
      line: { color: theme.primary },
      altText: 'Decorative',
    });

    slide.addText('LEARNING OBJECTIVES', {
      x: 0.5,
      y: 0.1,
      w: W - 0.8,
      h: 0.4,
      fontSize: 10,
      fontFace: FONT_LABEL,
      color: theme.accent,
      charSpacing: 4,
      bold: true,
    });

    slide.addText(s.title || 'By the end of this lesson, students will be able to:', {
      x: 0.5,
      y: 0.5,
      w: W - 0.8,
      h: 0.55,
      fontSize: 22,
      fontFace: FONT_HEADING,
      color: theme.titleText,
      bold: true,
    });

    // Numbered objectives as visual cards
    if (s.bullets?.length > 0) {
      const objBullets = s.bullets.slice(0, 4);
      for (let i = 0; i < objBullets.length; i++) {
        const b = objBullets[i];
        const col = i < 2 ? 0 : 1;
        const row = i % 2;
        const x = col === 0 ? 0.4 : W / 2 + 0.15;
        const y = 1.35 + row * 1.85;
        const cardW = W / 2 - 0.55;

        slide.addShape(pptx.ShapeType.roundRect, {
          x,
          y,
          w: cardW,
          h: 1.6,
          fill: { color: 'FFFFFF' },
          line: { color: theme.secondary, pt: 1.5 },
          rectRadius: 0.1,
          altText: 'Decorative',
        });

        // Number circle
        slide.addShape(pptx.ShapeType.ellipse, {
          x: x + 0.15,
          y: y + 0.15,
          w: 0.5,
          h: 0.5,
          fill: { color: theme.secondary },
          line: { color: theme.secondary },
          altText: `Objective ${i + 1}`,
        });
        slide.addText(`${i + 1}`, {
          x: x + 0.15,
          y: y + 0.15,
          w: 0.5,
          h: 0.5,
          fontSize: 16,
          fontFace: FONT_HEADING,
          color: 'FFFFFF',
          bold: true,
          align: 'center',
          valign: 'middle',
        });

        // Auto-fit objective card text from 12pt down to 9pt
        const objTextW = cardW - 0.9,
          objTextH = 1.3;
        const objFontSize = autoFitFontSize(b, objTextW, objTextH, FONT_BODY, 12, 9, 1.4);
        const objResult = await maybeProcessLatex(b, hasLatex, { color: theme.bodyText, fontSizePt: objFontSize });
        slide.addText(objResult.text, {
          x: x + 0.75,
          y: y + 0.15,
          w: objTextW,
          h: objTextH,
          fontSize: objFontSize,
          fontFace: FONT_BODY,
          color: theme.bodyText,
          valign: 'top',
          lineSpacingMultiple: 1.4,
        });
        tracker.add({ x: x + 0.75, y: y + 0.15, w: objTextW, h: objTextH, label: `objective-${i + 1}` });
        // Add LaTeX images for objective
        for (const img of objResult.images.filter((im) => im.displayMode)) {
          slide.addImage({
            data: img.base64,
            x: x + 0.75,
            y: y + 1.0,
            w: Math.min(img.widthIn, objTextW),
            h: img.heightIn,
          });
        }
      }
    }

    addProgressDots(pptx, slide, theme, slideIndex, totalSlides, false);
  } else if (slideType === 'agenda') {
    // ── AGENDA SLIDE ─────────────────────────────────────────────────────
    slide.background = { color: 'FFFFFF' };

    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 0.12,
      h: H,
      fill: { color: theme.primary },
      line: { color: theme.primary },
      altText: 'Decorative',
    });

    slide.addShape(pptx.ShapeType.rect, {
      x: 0.12,
      y: 0,
      w: W - 0.12,
      h: 1.15,
      fill: { color: theme.secondary },
      line: { color: theme.secondary },
      altText: 'Decorative',
    });

    slide.addText("TODAY'S AGENDA", {
      x: 0.5,
      y: 0.08,
      w: 5,
      h: 0.35,
      fontSize: 10,
      color: theme.accent,
      charSpacing: 4,
      bold: true,
      fontFace: FONT_LABEL,
    });
    slide.addText(s.title || 'Session Overview', {
      x: 0.5,
      y: 0.45,
      w: W - 0.8,
      h: 0.6,
      fontSize: 24,
      color: 'FFFFFF',
      bold: true,
      fontFace: FONT_HEADING,
    });

    if (s.bullets?.length > 0) {
      const agendaBullets = s.bullets.slice(0, 6);
      // v0.12.1: one shared font size for the whole list. Per-row auto-fit
      // used to mix 13–16pt within a single agenda; use the smallest of the
      // rows' computed sizes so the list reads as one unit.
      const agendaItemW = W - 1.7,
        agendaItemH = 0.55;
      const agendaFontSize = Math.min(
        ...agendaBullets.map((b) => autoFitFontSize(b, agendaItemW, agendaItemH, FONT_BODY, 16, 12, 1.5)),
      );
      for (let i = 0; i < agendaBullets.length; i++) {
        const b = agendaBullets[i];
        const y = 1.3 + i * 0.68;
        slide.addShape(pptx.ShapeType.ellipse, {
          x: 0.5,
          y: y + 0.05,
          w: 0.44,
          h: 0.44,
          fill: { color: i === 0 ? theme.accent : theme.light },
          line: { color: i === 0 ? theme.accent : theme.secondary, pt: 1.5 },
          altText: `Agenda item ${i + 1}`,
        });
        slide.addText(`${i + 1}`, {
          x: 0.5,
          y: y + 0.05,
          w: 0.44,
          h: 0.44,
          fontSize: 14,
          color: i === 0 ? theme.primary : theme.secondary,
          bold: true,
          align: 'center',
          valign: 'middle',
          fontFace: FONT_HEADING,
        });
        const agendaResult = await maybeProcessLatex(b, hasLatex, {
          color: i === 0 ? theme.bodyText : '555555',
          fontSizePt: agendaFontSize,
        });
        slide.addText(agendaResult.text, {
          x: 1.15,
          y,
          w: agendaItemW,
          h: agendaItemH,
          fontSize: agendaFontSize,
          color: i === 0 ? theme.bodyText : '555555',
          fontFace: FONT_BODY,
          bold: i === 0,
          valign: 'middle',
          lineSpacingMultiple: 1.5,
        });
        tracker.add({ x: 1.15, y, w: agendaItemW, h: agendaItemH, label: `agenda-${i + 1}` });
        if (i < s.bullets.length - 1) {
          slide.addShape(pptx.ShapeType.line, {
            x: 1.15,
            y: y + 0.6,
            w: W - 1.9,
            h: 0,
            line: { color: 'E8ECF0', pt: 0.5 },
            altText: 'Decorative',
          });
        }
      }
    }

    addProgressDots(pptx, slide, theme, slideIndex, totalSlides, false);
  } else if (slideType === 'bridge') {
    // ── BRIDGE / RECAP SLIDE ─────────────────────────────────────────────
    // Split layout: left dark recap, right light today
    slide.background = { color: 'FFFFFF' };

    // Left panel (40%)
    const splitX = W * 0.42;
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: splitX,
      h: H,
      fill: { color: theme.primary },
      line: { color: theme.primary },
      altText: 'Decorative',
    });

    // Decorative circle on left
    slide.addShape(pptx.ShapeType.ellipse, {
      x: -1,
      y: H - 2.5,
      w: 3,
      h: 3,
      fill: { color: theme.secondary, transparency: 50 },
      line: { color: theme.secondary, transparency: 50 },
      altText: 'Decorative',
    });

    const bridgeTitleText = s.title || 'Bridge to Today';
    const bridgeLeadLabel = /course throughline/i.test(bridgeTitleText) ? 'COURSE ARC' : 'LAST TIME';

    // Lesson 1 has no previous meeting; its bridge is the course arc.
    slide.addText(bridgeLeadLabel, {
      x: 0.4,
      y: 0.35,
      w: splitX - 0.6,
      h: 0.35,
      fontSize: 10,
      fontFace: FONT_LABEL,
      color: theme.accent,
      bold: true,
      charSpacing: 4,
    });

    // Recap title (auto-fit from 20pt down to 14pt)
    const bridgeTitleW = splitX - 0.6,
      bridgeTitleH = 1.65;
    const bridgeTitleSize = autoFitFontSize(bridgeTitleText, bridgeTitleW, bridgeTitleH, FONT_HEADING, 20, 12, 1.15);
    slide.addText(bridgeTitleText, {
      x: 0.4,
      y: 0.75,
      w: bridgeTitleW,
      h: bridgeTitleH,
      fontSize: bridgeTitleSize,
      fontFace: FONT_HEADING,
      color: theme.titleText,
      bold: true,
      valign: 'top',
      lineSpacingMultiple: 1.15,
      fit: 'shrink', // v0.12.1: audited overflow box ("LAST TIME" panel headline, ~0.7in)
    });
    tracker.add({ x: 0.4, y: 0.75, w: bridgeTitleW, h: bridgeTitleH, label: 'bridge-title' });

    // Recap bullets on left
    if (s.bullets?.length > 0) {
      const halfBullets = Math.ceil(s.bullets.length / 2);
      const recapBullets = s.bullets.slice(0, halfBullets);
      const recapText = recapBullets.map((b) => ({
        text: b,
        options: {
          bullet: { code: '2714' },
          fontSize: 13,
          color: 'D0E8FF',
          breakLine: true,
          paraSpaceAfter: 10,
          lineSpacingMultiple: 1.4,
        },
      }));
      slide.addText(recapText, {
        x: 0.4,
        y: 2.5,
        w: splitX - 0.7,
        h: H - 3.1,
        fontFace: FONT_BODY,
        valign: 'top',
      });
      tracker.add({ x: 0.4, y: 2.5, w: splitX - 0.7, h: H - 3.1, label: 'bridge-recap' });
    }

    // Right panel — "TODAY" label
    slide.addText('TODAY', {
      x: splitX + 0.35,
      y: 0.35,
      w: W - splitX - 0.6,
      h: 0.35,
      fontSize: 10,
      fontFace: FONT_LABEL,
      color: theme.primary,
      bold: true,
      charSpacing: 4,
    });

    // Today bullets on right
    if (s.bullets?.length > 1) {
      const halfBullets = Math.ceil(s.bullets.length / 2);
      const todayBullets = s.bullets.slice(halfBullets);
      if (todayBullets.length > 0) {
        const todayText = todayBullets.map((b) => ({
          text: b,
          options: {
            bullet: { code: '25B6' }, // ▶
            fontSize: 14,
            color: theme.bodyText,
            breakLine: true,
            paraSpaceAfter: 12,
            lineSpacingMultiple: 1.5,
          },
        }));
        slide.addText(todayText, {
          x: splitX + 0.35,
          y: 0.85,
          w: W - splitX - 0.7,
          h: H - 1.4,
          fontFace: FONT_BODY,
          valign: 'top',
        });
        tracker.add({
          x: splitX + 0.35,
          y: 0.85,
          w: W - splitX - 0.7,
          h: H - 1.4,
          label: 'bridge-today',
        });
      }
    }

    // Accent line divider accent at bottom
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: H - 0.08,
      w: W,
      h: 0.08,
      fill: { color: theme.accent },
      line: { color: theme.accent },
      altText: 'Decorative',
    });

    addProgressDots(pptx, slide, theme, slideIndex, totalSlides, false);
  } else if (slideType === 'example') {
    // ── EXAMPLE / CASE STUDY SLIDE ────────────────────────────────────────
    slide.background = { color: 'FFFAF5' };

    // Top header band
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: W,
      h: 0.95,
      fill: { color: theme.primary },
      line: { color: theme.primary },
      altText: 'Decorative',
    });

    // EXAMPLE badge
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.5,
      y: 0.2,
      w: 1.2,
      h: 0.52,
      fill: { color: theme.accent },
      line: { color: theme.accent },
      rectRadius: 0.08,
      altText: 'Decorative',
    });
    slide.addText('EXAMPLE', {
      x: 0.5,
      y: 0.2,
      w: 1.2,
      h: 0.52,
      fontSize: 10,
      color: theme.primary,
      bold: true,
      align: 'center',
      valign: 'middle',
      fontFace: FONT_LABEL,
      charSpacing: 2,
    });

    // Auto-fit example title from 22pt down to 14pt
    const exTitleText = s.title || 'Example';
    const exTitleW = W - 2.6,
      exTitleH = 0.65;
    const exTitleSize = autoFitFontSize(exTitleText, exTitleW, exTitleH, FONT_HEADING, 22, 14);
    slide.addText(exTitleText, {
      x: 1.9,
      y: 0.15,
      w: exTitleW,
      h: exTitleH,
      fontSize: exTitleSize,
      color: 'FFFFFF',
      bold: true,
      fontFace: FONT_HEADING,
      valign: 'middle',
    });
    tracker.add({ x: 1.9, y: 0.15, w: exTitleW, h: exTitleH, label: 'example-title' });

    // Content area with left accent border
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.5,
      y: 1.15,
      w: 0.06,
      h: H - 1.8,
      fill: { color: theme.accent },
      line: { color: theme.accent },
      altText: 'Decorative',
    });

    // Example content
    if (s.bullets?.length > 0) {
      const lastIdx = s.bullets.length - 1;
      // A one-bullet example needs an example body, not an empty canvas with
      // only a bottom banner. For richer examples, the final seat remains the
      // takeaway; strip labels the exporter already supplies.
      const mainBullets = s.bullets.length === 1 ? s.bullets : s.bullets.slice(0, lastIdx);
      const takeaway =
        s.bullets.length === 1
          ? ''
          : ensureTerminalPunctuation(
              String(s.bullets[lastIdx] || '').replace(/^(?:key takeaway|key insight)\s*:\s*/i, ''),
            );

      if (mainBullets.length > 0) {
        const bulletText = mainBullets.map((b) => ({
          text: b,
          options: {
            bullet: { code: '25CF' },
            fontSize: 16,
            color: theme.bodyText,
            breakLine: true,
            paraSpaceAfter: 12,
            lineSpacingMultiple: 1.5,
          },
        }));
        slide.addText(bulletText, {
          x: 0.85,
          y: 1.2,
          w: W - 1.3,
          h: H - 2.8,
          fontFace: FONT_BODY,
          valign: 'top',
        });
      }

      // Key takeaway at bottom
      if (takeaway) {
        slide.addShape(pptx.ShapeType.roundRect, {
          x: 0.5,
          y: H - 1.2,
          // Keep the highlight clear of the bottom-right slide-number chip.
          w: W - 1.75,
          h: 0.8,
          fill: { color: theme.light },
          line: { color: theme.accent, pt: 1.5 },
          rectRadius: 0.08,
          altText: 'Key takeaway highlight',
        });
        slide.addText(`Key Takeaway: ${takeaway}`, {
          x: 0.7,
          y: H - 1.2,
          w: W - 2.15,
          h: 0.8,
          fontSize: 13,
          fontFace: FONT_BODY,
          color: theme.primary,
          bold: true,
          valign: 'middle',
          lineSpacingMultiple: 1.3,
        });
      }
    }

    addProgressDots(pptx, slide, theme, slideIndex, totalSlides, false);
  } else if (slideType === 'keyTerm') {
    // ── KEY CONCEPT / DEFINITION SLIDE ────────────────────────────────────
    slide.background = { color: theme.light };

    // Left sidebar
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 0.12,
      h: H,
      fill: { color: theme.primary },
      line: { color: theme.primary },
      altText: 'Decorative',
    });

    // "KEY CONCEPT" label
    slide.addText('KEY CONCEPT', {
      x: 0.5,
      y: 0.3,
      w: W - 0.8,
      h: 0.35,
      fontSize: 10,
      fontFace: FONT_LABEL,
      color: theme.primary,
      bold: true,
      charSpacing: 4,
    });

    // Large central card — shifts to the left half when the visual
    // descriptor's concept map renders natively beside it (v0.12.1).
    const isConceptMap = nativeVisual?.type === 'conceptMap';
    const cardX = isConceptMap ? 0.5 : 1.2,
      cardY = 1.0;
    const cardW = isConceptMap ? 4.3 : W - 2.4,
      cardH = isConceptMap ? 3.4 : 2.8;
    slide.addShape(pptx.ShapeType.roundRect, {
      x: cardX,
      y: cardY,
      w: cardW,
      h: cardH,
      fill: { color: 'FFFFFF' },
      line: { color: theme.secondary, pt: 2 },
      rectRadius: 0.15,
      shadow: { type: 'outer', blur: 8, offset: 3, opacity: 0.15, color: '000000' },
      altText: 'Key concept card',
    });

    // Accent stripe at top of card
    slide.addShape(pptx.ShapeType.rect, {
      x: cardX,
      y: cardY,
      w: cardW,
      h: 0.08,
      fill: { color: theme.accent },
      line: { color: theme.accent },
      altText: 'Decorative',
    });

    // Main term/concept (auto-fit from 26pt down to 16pt; tighter when the
    // definition shares the slide with a native concept map)
    const mainText = isConceptMap ? nativeVisual.definition : s.bullets?.[0] || s.title || 'Key Concept';
    const conceptW = cardW - 0.8,
      conceptH = isConceptMap ? cardH - 0.6 : 1.6;
    const conceptSize = autoFitFontSize(
      mainText,
      conceptW,
      conceptH,
      FONT_HEADING,
      isConceptMap ? 20 : 26,
      isConceptMap ? 12 : 16,
      1.3,
    );
    const conceptResult = await maybeProcessLatex(mainText, hasLatex, {
      color: theme.primary,
      fontSizePt: conceptSize,
    });
    slide.addText(conceptResult.text, {
      x: cardX + 0.4,
      y: cardY + 0.3,
      w: conceptW,
      h: conceptH,
      fontSize: conceptSize,
      fontFace: FONT_HEADING,
      color: theme.primary,
      bold: true,
      align: 'center',
      valign: 'middle',
      lineSpacingMultiple: 1.3,
    });
    tracker.add({ x: cardX + 0.4, y: cardY + 0.3, w: conceptW, h: conceptH, label: 'key-concept' });
    // Add LaTeX images for key concept
    for (const img of conceptResult.images.filter((i) => i.displayMode)) {
      slide.addImage({
        data: img.base64,
        x: (W - img.widthIn) / 2,
        y: cardY + conceptH + 0.4,
        w: img.widthIn,
        h: img.heightIn,
      });
    }

    if (isConceptMap) {
      // Native concept map (v0.12.1): the explanatory bullets render as the
      // hub-and-spoke group on the right, so no separate explanation block —
      // the full bullet text remains available in the speaker notes.
      addConceptMapGroup(pptx, slide, theme, nativeVisual, tracker);
    } else if (s.bullets?.length > 1) {
      // Explanatory text below card
      const explanation = s.bullets.slice(1).join('\n');
      slide.addText(explanation, {
        x: 1.5,
        y: cardY + cardH + 0.2,
        w: W - 3,
        h: H - cardY - cardH - 0.5,
        fontSize: 14,
        fontFace: FONT_BODY,
        color: theme.bodyText,
        align: 'center',
        valign: 'top',
        lineSpacingMultiple: 1.5,
      });
    }

    addProgressDots(pptx, slide, theme, slideIndex, totalSlides, false);
  } else if (slideType === 'activity') {
    // ── ACTIVITY SLIDE ───────────────────────────────────────────────────
    slide.background = { color: 'FAFBFF' };

    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: W,
      h: 0.95,
      fill: { color: theme.primary },
      line: { color: theme.primary },
      altText: 'Decorative',
    });

    // ACTIVITY badge
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.5,
      y: 0.2,
      w: 1.2,
      h: 0.52,
      fill: { color: theme.accent },
      line: { color: theme.accent },
      rectRadius: 0.08,
      altText: 'Decorative',
    });
    slide.addText('ACTIVITY', {
      x: 0.5,
      y: 0.2,
      w: 1.2,
      h: 0.52,
      fontSize: 10,
      color: theme.primary,
      bold: true,
      align: 'center',
      valign: 'middle',
      fontFace: FONT_LABEL,
      charSpacing: 2,
    });

    if (s.timer || s.activityType) {
      const timerLabel = s.timer ? `Duration: ${s.timer}` : s.activityType;
      slide.addText(timerLabel, {
        x: W - 2.5,
        y: 0.22,
        w: 2.2,
        h: 0.48,
        fontSize: 12,
        color: theme.accent,
        bold: true,
        align: 'right',
        valign: 'middle',
        fontFace: FONT_BODY,
      });
    }

    // Auto-fit activity title from 22pt down to 14pt
    const actTitleText = s.title || 'Activity';
    const actTitleW = W - 4.5,
      actTitleH = 0.7;
    const actTitleSize = autoFitFontSize(actTitleText, actTitleW, actTitleH, FONT_HEADING, 22, 14);
    slide.addText(actTitleText, {
      x: 1.9,
      y: 0.12,
      w: actTitleW,
      h: actTitleH,
      fontSize: actTitleSize,
      color: 'FFFFFF',
      bold: true,
      fontFace: FONT_HEADING,
      valign: 'middle',
    });
    tracker.add({ x: 1.9, y: 0.12, w: actTitleW, h: actTitleH, label: 'activity-title' });

    // Activity card
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.5,
      y: 1.15,
      w: W - 1,
      h: H - 1.6,
      fill: { color: 'FFF8F0' },
      line: { color: theme.accent, pt: 2 },
      rectRadius: 0.15,
      altText: 'Activity instructions area',
    });

    if (s.bullets?.length > 0) {
      const bulletText = s.bullets.map((b, bi) => ({
        text: b,
        options: {
          bullet: { type: 'number', style: '1)', startAt: bi + 1 },
          fontSize: 16,
          color: theme.bodyText,
          breakLine: true,
          paraSpaceAfter: 12,
          lineSpacingMultiple: 1.5,
          bold: bi === 0,
        },
      }));
      slide.addText(bulletText, {
        x: 0.8,
        y: 1.35,
        w: W - 1.6,
        h: H - 2.0,
        fontFace: FONT_BODY,
        valign: 'top',
      });
    }

    addProgressDots(pptx, slide, theme, slideIndex, totalSlides, false);
  } else if (slideType === 'summary') {
    // ── SUMMARY / CLOSING SLIDE ──────────────────────────────────────────
    slide.background = { color: theme.primary };

    slide.addShape(pptx.ShapeType.ellipse, {
      x: W - 2.5,
      y: -0.8,
      w: 3.5,
      h: 3.5,
      fill: { color: theme.secondary, transparency: 55 },
      line: { color: theme.secondary, transparency: 55 },
      altText: 'Decorative',
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: H - 0.5,
      w: W,
      h: 0.5,
      fill: { color: theme.accent },
      line: { color: theme.accent },
      altText: 'Decorative',
    });

    // v0.14.1 (5.2a): slides 11 and 12 of every audited deck both carried the
    // "KEY TAKEAWAYS" kicker — slide 11 is the readiness self-check (compiled
    // type "summary", title "… readiness check"), slide 12 the carry-forward.
    // The kicker now names the slide's actual role.
    const rawSummaryType = String(s.type || '').toLowerCase();
    const summaryKicker =
      rawSummaryType === 'summary' || /readiness|self.?check|check[\s-]?in\b/i.test(s.title || '')
        ? 'READINESS CHECK'
        : 'KEY TAKEAWAYS';
    slide.addText(summaryKicker, {
      x: 0.7,
      y: 0.4,
      w: 6,
      h: 0.4,
      fontSize: 11,
      color: theme.accent,
      bold: true,
      charSpacing: 4,
      fontFace: FONT_LABEL,
    });
    // Auto-fit summary title from 28pt down to 18pt
    const sumTitleText = s.title || 'Summary';
    const sumTitleW = W - 1.5,
      sumTitleH = 0.95;
    const sumTitleSize = autoFitFontSize(sumTitleText, sumTitleW, sumTitleH, FONT_HEADING, 28, 18);
    slide.addText(sumTitleText, {
      x: 0.7,
      y: 0.85,
      w: sumTitleW,
      h: sumTitleH,
      fontSize: sumTitleSize,
      color: 'FFFFFF',
      bold: true,
      fontFace: FONT_HEADING,
    });
    tracker.add({ x: 0.7, y: 0.85, w: sumTitleW, h: sumTitleH, label: 'summary-title' });

    slide.addShape(pptx.ShapeType.rect, {
      x: 0.7,
      y: 1.85,
      w: 2.2,
      h: 0.06,
      fill: { color: theme.accent },
      line: { color: theme.accent },
      altText: 'Decorative',
    });

    if (s.bullets?.length > 0) {
      const summaryBullets = s.bullets.map((bullet) => String(bullet || '').trim()).filter(Boolean);
      // Summary slides sit immediately above the accent footer. Generated
      // carry-forward checks can be several lines longer than ordinary
      // takeaways, so a fixed 16pt list can visually spill outside its text
      // box and into the footer even though the OOXML bounds are valid.
      // Size the complete list as one unit and keep a readable 11pt floor.
      const summaryBodyW = W - 1.5;
      const summaryBodyH = H - 3.0;
      const summaryFontSize = autoFitBullets(summaryBullets, summaryBodyW, summaryBodyH, FONT_BODY, 16, 11, 1.5, 12);
      const bulletText = summaryBullets.map((b) => ({
        // `breakLine` already creates the next bullet paragraph. A literal
        // trailing newline creates a second visual line inside that paragraph
        // in PowerPoint/LibreOffice and was the actual source of the footer
        // collision found by rendered-package QA.
        text: b,
        options: {
          bullet: { code: '2714' },
          fontSize: summaryFontSize,
          color: 'D0E8FF',
          breakLine: true,
          paraSpaceAfter: 12,
          lineSpacingMultiple: 1.5,
        },
      }));
      slide.addText(bulletText, {
        x: 0.7,
        y: 2.1,
        w: summaryBodyW,
        h: summaryBodyH,
        fontFace: FONT_BODY,
        valign: 'top',
      });
    }

    addProgressDots(pptx, slide, theme, slideIndex, totalSlides, true);
  } else if (slideType === 'question') {
    // ── Q&A / DISCUSSION SLIDE ───────────────────────────────────────────
    slide.background = { color: theme.secondary };

    slide.addShape(pptx.ShapeType.ellipse, {
      x: W - 3,
      y: -1,
      w: 4,
      h: 4,
      fill: { color: theme.primary, transparency: 40 },
      line: { color: theme.primary, transparency: 40 },
      altText: 'Decorative',
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: H - 0.45,
      w: W,
      h: 0.45,
      fill: { color: theme.accent },
      line: { color: theme.accent },
      altText: 'Decorative',
    });

    slide.addText('?', {
      x: 0.4,
      y: 0.5,
      w: 1.2,
      h: 1.5,
      fontSize: 80,
      color: theme.accent,
      bold: true,
      align: 'center',
      fontFace: FONT_HEADING,
      transparency: 30,
    });

    // Auto-fit question title from 28pt down to 18pt
    const qTitleText = s.title || 'Discussion';
    const qTitleW = W - 2.2,
      qTitleH = 1.2;
    const qTitleSize = autoFitFontSize(qTitleText, qTitleW, qTitleH, FONT_HEADING, 28, 18);
    slide.addText(qTitleText, {
      x: 1.6,
      y: 0.7,
      w: qTitleW,
      h: qTitleH,
      fontSize: qTitleSize,
      color: 'FFFFFF',
      bold: true,
      fontFace: FONT_HEADING,
      valign: 'middle',
    });
    tracker.add({ x: 1.6, y: 0.7, w: qTitleW, h: qTitleH, label: 'question-title' });

    // Native decision matrix (v0.12.1): when the visual descriptor calls for
    // a matrix and the prompts fit, lay them out as a 2-column comparison
    // grid instead of a flat bullet list.
    if (nativeVisual?.type === 'decisionMatrix') {
      addDecisionMatrix(pptx, slide, theme, nativeVisual, tracker);
    } else if (s.bullets?.length > 0) {
      const bulletText = s.bullets.map((b) => ({
        text: b,
        options: {
          bullet: true,
          fontSize: 16,
          color: 'E8F4FF',
          breakLine: true,
          paraSpaceAfter: 12,
          lineSpacingMultiple: 1.5,
        },
      }));
      slide.addText(bulletText, {
        x: 0.7,
        y: 2.1,
        w: W - 1.4,
        h: H - 2.8,
        fontFace: FONT_BODY,
        valign: 'top',
      });
    }

    addProgressDots(pptx, slide, theme, slideIndex, totalSlides, true);
  } else {
    // ── CONTENT SLIDE (default) ──────────────────────────────────────────
    slide.background = { color: 'FFFFFF' };
    const bullets = s.bullets || [];
    const useTwoCol = bullets.length >= 4;

    // Left sidebar
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 0.12,
      h: H,
      fill: { color: theme.primary },
      line: { color: theme.primary },
      altText: 'Decorative',
    });

    // Top header area — gradient feel (light to white)
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.12,
      y: 0,
      w: W - 0.12,
      h: 1.1,
      fill: { color: theme.light },
      line: { color: theme.light },
      altText: 'Decorative',
    });

    // Accent line below header
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.12,
      y: 1.07,
      w: W - 0.12,
      h: 0.05,
      fill: { color: theme.accent },
      line: { color: theme.accent },
      altText: 'Decorative',
    });

    // Slide title — assertion-evidence style (auto-fit from 28pt down to 18pt)
    const contentTitleText = s.title || '';
    const contentTitleW = W - 0.7,
      contentTitleH = 0.9;
    const contentTitleSize = autoFitFontSize(contentTitleText, contentTitleW, contentTitleH, FONT_HEADING, 28, 18, 1.1);
    const contentTitleResult = await maybeProcessLatex(contentTitleText, hasLatex, {
      color: theme.primary,
      fontSizePt: contentTitleSize,
    });
    slide.addText(contentTitleResult.text, {
      x: 0.45,
      y: 0.1,
      w: contentTitleW,
      h: contentTitleH,
      fontSize: contentTitleSize,
      fontFace: FONT_HEADING,
      color: theme.primary,
      bold: true,
      valign: 'middle',
      lineSpacingMultiple: 1.1,
      fit: 'shrink', // v0.12.1: audited overflow box (content headline, ~0.9in)
    });
    tracker.add({ x: 0.45, y: 0.1, w: contentTitleW, h: contentTitleH, label: 'content-title' });

    // Native evidence table (v0.12.1): when the visual descriptor calls for
    // a table and the bullets fit, the lead assertion stays as text on the
    // left and the remaining bullets render as a native table on the right.
    // Both zones are sized so the reflow cannot overflow the slide.
    if (nativeVisual?.type === 'evidenceTable') {
      const leadW = 4.15,
        leadH = H - 2.0;
      const leadSize = autoFitFontSize(nativeVisual.lead, leadW, leadH, FONT_BODY, 15, 11, 1.4);
      slide.addText(nativeVisual.lead, {
        x: 0.45,
        y: 1.35,
        w: leadW,
        h: leadH,
        fontSize: leadSize,
        fontFace: FONT_BODY,
        color: theme.bodyText,
        bold: true,
        valign: 'top',
        lineSpacingMultiple: 1.4,
        fit: 'shrink',
      });
      tracker.add({ x: 0.45, y: 1.35, w: leadW, h: leadH, label: 'evidence-lead' });
      addEvidenceTable(pptx, slide, theme, nativeVisual, visKind, tracker);
    } else if (nativeVisual?.type === 'wePlot') {
      // Worked-example plot (v0.14.5 C2): the authored step bullets keep the
      // left half (the reasoning IS the content) and the computed values
      // render as a native bar chart in the visual zone — the same split the
      // evidence table uses, so neither zone can overflow the slide.
      const plotLeftW = 4.15,
        plotLeftH = H - 1.6;
      const plotSize = autoFitBullets(bullets, plotLeftW, plotLeftH, FONT_BODY, 14, 10, 1.4, 10);
      slide.addText(
        bullets.map((b, bi) => ({
          text: b,
          options: {
            bullet: { code: '25CF' },
            fontSize: plotSize,
            color: bi === 0 ? theme.bodyText : '444444',
            breakLine: true,
            paraSpaceAfter: 10,
            lineSpacingMultiple: 1.4,
            bold: bi === 0,
          },
        })),
        {
          x: 0.45,
          y: 1.2,
          w: plotLeftW,
          h: plotLeftH,
          fontFace: FONT_BODY,
          valign: 'top',
        },
      );
      tracker.add({ x: 0.45, y: 1.2, w: plotLeftW, h: plotLeftH, label: 'worked-example-bullets' });
      addWorkedExamplePlot(pptx, slide, theme, nativeVisual, tracker);
    } else if (bullets.length > 0) {
      // Content bullets — two-column if 4+
      if (useTwoCol) {
        const mid = Math.ceil(bullets.length / 2);
        const leftBullets = bullets.slice(0, mid);
        const rightBullets = bullets.slice(mid);

        // Auto-fit two-column bullets from 16pt down to 11pt
        const twoColW = (W - 1.0) / 2,
          twoColH = H - 1.6;
        const allBullets2col = [...leftBullets, ...rightBullets];
        const twoColSize = autoFitBullets(allBullets2col, twoColW, twoColH, FONT_BODY, 16, 11, 1.5, 12);

        // Process LaTeX for each bullet
        const leftProcessed = await Promise.all(
          leftBullets.map((b) => maybeProcessLatex(b, hasLatex, { color: theme.bodyText, fontSizePt: twoColSize })),
        );
        const leftText = leftProcessed.map((r, bi) => ({
          text: r.text,
          options: {
            bullet: { code: '25CF' },
            fontSize: twoColSize,
            color: bi === 0 ? theme.bodyText : '444444',
            breakLine: true,
            paraSpaceAfter: 12,
            lineSpacingMultiple: 1.5,
            bold: bi === 0,
          },
        }));
        slide.addText(leftText, {
          x: 0.45,
          y: 1.2,
          w: twoColW,
          h: twoColH,
          fontFace: FONT_BODY,
          valign: 'top',
        });
        tracker.add({ x: 0.45, y: 1.2, w: twoColW, h: twoColH, label: 'bullets-left' });

        const rightProcessed = await Promise.all(
          rightBullets.map((b) => maybeProcessLatex(b, hasLatex, { color: '444444', fontSizePt: twoColSize })),
        );
        const rightText = rightProcessed.map((r) => ({
          text: r.text,
          options: {
            bullet: { code: '25CF' },
            fontSize: twoColSize,
            color: '444444',
            breakLine: true,
            paraSpaceAfter: 12,
            lineSpacingMultiple: 1.5,
          },
        }));
        slide.addText(rightText, {
          x: W / 2 + 0.1,
          y: 1.2,
          w: twoColW,
          h: twoColH,
          fontFace: FONT_BODY,
          valign: 'top',
        });
        tracker.add({ x: W / 2 + 0.1, y: 1.2, w: twoColW, h: twoColH, label: 'bullets-right' });

        // Collect display-mode LaTeX images from all bullets
        const twoColImages = [...leftProcessed, ...rightProcessed].flatMap((r) =>
          r.images.filter((i) => i.displayMode),
        );
        let imgY2col = H - 1.0;
        for (const img of twoColImages) {
          slide.addImage({ data: img.base64, x: (W - img.widthIn) / 2, y: imgY2col, w: img.widthIn, h: img.heightIn });
          imgY2col += img.heightIn + 0.1;
        }
      } else {
        // Auto-fit single-column bullets from 16pt down to 11pt
        const oneColW = W - 0.7,
          oneColH = H - 1.6;
        const oneColSize = autoFitBullets(bullets, oneColW, oneColH, FONT_BODY, 16, 11, 1.5, 12);

        const oneColProcessed = await Promise.all(
          bullets.map((b) => maybeProcessLatex(b, hasLatex, { color: theme.bodyText, fontSizePt: oneColSize })),
        );
        const bulletText = oneColProcessed.map((r, bi) => ({
          text: r.text,
          options: {
            bullet: { code: '25CF' },
            fontSize: oneColSize,
            color: bi === 0 ? theme.bodyText : '444444',
            breakLine: true,
            paraSpaceAfter: 12,
            lineSpacingMultiple: 1.5,
            bold: bi === 0,
          },
        }));
        slide.addText(bulletText, {
          x: 0.45,
          y: 1.2,
          w: oneColW,
          h: oneColH,
          fontFace: FONT_BODY,
          valign: 'top',
        });
        tracker.add({ x: 0.45, y: 1.2, w: oneColW, h: oneColH, label: 'bullets' });

        // Collect display-mode LaTeX images
        const oneColImages = oneColProcessed.flatMap((r) => r.images.filter((i) => i.displayMode));
        let imgY1col = H - 1.0;
        for (const img of oneColImages) {
          slide.addImage({ data: img.base64, x: (W - img.widthIn) / 2, y: imgY1col, w: img.widthIn, h: img.heightIn });
          imgY1col += img.heightIn + 0.1;
        }
      }
    }

    addProgressDots(pptx, slide, theme, slideIndex, totalSlides, false);
  }

  // ── Slide number badge (bottom right) ────────────────────────────────
  const isDarkSlide = slideType === 'title' || slideType === 'summary' || slideType === 'question';
  const slideNumberX = W - 1.75;
  // The bridge layout owns a full-width bottom accent band, so seat its badge
  // just above that band.
  const slideNumberY = slideType === 'bridge' ? H - 0.85 : H - 0.46;
  const slideNumberW = 1.5;
  const slideNumberH = 0.36;
  const slideNumberLabel = `${slideIndex + 1}/${totalSlides}`;
  const slideNumberFill = isDarkSlide ? theme.accent : theme.primary;
  const slideNumberColor = isDarkSlide ? theme.primary : 'FFFFFF';
  addSlideCounterBadge(
    pptx,
    slide,
    slideNumberLabel,
    slideNumberFill,
    slideNumberColor,
    slideNumberX,
    slideNumberY,
    slideNumberW,
    slideNumberH,
  );
  // v0.14.5 (C3) arming marker: every deck's FIRST slide stamps the
  // visual-layer feature name into its XML. The grader's native-visual bar
  // arms only on packages carrying a cmViz marker.
  if (slideIndex === 0) {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 0.001,
      h: 0.001,
      fill: { color: slideNumberFill, transparency: 100 },
      line: { color: slideNumberFill, transparency: 100 },
      objectName: 'cmVizLayer',
      altText: 'Scion native visual marker',
    });
  }

  // ── Element validation ─────────────────────────────────────────────────
  const warnings = tracker.validate();
  if (warnings.length > 0) {
    console.warn(`[CM] Slide ${slideIndex + 1} (${slideType}) validation:`, warnings);
  }

  // Speaker notes — prepend a natural-language visual note when
  // the slide carries a visual hint. This keeps the cue visible in the
  // PPT's Notes Page view even if the instructor never looks at the slide.
  // The block stays even when the visual was rendered natively above — it
  // doubles as accessibility support for the rendered table/shape group.
  const rawNotes = s.notes || s.speakerNotes || '';
  const baseNotes =
    countSpeakerNoteWords(rawNotes) >= 20
      ? rawNotes
      : [rawNotes, buildFallbackSpeakerNotes(deck, s, slideIndex, totalSlides)].filter(Boolean).join('\n\n');
  const visualLabel = noteLabel(VISUAL_NOTE_LABELS, deck.lessonTitle, deck.lt, s.title, slideIndex, slideType, visKind);
  const accessibilityLabel = noteLabel(
    ACCESSIBILITY_NOTE_LABELS,
    deck.lessonTitle,
    deck.lt,
    s.title,
    slideIndex,
    slideType,
    visKind,
    visAlt,
  );
  const visualGuidance = hasVisual
    ? [`${visualLabel} (${visKind}): ${visDesc}`, visAlt ? `${accessibilityLabel}: ${visAlt}` : '']
        .filter(Boolean)
        .join('\n')
    : '';
  const augmentedNotes = visualGuidance ? `${visualGuidance}${baseNotes ? `\n\n---\n\n${baseNotes}` : ''}` : baseNotes;
  if (augmentedNotes) slide.addNotes(augmentedNotes);

  // Generated visual images render on the slide; visual *suggestions* live in
  // the speaker notes only. v0.8.6 drew a dashed "SUGGESTED VISUAL" meta-box
  // on student-facing slides, which read as unfinished authoring scaffolding,
  // so the text placeholder was removed in v0.8.61.
  const PLACEHOLDER_TYPES = new Set(['content', 'bridge', 'example', 'keyTerm', 'activity']);
  if (hasVisual && PLACEHOLDER_TYPES.has(slideType)) {
    const pw = 3.0,
      ph = 1.15;
    const px = W - pw - 0.3;
    const py = H - ph - 0.55; // above slide-number chip
    if (generatedVisualImage?.url?.startsWith('data:image/')) {
      slide.addImage({
        data: generatedVisualImage.url,
        x: px,
        y: py,
        w: pw,
        h: ph,
        altText: visAlt || visDesc || 'Generated slide visual',
      });
      tracker.add({ x: px, y: py, w: pw, h: ph, label: 'generated visual' });
    }
  }

  // v0.14.5 (C3): report what rendered so the multi-deck audit line can
  // count native visuals across the build.
  return { nativeVisualType: nativeVisual?.type || null };
}

/**
 * Resolve theme — supports themeIndex or falls back to rotating.
 */
function resolveTheme(deckIndex, themeIndex) {
  if (themeIndex !== undefined && themeIndex !== null && themeIndex >= 0 && themeIndex < THEMES.length) {
    return THEMES[themeIndex];
  }
  return THEMES[deckIndex % THEMES.length];
}

/**
 * Create a pptx instance with all decks.
 */
async function createPptxWithDecks(data, courseName, themeIndex) {
  const expanded = expandKeys('slideDecks', data);
  const PptxGenJS = await getPptxGen();
  const pptx = new PptxGenJS();

  pptx.layout = 'LAYOUT_16x9';
  pptx.lang = 'en-US';
  pptx.author = 'CourseMapper';
  pptx.title = courseName || 'Slide Decks';
  pptx.theme = { headFontFace: FONT_HEADING, bodyFontFace: FONT_BODY };

  const key = expanded.decks ? 'decks' : 'slideDecks';
  const decks = (expanded[key] || []).map((d, i) => ({ ...d, _deckIndex: i }));

  // One-time LaTeX scan across all decks
  const hasLatex = deckDataContainsLatex(expanded);
  if (hasLatex) {
    console.log('[CM] PPTX: LaTeX detected in deck data — enabling math rendering');
  }

  const deckAudit = [];
  let nativeVisualCount = 0;
  for (let di = 0; di < decks.length; di++) {
    const deck = decks[di];
    const theme = themeWithCourseAccent(resolveTheme(di, themeIndex), courseName);
    const slides = deck.slides || [];

    for (let si = 0; si < slides.length; si++) {
      const built = await buildSlideForDeck(pptx, deck, theme, si, slides.length, { hasLatex });
      if (built?.nativeVisualType) nativeVisualCount += 1;
    }

    deckAudit.push({ lesson: deck.lessonTitle || `Deck ${di + 1}`, slides: slides.length });
  }

  // ── Slide deck audit logging ──
  // v0.12.1: only log for multi-deck builds. The package ZIP exporter slices
  // decks one lesson per file through this builder, which used to print 15
  // statistically meaningless "1 decks (min=max=median)" lines per package.
  if (deckAudit.length > 1) {
    const slideCounts = deckAudit.map((d) => d.slides);
    const totalSlides = slideCounts.reduce((a, b) => a + b, 0);
    const minSlides = Math.min(...slideCounts);
    const maxSlides = Math.max(...slideCounts);
    const median = [...slideCounts].sort((a, b) => a - b)[Math.floor(slideCounts.length / 2)];
    // v0.14.5 (C3): the audit line counts native visuals (tables, matrices,
    // concept maps, worked-example charts) rendered across the build.
    console.log(
      `[CM] PPTX audit: ${deckAudit.length} decks, ${totalSlides} total slides, ${nativeVisualCount} native visuals (min: ${minSlides}, max: ${maxSlides}, median: ${median})`,
    );
    const thin = deckAudit.filter((d) => d.slides < Math.max(5, Math.floor(median * 0.4)));
    if (thin.length > 0) {
      console.warn(
        `[CM] PPTX: ${thin.length} deck(s) with unusually few slides:`,
        thin.map((d) => `${d.lesson} (${d.slides})`),
      );
    }
  }

  return pptx;
}

/**
 * v0.14.1 (1.13): strip run-level <a:ea> overrides that pin CJK glyphs to a
 * Latin face. pptxgenjs 4.0.1 hardcodes
 *   <a:latin .../><a:ea typeface="${fontFace}" .../><a:cs .../>
 * for EVERY run that sets fontFace (dist/pptxgen.cjs.js, genXmlTextRunProperties)
 * — there is no option to suppress it, so every Georgia/Trebuchet MS run in
 * our decks carried w:eastAsia="Georgia"-style overrides and CJK text
 * rendered as tofu in LibreOffice/Google Slides/PDF pipelines. The
 * theme1.xml pptxgenjs writes is fine (its <a:ea typeface=""/> plus
 * per-script font tables are CJK-capable), so removing the run-level
 * override lets renderers fall back correctly.
 */
async function stripLatinEastAsiaOverrides(blob) {
  const mod = await safeImport(() => import('jszip'));
  const JSZip = mod.default || mod;
  const zip = await JSZip.loadAsync(typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : blob);
  const escapeFace = (face) => face.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const faces = [...new Set([FONT_HEADING, FONT_BODY, FONT_LABEL])].map(escapeFace).join('|');
  const eaOverride = new RegExp(`<a:ea typeface="(?:${faces})"[^>]*/>`, 'g');
  let changed = false;
  for (const name of Object.keys(zip.files)) {
    if (!/^ppt\/.*\.xml$/.test(name)) continue;
    const xml = await zip.file(name).async('string');
    const next = xml.replace(eaOverride, '');
    if (next !== xml) {
      zip.file(name, next);
      changed = true;
    }
  }
  if (!changed) return blob;
  return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/**
 * Export slide deck data as a .pptx file.
 */
export async function exportSlideDeckPptx(data, courseName, themeIndex) {
  const { saveAs } = await safeImport(() => import('file-saver'));
  const blob = await buildSlideDeckPptxBlob(data, courseName, themeIndex);
  await assertOfficeExportHasNoInternalText(blob, 'pptx', 'Slide Decks');
  const fileName = `${courseName || 'Course'} - Slide Decks.pptx`;
  saveAs(blob, fileName);
  return fileName;
}

/**
 * Build a PPTX blob (for uploading to Google Slides).
 */
export async function buildSlideDeckPptxBlob(data, courseName, themeIndex) {
  const pptx = await createPptxWithDecks(data, courseName, themeIndex);
  const blob = await pptx.write({ outputType: 'blob' });
  return await stripLatinEastAsiaOverrides(blob);
}

/**
 * Build a PPTX blob for a single slide deck (one lesson).
 */
export async function buildSingleDeckPptxBlob(deck, deckIndex, courseName, themeIndex) {
  const expandedDeck = expandKeys('slideDecks', { decks: [deck] })?.decks?.[0] || deck;
  const PptxGenJS = await getPptxGen();
  const pptx = new PptxGenJS();

  pptx.layout = 'LAYOUT_16x9';
  pptx.lang = 'en-US';
  pptx.title = expandedDeck.lessonTitle || courseName || 'Slide Deck';
  pptx.theme = { headFontFace: FONT_HEADING, bodyFontFace: FONT_BODY };

  const theme = themeWithCourseAccent(resolveTheme(deckIndex, themeIndex), courseName);
  const deckWithIndex = { ...expandedDeck, _deckIndex: deckIndex };
  const slides = expandedDeck.slides || [];

  // Check for LaTeX in this single deck
  const hasLatex = deckDataContainsLatex({ decks: [expandedDeck] });

  for (let si = 0; si < slides.length; si++) {
    await buildSlideForDeck(pptx, deckWithIndex, theme, si, slides.length, { hasLatex });
  }

  const blob = await pptx.write({ outputType: 'blob' });
  return await stripLatinEastAsiaOverrides(blob);
}

/**
 * Download a single deck as its own .pptx file immediately.
 */
export async function exportSingleDeckPptx(deck, deckIndex, courseName, themeIndex) {
  const { saveAs } = await safeImport(() => import('file-saver'));
  const blob = await buildSingleDeckPptxBlob(deck, deckIndex, courseName, themeIndex);
  await assertOfficeExportHasNoInternalText(blob, 'pptx', 'Slide Decks');
  const deckName = (deck.lessonTitle || `Deck ${deckIndex + 1}`).replace(/[/\\?%*:|"<>]/g, '-').trim();
  const lessonNumMatch = (deck.lessonTitle || '').match(/^(?:Lesson|Week)\s*(\d+)/i);
  const lessonNum = lessonNumMatch ? parseInt(lessonNumMatch[1], 10) : deckIndex + 1;
  const fileName = `Lesson ${lessonNum} - ${deckName}.pptx`;
  saveAs(blob, fileName);
  return fileName;
}
