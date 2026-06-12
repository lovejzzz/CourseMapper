/**
 * slideTextFit.js — Browser-based text measurement, auto font sizing,
 * and slide element validation for PPTX export.
 *
 * Uses Canvas API (OffscreenCanvas with fallback) for text measurement.
 * Inspired by OpenAI's pptxgenjs_helpers text.js — adapted for browser.
 */

// ── Constants ─────────────────────────────────────────────────────────────
const DPI = 96; // CSS pixels per inch (browser standard)
const PT_PER_INCH = 72; // points per inch
export const SLIDE_W = 10; // inches (16:9)
export const SLIDE_H = 5.625; // inches (16:9)

// ── Canvas singleton ──────────────────────────────────────────────────────
let _ctx = null;

function getContext() {
  if (_ctx === null) {
    if (typeof OffscreenCanvas !== 'undefined') {
      _ctx = new OffscreenCanvas(1, 1).getContext('2d');
    } else if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      _ctx = canvas.getContext('2d');
    } else {
      // v0.15.1 C3: headless (Node/vite-node) — no canvas anywhere. The
      // callers fall back to the heuristic estimator below so PPTX export
      // works in the CurriculumOS headless path; browser behavior is
      // untouched (canvas measurement stays authoritative when present).
      _ctx = false;
    }
  }
  return _ctx || null;
}

// Average glyph advance as a fraction of the font size — the standing
// approximation for proportional Latin text when no canvas can measure.
const HEURISTIC_GLYPH_EM = 0.52;

function heuristicTextWidthIn(text, fontSizePt) {
  return (String(text).length * fontSizePt * HEURISTIC_GLYPH_EM) / PT_PER_INCH;
}

// ── Text Measurement ──────────────────────────────────────────────────────

/**
 * Measure the width of a single line of text in inches.
 * @param {string} text
 * @param {string} fontFamily - e.g. 'Montserrat', 'Open Sans'
 * @param {number} fontSizePt - Font size in points
 * @returns {number} Width in inches
 */
export function measureTextWidth(text, fontFamily, fontSizePt) {
  if (!text) return 0;
  const ctx = getContext();
  if (!ctx) return heuristicTextWidthIn(text, fontSizePt);
  const fontSizePx = (fontSizePt * DPI) / PT_PER_INCH;
  ctx.font = `${fontSizePx}px "${fontFamily}"`;
  return ctx.measureText(text).width / DPI;
}

/**
 * Estimate the height of text when word-wrapped to a max width, in inches.
 * Handles multi-line text (split on \n) and greedy word-wrapping.
 *
 * @param {string} text - Text content (may contain \n)
 * @param {string} fontFamily
 * @param {number} fontSizePt
 * @param {number} maxWidthIn - Maximum width in inches
 * @param {number} [lineSpacing=1.4] - Line spacing multiplier
 * @returns {number} Estimated height in inches
 */
export function estimateTextHeight(text, fontFamily, fontSizePt, maxWidthIn, lineSpacing = 1.4) {
  if (!text) return 0;
  const ctx = getContext();
  if (!ctx) {
    // Headless heuristic: greedy wrap by estimated glyph width.
    const lineHeightIn = (fontSizePt * lineSpacing) / PT_PER_INCH;
    let totalLines = 0;
    for (const para of String(text).split('\n')) {
      if (!para.trim()) {
        totalLines += 1;
        continue;
      }
      const lineWidth = heuristicTextWidthIn(para, fontSizePt);
      totalLines += Math.max(1, Math.ceil(lineWidth / Math.max(maxWidthIn, 0.1)));
    }
    return totalLines * lineHeightIn;
  }
  const fontSizePx = (fontSizePt * DPI) / PT_PER_INCH;
  ctx.font = `${fontSizePx}px "${fontFamily}"`;

  const maxWidthPx = maxWidthIn * DPI;
  let totalLines = 0;

  const paragraphs = text.split('\n');
  for (const para of paragraphs) {
    if (!para.trim()) {
      totalLines += 1;
      continue;
    }
    const words = para.split(/\s+/);
    let currentLineWidth = 0;
    let linesInPara = 1;

    for (const word of words) {
      const wordWidth = ctx.measureText(word + ' ').width;
      if (currentLineWidth + wordWidth > maxWidthPx && currentLineWidth > 0) {
        linesInPara++;
        currentLineWidth = wordWidth;
      } else {
        currentLineWidth += wordWidth;
      }
    }
    totalLines += linesInPara;
  }

  const lineHeightPx = fontSizePx * lineSpacing;
  return (totalLines * lineHeightPx) / DPI;
}

