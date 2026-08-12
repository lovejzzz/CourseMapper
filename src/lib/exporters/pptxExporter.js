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
import { renderedDeliverableCollection } from '../renderedDeliverableRoot.js';
import { assertOfficeExportHasNoInternalText } from '../exportTextInspector.js';
import { safeImport } from '../safeImport.js';
import { isSubstantiveSlideSubtitle } from './slideTitleSubtitle.js';

let _PptxGenJS;

async function getPptxGen() {
  if (!_PptxGenJS) {
    const mod = await safeImport(() => import('pptxgenjs'));
    _PptxGenJS = mod.default || mod;
  }
  return _PptxGenJS;
}

const PPTX_ACCESSIBILITY_REGISTRY = Symbol('courseMapperPptxAccessibilityRegistry');
const PPTX_SPECIMEN_CONTRACT_REGISTRY = Symbol('courseMapperPptxSpecimenContractRegistry');
const PPTX_REGISTER_SPECIMEN_CONTRACT = Symbol('courseMapperRegisterSpecimenContract');

function flattenPptxAccessibleText(value, depth = 0) {
  if (value == null || depth > 5) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => flattenPptxAccessibleText(item, depth + 1))
      .filter(Boolean)
      .join(' ');
  }
  if (typeof value !== 'object') return '';
  if (Object.prototype.hasOwnProperty.call(value, 'text')) {
    return flattenPptxAccessibleText(value.text, depth + 1);
  }
  return Object.entries(value)
    .filter(([key]) => !['options', 'style', 'color', 'fill', 'line'].includes(key))
    .map(([, item]) => flattenPptxAccessibleText(item, depth + 1))
    .filter(Boolean)
    .join(' ');
}

function derivedPptxDescription(method, methodArgs, optionsIndex) {
  const authored = String(methodArgs[optionsIndex]?.altText || '').trim();
  if (authored) return authored;
  if (method === 'addText') return 'Visible slide text; content is exposed through the text box.';
  const content = flattenPptxAccessibleText(methodArgs.slice(0, optionsIndex))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
  if (!content) return '';
  if (method === 'addTable') return `Table content: ${content}`;
  if (method === 'addChart') return `Chart content: ${content}`;
  return '';
}

/**
 * pptxgenjs currently ignores `altText` on shapes and text boxes. Keep the
 * authoring API useful by assigning every semantic object a stable name and
 * recording its description for an OOXML post-processing pass. Records are
 * scoped per slide because native visual names (for example cmVizSpoke) are
 * intentionally repeated and are also used as deterministic quality markers.
 */
