import { expandKeys } from '../keyMaps.js';
import { renderedDeliverableCollection } from '../renderedDeliverableRoot.js';
import { assertTableRowsHaveNoInternalExportLanguage } from '../exportTextInspector.js';
import { classroomPdfDefinition, downloadClassroomPdf } from './classroomPdf.js';

// Printable slide handout: retain every bullet and the full teacher notes.
// Long authored slides may continue onto another page instead of silently
// dropping bullets or truncating notes to three lines.
export function slideDeckPdfDefinition(data, courseName) {
  const decks = renderedDeliverableCollection('slideDecks', expandKeys('slideDecks', data));
  const content = [];
  const inspection = [];
  for (const deck of decks) {
    for (const [index, slide] of (deck.slides || []).entries()) {
      const title = slide.title || `Slide ${index + 1}`;
      const notes = slide.speakerNotes || slide.notes || '';
      const bullets = slide.bullets || slide.content || [];
      const subtitle = slide.subtitle || '';
      const altText = slide.visual?.altText || '';
      const lesson = deck.lessonTitle || deck.title || courseName || 'Course';
      inspection.push([lesson, title, subtitle, ...bullets.map(String), notes, altText]);
      content.push(
        {
          text: `${lesson} · Slide ${index + 1}`,
          fontSize: 10,
          color: '#596779',
          margin: [0, 0, 0, 10],
          ...(content.length ? { pageBreak: 'before' } : {}),
        },
        { text: title, fontSize: 23, bold: true, color: '#1F3864', margin: [0, 0, 0, 14] },
      );
      if (subtitle) content.push({ text: subtitle, fontSize: 15, margin: [0, 0, 0, 12] });
      if (bullets.length)
        content.push({ ul: bullets.map((text) => ({ text: String(text), margin: [0, 0, 0, 8] })), fontSize: 15 });
      if (altText)
        content.push({ text: `Visual description: ${altText}`, fontSize: 10, italics: true, margin: [0, 12, 0, 6] });
      if (notes)
        content.push({
          text: [{ text: 'Speaker notes: ', bold: true }, { text: notes }],
          fontSize: 10,
          margin: [0, 12, 0, 0],
        });
    }
  }
  if (!content.length) throw new Error('No slides to export');
  assertTableRowsHaveNoInternalExportLanguage({ headers: ['Slide content'], rows: inspection }, 'Slide Decks', 'PDF');
  return classroomPdfDefinition(content, courseName, 'Slide Decks', { pageOrientation: 'landscape' });
}

export async function exportSlideDeckPdf(data, courseName) {
  return downloadClassroomPdf(slideDeckPdfDefinition(data, courseName), `${courseName || 'Course'} - Slide Decks.pdf`);
}