/**
 * Binary-search for the largest integer font size (in points) that fits
 * the text within the given bounding box.
 *
 * @param {string} text
 * @param {number} maxWidthIn - Available width in inches
 * @param {number} maxHeightIn - Available height in inches
 * @param {string} fontFamily
 * @param {number} startSizePt - Initial (desired) font size
 * @param {number} [minSizePt=8] - Minimum acceptable font size
 * @param {number} [lineSpacing=1.4] - Line spacing multiplier
 * @returns {number} Optimal font size in points (integer)
 */
export function autoFitFontSize(
  text,
  maxWidthIn,
  maxHeightIn,
  fontFamily,
  startSizePt,
  minSizePt = 8,
  lineSpacing = 1.4,
) {
  if (!text) return startSizePt;

  // Quick check: does it already fit?
  const startHeight = estimateTextHeight(text, fontFamily, startSizePt, maxWidthIn, lineSpacing);
  if (startHeight <= maxHeightIn) return startSizePt;

  // Binary search between minSizePt and startSizePt
  let lo = minSizePt;
  let hi = startSizePt;
  let best = minSizePt;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const h = estimateTextHeight(text, fontFamily, mid, maxWidthIn, lineSpacing);
    if (h <= maxHeightIn) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return best;
}

/**
 * Auto-fit a list of bullet strings. All bullets share the same font size.
 * Accounts for paragraph spacing between bullets.
 *
 * @param {string[]} bullets
 * @param {number} maxWidthIn
 * @param {number} maxHeightIn
 * @param {string} fontFamily
 * @param {number} startSizePt
 * @param {number} [minSizePt=10]
 * @param {number} [lineSpacing=1.5]
 * @param {number} [paraSpacePt=12] - Space after each bullet in points
 * @returns {number} Optimal shared font size
 */
export function autoFitBullets(
  bullets,
  maxWidthIn,
  maxHeightIn,
  fontFamily,
  startSizePt,
  minSizePt = 10,
  lineSpacing = 1.5,
  paraSpacePt = 12,
) {
  if (!bullets?.length) return startSizePt;

  const combinedText = bullets.join('\n');
  // Approximate extra height from paraSpaceAfter
  const extraHeightIn = (bullets.length * paraSpacePt) / PT_PER_INCH;
  const adjustedMaxHeight = maxHeightIn - extraHeightIn;

  if (adjustedMaxHeight <= 0) return minSizePt;

  return autoFitFontSize(combinedText, maxWidthIn, adjustedMaxHeight, fontFamily, startSizePt, minSizePt, lineSpacing);
}

// ── Element Validation ────────────────────────────────────────────────────

/**
 * Create a per-slide element tracker for bounds/overlap validation.
 *
 * Usage:
 *   const tracker = createElementTracker();
 *   tracker.add({ x: 0.7, y: 1.15, w: 6, h: 2.2, label: 'main title' });
 *   const warnings = tracker.validate();
 *
 * @returns {{ add: Function, validate: Function, elements: Array }}
 */
export function createElementTracker() {
  const elements = [];

  return {
    elements,

    /** Register an element's bounding box. */
    add({ x, y, w, h, label }) {
      elements.push({ x, y, w, h, label });
    },

    /**
     * Validate all registered elements.
     * @returns {string[]} Array of warning messages (empty if all valid)
     */
    validate() {
      const warnings = [];

      // 1. Bounds check
      for (const el of elements) {
        if (el.x + el.w > SLIDE_W + 0.05) {
          warnings.push(`[OOB] "${el.label}" extends right (x+w=${(el.x + el.w).toFixed(2)}, max=${SLIDE_W})`);
        }
        if (el.y + el.h > SLIDE_H + 0.05) {
          warnings.push(`[OOB] "${el.label}" extends below (y+h=${(el.y + el.h).toFixed(2)}, max=${SLIDE_H})`);
        }
      }

      // 2. Overlap check (AABB intersection)
      for (let i = 0; i < elements.length; i++) {
        for (let j = i + 1; j < elements.length; j++) {
          const a = elements[i],
            b = elements[j];
          if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
            warnings.push(`[OVERLAP] "${a.label}" and "${b.label}"`);
          }
        }
      }

      return warnings;
    },
  };
}
