import { afterEach, describe, expect, it, vi } from 'vitest';
import { createResearchTransport } from '../knowledge/researchTransport.js';
import { assessResearchCurrency, shouldSkipCoveredScionResearch } from '../knowledge/researchFreshness.js';
import { planAlgiCourseResearch } from '../knowledge/algiResearchPlan.js';
import { buildAlgiEvidenceGraph, consolidateAlgiLessonEvidence } from '../knowledge/algiEvidenceGraph.js';

afterEach(() => vi.useRealTimers());

describe('Scion research transactions', () => {
  it('makes no request when research is off', () => {
    const fetchImpl = vi.fn();
    expect(createResearchTransport({ fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('serializes parallel callers and deduplicates repeated reads', async () => {
    let active = 0,
      peak = 0;
    const fetchImpl = vi.fn(async () => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      return { ok: true, status: 200, json: async () => ({ found: true }) };
    });
    const p = createResearchTransport({ enabled: true, gapMs: 0, fetchImpl });
    await Promise.all([
      p.httpJson('https://example.org/a'),
      p.httpJson('https://example.org/b'),
      p.httpJson('https://example.org/a'),
    ]);
    expect(peak).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' });
  });
  it('opens the circuit on the first 429 and continues with another origin', async () => {
    const fetchImpl = vi.fn(async (url) => ({
      ok: url.includes('other'),
      status: url.includes('other') ? 200 : 429,
      headers: { get: () => '3600' },
      json: async () => ({}),
    }));
    const p = createResearchTransport({ enabled: true, gapMs: 0, fetchImpl });
    await expect(p.httpJson('https://example.org/a')).rejects.toThrow('research-http-429');
    await expect(p.httpJson('https://example.org/b')).rejects.toMatchObject({ code: 'RESEARCH_ORIGIN_RATE_LIMITED' });
    await p.httpJson('https://other.org/a');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(Date.parse(p.diagnostics().rateLimitedOrigins[0].retryAt) - Date.now()).toBeGreaterThan(3590000);
  });
  it('bounds a stalled body and prevents recovery from resetting the deadline', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) }));
    const p = createResearchTransport({ enabled: true, gapMs: 0, timeoutMs: 8000, maxDurationMs: 25, fetchImpl });
    const rejection = expect(p.httpJson('https://example.org/stall')).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(30);
    await rejection;
    await expect(p.httpJson('https://other.org/recovery')).rejects.toMatchObject({ code: 'RESEARCH_DEADLINE' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('cancels immediately even when a custom fetch ignores its signal', async () => {
    const controller = new AbortController();
    const p = createResearchTransport({
      enabled: true,
      signal: controller.signal,
      fetchImpl: () => new Promise(() => {}),
    });
    const request = p.httpJson('https://example.org/a');
    await Promise.resolve();
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('does not confuse an index update or a retrieval with a publication', () => {
    const now = Date.UTC(2026, 8, 5);
    const p = { providerId: 'doaj', publishedAt: '2010', indexedAt: '2026-09-05', retrievedAt: '2026-09-05' };
    expect(assessResearchCurrency({ provenance: p }, { now }).status).toBe('background');
    expect(assessResearchCurrency({ provenance: { ...p, publishedAt: '' } }, { now }).status).toBe('undated');
    expect(assessResearchCurrency({ provenance: { ...p, publishedAt: '2030' } }, { now }).status).toBe('undated');
  });
  it('uses bounded publication filters only when the lesson needs current evidence', () => {
    const plan = planAlgiCourseResearch({
      courseName: 'Biology',
      lessons: [{ title: 'Recent microbiology research' }],
      now: Date.UTC(2026, 8, 5),
    });
    expect(plan.lessons[0].providerQueries['europe-pmc']).toContain('FIRST_PDATE:[2024-01-01 TO 2026-09-05]');
    expect(plan.lessons[0].providerQueries.doaj).toContain('bibjson.year:[2024 TO 2026]');
  });
  it('requires dated evidence for an updated lesson even when an undated ledger has enough claims', () => {
    const topic = 'Current biology';
    const k = {
      id: 'k',
      term: 'Biology',
      provenance: { providerId: 'doaj' },
      definition: { text: 'Biology studies life.', anchor: { src: 's', quote: 'Biology studies life.' } },
    };
    const plan = {
      lessons: [{ title: topic, lessonId: 'l', minimumClaims: 1, minimumSources: 1, timeSensitive: true }],
    };
    const graph = buildAlgiEvidenceGraph({ plan, kernelsByTopic: new Map([[topic, [k]]]) });
    expect(graph.lessons[0].status).toBe('needs-current-evidence');
    expect(consolidateAlgiLessonEvidence({ topic, kernels: [k], evidenceGraph: graph, minimum: 1 }).admitted).toBe(
      false,
    );
  });
  it('skips only an approved, source-covered plan without an update request', () => {
    const options = {
      instructorProvidedFacts: ['a', 'b', 'c'],
      instructionalPlan: { admission: { status: 'approved' } },
      sourceBrief: 'Calculate a sample proportion.',
    };
    expect(shouldSkipCoveredScionResearch(options)).toBe(true);
    expect(shouldSkipCoveredScionResearch({ ...options, sourceBrief: 'Use latest evidence.' })).toBe(false);
    expect(shouldSkipCoveredScionResearch({ ...options, instructionalPlan: null })).toBe(false);
  });
});
