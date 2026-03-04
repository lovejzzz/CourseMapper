/**
 * Export slide decks as PowerPoint (.pptx) using pptxgenjs.
 * World-class educational slide design with Google-native fonts,
 * assertion-evidence layouts, and rich visual hierarchy.
 *
 * Fonts: Montserrat (headings) + Open Sans (body) — both Google Slides native.
 */

let _PptxGenJS;

async function getPptxGen() {
  if (!_PptxGenJS) {
    const mod = await import('pptxgenjs');
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
    primary: '1E3A5F', secondary: '2E86AB', accent: 'F6C90E',
    light: 'EEF4FF', sideBar: '1E3A5F', body: 'FFFFFF',
    titleText: 'FFFFFF', bodyText: '1A1A2E', subtleText: '6B7FA3',
  },
  {
    name: 'Forest & Amber',
    primary: '1B4332', secondary: '52B788', accent: 'F4A261',
    light: 'F0FFF4', sideBar: '1B4332', body: 'FFFFFF',
    titleText: 'FFFFFF', bodyText: '1B2B1F', subtleText: '52796F',
  },
  {
    name: 'Purple & Orange',
    primary: '4A1C96', secondary: '7B2FBE', accent: 'FF6B35',
    light: 'FAF5FF', sideBar: '4A1C96', body: 'FFFFFF',
    titleText: 'FFFFFF', bodyText: '2D1B40', subtleText: '7C3AED',
  },
  {
    name: 'Crimson & Gold',
    primary: '8B0000', secondary: 'C62828', accent: 'FFD700',
    light: 'FFF9F9', sideBar: '8B0000', body: 'FFFFFF',
    titleText: 'FFFFFF', bodyText: '2D0A0A', subtleText: '9E3030',
  },
  {
    name: 'Ocean & Cyan',
    primary: '0C3547', secondary: '1565C0', accent: '00BCD4',
    light: 'F0FBFF', sideBar: '0C3547', body: 'FFFFFF',
    titleText: 'FFFFFF', bodyText: '0A1628', subtleText: '2196F3',
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

// ── Progress dot builder ───────────────────────────────────────────────────
function addProgressDots(pptx, slide, theme, slideIndex, totalSlides, isDark) {
  const W = 10, H = 5.625;
  const dotR = 0.06;
  const dotGap = 0.2;
  const maxDots = Math.min(totalSlides, 20);
  const totalW = maxDots * dotGap;
  const startX = 0.4;
  const y = H - 0.18;

  for (let i = 0; i < maxDots; i++) {
    const isCurrent = i === slideIndex;
    slide.addShape(pptx.ShapeType.ellipse, {
      x: startX + i * dotGap, y: y - dotR, w: dotR * 2, h: dotR * 2,
      fill: { color: isCurrent ? theme.accent : (isDark ? 'FFFFFF' : theme.primary), transparency: isCurrent ? 0 : 70 },
      line: { width: 0 },
      altText: isCurrent ? `Current slide ${slideIndex + 1} of ${totalSlides}` : 'Decorative',
    });
  }
}

/**
 * Build a single slide into a pptx instance.
 */
function buildSlideForDeck(pptx, deck, theme, slideIndex, totalSlides) {
  const s = deck.slides?.[slideIndex];
  if (!s) return;
  const slideType = getSlideType(s);
  const slide = pptx.addSlide();
  const W = 10, H = 5.625;

  if (slideType === 'title') {
    // ── TITLE SLIDE ─────────────────────────────────────────────────────
    slide.background = { color: theme.primary };

    // Large decorative circle (top right)
    slide.addShape(pptx.ShapeType.ellipse, {
      x: W - 3.2, y: -1.5, w: 4.5, h: 4.5,
      fill: { color: theme.secondary, transparency: 15 },
      line: { color: theme.secondary, transparency: 15 },
      altText: 'Decorative',
    });

    // Smaller accent circle (bottom left)
    slide.addShape(pptx.ShapeType.ellipse, {
      x: -1.2, y: H - 1.8, w: 3, h: 3,
      fill: { color: theme.accent, transparency: 30 },
      line: { color: theme.accent, transparency: 30 },
      altText: 'Decorative',
    });

    // Bottom accent bar
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: H - 0.6, w: W, h: 0.6,
      fill: { color: theme.accent, transparency: 20 },
      line: { color: theme.accent, transparency: 20 },
      altText: 'Decorative',
    });

    // Thin decorative line
    slide.addShape(pptx.ShapeType.line, {
      x: 0.7, y: 0.45, w: 2.5, h: 0,
      line: { color: theme.accent, pt: 1.5, transparency: 40 },
      altText: 'Decorative',
    });

    // Course/Lesson number badge
    const titleMatch = (deck.lessonTitle || '').match(/^(?:Lesson|Week)\s*(\d+)/i);
    const deckNum = titleMatch ? parseInt(titleMatch[1], 10) : (deck._deckIndex !== undefined ? deck._deckIndex + 1 : 1);
    slide.addText(`LESSON ${deckNum}`, {
      x: 0.7, y: 0.6, w: 3, h: 0.4,
      fontSize: 11, fontFace: FONT_LABEL,
      color: theme.accent,
      bold: true, charSpacing: 4,
    });

    // Main title — large, bold
    slide.addText(deck.lessonTitle || s.title || 'Untitled Lesson', {
      x: 0.7, y: 1.15, w: W - 4, h: 2.2,
      fontSize: 40, fontFace: FONT_HEADING,
      color: theme.titleText,
      bold: true, align: 'left', valign: 'middle',
      lineSpacingMultiple: 1.15,
    });

    // Accent line under title
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.7, y: 3.4, w: 2.2, h: 0.06,
      fill: { color: theme.accent },
      line: { color: theme.accent },
      altText: 'Decorative',
    });

    // Subtitle / first bullet
    if (s.bullets?.length > 0) {
      slide.addText(s.bullets[0], {
        x: 0.7, y: 3.65, w: W - 4.2, h: 0.6,
        fontSize: 16, fontFace: FONT_BODY,
        color: 'D0DCF0',
        align: 'left', italic: true,
        lineSpacingMultiple: 1.5,
      });
    }

    // Progress dots
    addProgressDots(pptx, slide, theme, slideIndex, totalSlides, true);

  } else if (slideType === 'objectives') {
    // ── LEARNING OBJECTIVES SLIDE ────────────────────────────────────────
    slide.background = { color: theme.light };

    // Left sidebar
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: 0.12, h: H,
      fill: { color: theme.primary },
      line: { color: theme.primary },
      altText: 'Decorative',
    });

    // Header band
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.12, y: 0, w: W - 0.12, h: 1.15,
      fill: { color: theme.primary },
      line: { color: theme.primary },
      altText: 'Decorative',
    });

    slide.addText('LEARNING OBJECTIVES', {
      x: 0.5, y: 0.1, w: W - 0.8, h: 0.4,
      fontSize: 10, fontFace: FONT_LABEL,
      color: theme.accent, charSpacing: 4, bold: true,
    });

    slide.addText(s.title || 'By the end of this lesson, students will be able to:', {
      x: 0.5, y: 0.5, w: W - 0.8, h: 0.55,
      fontSize: 22, fontFace: FONT_HEADING,
      color: theme.titleText, bold: true,
    });

    // Numbered objectives as visual cards
    if (s.bullets?.length > 0) {
      s.bullets.slice(0, 4).forEach((b, i) => {
        const col = i < 2 ? 0 : 1;
        const row = i % 2;
        const x = col === 0 ? 0.4 : W / 2 + 0.15;
        const y = 1.35 + row * 1.85;
        const cardW = W / 2 - 0.55;

        slide.addShape(pptx.ShapeType.roundRect, {
          x, y, w: cardW, h: 1.6,
          fill: { color: 'FFFFFF' },
          line: { color: theme.secondary, pt: 1.5 },
          rectRadius: 0.1,
          altText: 'Decorative',
        });

        // Number circle
        slide.addShape(pptx.ShapeType.ellipse, {
          x: x + 0.15, y: y + 0.15, w: 0.5, h: 0.5,
          fill: { color: theme.secondary },
          line: { color: theme.secondary },
          altText: `Objective ${i + 1}`,
        });
        slide.addText(`${i + 1}`, {
          x: x + 0.15, y: y + 0.15, w: 0.5, h: 0.5,
          fontSize: 16, fontFace: FONT_HEADING, color: 'FFFFFF',
          bold: true, align: 'center', valign: 'middle',
        });

        slide.addText(b, {
          x: x + 0.75, y: y + 0.15, w: cardW - 0.9, h: 1.3,
          fontSize: 12, fontFace: FONT_BODY,
          color: theme.bodyText, valign: 'top',
          lineSpacingMultiple: 1.4,
        });
      });
    }

    addProgressDots(pptx, slide, theme, slideIndex, totalSlides, false);

  } else if (slideType === 'agenda') {
    // ── AGENDA SLIDE ─────────────────────────────────────────────────────
    slide.background = { color: 'FFFFFF' };

    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: 0.12, h: H,
      fill: { color: theme.primary },
      line: { color: theme.primary },
      altText: 'Decorative',
    });

    slide.addShape(pptx.ShapeType.rect, {
      x: 0.12, y: 0, w: W - 0.12, h: 1.15,
      fill: { color: theme.secondary },
      line: { color: theme.secondary },
      altText: 'Decorative',
    });

    slide.addText('TODAY\'S AGENDA', {
      x: 0.5, y: 0.08, w: 5, h: 0.35,
      fontSize: 10, color: theme.accent,
      charSpacing: 4, bold: true, fontFace: FONT_LABEL,
    });
    slide.addText(s.title || 'Session Overview', {
      x: 0.5, y: 0.45, w: W - 0.8, h: 0.6,
      fontSize: 24, color: 'FFFFFF',
      bold: true, fontFace: FONT_HEADING,
    });

    if (s.bullets?.length > 0) {
      s.bullets.slice(0, 6).forEach((b, i) => {
        const y = 1.3 + i * 0.68;
        slide.addShape(pptx.ShapeType.ellipse, {
          x: 0.5, y: y + 0.05, w: 0.44, h: 0.44,
          fill: { color: i === 0 ? theme.accent : theme.light },
          line: { color: i === 0 ? theme.accent : theme.secondary, pt: 1.5 },
          altText: `Agenda item ${i + 1}`,
        });
        slide.addText(`${i + 1}`, {
          x: 0.5, y: y + 0.05, w: 0.44, h: 0.44,
          fontSize: 14, color: i === 0 ? theme.primary : theme.secondary,
          bold: true, align: 'center', valign: 'middle', fontFace: FONT_HEADING,
        });
        slide.addText(b, {
          x: 1.15, y, w: W - 1.7, h: 0.55,
          fontSize: 16, color: i === 0 ? theme.bodyText : '555555',
          fontFace: FONT_BODY, bold: i === 0, valign: 'middle',
          lineSpacingMultiple: 1.5,
        });
        if (i < s.bullets.length - 1) {
          slide.addShape(pptx.ShapeType.line, {
            x: 1.15, y: y + 0.6, w: W - 1.9, h: 0,
            line: { color: 'E8ECF0', pt: 0.5 },
            altText: 'Decorative',
          });
        }
      });
    }

    addProgressDots(pptx, slide, theme, slideIndex, totalSlides, false);

  } else if (slideType === 'bridge') {
    // ── BRIDGE / RECAP SLIDE ─────────────────────────────────────────────
    // Split layout: left dark recap, right light today
    slide.background = { color: 'FFFFFF' };

    // Left panel (40%)
    const splitX = W * 0.42;
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: splitX, h: H,
      fill: { color: theme.primary },
      line: { color: theme.primary },
      altText: 'Decorative',
    });

    // Decorative circle on left
    slide.addShape(pptx.ShapeType.ellipse, {
      x: -1, y: H - 2.5, w: 3, h: 3,
      fill: { color: theme.secondary, transparency: 50 },
      line: { color: theme.secondary, transparency: 50 },
      altText: 'Decorative',
    });

    // "LAST TIME" label
    slide.addText('LAST TIME', {
      x: 0.4, y: 0.35, w: splitX - 0.6, h: 0.35,
      fontSize: 10, fontFace: FONT_LABEL,
      color: theme.accent, bold: true, charSpacing: 4,
    });

    // Recap title
    slide.addText(s.title || 'Bridge to Today', {
      x: 0.4, y: 0.75, w: splitX - 0.6, h: 0.7,
      fontSize: 20, fontFace: FONT_HEADING,
      color: theme.titleText, bold: true, valign: 'top',
      lineSpacingMultiple: 1.2,
    });

    // Recap bullets on left
    if (s.bullets?.length > 0) {
      const halfBullets = Math.ceil(s.bullets.length / 2);
      const recapBullets = s.bullets.slice(0, halfBullets);
      const recapText = recapBullets.map(b => ({
        text: `${b}\n`,
        options: {
          bullet: { code: '2714' },
          fontSize: 13, color: 'D0E8FF', breakLine: true,
          paraSpaceAfter: 10, lineSpacingMultiple: 1.4,
        },
      }));
      slide.addText(recapText, {
        x: 0.4, y: 1.6, w: splitX - 0.7, h: H - 2.2,
        fontFace: FONT_BODY, valign: 'top',
      });
    }

    // Right panel — "TODAY" label
    slide.addText('TODAY', {
      x: splitX + 0.35, y: 0.35, w: W - splitX - 0.6, h: 0.35,
      fontSize: 10, fontFace: FONT_LABEL,
      color: theme.primary, bold: true, charSpacing: 4,
    });

    // Arrow transition indicator
    slide.addText('Transition to today', {
      x: splitX - 0.4, y: H / 2 - 0.4, w: 1.1, h: 0.6,
      fontSize: 10, fontFace: FONT_LABEL,
      color: theme.accent, bold: true, align: 'center', valign: 'middle',
    });

    // Today bullets on right
    if (s.bullets?.length > 1) {
      const halfBullets = Math.ceil(s.bullets.length / 2);
      const todayBullets = s.bullets.slice(halfBullets);
      if (todayBullets.length > 0) {
        const todayText = todayBullets.map(b => ({
          text: `${b}\n`,
          options: {
            bullet: { code: '25B6' },  // ▶
            fontSize: 14, color: theme.bodyText, breakLine: true,
            paraSpaceAfter: 12, lineSpacingMultiple: 1.5,
          },
        }));
        slide.addText(todayText, {
          x: splitX + 0.35, y: 0.85, w: W - splitX - 0.7, h: H - 1.4,
          fontFace: FONT_BODY, valign: 'top',
        });
      }
    }

    // Accent line divider accent at bottom
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: H - 0.08, w: W, h: 0.08,
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
      x: 0, y: 0, w: W, h: 0.95,
      fill: { color: theme.primary },
      line: { color: theme.primary },
      altText: 'Decorative',
    });

    // EXAMPLE badge
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.5, y: 0.2, w: 1.2, h: 0.52,
      fill: { color: theme.accent },
      line: { color: theme.accent },
      rectRadius: 0.08,
      altText: 'Decorative',
    });
    slide.addText('EXAMPLE', {
      x: 0.5, y: 0.2, w: 1.2, h: 0.52,
      fontSize: 10, color: theme.primary,
      bold: true, align: 'center', valign: 'middle',
      fontFace: FONT_LABEL, charSpacing: 2,
    });

    slide.addText(s.title || 'Example', {
      x: 1.9, y: 0.15, w: W - 2.6, h: 0.65,
      fontSize: 22, color: 'FFFFFF',
      bold: true, fontFace: FONT_HEADING, valign: 'middle',
    });

    // Content area with left accent border
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.5, y: 1.15, w: 0.06, h: H - 1.8,
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
        const bulletText = mainBullets.map(b => ({
          text: `${b}\n`,
          options: {
            bullet: { code: '25CF' },
            fontSize: 16, color: theme.bodyText, breakLine: true,
            paraSpaceAfter: 12, lineSpacingMultiple: 1.5,
          },
        }));
        slide.addText(bulletText, {
          x: 0.85, y: 1.2, w: W - 1.3, h: H - 2.8,
          fontFace: FONT_BODY, valign: 'top',
        });
      }

      // Key takeaway at bottom
      if (takeaway) {
        slide.addShape(pptx.ShapeType.roundRect, {
          x: 0.5, y: H - 1.2, w: W - 1, h: 0.8,
          fill: { color: theme.light },
          line: { color: theme.accent, pt: 1.5 },
          rectRadius: 0.08,
          altText: 'Key takeaway highlight',
        });
        slide.addText(`Key Takeaway: ${takeaway}`, {
          x: 0.7, y: H - 1.2, w: W - 1.4, h: 0.8,
          fontSize: 13, fontFace: FONT_BODY,
          color: theme.primary, bold: true, valign: 'middle',
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
      x: 0, y: 0, w: 0.12, h: H,
      fill: { color: theme.primary },
      line: { color: theme.primary },
      altText: 'Decorative',
    });

    // "KEY CONCEPT" label
    slide.addText('KEY CONCEPT', {
      x: 0.5, y: 0.3, w: W - 0.8, h: 0.35,
      fontSize: 10, fontFace: FONT_LABEL,
      color: theme.primary, bold: true, charSpacing: 4,
    });

    // Large central card
    const cardX = 1.2, cardY = 1.0;
    const cardW = W - 2.4, cardH = 2.8;
    slide.addShape(pptx.ShapeType.roundRect, {
      x: cardX, y: cardY, w: cardW, h: cardH,
      fill: { color: 'FFFFFF' },
      line: { color: theme.secondary, pt: 2 },
      rectRadius: 0.15,
      shadow: { type: 'outer', blur: 8, offset: 3, opacity: 0.15, color: '000000' },
      altText: 'Key concept card',
    });

    // Accent stripe at top of card
    slide.addShape(pptx.ShapeType.rect, {
      x: cardX, y: cardY, w: cardW, h: 0.08,
      fill: { color: theme.accent },
      line: { color: theme.accent },
      altText: 'Decorative',
    });

    // Main term/concept (first bullet or title)
    const mainText = s.bullets?.[0] || s.title || 'Key Concept';
    slide.addText(mainText, {
      x: cardX + 0.4, y: cardY + 0.3, w: cardW - 0.8, h: 1.6,
      fontSize: 26, fontFace: FONT_HEADING,
      color: theme.primary, bold: true,
      align: 'center', valign: 'middle',
      lineSpacingMultiple: 1.3,
    });

    // Explanatory text below card
    if (s.bullets?.length > 1) {
      const explanation = s.bullets.slice(1).join('\n');
      slide.addText(explanation, {
        x: 1.5, y: cardY + cardH + 0.2, w: W - 3, h: H - cardY - cardH - 0.5,
        fontSize: 14, fontFace: FONT_BODY,
        color: theme.bodyText, align: 'center', valign: 'top',
        lineSpacingMultiple: 1.5,
      });
    }

    addProgressDots(pptx, slide, theme, slideIndex, totalSlides, false);

  } else if (slideType === 'activity') {
    // ── ACTIVITY SLIDE ───────────────────────────────────────────────────
    slide.background = { color: 'FAFBFF' };

    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: W, h: 0.95,
      fill: { color: theme.primary },
      line: { color: theme.primary },
      altText: 'Decorative',
    });

    // ACTIVITY badge
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.5, y: 0.2, w: 1.2, h: 0.52,
      fill: { color: theme.accent },
      line: { color: theme.accent },
      rectRadius: 0.08,
      altText: 'Decorative',
    });
    slide.addText('ACTIVITY', {
      x: 0.5, y: 0.2, w: 1.2, h: 0.52,
      fontSize: 10, color: theme.primary,
      bold: true, align: 'center', valign: 'middle',
      fontFace: FONT_LABEL, charSpacing: 2,
    });

    if (s.timer || s.activityType) {
      const timerLabel = s.timer ? `Duration: ${s.timer}` : s.activityType;
      slide.addText(timerLabel, {
        x: W - 2.5, y: 0.22, w: 2.2, h: 0.48,
        fontSize: 12, color: theme.accent,
        bold: true, align: 'right', valign: 'middle', fontFace: FONT_BODY,
      });
    }

    slide.addText(s.title || 'Activity', {
      x: 1.9, y: 0.12, w: W - 4.5, h: 0.7,
      fontSize: 22, color: 'FFFFFF',
      bold: true, fontFace: FONT_HEADING, valign: 'middle',
    });

    // Activity card
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.5, y: 1.15, w: W - 1, h: H - 1.6,
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
          fontSize: 16, color: theme.bodyText, breakLine: true,
          paraSpaceAfter: 12, lineSpacingMultiple: 1.5,
          bold: bi === 0,
        },
      }));
      slide.addText(bulletText, {
        x: 0.8, y: 1.35, w: W - 1.6, h: H - 2.0,
        fontFace: FONT_BODY, valign: 'top',
      });
    }

    addProgressDots(pptx, slide, theme, slideIndex, totalSlides, false);

  } else if (slideType === 'summary') {
    // ── SUMMARY / CLOSING SLIDE ──────────────────────────────────────────
    slide.background = { color: theme.primary };

    slide.addShape(pptx.ShapeType.ellipse, {
      x: W - 2.5, y: -0.8, w: 3.5, h: 3.5,
      fill: { color: theme.secondary, transparency: 55 },
      line: { color: theme.secondary, transparency: 55 },
      altText: 'Decorative',
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: H - 0.5, w: W, h: 0.5,
      fill: { color: theme.accent },
      line: { color: theme.accent },
      altText: 'Decorative',
    });

    slide.addText('KEY TAKEAWAYS', {
      x: 0.7, y: 0.4, w: 6, h: 0.4,
      fontSize: 11, color: theme.accent,
      bold: true, charSpacing: 4, fontFace: FONT_LABEL,
    });
    slide.addText(s.title || 'Summary', {
      x: 0.7, y: 0.85, w: W - 1.5, h: 0.95,
      fontSize: 28, color: 'FFFFFF',
      bold: true, fontFace: FONT_HEADING,
    });

    slide.addShape(pptx.ShapeType.rect, {
      x: 0.7, y: 1.85, w: 2.2, h: 0.06,
      fill: { color: theme.accent },
      line: { color: theme.accent },
      altText: 'Decorative',
    });

    if (s.bullets?.length > 0) {
      const bulletText = s.bullets.map(b => ({
        text: `${b}\n`,
        options: {
          bullet: { code: '2714' },
          fontSize: 16, color: 'D0E8FF', breakLine: true,
          paraSpaceAfter: 12, lineSpacingMultiple: 1.5,
        },
      }));
      slide.addText(bulletText, {
        x: 0.7, y: 2.1, w: W - 1.5, h: H - 3.0,
        fontFace: FONT_BODY, valign: 'top',
      });
    }

    addProgressDots(pptx, slide, theme, slideIndex, totalSlides, true);

  } else if (slideType === 'question') {
    // ── Q&A / DISCUSSION SLIDE ───────────────────────────────────────────
    slide.background = { color: theme.secondary };

    slide.addShape(pptx.ShapeType.ellipse, {
      x: W - 3, y: -1, w: 4, h: 4,
      fill: { color: theme.primary, transparency: 40 },
      line: { color: theme.primary, transparency: 40 },
      altText: 'Decorative',
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: H - 0.45, w: W, h: 0.45,
      fill: { color: theme.accent },
      line: { color: theme.accent },
      altText: 'Decorative',
    });

    slide.addText('?', {
      x: 0.4, y: 0.5, w: 1.2, h: 1.5,
      fontSize: 80, color: theme.accent,
      bold: true, align: 'center', fontFace: FONT_HEADING,
      transparency: 30,
    });

    slide.addText(s.title || 'Discussion', {
      x: 1.6, y: 0.7, w: W - 2.2, h: 1.2,
      fontSize: 28, color: 'FFFFFF',
      bold: true, fontFace: FONT_HEADING, valign: 'middle',
    });

    if (s.bullets?.length > 0) {
      const bulletText = s.bullets.map(b => ({
        text: `${b}\n`,
        options: {
          bullet: true, fontSize: 16, color: 'E8F4FF', breakLine: true,
          paraSpaceAfter: 12, lineSpacingMultiple: 1.5,
        },
      }));
      slide.addText(bulletText, {
        x: 0.7, y: 2.1, w: W - 1.4, h: H - 2.8,
        fontFace: FONT_BODY, valign: 'top',
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
      x: 0, y: 0, w: 0.12, h: H,
      fill: { color: theme.primary },
      line: { color: theme.primary },
      altText: 'Decorative',
    });

    // Top header area — gradient feel (light to white)
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.12, y: 0, w: W - 0.12, h: 1.1,
      fill: { color: theme.light },
      line: { color: theme.light },
      altText: 'Decorative',
    });

    // Accent line below header
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.12, y: 1.07, w: W - 0.12, h: 0.05,
      fill: { color: theme.accent },
      line: { color: theme.accent },
      altText: 'Decorative',
    });

    // Slide title — assertion-evidence style (full sentence)
    slide.addText(s.title || '', {
      x: 0.45, y: 0.1, w: W - 0.7, h: 0.9,
      fontSize: 28, fontFace: FONT_HEADING,
      color: theme.primary,
      bold: true, valign: 'middle',
      lineSpacingMultiple: 1.1,
    });

    // Content bullets — two-column if 4+
    if (bullets.length > 0) {
      if (useTwoCol) {
        const mid = Math.ceil(bullets.length / 2);
        const leftBullets = bullets.slice(0, mid);
        const rightBullets = bullets.slice(mid);

        const leftText = leftBullets.map((b, bi) => ({
          text: `${b}\n`,
          options: {
            bullet: { code: '25CF' },
            fontSize: 16, color: bi === 0 ? theme.bodyText : '444444',
            breakLine: true, paraSpaceAfter: 12, lineSpacingMultiple: 1.5,
            bold: bi === 0,
          },
        }));
        slide.addText(leftText, {
          x: 0.45, y: 1.2, w: (W - 1.0) / 2, h: H - 1.6,
          fontFace: FONT_BODY, valign: 'top',
        });

        const rightText = rightBullets.map((b) => ({
          text: `${b}\n`,
          options: {
            bullet: { code: '25CF' },
            fontSize: 16, color: '444444',
            breakLine: true, paraSpaceAfter: 12, lineSpacingMultiple: 1.5,
          },
        }));
        slide.addText(rightText, {
          x: W / 2 + 0.1, y: 1.2, w: (W - 1.0) / 2, h: H - 1.6,
          fontFace: FONT_BODY, valign: 'top',
        });
      } else {
        const bulletText = bullets.map((b, bi) => ({
          text: `${b}\n`,
          options: {
            bullet: { code: '25CF' },
            fontSize: 16, color: bi === 0 ? theme.bodyText : '444444',
            breakLine: true, paraSpaceAfter: 12, lineSpacingMultiple: 1.5,
            bold: bi === 0,
          },
        }));
        slide.addText(bulletText, {
          x: 0.45, y: 1.2, w: W - 0.7, h: H - 1.6,
          fontFace: FONT_BODY, valign: 'top',
        });
      }
    }

    addProgressDots(pptx, slide, theme, slideIndex, totalSlides, false);
  }

  // ── Slide number badge (bottom right) ────────────────────────────────
  const isDarkSlide = slideType === 'title' || slideType === 'summary' || slideType === 'question';
  slide.addShape(pptx.ShapeType.roundRect, {
    x: W - 0.95, y: H - 0.44, w: 0.68, h: 0.34,
    fill: { color: isDarkSlide ? theme.accent : theme.primary },
    line: { width: 0 },
    rectRadius: 0.05,
    altText: 'Decorative',
  });
  slide.addText(`${slideIndex + 1}/${totalSlides}`, {
    x: W - 0.95, y: H - 0.44, w: 0.68, h: 0.34,
    fontSize: 9, color: isDarkSlide ? theme.primary : 'FFFFFF',
    align: 'center', valign: 'middle', fontFace: FONT_BODY, bold: true,
  });

  // Speaker notes
  if (s.notes || s.speakerNotes) {
    slide.addNotes(s.notes || s.speakerNotes);
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
  const PptxGenJS = await getPptxGen();
  const pptx = new PptxGenJS();

  pptx.layout = 'LAYOUT_16x9';
  pptx.lang = 'en-US';
  pptx.author = 'CourseMapper';
  pptx.title = courseName || 'Slide Decks';

  const key = data.decks ? 'decks' : 'slideDecks';
  const decks = (data[key] || []).map((d, i) => ({ ...d, _deckIndex: i }));

  for (let di = 0; di < decks.length; di++) {
    const deck = decks[di];
    const theme = resolveTheme(di, themeIndex);
    const slides = deck.slides || [];

    // Add section divider between decks (after the first)
    if (di > 0) {
      const divider = pptx.addSlide();
      divider.background = { color: theme.primary };
      divider.addShape(pptx.ShapeType.rect, {
        x: 0, y: 5.625 - 0.08, w: 10, h: 0.08,
        fill: { color: theme.accent },
        line: { color: theme.accent },
        altText: 'Decorative',
      });
      divider.addText(deck.lessonTitle || `Lesson ${di + 1}`, {
        x: 1, y: 1.5, w: 8, h: 2.5,
        fontSize: 36, fontFace: FONT_HEADING,
        color: 'FFFFFF', bold: true, align: 'center', valign: 'middle',
      });
      const num = (deck.lessonTitle || '').match(/^(?:Lesson|Week)\s*(\d+)/i);
      divider.addText(`LESSON ${num ? num[1] : di + 1}`, {
        x: 1, y: 0.6, w: 8, h: 0.4,
        fontSize: 11, fontFace: FONT_LABEL,
        color: theme.accent, bold: true, charSpacing: 4, align: 'center',
      });
    }

    for (let si = 0; si < slides.length; si++) {
      buildSlideForDeck(pptx, deck, theme, si, slides.length);
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
  const PptxGenJS = await getPptxGen();
  const pptx = new PptxGenJS();

  pptx.layout = 'LAYOUT_16x9';
  pptx.lang = 'en-US';
  pptx.title = deck.lessonTitle || courseName || 'Slide Deck';

  const theme = resolveTheme(deckIndex, themeIndex);
  const deckWithIndex = { ...deck, _deckIndex: deckIndex };
  const slides = deck.slides || [];

  for (let si = 0; si < slides.length; si++) {
    buildSlideForDeck(pptx, deckWithIndex, theme, si, slides.length);
  }

  return await pptx.write({ outputType: 'blob' });
}

/**
 * Download a single deck as its own .pptx file immediately.
 */
export async function exportSingleDeckPptx(deck, deckIndex, courseName, themeIndex) {
  const { saveAs } = await import('file-saver');
  const blob = await buildSingleDeckPptxBlob(deck, deckIndex, courseName, themeIndex);
  const deckName = (deck.lessonTitle || `Deck ${deckIndex + 1}`).replace(/[/\\?%*:|"<>]/g, '-').trim();
  const lessonNumMatch = (deck.lessonTitle || '').match(/^(?:Lesson|Week)\s*(\d+)/i);
  const lessonNum = lessonNumMatch ? parseInt(lessonNumMatch[1], 10) : deckIndex + 1;
  const fileName = `Lesson ${lessonNum} - ${deckName}.pptx`;
  saveAs(blob, fileName);
  return fileName;
}
