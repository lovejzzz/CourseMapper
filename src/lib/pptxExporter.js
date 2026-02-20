/**
 * Export slide decks as PowerPoint (.pptx) using pptxgenjs.
 * University-quality design: bold headers, gradient accents, rich layouts.
 * Item 9: Redesigned for visually rich, colorful, modern university slides.
 */

let _PptxGenJS;

async function getPptxGen() {
  if (!_PptxGenJS) {
    const mod = await import('pptxgenjs');
    _PptxGenJS = mod.default || mod;
  }
  return _PptxGenJS;
}

// Rich university color themes — each with a primary, secondary, accent, and body colors
// Design inspiration: MIT OpenCourseWare, Stanford Education, TED-Ed
const THEMES = [
  {
    // Navy + Gold — classic university authority
    primary: '1E3A5F',    // Deep navy
    secondary: '2E86AB',  // Ocean blue
    accent: 'F6C90E',     // Gold
    light: 'EEF4FF',      // Soft blue-white
    sideBar: '1E3A5F',    // Left sidebar
    body: 'FFFFFF',
    titleText: 'FFFFFF',
    bodyText: '1A1A2E',
    subtleText: '6B7FA3',
  },
  {
    // Forest + Amber — warm academic green
    primary: '1B4332',    // Deep forest
    secondary: '52B788',  // Medium green
    accent: 'F4A261',     // Warm amber
    light: 'F0FFF4',
    sideBar: '1B4332',
    body: 'FFFFFF',
    titleText: 'FFFFFF',
    bodyText: '1B2B1F',
    subtleText: '52796F',
  },
  {
    // Royal Purple + Orange — vibrant creative
    primary: '4A1C96',    // Deep purple
    secondary: '7B2FBE',  // Medium purple
    accent: 'FF6B35',     // Vivid orange
    light: 'FAF5FF',
    sideBar: '4A1C96',
    body: 'FFFFFF',
    titleText: 'FFFFFF',
    bodyText: '2D1B40',
    subtleText: '7C3AED',
  },
  {
    // Crimson + Gold — Harvard-style prestige
    primary: '8B0000',    // Crimson
    secondary: 'C62828',  // Medium red
    accent: 'FFD700',     // Pure gold
    light: 'FFF9F9',
    sideBar: '8B0000',
    body: 'FFFFFF',
    titleText: 'FFFFFF',
    bodyText: '2D0A0A',
    subtleText: '9E3030',
  },
  {
    // Ocean + Cyan — modern tech university
    primary: '0C3547',    // Deep ocean
    secondary: '1565C0',  // Royal blue
    accent: '00BCD4',     // Bright cyan
    light: 'F0FBFF',
    sideBar: '0C3547',
    body: 'FFFFFF',
    titleText: 'FFFFFF',
    bodyText: '0A1628',
    subtleText: '2196F3',
  },
];

function getSlideType(slide) {
  // Use explicit type field first (from AI)
  if (slide.type) {
    const t = slide.type.toLowerCase();
    if (t === 'title') return 'title';
    if (t === 'agenda') return 'agenda';
    if (t === 'summary' || t === 'closing') return 'summary';
    if (t === 'activity' || t === 'exercise') return 'activity';
    if (t === 'question' || t === 'discussion') return 'question';
    if (t === 'objectives' || t === 'learning_objectives') return 'objectives';
  }
  // Fallback: infer from title
  const t = (slide.title || '').toLowerCase();
  if (/welcome|intro|title|overview/i.test(t)) return 'title';
  if (/agenda|outline|today|roadmap/i.test(t)) return 'agenda';
  if (/summary|recap|takeaway|conclusion|wrap/i.test(t)) return 'summary';
  if (/activity|exercise|workshop|group|breakout|hands.?on/i.test(t)) return 'activity';
  if (/objective|goal|outcome|learn/i.test(t)) return 'objectives';
  if (/question|q\s*&\s*a|quiz|discuss/i.test(t)) return 'question';
  return 'content';
}

/**
 * Build a single slide deck into a pptx instance.
 * Shared between export-to-file and export-to-blob.
 */