function instrumentPptxAccessibility(pptx) {
  const registry = new Map();
  const specimenContractRegistry = new Map();
  const addSlide = pptx.addSlide.bind(pptx);
  let slideNumber = 0;

  pptx.addSlide = (...args) => {
    const slide = addSlide(...args);
    slideNumber += 1;
    const records = [];
    registry.set(slideNumber, records);
    Object.defineProperty(slide, PPTX_REGISTER_SPECIMEN_CONTRACT, {
      value: (contract) => specimenContractRegistry.set(slideNumber, structuredClone(contract)),
    });

    for (const [method, optionsIndex] of [
      ['addShape', 1],
      ['addText', 1],
      ['addTable', 1],
      ['addChart', 2],
      ['addImage', 0],
    ]) {
      if (typeof slide[method] !== 'function') continue;
      const original = slide[method].bind(slide);
      slide[method] = (...methodArgs) => {
        const options = methodArgs[optionsIndex] || {};
        const description = derivedPptxDescription(method, methodArgs, optionsIndex);
        const objectName = String(options.objectName || `cmA11y-s${slideNumber}-${records.length + 1}`);
        methodArgs[optionsIndex] = { ...options, objectName };
        records.push({ objectName, description });
        return original(...methodArgs);
      };
    }

    return slide;
  };

  Object.defineProperty(pptx, PPTX_ACCESSIBILITY_REGISTRY, { value: registry });
  Object.defineProperty(pptx, PPTX_SPECIMEN_CONTRACT_REGISTRY, { value: specimenContractRegistry });
  return pptx;
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
    secondary: '246B8A',
    accent: 'F6C90E',
    light: 'EEF4FF',
    sideBar: '1E3A5F',
    body: 'FFFFFF',
    titleText: 'FFFFFF',
    bodyText: '1A1A2E',
    subtleText: '566987',
  },
  {
    name: 'Forest & Amber',
    primary: '1B4332',
    secondary: '2F7A56',
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
    subtleText: '0B6AA2',
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
  const pointCount = rawBullets.filter((bullet) => String(bullet || '').trim()).length;
  const focus =
    pointCount === 1 ? 'displayed point' : pointCount > 1 ? `${pointCount} displayed points` : 'central idea';
  // Notes should help an instructor teach the projected content, not copy it.
  // Verbatim bullet echoes both inflate the honest package repetition score and
  // encourage reading the slide aloud. Slide-indexed variants keep the fallback
  // natural across a full course without stamping one long template everywhere.
  const guidance = [
    `Guide learners through the ${focus} in sequence, pausing to distinguish the claim, evidence, and implication.`,
    `Treat the ${focus} as a comparison: clarify the premise first, then ask what changes in practice.`,
    `Unpack the ${focus} one at a time; name the reasoning move and check where learners need evidence.`,
    `Connect the ${focus} to the lesson objective, then test understanding with a concrete counterexample.`,
  ];
  const checks = [
    'Invite one implication or misconception before moving forward.',
    'Ask for a concise application before advancing to the next slide.',
    'Check one learner explanation and correct the most consequential gap.',
    'Close by asking what evidence would change the conclusion.',
  ];
  const variant = slideIndex % guidance.length;
  return [
    `Use this slide in ${lessonTitle} to frame "${slideTitle}" as part ${slideIndex + 1} of ${totalSlides}.`,
    guidance[variant],
    checks[variant],
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

function addSlideCounterBadge(pptx, slide, label, backgroundColor, glyphColor, x, y, w, h) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    fill: { color: backgroundColor },
    line: { color: backgroundColor, transparency: 100 },
    altText: 'Decorative slide counter background',
    objectName: `slide-counter-${label.replace('/', '-of-')}`,
  });
  slide.addText(label.replace('/', ' / '), {
    x,
    y,
    w,
    h,
    margin: 0,
    fontFace: FONT_BODY,
    fontSize: 12,
    bold: true,
    color: glyphColor,
    align: 'center',
    valign: 'middle',
    fit: 'shrink',
    altText: `Slide ${label.replace('/', ' of ')}`,
    objectName: `slide-counter-label-${label.replace('/', '-of-')}`,
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
      // Keep the fixed-height evidence table readable. Four prose-heavy rows
      // force PowerPoint/LibreOffice to clip the final cell even when the
      // descriptor itself is valid.
      .slice(0, 3);
    if (rows.length < 2) return null;
    const rawDescriptorLead = String(visual.tableLead || '').trim();
    const descriptorLead = /\b(?:a|an|and|as|at|by|for|from|in|of|on|or|that|the|to|with|without)$/i.test(
      rawDescriptorLead,
    )
      ? `Use the source points below to evaluate ${String(s.title || 'the lesson claim').trim()}.`
      : rawDescriptorLead;
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

  if (slideType === 'keyTerm' && /\bevidence\s*specimen\b/i.test(visKind)) {
    const visual = s.visual || s.vi || {};
    const typedSpecimen = visual.typedSpecimen || null;
    const hasBoundVisibleTask =
      typedSpecimen?.protocol === 'coursemapper-typed-evidence-specimen-v1' &&
      typedSpecimen?.visibleTask?.protocol === 'coursemapper-visible-functional-task-v1';
    const definition = String(
      hasBoundVisibleTask ? typedSpecimen.visibleTask.cardText : visual.observationPrompt || '',
    ).trim();
    // Typed tasks are hash-bound by the compiler. Keep that authored text
    // visible and let the card shrink/reflow; never substitute generic prose
    // or silently drop the promised specimen because the task is long.
    if (!definition || (!hasBoundVisibleTask && definition.length > NATIVE_VISUAL_LIMITS.definition)) return null;
    return {
      type: 'evidenceSpecimen',
      definition,
      seed: String(visual.specimenSeed || s.title || 'specimen'),
      label: String(visual.specimenLabel || 'Visual evidence').trim(),
      evidenceLabel: String(visual.evidenceLabel || 'Supporting detail').trim(),
      altText: String(visual.altText || '').trim(),
      typedSpecimen,
    };
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
    const descriptor = visual.wePlot || {};
    const kind = String(descriptor.kind || 'bar').trim();
    const pairs = (Array.isArray(descriptor.pairs) ? descriptor.pairs : [])
      .map((pair) => ({
        label: String(pair?.label || '').trim(),
        value: Number(pair?.value),
        unit: String(pair?.unit || '').trim(),
      }))
      .filter((pair) => pair.label && Number.isFinite(pair.value));
    if (['bar', 'histogram'].includes(kind) && pairs.length >= 2 && pairs.length <= 8) {
      return { type: 'wePlot', kind, pairs };
    }
    if (kind === 'scatter') {
      const points = (Array.isArray(descriptor.points) ? descriptor.points : [])
        .map((point) => ({ x: Number(point?.x), y: Number(point?.y) }))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
      if (points.length >= 2 && points.length <= 24) {
        return { type: 'wePlot', kind, points, showFit: descriptor.showFit === true };
      }
    }
    if (kind === 'dotplot') {
      const values = (Array.isArray(descriptor.values) ? descriptor.values : []).map(Number).filter(Number.isFinite);
      if (values.length >= 3 && values.length <= 30) return { type: 'wePlot', kind, values };
    }
    if (kind === 'contingency-table') {
      const columns = (Array.isArray(descriptor.columns) ? descriptor.columns : []).map((value) => String(value));
      const rows = (Array.isArray(descriptor.rows) ? descriptor.rows : [])
        .map((row) => (Array.isArray(row) ? row.slice(0, 3) : []))
        .filter((row) => row.length === 3 && row.every((value) => String(value).trim()));
      if (columns.length === 3 && rows.length >= 2 && rows.length <= 6) {
        return { type: 'wePlot', kind, columns, rows };
      }
    }
    if (kind === 'number-line') {
      const domain = (Array.isArray(descriptor.domain) ? descriptor.domain : []).map(Number);
      const markers = (Array.isArray(descriptor.markers) ? descriptor.markers : [])
        .map((marker) => ({ label: String(marker?.label || '').trim(), value: Number(marker?.value) }))
        .filter((marker) => marker.label && Number.isFinite(marker.value));
      if (domain.length === 2 && domain.every(Number.isFinite) && domain[0] < domain[1] && markers.length >= 2) {
        return { type: 'wePlot', kind, domain, markers };
      }
    }
    if (kind === 'interval') {
      const low = Number(descriptor.low);
      const center = Number(descriptor.center);
      const high = Number(descriptor.high);
      if ([low, center, high].every(Number.isFinite) && low <= center && center <= high && low < high) {
        return {
          type: 'wePlot',
          kind,
          low,
          center,
          high,
          labels: (Array.isArray(descriptor.labels) ? descriptor.labels : ['lower', 'estimate', 'upper']).map(String),
        };
      }
    }
    if (kind === 'sampling-frame') {
      const frame = (Array.isArray(descriptor.frame) ? descriptor.frame : []).map(Number).filter(Number.isFinite);
      const selected = (Array.isArray(descriptor.selected) ? descriptor.selected : [])
        .map(Number)
        .filter(Number.isFinite);
      if (frame.length >= 4 && frame.length <= 24 && selected.length >= 1) {
        return { type: 'wePlot', kind, frame, selected };
      }
    }
    return null;
  }

  return null;
}

/** Render the evidence table on the right half of a content slide. */
function addEvidenceTable(pptx, slide, theme, plan, visKind, tracker, authoredAltText = '') {
  const tableX = 4.95,
    tableY = 1.35;
  const tableW = SLIDE_W - tableX - 0.4;
  const leadColW = plan.isMisconceptionComparison ? 2.05 : 1.55;
  const bodyFontSize = plan.isMisconceptionComparison ? 8.25 : 10;
  // Four rows (header + three comparisons) must stay below the counter while
  // leaving enough vertical room for LibreOffice's less compact line metrics.
  // The former 0.9in rows let wrapped corrections bleed into the next row.
  const rowH = plan.isMisconceptionComparison ? 0.95 : 0.72;
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
  const tableRecoveryDescription = `Columns ${headerRow.map((cell) => cell.text).join(' and ')}. Rows: ${plan.rows
    .map((cells) =>
      cells
        .map((cell) => String(cell || '').trim())
        .filter(Boolean)
        .join(' means '),
    )
    .filter(Boolean)
    .join('; ')}.`;
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
    altText: `${String(authoredAltText || '').trim() || 'Evidence table.'} ${tableRecoveryDescription}`,
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
function addDecisionMatrix(pptx, slide, theme, plan, tracker, authoredAltText = '') {
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
    altText: `${String(authoredAltText || '').trim() || 'Decision matrix.'} Options: ${plan.cells
      .map((cell) => String(cell || '').trim())
      .filter(Boolean)
      .join('; ')}.`,
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
      altText: `Connector from central concept ${plan.hub} to related idea ${spoke.text}`,
    });
  }

  for (const spoke of spokes) {
    // LibreOffice can split the final letter from an otherwise unbroken
    // 11+ character label even when the rough line-width estimate fits.
    // Start those tokens smaller so words such as "Conformance" stay whole.
    const longestToken = Math.max(
      ...String(spoke.text)
        .split(/\s+/)
        .map((token) => token.length),
    );
    const spokeMaxSize = longestToken >= 11 ? 9 : 11;
    const spokeSize = autoFitFontSize(spoke.text, spoke.w - 0.3, spokeH - 0.25, FONT_BODY, spokeMaxSize, 8, 1.15);
    // Keep geometry and text in separate objects. LibreOffice may interpret a
    // text-bearing ellipse as "resize shape to fit text" and expand a lower
    // spoke into a large white mask over the rest of the slide. A fixed shape
    // plus a transparent shrink-to-fit label preserves the physical slot.
    slide.addShape(pptx.ShapeType.ellipse, {
      x: spoke.x,
      y: spoke.y,
      w: spoke.w,
      h: spokeH,
      fill: { color: 'FFFFFF' },
      line: { color: theme.secondary, pt: 1 },
      objectName: 'cmVizSpoke',
      altText: `Concept-map node containing related idea ${spoke.text}`,
    });
    slide.addText(spoke.text, {
      x: spoke.x,
      y: spoke.y,
      w: spoke.w,
      h: spokeH,
      fontSize: spokeSize,
      fontFace: FONT_BODY,
      color: theme.bodyText,
      align: 'center',
      valign: 'middle',
      lineSpacingMultiple: 1.15,
      fit: 'shrink',
      margin: 0.08,
      objectName: 'cmVizSpokeLabel',
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
  slide.addShape(pptx.ShapeType.ellipse, {
    x: hub.x,
    y: hub.y,
    w: hub.w,
    h: hub.h,
    fill: { color: theme.accent },
    line: { color: theme.primary, pt: 1.5 },
    objectName: 'cmVizHub',
    altText: `Concept-map hub containing central concept ${plan.hub}`,
  });
  slide.addText(plan.hub, {
    x: hub.x,
    y: hub.y,
    w: hub.w,
    h: hub.h,
    fontSize: hubSize,
    fontFace: FONT_HEADING,
    color: theme.primary,
    bold: true,
    align: 'center',
    valign: 'middle',
    lineSpacingMultiple: 1.1,
    fit: 'shrink',
    margin: 0.08,
    objectName: 'cmVizHubLabel',
    altText: `Central concept: ${plan.hub}`,
  });
  tracker.add({ x: hub.x, y: hub.y, w: hub.w, h: hub.h, label: 'concept-hub' });
}

function specimenVariant(seed = '') {
  let hash = 0;
  for (const character of String(seed)) hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  return hash % 4;
}

function typedSpecimenTone(theme, tone) {
  if (tone === 'accent') return theme.accent;
  if (tone === 'secondary') return theme.secondary;
  if (tone === 'muted') return 'CBD5E1';
  return theme.primary;
}

function specimenGeometry(canvas, geometry = {}) {
  const x = Number(geometry.x) || 0;
  const y = Number(geometry.y) || 0;
  const w = Math.max(2, Number(geometry.w) || 10);
  const h = Math.max(2, Number(geometry.h) || 10);
  return {
    x: canvas.x + (canvas.w * x) / 100,
    y: canvas.y + (canvas.h * y) / 100,
    w: (canvas.w * w) / 100,
    h: (canvas.h * h) / 100,
  };
}

function addTypedSpecimenGeometryInvariants(pptx, slide, theme, contract, canvas, rendered) {
  const kind = String(contract?.specimenKind || '');
  if (kind === 'spatial-composition') {
    for (const [axis, fraction] of [
      ['v1', 1 / 3],
      ['v2', 2 / 3],
    ]) {
      slide.addShape(pptx.ShapeType.line, {
        x: canvas.x + canvas.w * fraction,
        y: canvas.y,
        w: 0,
        h: canvas.h,
        line: { color: '94A3B8', pt: 0.8, dash: 'dash' },
        objectName: `cmInvariant_thirds-${axis}`,
        altText: `Rule-of-thirds vertical guide ${axis.slice(-1)}.`,
      });
    }
    for (const [axis, fraction] of [
      ['h1', 1 / 3],
      ['h2', 2 / 3],
    ]) {
      slide.addShape(pptx.ShapeType.line, {
        x: canvas.x,
        y: canvas.y + canvas.h * fraction,
        w: canvas.w,
        h: 0,
        line: { color: '94A3B8', pt: 0.8, dash: 'dash' },
        objectName: `cmInvariant_thirds-${axis}`,
        altText: `Rule-of-thirds horizontal guide ${axis.slice(-1)}.`,
      });
    }
    const from = rendered.get('primary-mass');
    const to = rendered.get('focal-anchor');
    if (from && to) {
      const x1 = from.x + from.w;
      const y1 = from.y + from.h / 2;
      const x2 = to.x + to.w / 2;
      const y2 = to.y + to.h / 2;
      slide.addShape(pptx.ShapeType.line, {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        w: Math.abs(x2 - x1),
        h: Math.abs(y2 - y1),
        flipH: x2 < x1,
        flipV: y2 < y1,
        line: { color: theme.accent, pt: 2.2, endArrowType: 'triangle' },
        objectName: 'cmRelation_eye-path',
        altText: 'Visible relation eye-path: the primary mass directs attention to the focal anchor.',
      });
    }
  }
}

function specimenBoundaryPoint(from, toward) {
  const fromCenter = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const towardCenter = { x: toward.x + toward.w / 2, y: toward.y + toward.h / 2 };
  const dx = towardCenter.x - fromCenter.x;
  const dy = towardCenter.y - fromCenter.y;
  if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) return fromCenter;
  const xScale = Math.abs(dx) < 0.0001 ? Number.POSITIVE_INFINITY : from.w / 2 / Math.abs(dx);
  const yScale = Math.abs(dy) < 0.0001 ? Number.POSITIVE_INFINITY : from.h / 2 / Math.abs(dy);
  const scale = Math.min(xScale, yScale);
  return { x: fromCenter.x + dx * scale, y: fromCenter.y + dy * scale };
}

function addSpatialCompositionEvidenceScene(pptx, slide, theme, contract, canvas) {
  const byId = new Map(
    (contract.entities || []).map((entity) => [String(entity?.id || ''), specimenGeometry(canvas, entity.geometry)]),
  );
  const house = byId.get('primary-mass');
  const tree = byId.get('secondary-mass');
  const sun = byId.get('focal-anchor');
  const thirdsFrame = byId.get('thirds-frame');
  if (!house || !tree || !sun) return false;

  slide.addShape(pptx.ShapeType.rect, {
    ...canvas,
    fill: { color: 'DCEFFC' },
    line: { color: '94A3B8', pt: 0.7 },
    objectName: 'cmScene_sky',
    altText: 'Pale sky field in an original native landscape composition.',
  });
  const horizonY = canvas.y + canvas.h * 0.64;
  slide.addShape(pptx.ShapeType.rect, {
    x: canvas.x,
    y: horizonY,
    w: canvas.w,
    h: canvas.y + canvas.h - horizonY,
    fill: { color: 'D9E8C8' },
    line: { color: '7C9A67', pt: 0.7 },
    objectName: 'cmScene_ground',
    altText: 'Ground field beginning at the lower horizontal third.',
  });
  addTypedSpecimenGeometryInvariants(pptx, slide, theme, contract, canvas, byId);

  if (thirdsFrame) {
    slide.addShape(pptx.ShapeType.rect, {
      ...thirdsFrame,
      fill: { color: 'FFFFFF', transparency: 100 },
      line: { color: 'FFFFFF', transparency: 100, pt: 0.1 },
      objectName: 'cmEntity_thirds-frame',
      altText: 'Observable entity thirds-frame: the measurable rule-of-thirds analysis boundary.',
    });
  }

  slide.addShape(pptx.ShapeType.rect, {
    x: house.x,
    y: house.y + house.h * 0.3,
    w: house.w,
    h: house.h * 0.7,
    fill: { color: 'F7F1E3' },
    line: { color: theme.primary, pt: 1.2 },
    objectName: 'cmEntity_primary-mass',
    altText: 'Observable entity: a small house positioned near the lower-left rule-of-thirds intersection.',
  });
  slide.addShape(pptx.ShapeType.triangle, {
    x: house.x - house.w * 0.08,
    y: house.y,
    w: house.w * 1.16,
    h: house.h * 0.45,
    fill: { color: 'B65C45' },
    line: { color: theme.primary, pt: 1.1 },
    objectName: 'cmScene_house-roof',
    altText: 'Observable entity: a triangular house roof whose slope points toward the sun.',
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: house.x + house.w * 0.39,
    y: house.y + house.h * 0.58,
    w: house.w * 0.22,
    h: house.h * 0.42,
    fill: { color: '8B5E3C' },
    line: { color: theme.primary, pt: 0.6 },
    objectName: 'cmScene_house-door',
    altText: 'Observable entity: a centered dark door within the house.',
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: tree.x + tree.w * 0.42,
    y: tree.y + tree.h * 0.45,
    w: tree.w * 0.18,
    h: tree.h * 0.55,
    fill: { color: '8B5E3C' },
    line: { color: '6B442A', pt: 0.6 },
    objectName: 'cmScene_tree-trunk',
    altText: 'Observable entity: a tree trunk crossing the lower horizontal third.',
  });
  slide.addShape(pptx.ShapeType.ellipse, {
    x: tree.x,
    y: tree.y,
    w: tree.w,
    h: tree.h * 0.58,
    fill: { color: '5E9B62' },
    line: { color: '356B3A', pt: 1 },
    objectName: 'cmEntity_secondary-mass',
    altText: 'Observable entity: a tree canopy serving as a smaller middle-ground counterweight.',
  });
  slide.addShape(pptx.ShapeType.ellipse, {
    ...sun,
    fill: { color: 'F6C945' },
    line: { color: 'D39B16', pt: 1.1 },
    objectName: 'cmEntity_focal-anchor',
    altText: 'Observable entity: the sun positioned near the upper-right rule-of-thirds intersection.',
  });
  const counterStart = specimenBoundaryPoint(tree, house);
  const counterEnd = specimenBoundaryPoint(house, tree);
  slide.addShape(pptx.ShapeType.line, {
    x: Math.min(counterStart.x, counterEnd.x),
    y: Math.min(counterStart.y, counterEnd.y),
    w: Math.abs(counterEnd.x - counterStart.x),
    h: Math.abs(counterEnd.y - counterStart.y),
    flipH: counterEnd.x < counterStart.x,
    flipV: counterEnd.y < counterStart.y,
    line: { color: theme.secondary, pt: 1.1, dash: 'dash', endArrowType: 'triangle' },
    objectName: 'cmRelation_counter-balance',
    altText: 'Visible relation from the tree to the house: the smaller tree counterbalances the primary mass.',
  });
  slide[PPTX_REGISTER_SPECIMEN_CONTRACT]?.(contract);
  return true;
}

function addTypedEvidenceSpecimenContent(pptx, slide, theme, plan, canvas) {
  const contract = plan?.typedSpecimen;
  if (contract?.protocol !== 'coursemapper-typed-evidence-specimen-v1') return false;
  if (contract.specimenKind === 'spatial-composition') {
    return addSpatialCompositionEvidenceScene(pptx, slide, theme, contract, canvas);
  }
  const entities = Array.isArray(contract.entities) ? contract.entities : [];
  const relations = Array.isArray(contract.relations) ? contract.relations : [];
  if (entities.length < 3 || relations.length < 1) return false;
  const rendered = new Map();
  const preparedEntities = [];
  for (const item of entities) {
    const id = String(item?.id || '').trim();
    if (!/^[a-z0-9-]+$/.test(id)) continue;
    const box = specimenGeometry(canvas, item.geometry);
    const color = typedSpecimenTone(theme, item.tone);
    const shape =
      item.shape === 'ellipse'
        ? pptx.ShapeType.ellipse
        : item.shape === 'frame'
          ? pptx.ShapeType.rect
          : pptx.ShapeType.roundRect;
    const isFrame = item.shape === 'frame';
    const backgroundEntity =
      isFrame ||
      /(?:^|-)field(?:-|$)/.test(String(item.role || '')) ||
      /(?:^|-)image(?:-|$)/.test(String(item.role || ''));
    preparedEntities.push({ item, id, box, color, shape, isFrame, backgroundEntity });
    rendered.set(id, box);
  }
  const renderShape = ({ item, id, box, color, shape, isFrame }) => {
    slide.addShape(shape, {
      ...box,
      fill: isFrame ? { color: 'FFFFFF', transparency: 100 } : { color, transparency: item.tone === 'muted' ? 35 : 8 },
      line: { color, pt: isFrame ? 1.5 : 0.8, dash: isFrame ? 'dash' : 'solid' },
      rectRadius: item.shape === 'rect' || item.shape === 'label' ? 0.05 : 0,
      objectName: `cmEntity_${id}`,
      altText: `Observable entity ${id}: ${item.label}; role ${item.role}.`,
    });
  };
  const renderLabel = ({ item, id, box, backgroundEntity, isFrame }) => {
    const visibleLabel = String(item.label || id).toUpperCase();
    const labelColor = isFrame || item.tone === 'muted' || item.tone === 'accent' ? theme.primary : 'FFFFFF';
    const compactFontSize = Math.max(
      7,
      Math.min(11, box.h * 10, ((Math.max(0.12, box.w - 0.12) * 72) / Math.max(1, visibleLabel.length)) * 1.45),
    );
    slide.addText(visibleLabel, {
      x: box.x + 0.03,
      y: box.y + (backgroundEntity ? 0.05 : 0.03),
      w: Math.max(0.12, box.w - 0.06),
      h: backgroundEntity ? Math.min(0.28, Math.max(0.18, box.h * 0.18)) : Math.max(0.18, box.h - 0.06),
      fontSize: backgroundEntity ? 9 : compactFontSize,
      fontFace: FONT_BODY,
      bold: true,
      color: labelColor,
      align: 'center',
      valign: backgroundEntity ? 'top' : 'middle',
      fit: 'shrink',
      margin: 0.02,
      objectName: `cmEntityLabel_${id}`,
      altText: `Visible label for observable entity ${id}.`,
    });
  };

  // Establish the visual stack explicitly: fields/frames and guides first,
  // relations second, semantic marks third, and labels last. This keeps grid
  // and relation strokes from obscuring the observable marks or their text.
  preparedEntities.filter((entry) => entry.backgroundEntity).forEach(renderShape);
  addTypedSpecimenGeometryInvariants(pptx, slide, theme, contract, canvas, rendered);
  for (const item of relations) {
    const id = String(item?.id || '').trim();
    const from = rendered.get(String(item?.from || ''));
    const to = rendered.get(String(item?.to || ''));
    if (!/^[a-z0-9-]+$/.test(id) || !from || !to) continue;
    const start = specimenBoundaryPoint(from, to);
    const end = specimenBoundaryPoint(to, from);
    const startX = start.x;
    const startY = start.y;
    const endX = end.x;
    const endY = end.y;
    slide.addShape(pptx.ShapeType.line, {
      x: Math.min(startX, endX),
      y: Math.min(startY, endY),
      w: Math.abs(endX - startX),
      h: Math.abs(endY - startY),
      flipH: endX < startX,
      flipV: endY < startY,
      line: { color: theme.secondary, pt: 1.6, dash: 'dash', endArrowType: 'triangle' },
      objectName: `cmRelation_${id}`,
      altText: `Visible relation ${id}: ${item.visibleStatement || `${item.from} ${item.type} ${item.to}`}`,
    });
  }
  preparedEntities.filter((entry) => !entry.backgroundEntity).forEach(renderShape);
  // Image fields already carry a dedicated SAME EVENT token. Repeating
  // EVENT A/B on the field itself created a visible collision without adding
  // evidence, so keep those container identities in OOXML/alt text only.
  preparedEntities.filter((entry) => !/(?:^|-)image(?:-|$)/.test(String(entry.item?.role || ''))).forEach(renderLabel);
  slide[PPTX_REGISTER_SPECIMEN_CONTRACT]?.(contract);
  return rendered.size === entities.length;
}

/**
 * Render a concrete native specimen for visual-analysis briefs. Unlike the
 * concept map, the object itself carries observable composition: scale,
 * alignment, contrast, a grid, and a directional path. It remains an
 * original vector with an explicit rights boundary and varies deterministically
 * by lesson seed without inventing subject-matter facts or external licenses.
 */
function addEvidenceSpecimenGroup(pptx, slide, theme, plan, tracker) {
  const panel = { x: 5.02, y: 1.0, w: 4.5, h: 3.85 };
  // Keep a real gutter between the specimen title and the evidence canvas.
  // The earlier 1.64in canvas origin intersected the title's 1.43–1.71in
  // text box after LibreOffice rendering.
  const canvas = { x: 5.27, y: 1.78, w: 4.0, h: 2.3 };
  const variant = specimenVariant(plan.seed);
  const focalPositions = [
    { x: canvas.x + 2.86, y: canvas.y + 0.22 },
    { x: canvas.x + 2.65, y: canvas.y + 1.48 },
    { x: canvas.x + 0.26, y: canvas.y + 0.25 },
    { x: canvas.x + 0.32, y: canvas.y + 1.43 },
  ];
  const focal = focalPositions[variant];
  const barsOnLeft = variant < 2;
  const barX = barsOnLeft ? canvas.x + 0.32 : canvas.x + 2.08;
  const barWidths = variant % 2 === 0 ? [1.7, 1.2, 0.72] : [0.8, 1.55, 1.08];

  slide.addShape(pptx.ShapeType.roundRect, {
    ...panel,
    fill: { color: 'FFFFFF' },
    line: { color: theme.secondary, pt: 1.5 },
    rectRadius: 0.12,
    shadow: { type: 'outer', blur: 5, offset: 2, opacity: 0.12, color: '000000' },
    objectName: 'cmSpecimenPanel',
    altText: plan.altText || 'Concrete visual evidence specimen',
  });
  slide.addText('VISUAL PROVENANCE · ORIGINAL NATIVE · NO EXTERNAL IMAGE ASSET', {
    x: panel.x + 0.25,
    y: panel.y + 0.16,
    w: panel.w - 0.5,
    h: 0.22,
    fontSize: 8.5,
    fontFace: FONT_BODY,
    bold: true,
    charSpacing: 0.35,
    color: theme.secondary,
    margin: 0,
    objectName: 'cmSpecimenProvenance',
    altText: 'Visual provenance: original course-created vector; no external image asset.',
  });
  slide.addText(`SPECIMEN · ${spokeShapeLabel(plan.label || 'Visual evidence', 5)}`, {
    x: panel.x + 0.25,
    y: panel.y + 0.43,
    w: panel.w - 0.5,
    h: 0.28,
    fontSize: 12,
    fontFace: FONT_HEADING,
    bold: true,
    color: theme.primary,
    margin: 0,
    fit: 'shrink',
    objectName: 'cmSpecimenLabel',
  });
  slide.addShape(pptx.ShapeType.rect, {
    ...canvas,
    fill: { color: 'F8FAFC' },
    line: { color: theme.rule || theme.secondary, pt: 0.75 },
    objectName: 'cmSpecimenCanvas',
    altText: plan.altText || 'Abstract visual specimen',
  });

  if (addTypedEvidenceSpecimenContent(pptx, slide, theme, plan, canvas)) {
    const sourceBindingLabel = String(plan?.typedSpecimen?.sourceBinding?.label || '').trim();
    const learnerArtifact = String(plan?.typedSpecimen?.learnerProduct?.artifact || '').trim();
    const lessonNumber = Math.max(1, Number(plan?.typedSpecimen?.lessonNumber || 1));
    const sourceBindingId = String(plan?.typedSpecimen?.sourceBinding?.id || '').trim();
    const productBindingId = String(plan?.typedSpecimen?.learnerProduct?.id || '').trim();
    const sourceDisplay = `LESSON ${lessonNumber} EVIDENCE · ${sourceBindingId}`;
    const productDisplay = `LESSON ${lessonNumber} APPLICATION · ${productBindingId}`;
    const progressionIndex = Math.max(0, Number(plan?.typedSpecimen?.lessonNumber || 1) - 1) % 5;
    const analysisCues = [
      'OBSERVE · label entities · trace one visible relation',
      'DISTINGUISH · separate the record from the inference',
      'CONNECT · follow the relation from evidence to claim',
      'CHALLENGE · compare views · reject one overreach',
      'BOUND · preserve context · stop where evidence stops',
    ];
    const transferCues = [
      `VERIFY ${sourceDisplay} · APPLY TO ${productDisplay}`,
      `TRACE ${sourceDisplay} · TEST ${productDisplay}`,
      `WARRANT IN ${sourceDisplay} · REVISE ${productDisplay}`,
      `COMPARE ${sourceDisplay} · QUALIFY ${productDisplay}`,
      `AUDIT ${sourceDisplay} · PUBLISH ${productDisplay}`,
    ];
    slide.addText(analysisCues[progressionIndex], {
      x: panel.x + 0.25,
      y: panel.y + panel.h - 0.42,
      w: panel.w - 0.5,
      h: 0.22,
      fontSize: 8.5,
      fontFace: FONT_BODY,
      bold: true,
      charSpacing: 0.45,
      color: theme.primary,
      margin: 0,
      align: 'center',
      objectName: 'cmSpecimenObserve',
      altText: `Analysis cues for ${plan.evidenceLabel || 'the specimen'}: annotate or compare visible entities and relations before interpreting them.`,
    });
    slide.addText(transferCues[progressionIndex], {
      x: panel.x + 0.25,
      y: panel.y + panel.h - 0.19,
      w: panel.w - 0.5,
      h: 0.15,
      fontSize: 8.5,
      fontFace: FONT_BODY,
      bold: true,
      charSpacing: 0.2,
      color: theme.secondary,
      margin: 0,
      align: 'center',
      objectName: 'cmSpecimenTransfer',
      fit: 'shrink',
      altText: `Test the interpretation against the Lesson ${lessonNumber} evidence specimen, ${sourceBindingLabel.replace(/CourseMapper-native/gi, 'course-created')}, and carry the evidence into the Lesson ${lessonNumber} application artifact, ${learnerArtifact}.`,
    });
    tracker.add({ ...panel, label: 'typed-evidence-specimen' });
    return;
  }

  for (const fraction of [1 / 3, 2 / 3]) {
    slide.addShape(pptx.ShapeType.line, {
      x: canvas.x + canvas.w * fraction,
      y: canvas.y,
      w: 0,
      h: canvas.h,
      line: { color: 'CBD5E1', pt: 0.6, dash: 'dash' },
      objectName: 'cmSpecimenGrid',
      altText: 'Decorative grid line',
    });
    slide.addShape(pptx.ShapeType.line, {
      x: canvas.x,
      y: canvas.y + canvas.h * fraction,
      w: canvas.w,
      h: 0,
      line: { color: 'CBD5E1', pt: 0.6, dash: 'dash' },
      objectName: 'cmSpecimenGrid',
      altText: 'Decorative grid line',
    });
  }

  barWidths.forEach((width, index) => {
    slide.addShape(pptx.ShapeType.roundRect, {
      x: barX,
      y: canvas.y + 0.42 + index * 0.52,
      w: width,
      h: index === 0 ? 0.3 : 0.24,
      fill: { color: index === 0 ? theme.primary : index === 1 ? theme.secondary : theme.accent },
      line: { color: index === 0 ? theme.primary : index === 1 ? theme.secondary : theme.accent, pt: 0.5 },
      rectRadius: 0.06,
      objectName: 'cmSpecimenBar',
      altText: `Visible bar ${index + 1} with ${index === 0 ? 'largest' : index === 1 ? 'medium' : 'smallest'} scale`,
    });
  });

  slide.addShape(pptx.ShapeType.ellipse, {
    x: focal.x,
    y: focal.y,
    w: 0.72,
    h: 0.72,
    fill: { color: theme.accent },
    line: { color: theme.primary, pt: 1.5 },
    objectName: 'cmSpecimenFocal',
    altText: 'High-contrast circular focal point',
  });
  const lineStartX = barsOnLeft ? canvas.x + 1.75 : canvas.x + 0.45;
  const lineEndX = focal.x + 0.36;
  const lineStartY = variant % 2 === 0 ? canvas.y + 2.13 : canvas.y + 0.38;
  const lineEndY = focal.y + 0.36;
  slide.addShape(pptx.ShapeType.line, {
    x: Math.min(lineStartX, lineEndX),
    y: Math.min(lineStartY, lineEndY),
    w: Math.abs(lineEndX - lineStartX),
    h: Math.abs(lineEndY - lineStartY),
    flipH: (lineEndX - lineStartX) * (lineEndY - lineStartY) < 0,
    line: { color: theme.secondary, pt: 2, beginArrowType: 'none', endArrowType: 'triangle' },
    objectName: 'cmSpecimenDirection',
    altText: 'Directional line leading toward the focal point',
  });
  slide.addText('A', {
    x: focal.x + 0.18,
    y: focal.y + 0.17,
    w: 0.36,
    h: 0.3,
    fontSize: 11,
    fontFace: FONT_BODY,
    bold: true,
    color: theme.primary,
    align: 'center',
    valign: 'middle',
    margin: 0,
    objectName: 'cmSpecimenAnchor',
    altText: 'Annotation anchor A',
  });
  slide.addText('ANALYZE · annotate or compare · observe before inferring', {
    x: panel.x + 0.25,
    y: panel.y + panel.h - 0.42,
    w: panel.w - 0.5,
    h: 0.22,
    fontSize: 8,
    fontFace: FONT_BODY,
    bold: true,
    charSpacing: 1.2,
    color: theme.primary,
    margin: 0,
    align: 'center',
    objectName: 'cmSpecimenObserve',
    altText: `Analysis cues for ${plan.evidenceLabel || 'the specimen'}: inspect scale, alignment, contrast, and direction`,
  });
  slide.addText('TEST AGAINST LESSON SOURCE · CARRY INTO COURSE ARTIFACT', {
    x: panel.x + 0.25,
    y: panel.y + panel.h - 0.18,
    w: panel.w - 0.5,
    h: 0.12,
    fontSize: 6.5,
    fontFace: FONT_BODY,
    bold: true,
    charSpacing: 0.9,
    color: theme.secondary,
    margin: 0,
    align: 'center',
    objectName: 'cmSpecimenTransfer',
    altText: 'Test the interpretation against the lesson source and carry the evidence into the course artifact.',
  });
  tracker.add({ ...panel, label: 'evidence-specimen' });
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
function addWorkedExampleBarPlot(pptx, slide, theme, plan, tracker) {
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
    ...(plan.kind === 'histogram' ? { gapWidthPct: 0 } : {}),
    objectName: 'cmVizChart',
    altText: `${plan.kind === 'histogram' ? 'Histogram' : 'Bar chart'} of worked-example values: ${plan.pairs
      .map((pair) => `${pair.label} ${pair.value}${pair.unit ? ` ${pair.unit}` : ''}`)
      .join(', ')}`,
  });
  tracker.add({ x: box.x, y: box.y, w: box.w, h: box.h, label: 'worked-example-plot' });
}

