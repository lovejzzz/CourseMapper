import { redactSecretText } from './secretText.js';
import { assert, bytes, hash } from './primitives.js';

export function redactSourceText(text) {
  return redactSecretText(text)
    .replace(
      /-----BEGIN ((?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY)-----[\s\S]*?-----END \1-----/g,
      '[redacted secret]',
    )
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted secret]');
}

// Store only the reviewed text view. Revisions identify the exposed (redacted)
// snapshot, so callers cannot combine original offsets with sanitized content.
export async function prepareSourceSnapshots(sources) {
  assert(Array.isArray(sources), 'INVALID_INPUT', 'Sources must be a list of text snapshots.');
  assert(bytes(sources) <= 1048576, 'PAYLOAD_TOO_LARGE', 'Share a smaller source selection.');
  const ids = new Set();
  return Promise.all(
    sources.map(async (source) => {
      assert(
        source && typeof source === 'object' && /^[a-zA-Z0-9_-]{1,50}$/.test(source.sourceId || ''),
        'INVALID_INPUT',
        'A source needs a stable source ID.',
      );
      assert(!ids.has(source.sourceId), 'INVALID_INPUT', 'Duplicate source ID.');
      ids.add(source.sourceId);
      assert(
        typeof source.title === 'string' && source.title.length <= 2000 && Array.isArray(source.excerpts),
        'INVALID_INPUT',
        'A source needs a title and text excerpts.',
      );
      const excerptIds = new Set();
      const excerpts = source.excerpts.map((excerpt) => {
        assert(
          excerpt && /^[a-zA-Z0-9_-]{1,50}$/.test(excerpt.excerptId || '') && typeof excerpt.text === 'string',
          'INVALID_INPUT',
          'Each excerpt needs an ID and text.',
        );
        assert(!excerptIds.has(excerpt.excerptId), 'INVALID_INPUT', 'Duplicate excerpt ID.');
        excerptIds.add(excerpt.excerptId);
        return { excerptId: excerpt.excerptId, text: redactSourceText(excerpt.text) };
      });
      const extraction = source.extraction;
      if (extraction) {
        assert(
          ['text-extracted', 'unavailable'].includes(extraction.status) &&
            ['not-applicable', 'unreviewed'].includes(extraction.visualStatus),
          'INVALID_INPUT',
          'Unknown source extraction state.',
        );
        assert(
          extraction.status !== 'text-extracted' || excerpts.some((e) => e.text.trim()),
          'INVALID_INPUT',
          'Extracted sources need readable text.',
        );
        assert(
          extraction.status !== 'unavailable' || excerpts.length === 0,
          'INVALID_INPUT',
          'An unavailable source cannot claim text excerpts.',
        );
      }
      const view = {
        sourceId: source.sourceId,
        title: redactSourceText(source.title),
        excerpts,
        ...(extraction ? { extraction: { status: extraction.status, visualStatus: extraction.visualStatus } } : {}),
      };
      return {
        ...view,
        sourceRevision: await hash(view),
        redacted:
          source.redacted === true ||
          JSON.stringify(excerpts) !== JSON.stringify(source.excerpts) ||
          view.title !== source.title,
      };
    }),
  );
}