function buildSlideForDeck(pptx, deck, theme, slideIndex, totalSlides) {
  const s = deck.slides?.[slideIndex];
  if (!s) return;
  const slideType = getSlideType(s);
  const slide = pptx.addSlide();
  const W = 10, H = 5.625; // 16:9 inches

  if (slideType === 'title') {
    // ── TITLE SLIDE ─────────────────────────────────────────────────────
    // Full bleed primary color background
    slide.background = { color: theme.primary };

    // Large decorative circle (top right)
    slide.addShape(pptx.ShapeType.ellipse, {
      x: W - 3.2, y: -1.5, w: 4.5, h: 4.5,
      fill: { color: theme.secondary },
      line: { color: theme.secondary },
    });

    // Smaller accent circle (bottom left)
    slide.addShape(pptx.ShapeType.ellipse, {
      x: -1.2, y: H - 1.8, w: 3, h: 3,
      fill: { color: theme.accent, transparency: 30 },
      line: { color: theme.accent, transparency: 30 },
    });

    // Bottom accent bar
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: H - 0.6, w: W, h: 0.6,
      fill: { color: theme.accent, transparency: 20 },
      line: { color: theme.accent, transparency: 20 },
    });

    // Course/Lesson number badge — extract from title if possible (e.g., "Lesson 6: ...")
    const titleMatch = (deck.lessonTitle || '').match(/^(?:Lesson|Week)\s*(\d+)/i);
    const deckNum = titleMatch ? parseInt(titleMatch[1], 10) : (deck._deckIndex !== undefined ? deck._deckIndex + 1 : 1);
    slide.addText(`LESSON ${deckNum}`, {
      x: 0.7, y: 0.6, w: 3, h: 0.35,
      fontSize: 10, fontFace: 'Calibri Light',
      color: theme.accent,
      bold: true, charSpacing: 3,
    });

    // Main title — large, bold
    slide.addText(deck.lessonTitle || s.title || 'Untitled Lesson', {
      x: 0.7, y: 1.1, w: W - 4, h: 2.2,
      fontSize: 36, fontFace: 'Calibri',
      color: theme.titleText,
      bold: true, align: 'left', valign: 'middle',
      lineSpacingMultiple: 1.15,
    });

    // Accent line under title
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.7, y: 3.4, w: 1.8, h: 0.05,
      fill: { color: theme.accent },
      line: { color: theme.accent },
    });

    // Subtitle / first bullet
    if (s.bullets?.length > 0) {
      slide.addText(s.bullets[0], {
        x: 0.7, y: 3.6, w: W - 4.2, h: 0.5,
        fontSize: 14, fontFace: 'Calibri Light',
        color: 'D0DCF0',
        align: 'left', italic: true,
      });
    }

  } else if (slideType === 'objectives') {
    // ── LEARNING OBJECTIVES SLIDE ────────────────────────────────────────
    slide.background = { color: theme.light };

    // Left colored sidebar
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: 0.12, h: H,
      fill: { color: theme.primary },
      line: { color: theme.primary },
    });

    // Header band
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.12, y: 0, w: W - 0.12, h: 1.1,
      fill: { color: theme.primary },
      line: { color: theme.primary },
    });

    // "LEARNING OBJECTIVES" label
    slide.addText('LEARNING OBJECTIVES', {
      x: 0.5, y: 0.1, w: W - 0.8, h: 0.4,
      fontSize: 9, fontFace: 'Calibri Light',
      color: theme.accent, charSpacing: 3, bold: true,
    });

    slide.addText(s.title || 'By the end of this lesson, students will be able to:', {
      x: 0.5, y: 0.5, w: W - 0.8, h: 0.5,
      fontSize: 20, fontFace: 'Calibri',
      color: theme.titleText, bold: true,
    });

    // Numbered objectives as visual cards
    if (s.bullets?.length > 0) {
      s.bullets.slice(0, 4).forEach((b, i) => {
        const col = i < 2 ? 0 : 1;
        const row = i % 2;
        const x = col === 0 ? 0.4 : W / 2 + 0.15;
        const y = 1.3 + row * 1.85;
        const cardW = W / 2 - 0.55;

        slide.addShape(pptx.ShapeType.roundRect, {
          x, y, w: cardW, h: 1.6,
          fill: { color: 'FFFFFF' },
          line: { color: theme.secondary, pt: 1.5 },
          rectRadius: 0.1,
        });

        // Number circle
        slide.addShape(pptx.ShapeType.ellipse, {
          x: x + 0.15, y: y + 0.15, w: 0.5, h: 0.5,
          fill: { color: theme.secondary },
          line: { color: theme.secondary },
        });
        slide.addText(`${i + 1}`, {
          x: x + 0.15, y: y + 0.15, w: 0.5, h: 0.5,
          fontSize: 14, fontFace: 'Calibri', color: 'FFFFFF',
          bold: true, align: 'center', valign: 'middle',
        });

        slide.addText(b, {
          x: x + 0.75, y: y + 0.15, w: cardW - 0.9, h: 1.3,
          fontSize: 11, fontFace: 'Calibri',
          color: theme.bodyText, valign: 'top',
          lineSpacingMultiple: 1.3,
        });
      });
    }

  } else if (slideType === 'agenda') {
    // ── AGENDA SLIDE ─────────────────────────────────────────────────────
    slide.background = { color: 'FFFFFF' };

    // Left sidebar
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: 0.12, h: H,
      fill: { color: theme.primary },
      line: { color: theme.primary },
    });

    // Top band
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.12, y: 0, w: W - 0.12, h: 1.1,
      fill: { color: theme.secondary },
      line: { color: theme.secondary },
    });

    slide.addText('TODAY\'S AGENDA', {
      x: 0.5, y: 0.08, w: 5, h: 0.35,
      fontSize: 9, color: theme.accent,
      charSpacing: 3, bold: true, fontFace: 'Calibri Light',
    });
    slide.addText(s.title || 'Session Overview', {
      x: 0.5, y: 0.45, w: W - 0.8, h: 0.55,
      fontSize: 22, color: 'FFFFFF',
      bold: true, fontFace: 'Calibri',
    });

    // Agenda items as numbered list with colored circles
    if (s.bullets?.length > 0) {
      s.bullets.slice(0, 6).forEach((b, i) => {
        const y = 1.25 + i * 0.65;
        // Number circle
        slide.addShape(pptx.ShapeType.ellipse, {
          x: 0.5, y: y + 0.05, w: 0.42, h: 0.42,
          fill: { color: i === 0 ? theme.accent : theme.light },
          line: { color: i === 0 ? theme.accent : theme.secondary, pt: 1.5 },
        });
        slide.addText(`${i + 1}`, {
          x: 0.5, y: y + 0.05, w: 0.42, h: 0.42,
          fontSize: 13, color: i === 0 ? theme.primary : theme.secondary,
          bold: true, align: 'center', valign: 'middle', fontFace: 'Calibri',
        });
        // Agenda item text
        slide.addText(b, {
          x: 1.1, y, w: W - 1.6, h: 0.52,
          fontSize: 14, color: i === 0 ? theme.bodyText : '666666',
          fontFace: 'Calibri', bold: i === 0, valign: 'middle',
        });
        // Separator line
        if (i < s.bullets.length - 1) {
          slide.addShape(pptx.ShapeType.line, {
            x: 1.1, y: y + 0.58, w: W - 1.8, h: 0,
            line: { color: 'E8ECF0', pt: 0.5 },
          });
        }
      });
    }

  } else if (slideType === 'activity') {
    // ── ACTIVITY SLIDE ───────────────────────────────────────────────────
    // Warm, engaging layout with colored card
    slide.background = { color: 'FAFBFF' };

    // Header
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: W, h: 0.9,
      fill: { color: theme.primary },
      line: { color: theme.primary },
    });

    // "ACTIVITY" badge
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.5, y: 0.18, w: 1.1, h: 0.52,
      fill: { color: theme.accent },
      line: { color: theme.accent },
      rectRadius: 0.08,
    });
    slide.addText('ACTIVITY', {
      x: 0.5, y: 0.18, w: 1.1, h: 0.52,
      fontSize: 9, color: theme.primary,
      bold: true, align: 'center', valign: 'middle',
      fontFace: 'Calibri', charSpacing: 1,
    });

    // Timer badge (if available)
    if (s.timer || s.activityType) {
      const timerLabel = s.timer ? `⏱ ${s.timer}` : s.activityType;
      slide.addText(timerLabel, {
        x: W - 2.5, y: 0.22, w: 2.2, h: 0.44,
        fontSize: 11, color: theme.accent,
        bold: true, align: 'right', valign: 'middle', fontFace: 'Calibri',
      });
    }

    slide.addText(s.title || 'Activity', {
      x: 1.8, y: 0.12, w: W - 4.5, h: 0.65,
      fontSize: 20, color: 'FFFFFF',
      bold: true, fontFace: 'Calibri', valign: 'middle',
    });

    // Activity card
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.5, y: 1.1, w: W - 1, h: H - 1.5,
      fill: { color: 'FFF8F0' },
      line: { color: theme.accent, pt: 2 },
      rectRadius: 0.15,
    });

    if (s.bullets?.length > 0) {
      const bulletText = s.bullets.map((b, bi) => ({
        text: `${b}\n`,
        options: {
          bullet: { type: 'number', style: '1)', startAt: bi + 1 },
          fontSize: 14, color: theme.bodyText, breakLine: true,
          paraSpaceAfter: 6, lineSpacingMultiple: 1.3,
          bold: bi === 0,
        },
      }));
      slide.addText(bulletText, {
        x: 0.8, y: 1.3, w: W - 1.6, h: H - 1.8,
        fontFace: 'Calibri', valign: 'top',
      });
    }

  } else if (slideType === 'summary') {
    // ── SUMMARY / CLOSING SLIDE ──────────────────────────────────────────
    slide.background = { color: theme.primary };

    // Large decorative shapes
    slide.addShape(pptx.ShapeType.ellipse, {
      x: W - 2.5, y: -0.8, w: 3.5, h: 3.5,
      fill: { color: theme.secondary, transparency: 60 },
      line: { color: theme.secondary, transparency: 60 },
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: H - 0.5, w: W, h: 0.5,
      fill: { color: theme.accent },
      line: { color: theme.accent },
    });

    slide.addText('KEY TAKEAWAYS', {
      x: 0.7, y: 0.4, w: 6, h: 0.4,
      fontSize: 10, color: theme.accent,
      bold: true, charSpacing: 3, fontFace: 'Calibri Light',
    });
    slide.addText(s.title || 'Summary', {
      x: 0.7, y: 0.85, w: W - 1.5, h: 0.9,
      fontSize: 28, color: 'FFFFFF',
      bold: true, fontFace: 'Calibri',
    });

    // Gold accent line
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.7, y: 1.8, w: 2, h: 0.05,
      fill: { color: theme.accent },
      line: { color: theme.accent },
    });

    if (s.bullets?.length > 0) {
      const bulletText = s.bullets.map(b => ({
        text: `${b}\n`,
        options: {
          bullet: { code: '2714' },  // ✔ checkmark
          fontSize: 14, color: 'D0E8FF', breakLine: true,
          paraSpaceAfter: 8, lineSpacingMultiple: 1.3,
        },
      }));
      slide.addText(bulletText, {
        x: 0.7, y: 2.0, w: W - 1.5, h: H - 2.9,
        fontFace: 'Calibri', valign: 'top',
      });
    }

  } else if (slideType === 'question') {
    // ── Q&A / DISCUSSION SLIDE ───────────────────────────────────────────
    slide.background = { color: theme.secondary };

    slide.addShape(pptx.ShapeType.ellipse, {
      x: W - 3, y: -1, w: 4, h: 4,
      fill: { color: theme.primary, transparency: 40 },
      line: { color: theme.primary, transparency: 40 },
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: H - 0.45, w: W, h: 0.45,
      fill: { color: theme.accent },
      line: { color: theme.accent },
    });

    // Big question mark
    slide.addText('?', {
      x: 0.4, y: 0.5, w: 1.2, h: 1.5,
      fontSize: 80, color: theme.accent,
      bold: true, align: 'center', fontFace: 'Calibri',
      transparency: 30,
    });

    slide.addText(s.title || 'Discussion', {
      x: 1.6, y: 0.7, w: W - 2.2, h: 1.2,
      fontSize: 26, color: 'FFFFFF',
      bold: true, fontFace: 'Calibri', valign: 'middle',
    });

    if (s.bullets?.length > 0) {
      const bulletText = s.bullets.map(b => ({
        text: `${b}\n`,
        options: { bullet: true, fontSize: 14, color: 'E8F4FF', breakLine: true, paraSpaceAfter: 8, lineSpacingMultiple: 1.3 },
      }));
      slide.addText(bulletText, {
        x: 0.7, y: 2.1, w: W - 1.4, h: H - 2.7,
        fontFace: 'Calibri', valign: 'top',
      });
    }

  } else {
    // ── CONTENT SLIDE (default) ──────────────────────────────────────────
    slide.background = { color: 'FFFFFF' };

    // Left colored sidebar (12% of width)
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: 0.12, h: H,
      fill: { color: theme.primary },
      line: { color: theme.primary },
    });

    // Top header area
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.12, y: 0, w: W - 0.12, h: 1.05,
      fill: { color: theme.light },
      line: { color: theme.light },
    });

    // Accent line below header
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.12, y: 1.02, w: W - 0.12, h: 0.045,
      fill: { color: theme.accent },
      line: { color: theme.accent },
    });

    // Slide title
    slide.addText(s.title || '', {
      x: 0.45, y: 0.12, w: W - 0.7, h: 0.8,
      fontSize: 24, fontFace: 'Calibri',
      color: theme.primary,
      bold: true, valign: 'middle',
    });

    // Content bullets
    if (s.bullets?.length > 0) {
      const bulletText = s.bullets.map((b, bi) => ({
        text: `${b}\n`,
        options: {
          bullet: { code: '25CF' },  // ● filled circle
          fontSize: 14, color: bi === 0 ? theme.bodyText : '444444',
          breakLine: true, paraSpaceAfter: 7, lineSpacingMultiple: 1.35,
          bold: bi === 0,
        },
      }));
      slide.addText(bulletText, {
        x: 0.45, y: 1.15, w: W - 0.7, h: H - 1.45,
        fontFace: 'Calibri', valign: 'top',
      });
    }
  }

  // ── Slide number badge (bottom right) ────────────────────────────────
  slide.addShape(pptx.ShapeType.roundRect, {
    x: W - 0.9, y: H - 0.42, w: 0.62, h: 0.32,
    fill: { color: slideType === 'title' || slideType === 'summary' || slideType === 'question' ? theme.accent : theme.primary },
    line: { color: 'transparent' },
    rectRadius: 0.04,
  });
  slide.addText(`${slideIndex + 1}/${totalSlides}`, {
    x: W - 0.9, y: H - 0.42, w: 0.62, h: 0.32,
    fontSize: 8, color: slideType === 'title' || slideType === 'summary' || slideType === 'question' ? theme.primary : 'FFFFFF',
    align: 'center', valign: 'middle', fontFace: 'Calibri', bold: true,
  });

  // Speaker notes
  if (s.notes || s.speakerNotes) {
    slide.addNotes(s.notes || s.speakerNotes);
  }
}