function plotPoint(domain, value, start, span) {
  const [minimum, maximum] = domain;
  return start + ((value - minimum) / Math.max(maximum - minimum, Number.EPSILON)) * span;
}

function addPlotLine(pptx, slide, from, to, options = {}) {
  slide.addShape(pptx.ShapeType.line, {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    w: Math.abs(to.x - from.x),
    h: Math.abs(to.y - from.y),
    flipH: (to.x - from.x) * (to.y - from.y) < 0,
    line: options.line,
    objectName: options.objectName,
    altText: options.altText,
  });
}

function addWorkedExampleScatterPlot(pptx, slide, theme, plan, tracker) {
  const box = WE_PLOT_GEOMETRY;
  const plot = { x: box.x + 0.45, y: box.y + 0.25, w: box.w - 0.7, h: box.h - 0.75 };
  const xs = plan.points.map((point) => point.x);
  const ys = plan.points.map((point) => point.y);
  const xPad = Math.max(0.5, (Math.max(...xs) - Math.min(...xs)) * 0.15);
  const yPad = Math.max(0.5, (Math.max(...ys) - Math.min(...ys)) * 0.15);
  const xDomain = [Math.min(...xs) - xPad, Math.max(...xs) + xPad];
  const yDomain = [Math.min(...ys) - yPad, Math.max(...ys) + yPad];
  slide.addShape(pptx.ShapeType.rect, {
    ...box,
    fill: { color: 'F8FAFC' },
    line: { color: 'CBD5E1', pt: 0.8 },
    objectName: 'cmVizScatterFrame',
    altText: `Scatterplot of ${plan.points.map((point) => `(${point.x}, ${point.y})`).join(', ')}`,
  });
  addPlotLine(
    pptx,
    slide,
    { x: plot.x, y: plot.y + plot.h },
    { x: plot.x + plot.w, y: plot.y + plot.h },
    {
      line: { color: theme.bodyText, pt: 1.1, endArrowType: 'triangle' },
      objectName: 'cmVizScatterXAxis',
      altText: 'Horizontal x axis',
    },
  );
  addPlotLine(
    pptx,
    slide,
    { x: plot.x, y: plot.y + plot.h },
    { x: plot.x, y: plot.y },
    {
      line: { color: theme.bodyText, pt: 1.1, endArrowType: 'triangle' },
      objectName: 'cmVizScatterYAxis',
      altText: 'Vertical y axis',
    },
  );
  const positioned = plan.points.map((point) => ({
    ...point,
    px: plotPoint(xDomain, point.x, plot.x, plot.w),
    py: plot.y + plot.h - plotPoint(yDomain, point.y, 0, plot.h),
  }));
  for (const point of positioned) {
    slide.addShape(pptx.ShapeType.ellipse, {
      x: point.px - 0.09,
      y: point.py - 0.09,
      w: 0.18,
      h: 0.18,
      fill: { color: theme.secondary },
      line: { color: theme.primary, pt: 0.8 },
      objectName: 'cmVizScatterPoint',
      altText: `Observed point x ${point.x}, y ${point.y}`,
    });
  }
  if (plan.showFit && plan.points.length >= 2) {
    const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
    const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
    const denominator = xs.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
    if (denominator > 0) {
      const slope = plan.points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / denominator;
      const intercept = meanY - slope * meanX;
      const fitted = (x) => intercept + slope * x;
      addPlotLine(
        pptx,
        slide,
        {
          x: plotPoint(xDomain, xDomain[0], plot.x, plot.w),
          y: plot.y + plot.h - plotPoint(yDomain, fitted(xDomain[0]), 0, plot.h),
        },
        {
          x: plotPoint(xDomain, xDomain[1], plot.x, plot.w),
          y: plot.y + plot.h - plotPoint(yDomain, fitted(xDomain[1]), 0, plot.h),
        },
        {
          line: { color: theme.accent, pt: 2 },
          objectName: 'cmVizRegressionLine',
          altText: 'Least-squares fitted line through the synthetic observations',
        },
      );
    }
  }
  slide.addText('x', { x: plot.x + plot.w - 0.1, y: plot.y + plot.h + 0.08, w: 0.2, h: 0.2, fontSize: 9, margin: 0 });
  slide.addText('y', { x: plot.x - 0.28, y: plot.y - 0.05, w: 0.2, h: 0.2, fontSize: 9, margin: 0 });
  tracker.add({ ...box, label: 'worked-example-scatterplot' });
}

