import { describe, it, expect } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { createIndexedDbStore } from '../../src/lib/authoring/indexedDbStore.js';
import { createAuthoringService, LOCAL_PRINCIPAL } from '../../src/lib/authoringCore/service.js';
import { id, hash, bytes, LIMITS } from '../../src/lib/authoringCore/primitives.js';
import { request } from './helpers.js';
import { prepareSourceSnapshots } from '../../src/lib/authoringCore/sourceSnapshots.js';

async function context(sources = []) {
  const store = createIndexedDbStore({ indexedDB, name: `pages-${id()}` });
  const service = createAuthoringService({ store });
  const created = await service.createRequest(request, LOCAL_PRINCIPAL, { idempotencyKey: id(), sources });
  const requestId = created.data.requestId;
  const call = (name, args = {}) => service.execute(`cm_v2_${name}`, { requestId, ...args }, LOCAL_PRINCIPAL);
  return { store, service, requestId, call };
}

describe('authorized revision-bound pagination', () => {
  it.each([
    'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJmaXh0dXJlIn0.c2lnbmF0dXJl',
    ...['', 'RSA ', 'EC ', 'DSA ', 'OPENSSH ', 'ENCRYPTED '].map(
      (kind) => `-----BEGIN ${kind}PRIVATE KEY-----\nZml4dHVyZS1vbmx5\n-----END ${kind}PRIVATE KEY-----`,
    ),
  ])('redacts standalone credential fixture %# before storage and authorized reading', async (secret) => {
    const source = {
      sourceId: 'source',
      title: `Title ${secret}`,
      excerpts: [{ excerptId: 'excerpt', text: `Before ${secret} after` }],
    };
    const ctx = await context([source]);
    const record = await ctx.store.get(ctx.requestId);
    expect(JSON.stringify(record)).not.toContain(secret);
    expect(record.sources[0]).toMatchObject({ title: 'Title [redacted secret]', redacted: true });
    const read = await ctx.call('read_content', {
      contentId: 'source:excerpt',
      expectedRevision: record.sources[0].sourceRevision,
    });
    expect(read.data.text).toBe('Before [redacted secret] after');
    const [reviewed] = await prepareSourceSnapshots(record.sources);
    expect(reviewed).toEqual(record.sources[0]);
    expect(source.excerpts[0].text).toContain(secret);
  });

  it('preserves ordinary dotted notation and public PEM certificates', async () => {
    const text = 'x.y.z; -----BEGIN CERTIFICATE-----\nPUBLIC\n-----END CERTIFICATE-----';
    const [source] = await prepareSourceSnapshots([
      { sourceId: 'a', title: 'Example', excerpts: [{ excerptId: 'e', text }] },
    ]);
    expect(source.excerpts[0].text).toBe(text);
    expect(source.redacted).toBe(false);
  });

  it('enumerates more than 200 requests and rejects cursors from a changed authorized view', async () => {
    const ctx = await context();
    const original = await ctx.store.get(ctx.requestId);
    for (let i = 0; i < 205; i++) {
      const key = await hash(i);
      await ctx.store.cas(key, null, { ...original, id: key, request: { ...request, title: `Request ${i}` } });
    }
    const call = (args = {}, principal = LOCAL_PRINCIPAL) =>
      ctx.service.execute('cm_v2_list_requests', args, principal);
    const first = await call();
    let page = first,
      found = [];
    do {
      expect(page.ok).toBe(true);
      expect(bytes(page)).toBeLessThanOrEqual(LIMITS.pageBytes);
      found.push(...page.data.requests.map((x) => x.requestId));
      page = page.data.cursor ? await call({ cursor: page.data.cursor }) : null;
    } while (page);
    expect(new Set(found).size).toBe(206);
    expect((await call({ cursor: 'missing-request' })).error.code).toBe('INVALID_CURSOR');
    expect(
      (await call({ cursor: first.data.cursor }, { ...LOCAL_PRINCIPAL, requestIds: [ctx.requestId] })).error.code,
    ).toBe('INVALID_CURSOR');
    await ctx.service.createRequest(request, LOCAL_PRINCIPAL, { idempotencyKey: id() });
    expect((await call({ cursor: first.data.cursor })).error.code).toBe('INVALID_CURSOR');
  });

  it('returns every search match without mixing queries or changed source snapshots', async () => {
    const sources = [
      {
        sourceId: 'source',
        sourceRevision: await hash('revision'),
        title: '中文'.repeat(300),
        excerpts: Array.from({ length: 95 }, (_, i) => ({ excerptId: `excerpt-${i}`, text: `needle ${i}` })),
      },
    ];
    const ctx = await context(sources);
    let page = await ctx.call('search_content', { query: 'needle' });
    const firstCursor = page.data.cursor;
    const matches = [];
    do {
      expect(bytes(page)).toBeLessThanOrEqual(LIMITS.pageBytes);
      matches.push(...page.data.matches.map((x) => x.contentId));
      page = page.data.cursor ? await ctx.call('search_content', { query: 'needle', cursor: page.data.cursor }) : null;
    } while (page);
    expect(new Set(matches).size).toBe(95);
    expect((await ctx.call('search_content', { query: 'different', cursor: firstCursor })).error.code).toBe(
      'INVALID_CURSOR',
    );
    const record = await ctx.store.get(ctx.requestId);
    record.sources[0].excerpts[0].text = 'needle updated';
    const previous = record.storageVersion++;
    await ctx.store.cas(record.id, previous, record);
    expect((await ctx.call('search_content', { query: 'needle', cursor: firstCursor })).error.code).toBe(
      'INVALID_CURSOR',
    );
  });

  it('roundtrips Unicode and escaped controls within the serialized byte limit and binds read cursors to content', async () => {
    const text = 'x'.repeat(2999) + '🌍' + '\u0001'.repeat(5000) + '中文🌍'.repeat(3000);
    const revision = await hash(text);
    const ctx = await context([
      {
        sourceId: 'source',
        sourceRevision: revision,
        title: 'Source',
        excerpts: [
          { excerptId: 'a', text },
          { excerptId: 'b', text },
        ],
      },
    ]);
    const record = await ctx.store.get(ctx.requestId);
    const args = { contentId: 'source:a', expectedRevision: record.sources[0].sourceRevision };
    let page = await ctx.call('read_content', args);
    const cursor = page.data.cursor;
    let restored = '';
    do {
      expect(page.ok).toBe(true);
      expect(bytes(page)).toBeLessThanOrEqual(LIMITS.pageBytes);
      expect(page.data.text.isWellFormed()).toBe(true);
      restored += page.data.text;
      page = page.data.cursor ? await ctx.call('read_content', { ...args, cursor: page.data.cursor }) : null;
    } while (page);
    expect(restored).toBe(text);
    expect((await ctx.call('read_content', { ...args, contentId: 'source:b', cursor })).error.code).toBe(
      'INVALID_CURSOR',
    );
    expect((await ctx.call('read_content', { ...args, cursor: '3000' })).error.code).toBe('INVALID_CURSOR');
  });
  it('redacts source secrets before storage and derives revisions from the exposed snapshot', async () => {
    const secret = 'sk-proj-' + 'a'.repeat(30);
    const ctx = await context([
      {
        sourceId: 'source',
        sourceRevision: 'f'.repeat(64),
        title: 'Shared source',
        excerpts: [{ excerptId: 'excerpt', text: `Before ${secret} after` }],
      },
    ]);
    const record = await ctx.store.get(ctx.requestId);
    expect(JSON.stringify(record)).not.toContain(secret);
    expect(record.sources[0].redacted).toBe(true);
    expect(record.sources[0].sourceRevision).not.toBe('f'.repeat(64));
    const result = await ctx.call('read_content', {
      contentId: 'source:excerpt',
      expectedRevision: record.sources[0].sourceRevision,
    });
    expect(result.data.text).toBe('Before [redacted secret] after');
    expect(
      (await ctx.call('read_content', { contentId: 'source:excerpt', expectedRevision: 'f'.repeat(64) })).error.code,
    ).toBe('SOURCE_CHANGED');
    await expect(
      context([
        {
          sourceId: 'source',
          title: 'Invalid',
          excerpts: [
            { excerptId: 'a', text: 'one' },
            { excerptId: 'a', text: 'two' },
          ],
        },
      ]),
    ).rejects.toThrow('Duplicate excerpt');
  });
});
