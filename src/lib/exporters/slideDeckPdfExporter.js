import { safeImport } from '../safeImport';
import { assertTableRowsHaveNoInternalExportLanguage } from '../exportTextInspector';
import { expandKeys } from '../keyMaps';
import { loadPdfRuntime } from '../pdfRuntime';

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
  const margin = 12;
  const contentW = pageW - margin * 2;

  decks.forEach((deck, deckIdx) => {
    const slides = deck.slides || [];
    slides.forEach((slide, slideIdx) => {
      if (deckIdx > 0 || slideIdx > 0) doc.addPage();

      doc.setFillColor(30, 58, 138);
      doc.rect(0, 0, pageW, 18, 'F');

      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(147, 197, 253);
      const lessonLabel = deck.lessonTitle || deck.title || `Lesson ${deckIdx + 1}`;
      doc.text(lessonLabel, margin, 7);

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      const titleText = slide.title || '';
      const titleLines = doc.splitTextToSize(titleText, contentW - 40);
      doc.text(titleLines, margin, 14);

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(147, 197, 253);
      doc.text(`${slideIdx + 1} / ${slides.length}`, pageW - margin, 14, { align: 'right' });

      let y = 26;
      const bullets = slide.bullets || slide.content || [];
      if (bullets.length > 0) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 30, 30);
        bullets.forEach((bullet) => {
          const lines = doc.splitTextToSize(`- ${bullet}`, contentW);
          if (y + lines.length * 5 > pageH - 28) return;
          doc.text(lines, margin, y);
          y += lines.length * 5 + 1;
        });
      }

      const speakerNotes = slide.speakerNotes || slide.notes;
      if (speakerNotes) {
        const notesY = pageH - 24;
        doc.setFillColor(248, 250, 252);
        doc.rect(0, notesY - 4, pageW, pageH - notesY + 4, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.line(0, notesY - 4, pageW, notesY - 4);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 116, 139);
        doc.text('Speaker Notes:', margin, notesY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        const noteLines = doc.splitTextToSize(speakerNotes, contentW);
        doc.text(noteLines.slice(0, 2), margin, notesY + 5);
      }
    });
  });

  const blob = doc.output('blob');
  saveAs(blob, `${courseName || 'Course'} - Slide Decks.pdf`);
}