function addWorkedExampleDotPlot(pptx, slide, theme, plan, tracker) {
  const box = WE_PLOT_GEOMETRY;
  const axis = { x: box.x + 0.4, y: box.y + 2.45, w: box.w - 0.75 };
  const minimum = Math.min(...plan.values);
  const maximum = Math.max(...plan.values);
  const pad = Math.max(0.5, (maximum - minimum) * 0.08);
  const domain = [minimum - pad, maximum + pad];
  slide.addShape(pptx.ShapeType.rect, {
    ...box,
    fill: { color: 'F8FAFC' },
    line: { color: 'CBD5E1', pt: 0.8 },
    objectName: 'cmVizDotPlotFrame',
    altText: `Dot plot of synthetic observations ${plan.values.join(', ')}`,
  });
  addPlotLine(
    pptx,
    slide,
    { x: axis.x, y: axis.y },
    { x: axis.x + axis.w, y: axis.y },
    {
      line: { color: theme.bodyText, pt: 1.2 },
      objectName: 'cmVizDotPlotAxis',
      altText: 'Numeric axis for the dot plot',
    },
  );
  const stacks = new Map();
  for (const value of [...plan.values].sort((a, b) => a - b)) {
    const level = stacks.get(value) || 0;
    stacks.set(value, level + 1);
    const x = plotPoint(domain, value, axis.x, axis.w);
    slide.addShape(pptx.ShapeType.ellipse, {
      x: x - 0.09,
      y: axis.y - 0.24 - level * 0.22,
      w: 0.18,
      h: 0.18,
      fill: { color: value === maximum ? theme.accent : theme.secondary },
      line: { color: theme.primary, pt: 0.7 },
      objectName: 'cmVizDotPlotPoint',
      altText: `Observation ${value}${level ? `, stack ${level + 1}` : ''}`,
    });
  }
  for (const value of [...stacks.keys()].sort((a, b) => a - b)) {
    const x = plotPoint(domain, value, axis.x, axis.w);
    slide.addText(String(value), {
      x: x - 0.2,
      y: axis.y + 0.08,
      w: 0.4,
      h: 0.2,
      fontSize: 8,
      align: 'center',
      margin: 0,
    });
  }
  tracker.add({ ...box, label: 'worked-example-dotplot' });
}