/**
 * Create a pptx instance with all decks.
 */
async function createPptxWithDecks(data, courseName) {
  const PptxGenJS = await getPptxGen();
  const pptx = new PptxGenJS();

  pptx.layout = 'LAYOUT_16x9'; // 10" × 5.625" — matches Google Slides default
  pptx.author = 'CourseMapper';
  pptx.title = courseName || 'Slide Decks';

  const key = data.decks ? 'decks' : 'slideDecks';
  const decks = (data[key] || []).map((d, i) => ({ ...d, _deckIndex: i }));

  for (let di = 0; di < decks.length; di++) {
    const deck = decks[di];
    const theme = THEMES[di % THEMES.length];
    const slides = deck.slides || [];
    for (let si = 0; si < slides.length; si++) {
      buildSlideForDeck(pptx, deck, theme, si, slides.length);
    }
  }

  return pptx;
}

/**
 * Export slide deck data as a .pptx file.
 */
export async function exportSlideDeckPptx(data, courseName) {
  const pptx = await createPptxWithDecks(data, courseName);
  const fileName = `${courseName || 'Course'} - Slide Decks.pptx`;
  await pptx.writeFile({ fileName });
  return fileName;
}

/**
 * Build a PPTX blob (for uploading to Google Slides).
 */
export async function buildSlideDeckPptxBlob(data, courseName) {
  const pptx = await createPptxWithDecks(data, courseName);
  return await pptx.write({ outputType: 'blob' });
}

/**
 * Build a PPTX blob for a single slide deck (one lesson).
 */
export async function buildSingleDeckPptxBlob(deck, deckIndex, courseName) {
  const PptxGenJS = await getPptxGen();
  const pptx = new PptxGenJS();

  pptx.layout = 'LAYOUT_16x9';
  pptx.title = deck.lessonTitle || courseName || 'Slide Deck';

  const theme = THEMES[deckIndex % THEMES.length];
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
export async function exportSingleDeckPptx(deck, deckIndex, courseName) {
  const { saveAs } = await import('file-saver');
  const blob = await buildSingleDeckPptxBlob(deck, deckIndex, courseName);
  const deckName = (deck.lessonTitle || `Deck ${deckIndex + 1}`).replace(/[/\\?%*:|"<>]/g, '-').trim();
  const lessonNumMatch = (deck.lessonTitle || '').match(/^(?:Lesson|Week)\s*(\d+)/i);
  const lessonNum = lessonNumMatch ? parseInt(lessonNumMatch[1], 10) : deckIndex + 1;
  const fileName = `Lesson ${lessonNum} - ${deckName}.pptx`;
  saveAs(blob, fileName);
  return fileName;
}
