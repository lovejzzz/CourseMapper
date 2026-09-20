import { id, bytes } from '../authoringCore/primitives.js';
import { prepareSourceSnapshots } from '../authoringCore/sourceSnapshots.js';

export const SOURCE_FILE_LIMIT = 5 * 1024 * 1024;
const textTypes = new Set(['txt', 'md', 'csv']);
const documentTypes = new Set(['pdf', 'docx', 'pptx', 'rtf', 'html', 'htm', 'xlsx', 'odt', 'odp', 'ods']);

// Explicit local extraction only. No model, OCR, remote upload or URL fetch.
export async function extractSourceFile(file, parser) {
  if (file.size > SOURCE_FILE_LIMIT) throw new Error('Choose a source file smaller than 5 MB.');
  const extension = file.name.split('.').pop().toLowerCase();
  const supported = textTypes.has(extension) || documentTypes.has(extension);
  let text = '',
    status = 'unavailable';
  if (supported) {
    try {
      const parse = parser || (await import('../fileParser.js')).parseFile;
      text = await parse(file);
      status = text.trim() ? 'text-extracted' : 'unavailable';
    } catch {
      // Parser errors can contain source text. Expose a bounded status instead.
      status = 'unavailable';
    }
  }
  if (bytes(text) > 512 * 1024) throw new Error('Extracted text exceeds 512 KB. Share a smaller document or excerpt.');
  const [source] = await prepareSourceSnapshots([
    {
      sourceId: id(),
      title: file.name,
      excerpts: text.trim() ? [{ excerptId: id(), text }] : [],
      extraction: { status, visualStatus: textTypes.has(extension) ? 'not-applicable' : 'unreviewed' },
    },
  ]);
  return source;
}
