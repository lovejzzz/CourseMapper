/**
 * latexRenderer.js — LaTeX detection, Unicode conversion, and KaTeX image rendering.
 *
 * Two-tier approach:
 *   Tier 1 (text):  Inline LaTeX → Unicode/readable source-preserving text
 *   Tier 2 (image): Display LaTeX → KaTeX → html2canvas → PNG base64
 *
 * KaTeX is lazy-loaded only when complex expressions are detected during export.
 */

import { loadHtml2CanvasRuntime, loadKatexRuntime } from './katexRuntime.js';
import { renderedDeliverableCollection } from './renderedDeliverableRoot.js';
import { sanitizeMathHtml } from './sanitizeMathHtml.js';

// ── LaTeX Detection ───────────────────────────────────────────────────────

/** Match display math: $$...$$ */
const DISPLAY_MATH_RE = /\$\$(.+?)\$\$/gs;

/** Match inline math: $...$ (not preceded/followed by $) */
const INLINE_MATH_RE = /(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g;

/**
 * Check whether a string contains any LaTeX math expressions.
 * @param {string} text
 * @returns {boolean}
 */
export function containsLatex(text) {
  if (!text) return false;
  DISPLAY_MATH_RE.lastIndex = 0;
  INLINE_MATH_RE.lastIndex = 0;
  return DISPLAY_MATH_RE.test(text) || INLINE_MATH_RE.test(text);
}

/**
 * Quick scan: does any slide in the deck data contain LaTeX?
 * Used to decide whether to enable LaTeX processing at all.
 * @param {Object} data - Slide deck data
 * @returns {boolean}
 */
export function deckDataContainsLatex(data) {
  const decks = renderedDeliverableCollection('slideDecks', data);
  for (const deck of decks) {
    for (const slide of deck.slides || []) {
      if (containsLatex(slide.title)) return true;
      for (const b of slide.bullets || []) {
        if (containsLatex(b)) return true;
      }
    }
  }
  return false;
}

// ── Tier 1: Unicode Conversion ────────────────────────────────────────────

/** LaTeX commands → Unicode characters */
const LATEX_UNICODE_MAP = {
  // Greek lowercase
  '\\alpha': '\u03B1',
  '\\beta': '\u03B2',
  '\\gamma': '\u03B3',
  '\\delta': '\u03B4',
  '\\epsilon': '\u03B5',
  '\\varepsilon': '\u03B5',
  '\\zeta': '\u03B6',
  '\\eta': '\u03B7',
  '\\theta': '\u03B8',
  '\\iota': '\u03B9',
  '\\kappa': '\u03BA',
  '\\lambda': '\u03BB',
  '\\mu': '\u03BC',
  '\\nu': '\u03BD',
  '\\xi': '\u03BE',
  '\\pi': '\u03C0',
  '\\rho': '\u03C1',
  '\\sigma': '\u03C3',
  '\\tau': '\u03C4',
  '\\upsilon': '\u03C5',
  '\\phi': '\u03C6',
  '\\varphi': '\u03C6',
  '\\chi': '\u03C7',
  '\\psi': '\u03C8',
  '\\omega': '\u03C9',
  // Greek uppercase
  '\\Gamma': '\u0393',
  '\\Delta': '\u0394',
  '\\Theta': '\u0398',
  '\\Lambda': '\u039B',
  '\\Xi': '\u039E',
  '\\Pi': '\u03A0',
  '\\Sigma': '\u03A3',
  '\\Phi': '\u03A6',
  '\\Psi': '\u03A8',
  '\\Omega': '\u03A9',
  // Operators and relations
  '\\times': '\u00D7',
  '\\div': '\u00F7',
  '\\pm': '\u00B1',
  '\\mp': '\u2213',
  '\\cdot': '\u00B7',
  '\\leq': '\u2264',
  '\\le': '\u2264',
  '\\geq': '\u2265',
  '\\ge': '\u2265',
  '\\neq': '\u2260',
  '\\ne': '\u2260',
  '\\approx': '\u2248',
  '\\equiv': '\u2261',
  '\\sim': '\u223C',
  '\\propto': '\u221D',
  '\\infty': '\u221E',
  '\\partial': '\u2202',
  '\\nabla': '\u2207',
  '\\forall': '\u2200',
  '\\exists': '\u2203',
  '\\nexists': '\u2204',
  '\\in': '\u2208',
  '\\notin': '\u2209',
  '\\ni': '\u220B',
  '\\subset': '\u2282',
  '\\supset': '\u2283',
  '\\subseteq': '\u2286',
  '\\supseteq': '\u2287',
  '\\cup': '\u222A',
  '\\cap': '\u2229',
  '\\emptyset': '\u2205',
  '\\varnothing': '\u2205',
  // Arrows
  '\\to': '\u2192',
  '\\rightarrow': '\u2192',
  '\\leftarrow': '\u2190',
  '\\Rightarrow': '\u21D2',
  '\\Leftarrow': '\u21D0',
  '\\leftrightarrow': '\u2194',
  '\\Leftrightarrow': '\u21D4',
  '\\mapsto': '\u21A6',
  '\\uparrow': '\u2191',
  '\\downarrow': '\u2193',
  // Misc symbols
  '\\sqrt': '\u221A',
  '\\sum': '\u2211',
  '\\prod': '\u220F',
  '\\int': '\u222B',
  '\\oint': '\u222E',
  '\\iint': '\u222C',
  '\\therefore': '\u2234',
  '\\because': '\u2235',
  '\\angle': '\u2220',
  '\\degree': '\u00B0',
  '\\circ': '\u2218',
  '\\bullet': '\u2022',
  '\\ldots': '\u2026',
  '\\cdots': '\u22EF',
  '\\vdots': '\u22EE',
  '\\ddots': '\u22F1',
  '\\star': '\u22C6',
  '\\dagger': '\u2020',
  '\\ell': '\u2113',
  '\\hbar': '\u210F',
  '\\Re': '\u211C',
  '\\Im': '\u2111',
  '\\aleph': '\u2135',
  // Spacing & formatting
  '\\quad': '  ',
  '\\qquad': '    ',
  '\\,': ' ',
  '\\;': ' ',
  '\\!': '',
  '\\text': '',
};

/** Superscript character mapping */
const SUPERSCRIPT_MAP = {
  0: '\u2070',
  1: '\u00B9',
  2: '\u00B2',
  3: '\u00B3',
  4: '\u2074',
  5: '\u2075',
  6: '\u2076',
  7: '\u2077',
  8: '\u2078',
  9: '\u2079',
  '+': '\u207A',
  '-': '\u207B',
  '=': '\u207C',
  '(': '\u207D',
  ')': '\u207E',
  n: '\u207F',
  i: '\u2071',
};

/** Subscript character mapping */
const SUBSCRIPT_MAP = {
  0: '\u2080',
  1: '\u2081',
  2: '\u2082',
  3: '\u2083',
  4: '\u2084',
  5: '\u2085',
  6: '\u2086',
  7: '\u2087',
  8: '\u2088',
  9: '\u2089',
  '+': '\u208A',
  '-': '\u208B',
  '=': '\u208C',
  '(': '\u208D',
  ')': '\u208E',
  a: '\u2090',
  e: '\u2091',
  o: '\u2092',
  x: '\u2093',
  h: '\u2095',
  k: '\u2096',
  l: '\u2097',
  m: '\u2098',
  n: '\u2099',
  p: '\u209A',
  s: '\u209B',
  t: '\u209C',
};

// ── Complexity Detection ──────────────────────────────────────────────────

/** Patterns that require image rendering (Tier 2) */
const COMPLEX_PATTERNS = [
  /\\frac\s*\{/, // fractions
  /\\dfrac\s*\{/, // display fractions
  /\\sqrt\s*\[/, // nth roots
  /\\begin\s*\{/, // environments (matrix, cases, etc.)
  /\\int\s*[_^]/, // integrals with limits
  /\\sum\s*[_^]/, // sums with limits
  /\\prod\s*[_^]/, // products with limits
  /\\lim\b/, // limits
  /\\binom\s*\{/, // binomial coefficients
  /\\underset|\\overset/, // under/over annotations
  /\\hat\{|\\bar\{|\\vec\{|\\dot\{|\\tilde\{/, // accents
  /\\mathbb\{|\\mathcal\{|\\mathfrak\{/, // special fonts
  /\\overbrace|\\underbrace/,
  /\\stackrel/,
];

/**
 * Check if a LaTeX expression is simple enough for Unicode conversion.
 * @param {string} expr - LaTeX expression (without $ delimiters)
 * @returns {boolean}
 */
export function isSimpleLatex(expr) {
  return !COMPLEX_PATTERNS.some((re) => re.test(expr));
}

/**
 * Convert a simple LaTeX expression to Unicode text.
 * @param {string} expr - LaTeX expression (without $ delimiters)
 * @returns {string} Unicode representation
 */
export function latexToUnicode(expr) {
  let result = expr;

  // 1. Replace named commands (longest first to avoid partial matches)
  const sortedKeys = Object.keys(LATEX_UNICODE_MAP).sort((a, b) => b.length - a.length);
  for (const cmd of sortedKeys) {
    const escaped = cmd.replace(/\\/g, '\\\\');
    result = result.replace(new RegExp(escaped + '(?![a-zA-Z])', 'g'), LATEX_UNICODE_MAP[cmd]);
  }

  // 2. Convert superscripts: ^{content} or ^single_char
  result = result.replace(/\^{([^}]+)}/g, (_, content) => [...content].map((c) => SUPERSCRIPT_MAP[c] || c).join(''));
  result = result.replace(/\^([0-9a-z+\-=()ni])/g, (_, c) => SUPERSCRIPT_MAP[c] || `^${c}`);

  // 3. Convert subscripts: _{content} or _single_char
  result = result.replace(/_{([^}]+)}/g, (_, content) => [...content].map((c) => SUBSCRIPT_MAP[c] || c).join(''));
  result = result.replace(/_([0-9a-z+\-=()])/g, (_, c) => SUBSCRIPT_MAP[c] || `_${c}`);

  // 4. Clean up braces and extra whitespace
  result = result.replace(/[{}]/g, '');
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}

/**
 * Keep complex inline expressions complete and learner-readable. PowerPoint
 * text runs cannot contain inline images, so emitting an unplaced PNG loses
 * the equation before OOXML verification can see it. Convert common stacked
 * forms to linear notation and preserve the original expression whenever a
 * command remains unsupported.
 */
export function latexToReadableInlineText(expr) {
  const source = String(expr || '').trim();
  if (!source) return '';
  let readable = source;
  for (let pass = 0; pass < 4; pass += 1) {
    const next = readable.replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '($1)/($2)');
    if (next === readable) break;
    readable = next;
  }
  readable = readable
    .replace(/\\sqrt\s*\{([^{}]+)\}/g, '√($1)')
    .replace(/\\mathbb\s*\{R\}/g, 'ℝ')
    .replace(/\\mathbb\s*\{Z\}/g, 'ℤ')
    .replace(/\\mathbb\s*\{N\}/g, 'ℕ')
    .replace(/\\mathbb\s*\{Q\}/g, 'ℚ')
    .replace(/\\mathbb\s*\{C\}/g, 'ℂ');
  const unicode = latexToUnicode(readable);
  return /\\[A-Za-z]+/.test(unicode) ? source : unicode;
}

// ── Tier 2: KaTeX Image Rendering ─────────────────────────────────────────

/**
 * Render a LaTeX expression to a base64 PNG image using KaTeX + html2canvas.
 *
 * @param {string} expr - LaTeX expression (without $ delimiters)
 * @param {Object} [options]
 * @param {boolean} [options.displayMode=false]
 * @param {number} [options.fontSizePx=24]
 * @param {string} [options.color='#000000']
 * @returns {Promise<{ base64: string, widthIn: number, heightIn: number }>}
 */
export async function renderLatexToImage(expr, { displayMode = false, fontSizePx = 24, color = '#000000' } = {}) {
  const katex = await loadKatexRuntime();
  const html2canvas = await loadHtml2CanvasRuntime();

  const container = document.createElement('div');
  container.style.cssText = `
    position: absolute; left: -9999px; top: -9999px;
    padding: 8px; background: transparent;
    font-size: ${fontSizePx}px; color: ${color};
    max-width: 800px; line-height: 1.2;
  `;

  container.innerHTML = sanitizeMathHtml(
    katex.renderToString(expr, {
      displayMode,
      throwOnError: false,
      output: 'html',
    }),
  );

  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      backgroundColor: null,
      scale: 2,
      logging: false,
    });

    const base64 = canvas.toDataURL('image/png');
    // 2x scale at 96 DPI = 192 effective DPI
    const widthIn = canvas.width / 192;
    const heightIn = canvas.height / 192;

    return { base64, widthIn, heightIn };
  } finally {
    document.body.removeChild(container);
  }
}

// ── Main Integration Function ─────────────────────────────────────────────

/**
 * Process a text string containing LaTeX, returning modified text
 * (with Unicode substitutions) and images for complex expressions.
 *
 * @param {string} text - Original text (may contain $...$ or $$...$$)
 * @param {Object} [options]
 * @param {string} [options.color='#000000']
 * @param {number} [options.fontSizePt=16]
 * @returns {Promise<{ text: string, images: Array<{ base64: string, widthIn: number, heightIn: number, displayMode: boolean }> }>}
 */
export async function processSlideText(text, { color = '#000000', fontSizePt = 16 } = {}) {
  if (!text || !containsLatex(text)) {
    return { text, images: [] };
  }

  const images = [];
  let processedText = text;
  const fontSizePx = (fontSizePt * 96) / 72;

  // 1. Handle display math ($$...$$) — always render as image
  DISPLAY_MATH_RE.lastIndex = 0;
  const displayMatches = [...text.matchAll(DISPLAY_MATH_RE)];
  for (const match of displayMatches) {
    const expr = match[1].trim();
    try {
      const img = await renderLatexToImage(expr, { displayMode: true, fontSizePx, color });
      images.push({ ...img, displayMode: true, sourceExpression: expr });
      processedText = processedText.replace(match[0], '');
    } catch (err) {
      console.warn(`[CM] LaTeX render failed (display): ${expr}`, err);
      processedText = processedText.replace(match[0], latexToUnicode(expr));
    }
  }

  // 2. Handle inline math ($...$)
  INLINE_MATH_RE.lastIndex = 0;
  const inlineMatches = [...processedText.matchAll(INLINE_MATH_RE)];
  for (const match of inlineMatches) {
    const expr = match[1].trim();
    if (isSimpleLatex(expr)) {
      // Tier 1: Unicode substitution (preserves text editability)
      processedText = processedText.replace(match[0], latexToUnicode(expr));
    } else {
      // PowerPoint text boxes cannot place an image inside a text run. Keep a
      // complete linear representation in the text instead of creating an
      // image that no exporter insertion site can serialize.
      processedText = processedText.replace(match[0], latexToReadableInlineText(expr));
    }
  }

  return { text: processedText.trim(), images };
}
