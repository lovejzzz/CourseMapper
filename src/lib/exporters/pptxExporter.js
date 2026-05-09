/**
 * Export slide decks as PowerPoint (.pptx) using pptxgenjs.
 * World-class educational slide design with Google-native fonts,
 * assertion-evidence layouts, and rich visual hierarchy.
 *
 * Features:
 *   - Auto font sizing via Canvas API (prevents text overflow)
 *   - Slide element validation (out-of-bounds + overlap detection)
 *   - LaTeX rendering for STEM courses (Unicode + KaTeX image)
 *
 * Fonts: Montserrat (headings) + Open Sans (body) — both Google Slides native.
 */

import { autoFitFontSize, autoFitBullets, createElementTracker, SLIDE_W, SLIDE_H } from './slideTextFit.js';
import { containsLatex, deckDataContainsLatex, processSlideText } from '../latexRenderer.js';
import { expandKeys } from '../keyMaps.js';
import { safeImport } from '../safeImport.js';

let _PptxGenJS;

async function getPptxGen() {
  if (!_PptxGenJS) {
    const mod = await safeImport(() => import('pptxgenjs'));
    _PptxGenJS = mod.default || mod;
  }
  return _PptxGenJS;
}

// ── Font constants (Google Slides native) ──────────────────────────────────
const FONT_HEADING = 'Montserrat';
const FONT_BODY = 'Open Sans';
const FONT_LABEL = 'Open Sans';

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
  const bullets = rawBullets
    .slice(0, 3)
    .map((bullet) => String(bullet).trim())
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
  const s = deck.slides?.[slideIndex];
  if (!s) return;
  const slideType = getSlideType(s);
  const slide = pptx.addSlide();
  const W = SLIDE_W,
    H = SLIDE_H;
  const hasLatex = opts.hasLatex || false;
  const tracker = createElementTracker();

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
    const titleBoxW = W - 4,
      titleBoxH = 2.2;
    const titleFontSize = autoFitFontSize(titleText, titleBoxW, titleBoxH, FONT_HEADING, 40, 24, 1.15);
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
      lineSpacingMultiple: 1.15,
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
        // Auto-fit agenda item from 16pt down to 12pt
        const agendaItemW = W - 1.7,
          agendaItemH = 0.55;
        const agendaFontSize = autoFitFontSize(b, agendaItemW, agendaItemH, FONT_BODY, 16, 12, 1.5);
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

    // "LAST TIME" label
    slide.addText('LAST TIME', {
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
    const bridgeTitleText = s.title || 'Bridge to Today';
    const bridgeTitleW = splitX - 0.6,
      bridgeTitleH = 0.7;
    const bridgeTitleSize = autoFitFontSize(bridgeTitleText, bridgeTitleW, bridgeTitleH, FONT_HEADING, 20, 14, 1.2);
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
      lineSpacingMultiple: 1.2,
    });
    tracker.add({ x: 0.4, y: 0.75, w: bridgeTitleW, h: bridgeTitleH, label: 'bridge-title' });

    // Recap bullets on left
    if (s.bullets?.length > 0) {
      const halfBullets = Math.ceil(s.bullets.length / 2);
      const recapBullets = s.bullets.slice(0, halfBullets);
      const recapText = recapBullets.map((b) => ({
        text: `${b}\n`,
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
        y: 1.6,
        w: splitX - 0.7,
        h: H - 2.2,
        fontFace: FONT_BODY,
        valign: 'top',
      });
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

    // Arrow transition indicator
    slide.addText('Transition to today', {
      x: splitX - 0.4,
      y: H / 2 - 0.4,
      w: 1.1,
      h: 0.6,
      fontSize: 10,
      fontFace: FONT_LABEL,
      color: theme.accent,
      bold: true,
      align: 'center',
      valign: 'middle',
    });

    // Today bullets on right
    if (s.bullets?.length > 1) {
      const halfBullets = Math.ceil(s.bullets.length / 2);
      const todayBullets = s.bullets.slice(halfBullets);
      if (todayBullets.length > 0) {
        const todayText = todayBullets.map((b) => ({
          text: `${b}\n`,
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
      const mainBullets = s.bullets.slice(0, lastIdx);
      const takeaway = s.bullets[lastIdx];

      if (mainBullets.length > 0) {
        const bulletText = mainBullets.map((b) => ({
          text: `${b}\n`,
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
          w: W - 1,
          h: 0.8,
          fill: { color: theme.light },
          line: { color: theme.accent, pt: 1.5 },
          rectRadius: 0.08,
          altText: 'Key takeaway highlight',
        });
        slide.addText(`Key Takeaway: ${takeaway}`, {
          x: 0.7,
          y: H - 1.2,
          w: W - 1.4,
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

    // Large central card
    const cardX = 1.2,
      cardY = 1.0;
    const cardW = W - 2.4,
      cardH = 2.8;
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

    // Main term/concept (auto-fit from 26pt down to 16pt)
    const mainText = s.bullets?.[0] || s.title || 'Key Concept';
    const conceptW = cardW - 0.8,
      conceptH = 1.6;
    const conceptSize = autoFitFontSize(mainText, conceptW, conceptH, FONT_HEADING, 26, 16, 1.3);
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

    // Explanatory text below card
    if (s.bullets?.length > 1) {
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
        text: `${b}\n`,
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

    slide.addText('KEY TAKEAWAYS', {
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
      const bulletText = s.bullets.map((b) => ({
        text: `${b}\n`,
        options: {
          bullet: { code: '2714' },
          fontSize: 16,
          color: 'D0E8FF',
          breakLine: true,
          paraSpaceAfter: 12,
          lineSpacingMultiple: 1.5,
        },
      }));
      slide.addText(bulletText, {
        x: 0.7,
        y: 2.1,
        w: W - 1.5,
        h: H - 3.0,
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

    if (s.bullets?.length > 0) {
      const bulletText = s.bullets.map((b) => ({
        text: `${b}\n`,
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
    });
    tracker.add({ x: 0.45, y: 0.1, w: contentTitleW, h: contentTitleH, label: 'content-title' });

    // Content bullets — two-column if 4+
    if (bullets.length > 0) {
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
          text: `${r.text}\n`,
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
          text: `${r.text}\n`,
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
          text: `${r.text}\n`,
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
  slide.addShape(pptx.ShapeType.roundRect, {
    x: W - 0.95,
    y: H - 0.44,
    w: 0.68,
    h: 0.34,
    fill: { color: isDarkSlide ? theme.accent : theme.primary },
    line: { width: 0 },
    rectRadius: 0.05,
    altText: 'Decorative',
  });
  slide.addText(`${slideIndex + 1}/${totalSlides}`, {
    x: W - 0.95,
    y: H - 0.44,
    w: 0.68,
    h: 0.34,
    fontSize: 9,
    color: isDarkSlide ? theme.primary : 'FFFFFF',
    align: 'center',
    valign: 'middle',
    fontFace: FONT_BODY,
    bold: true,
  });

  // ── Element validation ─────────────────────────────────────────────────
  const warnings = tracker.validate();
  if (warnings.length > 0) {
    console.warn(`[CM] Slide ${slideIndex + 1} (${slideType}) validation:`, warnings);
  }

  // Speaker notes — prepend a "Suggested visual" block (with alt text) when
  // the slide carries a visual hint. This keeps the cue visible in the
  // PPT's Notes Page view even if the instructor never looks at the on-
  // slide placeholder below. Accepts both expanded (slide.visual) and
  // abbreviated (slide.vi) shapes from the generator.
  const vis = s.visual || s.vi;
  const visKind = vis?.kind || vis?.k;
  const hasVisual = vis && visKind && visKind !== 'none';
  const visDesc = hasVisual ? vis.description || vis.d || '' : '';
  const visAlt = hasVisual ? vis.altText || vis.at || '' : '';
  const generatedVisualImage = hasVisual ? getGeneratedVisualImage(vis) : null;

  const rawNotes = s.notes || s.speakerNotes || '';
  const baseNotes =
    countSpeakerNoteWords(rawNotes) >= 20
      ? rawNotes
      : [rawNotes, buildFallbackSpeakerNotes(deck, s, slideIndex, totalSlides)].filter(Boolean).join('\n\n');
  const augmentedNotes = hasVisual
    ? `SUGGESTED VISUAL (${visKind}): ${visDesc}${visAlt ? `\nALT TEXT: ${visAlt}` : ''}${baseNotes ? `\n\n---\n\n${baseNotes}` : ''}`
    : baseNotes;
  if (augmentedNotes) slide.addNotes(augmentedNotes);

  // On-slide visual placeholder — a small dashed box in the bottom-right
  // that signals "insert visual here" with the kind + 1-line description.
  // Positioned to tuck under bullet content without fighting activity /
  // example / keyTerm cards that fill the body region. Omitted for
  // title / agenda / objectives / summary / closing slides where the
  // layout doesn't leave room.
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
      return;
    }

    const kindIcon = { diagram: '▲', chart: '📊', image: '🖼', table: '▦', code: '⌨', equation: '∑' }[visKind] || '◈';
    slide.addShape(pptx.ShapeType.roundRect, {
      x: px,
      y: py,
      w: pw,
      h: ph,
      fill: { color: 'FFFFFF', transparency: 40 },
      line: { color: theme.accent || theme.primary, dashType: 'dash', pt: 1 },
      rectRadius: 0.08,
      altText: `Visual placeholder — ${visKind}: ${visAlt || visDesc}`,
    });
    slide.addText(
      [
        {
          text: `${kindIcon} SUGGESTED VISUAL · ${visKind.toUpperCase()}\n`,
          options: { fontSize: 8, bold: true, color: theme.accent || theme.primary, fontFace: FONT_BODY },
        },
        { text: visDesc, options: { fontSize: 9, color: '64748B', italic: true, fontFace: FONT_BODY } },
      ],
      {
        x: px + 0.1,
        y: py + 0.05,
        w: pw - 0.2,
        h: ph - 0.1,
        valign: 'top',
        align: 'left',
        margin: 0.05,
      },
    );
  }
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

  const key = expanded.decks ? 'decks' : 'slideDecks';
  const decks = (expanded[key] || []).map((d, i) => ({ ...d, _deckIndex: i }));

  // One-time LaTeX scan across all decks
  const hasLatex = deckDataContainsLatex(expanded);
  if (hasLatex) {
    console.log('[CM] PPTX: LaTeX detected in deck data — enabling math rendering');
  }

  const deckAudit = [];
  for (let di = 0; di < decks.length; di++) {
    const deck = decks[di];
    const theme = resolveTheme(di, themeIndex);
    const slides = deck.slides || [];

    // Add section divider between decks (after the first)
    if (di > 0) {
      const divider = pptx.addSlide();
      divider.background = { color: theme.primary };
      divider.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: 5.625 - 0.08,
        w: 10,
        h: 0.08,
        fill: { color: theme.accent },
        line: { color: theme.accent },
        altText: 'Decorative',
      });
      divider.addText(deck.lessonTitle || `Lesson ${di + 1}`, {
        x: 1,
        y: 1.5,
        w: 8,
        h: 2.5,
        fontSize: 36,
        fontFace: FONT_HEADING,
        color: 'FFFFFF',
        bold: true,
        align: 'center',
        valign: 'middle',
      });
      const num = (deck.lessonTitle || '').match(/^(?:Lesson|Week)\s*(\d+)/i);
      divider.addText(`LESSON ${num ? num[1] : di + 1}`, {
        x: 1,
        y: 0.6,
        w: 8,
        h: 0.4,
        fontSize: 11,
        fontFace: FONT_LABEL,
        color: theme.accent,
        bold: true,
        charSpacing: 4,
        align: 'center',
      });
      divider.addNotes(
        [
          `Use this transition slide to reset attention before ${deck.lessonTitle || `Lesson ${di + 1}`}.`,
          'Preview the lesson focus, connect it to the previous deck, and invite students to name one question they are bringing forward.',
          'Move quickly so the divider supports pacing without becoming a content slide.',
        ].join(' '),
      );
    }

    for (let si = 0; si < slides.length; si++) {
      await buildSlideForDeck(pptx, deck, theme, si, slides.length, { hasLatex });
    }

    deckAudit.push({ lesson: deck.lessonTitle || `Deck ${di + 1}`, slides: slides.length });
  }

  // ── Slide deck audit logging ──
  if (deckAudit.length > 0) {
    const slideCounts = deckAudit.map((d) => d.slides);
    const totalSlides = slideCounts.reduce((a, b) => a + b, 0);
    const minSlides = Math.min(...slideCounts);
    const maxSlides = Math.max(...slideCounts);
    const median = [...slideCounts].sort((a, b) => a - b)[Math.floor(slideCounts.length / 2)];
    console.log(
      `[CM] PPTX audit: ${deckAudit.length} decks, ${totalSlides} total slides (min: ${minSlides}, max: ${maxSlides}, median: ${median})`,
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
 * Export slide deck data as a .pptx file.
 */
export async function exportSlideDeckPptx(data, courseName, themeIndex) {
  const pptx = await createPptxWithDecks(data, courseName, themeIndex);
  const fileName = `${courseName || 'Course'} - Slide Decks.pptx`;
  await pptx.writeFile({ fileName });
  return fileName;
}

/**
 * Build a PPTX blob (for uploading to Google Slides).
 */
export async function buildSlideDeckPptxBlob(data, courseName, themeIndex) {
  const pptx = await createPptxWithDecks(data, courseName, themeIndex);
  return await pptx.write({ outputType: 'blob' });
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

  const theme = resolveTheme(deckIndex, themeIndex);
  const deckWithIndex = { ...expandedDeck, _deckIndex: deckIndex };
  const slides = expandedDeck.slides || [];

  // Check for LaTeX in this single deck
  const hasLatex = deckDataContainsLatex({ decks: [expandedDeck] });

  for (let si = 0; si < slides.length; si++) {
    await buildSlideForDeck(pptx, deckWithIndex, theme, si, slides.length, { hasLatex });
  }

  return await pptx.write({ outputType: 'blob' });
}

/**
 * Download a single deck as its own .pptx file immediately.
 */
export async function exportSingleDeckPptx(deck, deckIndex, courseName, themeIndex) {
  const { saveAs } = await safeImport(() => import('file-saver'));
  const blob = await buildSingleDeckPptxBlob(deck, deckIndex, courseName, themeIndex);
  const deckName = (deck.lessonTitle || `Deck ${deckIndex + 1}`).replace(/[/\\?%*:|"<>]/g, '-').trim();
  const lessonNumMatch = (deck.lessonTitle || '').match(/^(?:Lesson|Week)\s*(\d+)/i);
  const lessonNum = lessonNumMatch ? parseInt(lessonNumMatch[1], 10) : deckIndex + 1;
  const fileName = `Lesson ${lessonNum} - ${deckName}.pptx`;
  saveAs(blob, fileName);
  return fileName;
}
