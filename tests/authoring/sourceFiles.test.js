import { describe, it, expect, vi } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { extractSourceFile, SOURCE_FILE_LIMIT } from '../../src/lib/authoring/sourceFiles.js';
import { prepareSourceSnapshots } from '../../src/lib/authoringCore/sourceSnapshots.js';
import { createAuthoringService, LOCAL_PRINCIPAL } from '../../src/lib/authoringCore/service.js';
import { createIndexedDbStore } from '../../src/lib/authoring/indexedDbStore.js';
import { request } from './helpers.js';

const file = (name) => ({ name, size: 100 });
describe('reviewed attachment snapshots', () => {
  it('redacts text before exposing it and keeps the same revision when shared again', async () => {
    const source = await extractSourceFile(
      file('notes.txt'),
      async () => 'Lesson notes sk-proj-1234567890123456789012345',
    );
    expect(source.excerpts[0].text).toBe('Lesson notes [redacted secret]');
    expect(source.redacted).toBe(true);
    expect(source.extraction).toEqual({ status: 'text-extracted', visualStatus: 'not-applicable' });
    expect((await prepareSourceSnapshots([source]))[0]).toEqual(source);
  });
  it('does not claim to have read scans or images, nor leak parser errors', async () => {
    const parse = vi.fn(async () => {
      throw new Error('PRIVATE CONTENT IN A PARSER ERROR');
    });
    const image = await extractSourceFile(file('scan.png'), parse);
    expect(parse).not.toHaveBeenCalled();
    expect(image.excerpts).toEqual([]);
    const pdf = await extractSourceFile(file('scan.pdf'), parse);
    expect(pdf.extraction).toEqual({ status: 'unavailable', visualStatus: 'unreviewed' });
    expect(JSON.stringify(pdf)).not.toContain('PRIVATE CONTENT');
    const document = await extractSourceFile(file('notes.docx'), async () => 'Readable text');
    expect(document.extraction).toEqual({ status: 'text-extracted', visualStatus: 'unreviewed' });
  });
  it('rejects oversized files and extracted text without silently truncating', async () => {
    const parse = vi.fn();
    await expect(extractSourceFile({ name: 'big.txt', size: SOURCE_FILE_LIMIT + 1 }, parse)).rejects.toThrow('5 MB');
    expect(parse).not.toHaveBeenCalled();
    await expect(extractSourceFile(file('big.txt'), async () => 'x'.repeat(600000))).rejects.toThrow('512 KB');
  });
  it('exposes extraction limitations in context and contracts and never invents readable excerpts', async () => {
    const source = await extractSourceFile(file('scan.png'));
    const store = createIndexedDbStore({ indexedDB, name: `sources-${crypto.randomUUID()}` });
    const service = createAuthoringService({ store });
    const created = await service.createRequest(
      { ...request, sourcePolicy: 'explicit-shared-snapshots' },
      LOCAL_PRINCIPAL,
      { sources: [source], idempotencyKey: 'sources' },
    );
    const requestId = created.data.requestId;
    const context = await service.execute('cm_v2_get_context', { requestId }, LOCAL_PRINCIPAL);
    expect(context.data.sources[0].extraction.status).toBe('unavailable');
    const contract = await service.execute(
      'cm_v2_get_generation_contract',
      { requestId, kind: 'course-plan' },
      LOCAL_PRINCIPAL,
    );
    expect(contract.data.sources[0].extraction.visualStatus).toBe('unreviewed');
    const search = await service.execute('cm_v2_search_content', { requestId, query: 'scan' }, LOCAL_PRINCIPAL);
    expect(search.data.matches).toEqual([]);
    await expect(
      prepareSourceSnapshots([{ ...source, excerpts: [{ excerptId: 'false', text: 'claimed scan contents' }] }]),
    ).rejects.toThrow('unavailable');
  });
});
