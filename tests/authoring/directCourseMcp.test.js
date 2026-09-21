import { describe, it, expect, vi } from 'vitest';
import { createCourseMcpService } from '../../src/lib/courseMcp/service.js';
import { registerCourseTools } from '../../src/lib/courseMcp/webmcp.js';
import { diagnoseCourseOutput } from '../../src/lib/courseMcp/diagnostics.js';
function fixture() {
  const snapshot = {
    courseMap: { courseName: 'Output audit', lessons: [{ title: 'Logic' }] },
    deliverables: {
      quizBank: {
        data: {
          quizzes: [
            {
              lessonNumber: 1,
              lessonTitle: 'Logic',
              practiceRecord: {
                records: [
                  'Record A - Objective: Explain logic.',
                  'Record B - Evidence target: cite evidence.',
                  'Record C - Decision boundary: limit claims.',
                  'Record D - Required product: quiz.',
                ],
              },
              questions: [
                { id: 'q1', question: 'Use Record A', answer: 'General guidance', sourceReviewRequired: true },
              ],
            },
          ],
        },
      },
    },
    chatHistory: [{ text: 'private conversation' }],
    apiKey: 'secret',
  };
  const ctx = { allowed: true, accessKey: 'a', workspace: { getSnapshot: () => snapshot } };
  return { snapshot, ctx, service: createCourseMcpService(() => ctx) };
}
describe('read-only course output MCP', () => {
  it('finds actual output gaps without modifying the course', async () => {
    const f = fixture();
    const before = JSON.stringify(f.snapshot);
    const result = await f.service.execute('cm_course_diagnostics');
    expect(result.data.findings.map((x) => x.code)).toEqual(['METADATA_ONLY_PRACTICE', 'REFERENCE_ANSWERS_UNREVIEWED']);
    expect(result.data.paths).toContain('/materials/quizBank');
    expect(JSON.stringify(result)).not.toMatch(/private conversation|secret/);
    expect(JSON.stringify(f.snapshot)).toBe(before);
  });
  it('does not expose output without page permission or provide editing tools', async () => {
    const f = fixture();
    f.ctx.allowed = false;
    expect((await f.service.execute('cm_course_read')).error.code).toBe('ACCESS_REQUIRED');
    f.ctx.allowed = true;
    expect((await f.service.execute('cm_course_edit')).error.code).toBe('UNKNOWN_TOOL');
  });
  it('reads selected material paths and rejects private or inherited paths', async () => {
    const f = fixture();
    const result = await f.service.execute('cm_course_read', { path: '/materials/quizBank/quizzes/0/questions/0' });
    expect(JSON.parse(result.data.text).id).toBe('q1');
    for (const path of ['/apiKey', '/chatHistory', '/courseMap/__proto__'])
      expect((await f.service.execute('cm_course_read', { path })).error.code).toBe('INVALID_PATH');
  });
  it('bounds large output and protects continued reads against changed content', async () => {
    const f = fixture();
    f.snapshot.courseMap.description = 'x'.repeat(25000);
    const first = await f.service.execute('cm_course_read');
    expect(first.data.text.length).toBe(12000);
    expect(first.data.nextOffset).toBe(12000);
    const next = await f.service.execute('cm_course_read', { offset: 12000, expectedRevision: first.data.revision });
    expect(next.ok).toBe(true);
    f.snapshot.courseMap.courseName = 'Changed';
    expect(
      (await f.service.execute('cm_course_read', { offset: 12000, expectedRevision: first.data.revision })).error.code,
    ).toBe('REVISION_CONFLICT');
  });
  it('checks revocation after asynchronous hashing', async () => {
    const f = fixture();
    const pending = f.service.execute('cm_course_read');
    f.ctx.allowed = false;
    expect((await pending).error.code).toBe('ACCESS_REQUIRED');
  });
  it('does not treat concrete practice inputs as lesson-metadata cases', () => {
    const f = fixture();
    f.snapshot.deliverables.quizBank.data.quizzes[0].practiceRecord.records = ['P=T, Q=F', 'P=F, Q=T'];
    expect(diagnoseCourseOutput(f.snapshot).findings.some((x) => x.code === 'METADATA_ONLY_PRACTICE')).toBe(false);
  });
  it('registers exactly three read-only tools through remount and invalidates disposed handles', async () => {
    const registered = new Map();
    const view = {};
    view.top = view;
    const doc = {
      defaultView: view,
      modelContext: {
        registerTool: vi.fn((t) => registered.set(t.name, t)),
        unregisterTool: vi.fn((n) => registered.delete(n)),
      },
    };
    const f = fixture();
    const release = registerCourseTools(doc, f.service);
    release();
    const again = registerCourseTools(doc, f.service);
    await new Promise((r) => setTimeout(r, 0));
    expect(registered.size).toBe(3);
    expect([...registered.values()].every((t) => t.annotations.readOnlyHint)).toBe(true);
    const retained = registered.get('cm_course_read');
    again();
    await new Promise((r) => setTimeout(r, 0));
    expect((await retained.execute({})).error.code).toBe('ACCESS_REQUIRED');
  });
});