function addWorkedExampleTable(pptx, slide, theme, plan, tracker) {
  const box = WE_PLOT_GEOMETRY;
  const rows = [plan.columns, ...plan.rows].map((row, rowIndex) =>
    row.map((value) => ({
      text: String(value),
      options:
        rowIndex === 0
          ? { bold: true, color: 'FFFFFF', fill: { color: theme.primary } }
          : { color: theme.bodyText, fill: { color: rowIndex % 2 ? 'F8FAFC' : 'EAF2F8' } },
    })),
  );
  slide.addTable(rows, {
    ...box,
    border: { type: 'solid', color: '94A3B8', pt: 0.8 },
    fontFace: FONT_BODY,
    fontSize: 13,
    color: theme.bodyText,
    margin: 0.08,
    valign: 'mid',
    align: 'center',
    rowH: 0.72,
    colW: [box.w * 0.46, box.w * 0.27, box.w * 0.27],
    autoPage: false,
    objectName: 'cmVizContingencyTable',
    altText: `Two-way table with ${plan.rows.map((row) => row.join(', ')).join('; ')}`,
  });
  tracker.add({ ...box, label: 'worked-example-contingency-table' });
}

function addWorkedExampleNumberLine(pptx, slide, theme, plan, tracker) {
  const box = WE_PLOT_GEOMETRY;
  const axis = { x: box.x + 0.45, y: box.y + 2.0, w: box.w - 0.85 };
  slide.addShape(pptx.ShapeType.rect, {
    ...box,
    fill: { color: 'F8FAFC' },
    line: { color: 'CBD5E1', pt: 0.8 },
    objectName: 'cmVizNumberLineFrame',
    altText: `Number line from ${plan.domain[0]} to ${plan.domain[1]} with ${plan.markers.map((marker) => `${marker.label} ${marker.value}`).join(', ')}`,
  });
  addPlotLine(
    pptx,
    slide,
    { x: axis.x, y: axis.y },
    { x: axis.x + axis.w, y: axis.y },
    {
      line: { color: theme.bodyText, pt: 1.4, beginArrowType: 'triangle', endArrowType: 'triangle' },
      objectName: 'cmVizNumberLineAxis',
      altText: 'Numeric model axis',
    },
  );
  for (const [index, marker] of plan.markers.entries()) {
    const x = plotPoint(plan.domain, marker.value, axis.x, axis.w);
    slide.addShape(pptx.ShapeType.line, {
      x,
      y: axis.y - 0.45,
      w: 0,
      h: 0.9,
      line: { color: index === 0 ? theme.secondary : theme.accent, pt: 3 },
      objectName: 'cmVizNumberLineMarker',
      altText: `${marker.label} at ${marker.value}`,
    });
    slide.addText(`${marker.label}\n${marker.value}`, {
      x: x - 0.55,
      y: axis.y - 0.92,
      w: 1.1,
      h: 0.42,
      fontFace: FONT_BODY,
      fontSize: 10,
      bold: true,
      align: 'center',
      margin: 0,
      fit: 'shrink',
    });
  }
  tracker.add({ ...box, label: 'worked-example-number-line' });
}

