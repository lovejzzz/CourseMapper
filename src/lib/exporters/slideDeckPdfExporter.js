/**
 * Slide-deck PDF handout — one designed page per slide.
 *
 * v0.12.0 redesign: pages now carry the same per-deck color themes as the
 * PPTX export (THEMES rotation), with a full-bleed title page per lesson,
 * an accent side bar, tracked-uppercase kickers, round bullet markers, and
 * a tinted speaker-notes panel. jsPDF only embeds the 14 standard fonts, so
 * the design leans on color, weight, size, and geometry instead of faces.
 */
import { safeImport } from '../safeImport';
import { assertTableRowsHaveNoInternalExportLanguage } from '../exportTextInspector';
import { expandKeys } from '../keyMaps';
import { loadPdfRuntime } from '../pdfRuntime';
import { THEMES } from './pptxExporter.js';
import { isSubstantiveSlideSubtitle } from './slideTitleSubtitle.js';

function hexToRgb(hex) {
  const h = String(hex || '000000').replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function isTitleSlide(slide, slideIdx) {
  const t = (slide.type || '').toLowerCase();
  if (t === 'title') return true;
  if (t) return false;
  return slideIdx === 0 && /welcome|intro|title|overview/i.test(slide.title || '');
}

export async function exportSlideDeckPdf(data, courseName) {
  const expanded = expandKeys('slideDecks', data);
  const decks = expanded.slideDecks || expanded.decks || [];
  const inspectionRows = [];
  decks.forEach((deck, deckIdx) => {
    const lessonLabel = deck.lessonTitle || deck.title || `Lesson ${deckIdx + 1}`;
    inspectionRows.push(['Lesson', lessonLabel]);
    (deck.slides || []).forEach((slide, slideIdx) => {
      inspectionRows.push(['Slide Title', slide.title || '']);
      const bullets = slide.bullets || slide.content || [];
      bullets.forEach((bullet) => inspectionRows.push([`Slide ${slideIdx + 1} Bullet`, String(bullet || '')]));
      inspectionRows.push(['Speaker Notes', slide.speakerNotes || slide.notes || '']);
    });
  });
  assertTableRowsHaveNoInternalExportLanguage(
    { headers: ['Field', 'Content'], rows: inspectionRows },
    'Slide Decks',
    'PDF',
  );

  const { jsPDF } = await loadPdfRuntime();
  const { saveAs } = await safeImport(() => import('file-saver'));

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = 297;
  const pageH = 210;
  const margin = 16;
  const barW = 5; // accent side bar
  const contentX = margin + barW + 4;
  const contentW = pageW - contentX - margin;

  decks.forEach((deck, deckIdx) => {
    const theme = THEMES[deckIdx % THEMES.length];
    const primary = hexToRgb(theme.primary);
    const secondary = hexToRgb(theme.secondary);
    const accent = hexToRgb(theme.accent);
    const light = hexToRgb(theme.light);
    const bodyText = hexToRgb(theme.bodyText);
    const lessonLabel = deck.lessonTitle || deck.title || `Lesson ${deckIdx + 1}`;
    const slides = deck.slides || [];

    slides.forEach((slide, slideIdx) => {
      if (deckIdx > 0 || slideIdx > 0) doc.addPage();

      if (isTitleSlide(slide, slideIdx)) {
        // ── Full-bleed lesson title page ─────────────────────────────────
        doc.setFillColor(...primary);
        doc.rect(0, 0, pageW, pageH, 'F');
        // Accent bottom band + secondary corner block for depth.
        doc.setFillColor(...accent);
        doc.rect(0, pageH - 10, pageW, 10, 'F');
        doc.setFillColor(...secondary);
        doc.circle(pageW - 18, 22, 34, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...accent);
        doc.setCharSpace(1.2);
        doc.text(`LESSON ${deckIdx + 1}`, margin + 4, 78);
        doc.setCharSpace(0);

        doc.setFontSize(30);
        doc.setTextColor(255, 255, 255);
        const titleLines = doc.splitTextToSize(deck.lessonTitle || slide.title || 'Untitled Lesson', pageW - 90);
        doc.text(titleLines, margin + 4, 92);

        // Short accent rule under the title.
        const ruleY = 92 + titleLines.length * 12 + 4;
        doc.setFillColor(...accent);
        doc.rect(margin + 4, ruleY, 42, 1.6, 'F');

        const subtitle = String((slide.bullets || slide.content || [])[0] || '').trim();
        if (isSubstantiveSlideSubtitle(subtitle, { title: deck.lessonTitle || slide.title })) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(12);
          doc.setTextColor(220, 230, 245);
          doc.text(doc.splitTextToSize(String(subtitle), pageW - 110), margin + 4, ruleY + 10);
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        doc.text(`${slideIdx + 1} / ${slides.length}`, pageW - margin, pageH - 16, { align: 'right' });
        return;
      }

      // ── Content page ────────────────────────────────────────────────────
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageW, pageH, 'F');
      // Accent side bar.
      doc.setFillColor(...primary);
      doc.rect(0, 0, barW, pageH, 'F');

      // Kicker: lesson label, tracked uppercase.
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...secondary);
      doc.setCharSpace(0.8);
      doc.text(String(lessonLabel).toUpperCase(), contentX, margin + 2);
      doc.setCharSpace(0);

      // Slide title.
      doc.setFontSize(19);
      doc.setTextColor(...primary);
      const titleLines = doc.splitTextToSize(slide.title || '', contentW - 20);
      doc.text(titleLines, contentX, margin + 12);
      const titleBottom = margin + 12 + (titleLines.length - 1) * 8.5;

      // Accent underline.
      doc.setFillColor(...accent);
      doc.rect(contentX, titleBottom + 3.5, 28, 1.2, 'F');

      // Bullets with round markers.
      let y = titleBottom + 14;
      const bullets = slide.bullets || slide.content || [];
      const speakerNotes = slide.speakerNotes || slide.notes;
      const notesH = speakerNotes ? 26 : 0;
      const bulletBottom = pageH - margin - notesH;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11.5);
      bullets.forEach((bullet) => {
        const lines = doc.splitTextToSize(String(bullet), contentW - 8);
        const blockH = lines.length * 6;
        if (y + blockH > bulletBottom) return;
        doc.setFillColor(...secondary);
        doc.circle(contentX + 1.4, y - 1.4, 1.4, 'F');
        doc.setTextColor(...bodyText);
        doc.text(lines, contentX + 6.5, y, { lineHeightFactor: 1.5 });
        y += lines.length * 6.2 + 3.5;
      });

      // Speaker-notes panel: tinted, accent-ruled, clearly secondary.
      if (speakerNotes) {
        const notesY = pageH - notesH - 8;
        doc.setFillColor(...light);
        doc.rect(barW, notesY, pageW - barW, notesH + 8, 'F');
        doc.setFillColor(...accent);
        doc.rect(barW, notesY, pageW - barW, 0.9, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...secondary);
        doc.setCharSpace(0.7);
        doc.text('SPEAKER NOTES', contentX, notesY + 6.5);
        doc.setCharSpace(0);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(80, 90, 105);
        const noteLines = doc.splitTextToSize(String(speakerNotes), contentW);
        doc.text(noteLines.slice(0, 3), contentX, notesY + 12, { lineHeightFactor: 1.35 });
      }

      // Page chip, bottom right.
      doc.setFillColor(...primary);
      doc.roundedRect(pageW - margin - 16, pageH - 12.5, 16, 7, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text(`${slideIdx + 1} / ${slides.length}`, pageW - margin - 8, pageH - 7.8, { align: 'center' });
    });
  });

  const blob = doc.output('blob');
  saveAs(blob, `${courseName || 'Course'} - Slide Decks.pdf`);
}
