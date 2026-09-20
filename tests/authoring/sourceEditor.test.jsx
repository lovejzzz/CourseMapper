import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import SourceEditor from '../../src/components/authoring/SourceEditor.jsx';

it('shows the exact stored snapshot as escaped text and preserves extraction limits', () => {
  const html = renderToStaticMarkup(
    <SourceEditor
      record={{
        drafts: {},
        sources: [
          {
            sourceId: 'source-1',
            title: 'Teacher note',
            excerpts: [
              { text: '<img src="https://tracking.invalid" onerror="alert(1)">' },
              { text: '中文 ratio note' },
            ],
            extraction: { status: 'text-extracted', visualStatus: 'unreviewed' },
            redacted: true,
          },
        ],
      }}
      onSave={() => {}}
    />,
  );
  expect(html).toContain('Review stored source: Teacher note');
  expect(html).toContain('&lt;img');
  expect(html).not.toContain('<img');
  expect(html).toContain('中文 ratio note');
  expect(html).toContain('Visual content remains unreviewed.');
  expect(html).toContain('Recognized credentials were redacted.');
});

it('does not suggest an unreadable source contains usable text', () => {
  const html = renderToStaticMarkup(
    <SourceEditor
      record={{
        revoked: true,
        drafts: {},
        sources: [
          {
            sourceId: 'scan',
            title: 'Unparsed scan',
            excerpts: [],
            extraction: { status: 'unavailable', visualStatus: 'unreviewed' },
          },
        ],
      }}
      onSave={() => {}}
    />,
  );
  expect(html).toContain('No readable text available.');
  expect(html).not.toContain('<pre');
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save shared sources/);
});