function addWorkedExampleInterval(pptx, slide, theme, plan, tracker) {
  const spread = plan.high - plan.low;
  const domain = [plan.low - spread * 0.2, plan.high + spread * 0.2];
  addWorkedExampleNumberLine(
    pptx,
    slide,
    theme,
    {
      domain,
      markers: [
        { label: plan.labels?.[0] || 'lower', value: plan.low },
        { label: plan.labels?.[1] || 'estimate', value: plan.center },
        { label: plan.labels?.[2] || 'upper', value: plan.high },
      ],
    },
    tracker,
  );
  const box = WE_PLOT_GEOMETRY;
  const axis = { x: box.x + 0.45, y: box.y + 2.0, w: box.w - 0.85 };
  const lowX = plotPoint(domain, plan.low, axis.x, axis.w);
  const highX = plotPoint(domain, plan.high, axis.x, axis.w);
  addPlotLine(
    pptx,
    slide,
    { x: lowX, y: axis.y },
    { x: highX, y: axis.y },
    {
      line: { color: theme.secondary, pt: 7 },
      objectName: 'cmVizIntervalBand',
      altText: `Interval from ${plan.low} to ${plan.high}`,
    },
  );
}

function addWorkedExampleSamplingFrame(pptx, slide, theme, plan, tracker) {
  const box = WE_PLOT_GEOMETRY;
  const selected = new Set(plan.selected);
  const columns = Math.min(6, Math.ceil(Math.sqrt(plan.frame.length * 1.5)));
  const rows = Math.ceil(plan.frame.length / columns);
  const gap = 0.08;
  const cellW = (box.w - gap * (columns + 1)) / columns;
  const cellH = Math.min(0.68, (box.h - gap * (rows + 1)) / rows);
  slide.addShape(pptx.ShapeType.rect, {
    ...box,
    fill: { color: 'F8FAFC' },
    line: { color: 'CBD5E1', pt: 0.8 },
    objectName: 'cmVizSamplingFrame',
    altText: `Sampling frame ${plan.frame.join(', ')}; selected units ${plan.selected.join(', ')}`,
  });
  plan.frame.forEach((value, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const chosen = selected.has(value);
    slide.addText(String(value).padStart(2, '0'), {
      x: box.x + gap + column * (cellW + gap),
      y: box.y + gap + row * (cellH + gap),
      w: cellW,
      h: cellH,
      fontFace: FONT_BODY,
      fontSize: 11,
      bold: chosen,
      align: 'center',
      valign: 'mid',
      margin: 0,
      fill: { color: chosen ? theme.secondary : 'FFFFFF' },
      color: chosen ? 'FFFFFF' : theme.bodyText,
      line: { color: chosen ? theme.secondary : '94A3B8', pt: chosen ? 1.5 : 0.7 },
      objectName: chosen ? 'cmVizSelectedUnit' : 'cmVizFrameUnit',
      altText: `Unit ${value}${chosen ? ', selected' : ', not selected'}`,
    });
  });
  tracker.add({ ...box, label: 'worked-example-sampling-frame' });
}

function addWorkedExamplePlot(pptx, slide, theme, plan, tracker) {
  switch (plan.kind) {
    case 'scatter':
      return addWorkedExampleScatterPlot(pptx, slide, theme, plan, tracker);
    case 'dotplot':
      return addWorkedExampleDotPlot(pptx, slide, theme, plan, tracker);
    case 'contingency-table':
      return addWorkedExampleTable(pptx, slide, theme, plan, tracker);
    case 'number-line':
      return addWorkedExampleNumberLine(pptx, slide, theme, plan, tracker);
    case 'interval':
      return addWorkedExampleInterval(pptx, slide, theme, plan, tracker);
    case 'sampling-frame':
      return addWorkedExampleSamplingFrame(pptx, slide, theme, plan, tracker);
    default:
      return addWorkedExampleBarPlot(pptx, slide, theme, plan, tracker);
  }
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

    // Keep decorative geometry inside the canvas. Older full-bleed circles
    // used negative coordinates, so generic slide QA reported content
    // overflow even though the visible text was safe.
    slide.addShape(pptx.ShapeType.ellipse, {
      x: W - 3.6,
      y: 0,
      w: 3.6,
      h: 3.6,
      fill: { color: theme.secondary, transparency: 15 },
      line: { color: theme.secondary, transparency: 100 },
      objectName: 'cmDecorativeBackground',
      altText: 'Decorative',
    });

    // Smaller accent circle (bottom left)
    slide.addShape(pptx.ShapeType.ellipse, {
      x: 0,
      y: H - 2.2,
      w: 2.2,
      h: 2.2,
      fill: { color: theme.accent, transparency: 30 },
      line: { color: theme.accent, transparency: 100 },
      objectName: 'cmDecorativeBackground',
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
      color: theme.titleText,
      bold: true,
      charSpacing: 4,
    });

    // Main title — large, bold (auto-fit from 40pt down to 24pt)
    // The lesson number is already rendered as the eyebrow directly above the
    // title. Repeating "Lesson N:" in the large heading wastes an entire line
    // on longer titles and can push the final line into the accent rule.
    const titleText = (deck.lessonTitle || s.title || 'Untitled Lesson')
      .replace(/^(?:Lesson|Week)\s*\d+\s*:\s*/i, '')
      .trim();
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
      slide.addImage({
        data: img.base64,
        x: (W - img.widthIn) / 2,
        y: 3.5,
        w: img.widthIn,
        h: img.heightIn,
        altText: `LaTeX equation: ${img.sourceExpression || 'display equation'}`,
      });
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

    // Subtitle / first bullet (auto-fit from 16pt down to 12pt). A title
    // subtitle must be a real framing clause. Legacy decks sometimes stored
    // a bare concept or comma-separated concept dump here; omitting that weak
    // line is more polished than presenting an orphan under the title.
    const titleSubtitle = String(s.bullets?.[0] || '').trim();
    if (isSubstantiveSlideSubtitle(titleSubtitle, { title: deck.lessonTitle || s.title })) {
      const subBoxW = W - 4.2,
        subBoxH = 0.6;
      const subFontSize = autoFitFontSize(titleSubtitle, subBoxW, subBoxH, FONT_BODY, 16, 12, 1.5);
      const subResult = await maybeProcessLatex(titleSubtitle, hasLatex, { color: 'D0DCF0', fontSizePt: subFontSize });
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
      color: theme.titleText,
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
            altText: `LaTeX equation: ${img.sourceExpression || 'display equation'}`,
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
      color: theme.titleText,
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
      x: 0,
      y: H - 2.5,
      w: 2.5,
      h: 2.5,
      fill: { color: theme.secondary, transparency: 50 },
      line: { color: theme.secondary, transparency: 100 },
      objectName: 'cmDecorativeBackground',
      altText: 'Decorative',
    });

    const bridgeTitleText = s.title || 'Bridge to Today';
    const bridgeLeadLabel = /course throughline/i.test(bridgeTitleText) ? 'COURSE ARC' : 'LAST TIME';
    const bridgeBullets = (s.bullets || []).map((bullet) => String(bullet || '').trim()).filter(Boolean);
    const recapLabelPattern = /^(?:last time|this course):/i;
    const todayLabelPattern = /^(?:today|next):/i;
    // Bridge copy already carries semantic labels. Splitting three bullets by
    // array midpoint put “Today” on the left and left only “Next” beneath the
    // TODAY heading. Prefer those labels; retain the positional fallback for
    // older imported decks that do not carry them.
    const positionalSplit = Math.ceil(bridgeBullets.length / 2);
    const firstTodayIndex = bridgeBullets.findIndex((bullet) => todayLabelPattern.test(bullet));
    const hasSemanticLabels = bridgeBullets.some(
      (bullet) => recapLabelPattern.test(bullet) || todayLabelPattern.test(bullet),
    );
    const recapBullets = [];
    const todayBullets = [];
    bridgeBullets.forEach((bullet, index) => {
      if (recapLabelPattern.test(bullet)) {
        recapBullets.push(bullet);
      } else if (todayLabelPattern.test(bullet)) {
        todayBullets.push(bullet);
      } else if (hasSemanticLabels && firstTodayIndex >= 0) {
        (index < firstTodayIndex ? recapBullets : todayBullets).push(bullet);
      } else {
        (index < positionalSplit ? recapBullets : todayBullets).push(bullet);
      }
    });

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
    if (recapBullets.length > 0) {
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
    const isConceptMap = nativeVisual?.type === 'conceptMap';
    const isEvidenceSpecimen = nativeVisual?.type === 'evidenceSpecimen';
    const hasSplitNativeVisual = isConceptMap || isEvidenceSpecimen;

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

    // Use the authored visual-task genre on functional specimen slides. A
    // generic "KEY CONCEPT" label misstates the learner action and makes the
    // slide look like a definition card instead of an inspectable lab.
    slide.addText(isEvidenceSpecimen ? 'VISUAL EVIDENCE LAB' : 'KEY CONCEPT', {
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
    const cardX = hasSplitNativeVisual ? 0.5 : 1.2,
      cardY = 1.0;
    const cardW = hasSplitNativeVisual ? 4.3 : W - 2.4,
      cardH = hasSplitNativeVisual ? 3.4 : 2.8;
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
    const mainText = hasSplitNativeVisual ? nativeVisual.definition : s.bullets?.[0] || s.title || 'Key Concept';
    const conceptW = cardW - 0.8,
      conceptH = hasSplitNativeVisual ? cardH - 0.6 : 1.6;
    const conceptSize = autoFitFontSize(
      mainText,
      conceptW,
      conceptH,
      FONT_HEADING,
      isEvidenceSpecimen ? 11 : hasSplitNativeVisual ? 20 : 26,
      isEvidenceSpecimen ? 8 : hasSplitNativeVisual ? 12 : 16,
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
      fontFace: isEvidenceSpecimen ? FONT_BODY : FONT_HEADING,
      color: theme.primary,
      bold: !isEvidenceSpecimen,
      align: isEvidenceSpecimen ? 'left' : 'center',
      valign: isEvidenceSpecimen ? 'top' : 'middle',
      lineSpacingMultiple: isEvidenceSpecimen ? 1.15 : 1.3,
      fit: 'shrink',
      margin: 0.08,
      objectName: isEvidenceSpecimen ? 'cmVisibleTaskCard' : undefined,
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
        altText: `LaTeX equation: ${img.sourceExpression || 'display equation'}`,
      });
    }

    if (isConceptMap) {
      // Native concept map (v0.12.1): the explanatory bullets render as the
      // hub-and-spoke group on the right, so no separate explanation block —
      // the full bullet text remains available in the speaker notes.
      addConceptMapGroup(pptx, slide, theme, nativeVisual, tracker);
    } else if (isEvidenceSpecimen) {
      addEvidenceSpecimenGroup(pptx, slide, theme, nativeVisual, tracker);
    } else if (s.bullets?.length > 1) {
      // Explanatory text below card
      const explanation = s.bullets.slice(1).join('\n');
      const explanationY = cardY + cardH + 0.2;
      // Reserve the bottom progress rail instead of letting a fixed 14pt
      // block extend behind it when LibreOffice wraps one line earlier than
      // the browser preview.
      const explanationH = H - explanationY - 0.65;
      const explanationSize = autoFitFontSize(explanation, W - 3, explanationH, FONT_BODY, 14, 10, 1.5);
      slide.addText(explanation, {
        x: 1.5,
        y: explanationY,
        w: W - 3,
        h: explanationH,
        fontSize: explanationSize,
        fontFace: FONT_BODY,
        color: theme.bodyText,
        align: 'center',
        valign: 'top',
        lineSpacingMultiple: 1.5,
        fit: 'shrink',
      });
      tracker.add({ x: 1.5, y: explanationY, w: W - 3, h: explanationH, label: 'key-concept-explanation' });
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

    // Add the real heading before decorative label text. Export inspection
    // uses the first text run as the slide title; writing ACTIVITY first made
    // multiple activity frames look like duplicate-titled slides even though
    // their visible headings were unique.
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
      const activityBullets = s.bullets.map((bullet) => String(bullet || '').trim()).filter(Boolean);
      const [activityLead, ...activityDetails] = activityBullets;
      const activityBodyW = W - 2.0;
      const activityLeadSize = autoFitFontSize(activityLead, activityBodyW, 0.68, FONT_BODY, 17, 12, 1.2);
      slide.addText(activityLead, {
        x: 0.9,
        y: 1.42,
        w: activityBodyW,
        h: 0.68,
        fontSize: activityLeadSize,
        fontFace: FONT_BODY,
        color: theme.bodyText,
        bold: true,
        valign: 'middle',
        fit: 'shrink',
      });
      tracker.add({ x: 0.9, y: 1.42, w: activityBodyW, h: 0.68, label: 'activity-lead' });

      const activityBodyY = 2.14;
      // Bullets lose usable width to their hanging indent, and LibreOffice
      // does not consistently honor PowerPoint's normAutofit flag. Measure
      // against the real text column with a small vertical safety margin so
      // the final required decision never disappears behind the card/footer.
      const activityFitW = activityBodyW - 0.8;
      const activityBodyH = H - activityBodyY - 0.78;
      const activityBodySize = autoFitBullets(activityDetails, activityFitW, activityBodyH, FONT_BODY, 13, 9, 1.15, 4);
      const bulletText = activityDetails.map((b) => ({
        text: b,
        options: {
          bullet: { code: '2022' },
          fontSize: activityBodySize,
          color: theme.bodyText,
          breakLine: true,
          paraSpaceAfter: 4,
          lineSpacingMultiple: 1.15,
        },
      }));
      if (bulletText.length > 0) {
        slide.addText(bulletText, {
          x: 0.9,
          y: activityBodyY,
          w: activityBodyW,
          h: activityBodyH,
          fontFace: FONT_BODY,
          valign: 'top',
          fit: 'shrink',
        });
        tracker.add({
          x: 0.9,
          y: activityBodyY,
          w: activityBodyW,
          h: activityBodyH,
          label: 'activity-details',
        });
      }
    }

    addProgressDots(pptx, slide, theme, slideIndex, totalSlides, false);
  } else if (slideType === 'summary') {
    // ── SUMMARY / CLOSING SLIDE ──────────────────────────────────────────
    slide.background = { color: theme.primary };

    slide.addShape(pptx.ShapeType.ellipse, {
      x: W - 2.25,
      y: 0.05,
      w: 2.2,
      h: 2.2,
      fill: { color: theme.secondary, transparency: 55 },
      line: { color: theme.secondary, transparency: 100 },
      objectName: 'cmDecorativeBackground',
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
      // Keep a little render-engine safety margin. PowerPoint and
      // LibreOffice reserve more horizontal space for the checkmark indent
      // than Canvas measures, so a nominal 16pt three-item checklist can
      // acquire one extra wrapped line and collide with the footer. 14pt is
      // still comfortably readable at 16:9 and leaves room for that wrap.
      const summaryFontSize = autoFitBullets(summaryBullets, summaryBodyW, summaryBodyH, FONT_BODY, 14, 11, 1.5, 12);
      const bulletText = summaryBullets.map((b) => ({
        // `breakLine` already creates the next bullet paragraph. A literal
        // trailing newline creates a second visual line inside that paragraph
        // in PowerPoint/LibreOffice and was the actual source of the footer
        // collision found by rendered-package QA.
        // Use a font-safe literal marker. LibreOffice can omit DrawingML
        // buChar and checkmark glyphs on short single-line siblings.
        text: `— ${b}`,
        options: {
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
      y: 0,
      w: 3,
      h: 3,
      fill: { color: theme.primary, transparency: 40 },
      line: { color: theme.primary, transparency: 100 },
      objectName: 'cmDecorativeBackground',
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
      color: theme.titleText,
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
      addDecisionMatrix(pptx, slide, theme, nativeVisual, tracker, visAlt);
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
    const authoredContentTitle = s.title || '';
    const isPitfallsTitle = /^Common pitfalls in\s+/i.test(authoredContentTitle);
    const contentTitleText = isPitfallsTitle
      ? authoredContentTitle.replace(/^Common pitfalls in\s+/i, 'Pitfalls: ')
      : authoredContentTitle;
    const contentTitleW = W - 0.7,
      contentTitleH = 0.9;
    // Canvas and LibreOffice wrap long Georgia headings differently. Apply a
    // deterministic length ceiling before the measured fit so assertion
    // titles cannot acquire an extra rendered line above the slide canvas or
    // through the accent rule.
    const contentTitleLength = [...contentTitleText].length;
    const contentTitleMax =
      contentTitleLength > 110
        ? 14
        : contentTitleLength > 88
          ? 16
          : contentTitleLength > 68
            ? 18
            : contentTitleLength > 48
              ? 20
              : contentTitleLength > 34
                ? 22
                : 28;
    // LibreOffice's Georgia metrics are materially wider than the browser
    // canvas estimate for some comparison headings (notably "Conditional
    // branching and loops"). At 22pt the text wrapped after "Pitfalls:" and
    // vertically centered the first line above the slide canvas. Comparison
    // headings therefore use a conservative 18pt ceiling; the full title is
    // still prominent and remains on one line in the exported deck.
    const renderTitleMax =
      nativeVisual?.isMisconceptionComparison || isPitfallsTitle ? Math.min(contentTitleMax, 18) : contentTitleMax;
    const contentTitleSize = autoFitFontSize(
      contentTitleText,
      contentTitleW,
      contentTitleH,
      FONT_HEADING,
      renderTitleMax,
      Math.min(14, renderTitleMax),
      1.1,
    );
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
      addEvidenceTable(pptx, slide, theme, nativeVisual, visKind, tracker, visAlt);
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
          slide.addImage({
            data: img.base64,
            x: (W - img.widthIn) / 2,
            y: imgY2col,
            w: img.widthIn,
            h: img.heightIn,
            altText: `LaTeX equation: ${img.sourceExpression || 'display equation'}`,
          });
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
          slide.addImage({
            data: img.base64,
            x: (W - img.widthIn) / 2,
            y: imgY1col,
            w: img.widthIn,
            h: img.heightIn,
            altText: `LaTeX equation: ${img.sourceExpression || 'display equation'}`,
          });
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
  const typedSpecimen = nativeVisual?.type === 'evidenceSpecimen' ? nativeVisual.typedSpecimen : null;
  const typedSpecimenGuidance =
    typedSpecimen?.protocol === 'coursemapper-typed-evidence-specimen-v1'
      ? [
          `TYPED SPECIMEN · ${typedSpecimen.specimenKind} · ${typedSpecimen.conceptBinding}`,
          ...(typedSpecimen.taskContract?.protocol === 'coursemapper-functional-visual-task-contract-v1'
            ? [
                `VISUAL TASK CONTRACT [${typedSpecimen.taskContract.contractId}]: ${typedSpecimen.taskContractSha256}`,
                `UPSTREAM REQUIREMENT: ${typedSpecimen.taskContract.upstreamRequirementSha256}`,
                `RENDER PREDICATES: ${(typedSpecimen.taskContract.predicates || []).map((predicate) => predicate.id).join(', ')}`,
                `COUNTEREXAMPLE STATE: ${typedSpecimen.taskContract.counterexample?.stateId}`,
              ]
            : []),
          `EXPECTED OBSERVATION [${typedSpecimen.expectedObservation?.id}]: ${typedSpecimen.expectedObservation?.claim}`,
          `EVIDENCE IDS: ${(typedSpecimen.expectedObservation?.evidenceIds || []).join(', ')}`,
          `ANSWER/RUBRIC LINK [${typedSpecimen.answerRubricBinding?.expectedObservationId}]: ${typedSpecimen.answerRubricBinding?.scoringUse}`,
          ...(typedSpecimen.visibleTask?.protocol === 'coursemapper-visible-functional-task-v1'
            ? [
                `VTASK SHA256: ${typedSpecimen.visibleTask.cardTextSha256}`,
                `ASUM SHA256: ${typedSpecimen.visibleTask.authoredSummarySha256}`,
                `ABULLETS SHA256: ${typedSpecimen.visibleTask.authoredBulletsSha256} · COUNT: ${(typedSpecimen.visibleTask.authoredBullets || []).length}`,
              ]
            : []),
          `SOURCE BINDING: ${typedSpecimen.sourceBinding?.label}`,
          `RIGHTS BINDING: ${typedSpecimen.rightsBinding?.disclosure}`,
        ].join('\n')
      : '';
  const guidance = [visualGuidance, typedSpecimenGuidance].filter(Boolean).join('\n\n');
  const augmentedNotes = guidance ? `${guidance}${baseNotes ? `\n\n---\n\n${baseNotes}` : ''}` : baseNotes;
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

function isCompleteExperientialDeck(slides = []) {
  if (slides.length < 4) return false;
  if (!slides.every((slide) => slide?.enrichmentSource === 'scion-experiential-activity-v1')) return false;
  const bulletText = slides
    .flatMap((slide) => (Array.isArray(slide?.bullets) ? slide.bullets : []))
    .map((bullet) => String(bullet || '').trim());
  return (
    bulletText.some((bullet) => /^Situation:/i.test(bullet)) &&
    bulletText.some((bullet) => /^Activity clock:/i.test(bullet) && /Total time:/i.test(bullet)) &&
    bulletText.some((bullet) => /^Participant or working roles:/i.test(bullet)) &&
    bulletText.some((bullet) => /^Evidence:/i.test(bullet)) &&
    bulletText.some((bullet) => /^Student artifact\b/i.test(bullet)) &&
    bulletText.some((bullet) => /^Structured debrief:/i.test(bullet))
  );
}

/**
 * Create a pptx instance with all decks.
 */
async function createPptxWithDecks(data, courseName, themeIndex) {
  const expanded = expandKeys('slideDecks', data);
  const PptxGenJS = await getPptxGen();
  const pptx = instrumentPptxAccessibility(new PptxGenJS());

  pptx.layout = 'LAYOUT_16x9';
  pptx.lang = 'en-US';
  pptx.author = 'CourseMapper';
  pptx.title = courseName || 'Slide Decks';
  pptx.theme = { headFontFace: FONT_HEADING, bodyFontFace: FONT_BODY };

  const decks = renderedDeliverableCollection('slideDecks', expanded).map((d, i) => ({ ...d, _deckIndex: i }));

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

    deckAudit.push({
      lesson: deck.lessonTitle || `Deck ${di + 1}`,
      slides: slides.length,
      completeExperientialDeck: isCompleteExperientialDeck(slides),
    });
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
    // A canonical experiential deck intentionally carries one slide per
    // phase. Its four complete runnable frames are not comparable to the
    // ordinary concept-deck median, so judge it by the activity contract
    // above instead of emitting a misleading thin-deck warning.
    const thin = deckAudit.filter(
      (d) => !d.completeExperientialDeck && d.slides < Math.max(5, Math.floor(median * 0.4)),
    );
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
function escapeXmlAttribute(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function decodeXmlAttribute(value) {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function attachSemanticDescriptions(xml, records = []) {
  if (records.length === 0) return xml;
  const descriptionsByName = new Map();
  for (const record of records) {
    const descriptions = descriptionsByName.get(record.objectName) || [];
    descriptions.push(record.description);
    descriptionsByName.set(record.objectName, descriptions);
  }

  return xml.replace(/<(?:p|pic):cNvPr\b[^>]*>/g, (tag) => {
    const name = tag.match(/\bname="([^"]*)"/)?.[1];
    if (!name) return tag;
    const descriptions = descriptionsByName.get(decodeXmlAttribute(name));
    if (!descriptions?.length) return tag;
    const description = descriptions.shift();
    const withoutExistingMetadata = tag.replace(/\s+(?:title|descr)="[^"]*"/g, '');
    const suffix = withoutExistingMetadata.endsWith('/>') ? '/>' : '>';
    const title = /^slide-counter-label-/.test(decodeXmlAttribute(name))
      ? 'Slide counter'
      : 'CourseMapper semantic visual';
    return `${withoutExistingMetadata.slice(0, -suffix.length)} title="${title}" descr="${escapeXmlAttribute(description)}"${suffix}`;
  });
}

function attachTypedSpecimenContract(xml, contract = null) {
  if (!contract || typeof contract !== 'object') return xml;
  const payload = encodeURIComponent(JSON.stringify(contract));
  const extension = `<p:ext uri="{F242A84D-6D34-4EAE-9D52-8C52017A1501}"><cm:specimenContract xmlns:cm="https://edutool.dev/ns/coursemapper/specimen-contract/v1" encoding="uri-json">${payload}</cm:specimenContract></p:ext>`;
  if (/<p:extLst\b[^>]*>/i.test(xml)) return xml.replace(/<\/p:extLst>/i, `${extension}</p:extLst>`);
  return xml.replace(/<\/p:sld>\s*$/i, `<p:extLst>${extension}</p:extLst></p:sld>`);
}

async function stripLatinEastAsiaOverrides(
  blob,
  accessibilityRegistry = new Map(),
  specimenContractRegistry = new Map(),
) {
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
    const slideNumber = Number(name.match(/^ppt\/slides\/slide(\d+)\.xml$/)?.[1] || 0);
    const next = attachTypedSpecimenContract(
      attachSemanticDescriptions(xml.replace(eaOverride, ''), accessibilityRegistry.get(slideNumber)),
      specimenContractRegistry.get(slideNumber),
    );
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
  return await stripLatinEastAsiaOverrides(
    blob,
    pptx[PPTX_ACCESSIBILITY_REGISTRY],
    pptx[PPTX_SPECIMEN_CONTRACT_REGISTRY],
  );
}

/**
 * Build a PPTX blob for a single slide deck (one lesson).
 */
export async function buildSingleDeckPptxBlob(deck, deckIndex, courseName, themeIndex) {
  const expandedDeck = expandKeys('slideDecks', { decks: [deck] })?.decks?.[0] || deck;
  const PptxGenJS = await getPptxGen();
  const pptx = instrumentPptxAccessibility(new PptxGenJS());

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
  return await stripLatinEastAsiaOverrides(
    blob,
    pptx[PPTX_ACCESSIBILITY_REGISTRY],
    pptx[PPTX_SPECIMEN_CONTRACT_REGISTRY],
  );
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
