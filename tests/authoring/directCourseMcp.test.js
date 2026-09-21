import { describe, it, expect, vi } from 'vitest';
import { createCourseMcpService, editableFields } from '../../src/lib/courseMcp/service.js';
import { registerCourseTools } from '../../src/lib/courseMcp/webmcp.js';

function fixture() {
  let snapshot = {
    courseMap: {
      courseName: 'Original',
      lessons: [{ id: 'lesson-1', title: 'Lesson', sections: [{ learningGoals: 'Understand' }] }],
    },
    deliverables: {
      assignments: { data: [{ title: 'Task' }], authoredContent: { teacherOverride: [{ title: 'Task' }] } },
    },
    courseGraph: { enrichmentOverlay: { retained: 'source evidence' } },
    packageQualityPass: { status: 'passed' },
    chatHistory: [{ content: 'private chat' }],
    promptText: 'private prompt',
  };
  const workspace = {
    getSnapshot: () => snapshot,
    apply: vi.fn((next) => {
      snapshot = next;
    }),
    save: vi.fn(async () => true),
    isBusy: () => false,
  };
  const ctx = { allowed: true, accessKey: 'a', workspace, onChange: vi.fn() };
  return { ctx, workspace, service: createCourseMcpService(() => ctx) };
}
async function edit(f, changes = [{ path: '/courseMap/courseName', value: 'Updated' }], operationId = 'edit-1') {
  const read = await f.service.execute('cm_course_read');
  const args = { expectedRevision: read.data.revision, operationId, changes };
  return { args, result: await f.service.execute('cm_course_edit', args) };
}
describe('direct course WebMCP', () => {
  it('does not expose content before access, and never returns credentials, source files or conversations', async () => {
    const f = fixture();
    f.ctx.allowed = false;
    expect((await f.service.execute('cm_course_read')).error.code).toBe('ACCESS_REQUIRED');
    expect((await f.service.execute('cm_course_status')).data.connected).toBe(false);
    f.ctx.allowed = true;
    const read = await f.service.execute('cm_course_read');
    expect(read.data.courseMap.courseName).toBe('Original');
    expect(JSON.stringify(read)).not.toContain('private');
    expect(read.data.editableFields).not.toContain('/courseMap/lessons/0/id');
  });
  it('applies and durably saves edits with one-call retry receipts and a guarded undo', async () => {
    const f = fixture();
    const { args, result } = await edit(f);
    expect(result.data.localSave).toBe('saved');
    expect(f.workspace.getSnapshot().courseMap.courseName).toBe('Updated');
    expect(f.workspace.getSnapshot().deliverables.assignments.stale).toBe(true);
    expect(f.workspace.getSnapshot().courseGraph.enrichmentOverlay.retained).toBe('source evidence');
    expect(f.workspace.getSnapshot().packageQualityPass).toBeNull();
    expect(await f.service.execute('cm_course_edit', args)).toEqual(result);
    expect(f.workspace.apply).toHaveBeenCalledTimes(1);
    const undo = await f.service.execute('cm_course_undo', {
      expectedRevision: result.data.revision,
      operationId: 'undo-1',
    });
    expect(undo.ok).toBe(true);
    expect(f.workspace.getSnapshot().courseMap.courseName).toBe('Original');
  });
  it('rejects stale reads and refuses to undo over a manual edit', async () => {
    const f = fixture();
    const { args, result } = await edit(f);
    expect((await f.service.execute('cm_course_edit', { ...args, operationId: 'different' })).error.code).toBe(
      'REVISION_CONFLICT',
    );
    f.workspace.getSnapshot().courseMap.courseName = 'Human edit';
    const read = await f.service.execute('cm_course_read');
    expect(read.data.revision).not.toBe(result.data.revision);
    expect(
      (await f.service.execute('cm_course_undo', { expectedRevision: read.data.revision, operationId: 'undo' })).error
        .code,
    ).toBe('UNDO_UNAVAILABLE');
  });
  it('validates the whole batch before changing anything, including protected identifiers', async () => {
    const f = fixture();
    const { result } = await edit(f, [
      { path: '/courseMap/courseName', value: 'New' },
      { path: '/courseMap/lessons/0/id', value: 'other' },
    ]);
    expect(result.error.code).toBe('INVALID_INPUT');
    expect(f.workspace.apply).not.toHaveBeenCalled();
    expect(editableFields(JSON.parse('{"__proto__":{"attack":"x"},"name":"safe"}'))).toEqual({ '/name': 'safe' });
  });
  it('preserves authored material edits in the export/reload layer', async () => {
    const f = fixture();
    await edit(f, [{ path: '/materials/assignments/0/title', value: 'Edited task' }]);
    const entry = f.workspace.getSnapshot().deliverables.assignments;
    expect(entry.authoredContent.teacherOverride).toEqual(entry.data);
    expect(entry.data[0].title).toBe('Edited task');
  });
  it('reports applied-but-unsaved edits honestly and retains undo', async () => {
    const f = fixture();
    f.workspace.save.mockResolvedValue(false);
    const { result } = await edit(f);
    expect(result.data).toMatchObject({ applied: true, localSave: 'failed', canUndo: true });
  });
  it('rejects writes during generation and idempotency-key reuse with different content', async () => {
    const f = fixture();
    const { args } = await edit(f);
    expect((await f.service.execute('cm_course_edit', { ...args, changes: [] })).error.code).toBe(
      'IDEMPOTENCY_CONFLICT',
    );
    f.workspace.isBusy = () => true;
    expect((await f.service.execute('cm_course_edit', { ...args, operationId: 'other' })).error.code).toBe('BUSY');
  });
  it('revokes access immediately and clears old undo when another account connects', async () => {
    const f = fixture();
    await edit(f);
    f.ctx.allowed = false;
    expect((await f.service.execute('cm_course_read')).error.code).toBe('ACCESS_REQUIRED');
    f.ctx.allowed = true;
    f.ctx.accessKey = 'another-account';
    const read = await f.service.execute('cm_course_read');
    expect(
      (await f.service.execute('cm_course_undo', { expectedRevision: read.data.revision, operationId: 'undo' })).error
        .code,
    ).toBe('UNDO_UNAVAILABLE');
  });
  it('registers only once through remounts and invalidates retained callbacks on disposal', async () => {
    const registered = new Map();
    const view = {};
    view.top = view;
    const document = {
      defaultView: view,
      modelContext: {
        registerTool: vi.fn((tool) => registered.set(tool.name, tool)),
        unregisterTool: vi.fn((name) => registered.delete(name)),
      },
    };
    const f = fixture();
    const release = registerCourseTools(document, f.service);
    release();
    const releaseAgain = registerCourseTools(document, f.service);
    await new Promise((r) => setTimeout(r, 0));
    expect(registered.size).toBe(4);
    expect(document.modelContext.registerTool).toHaveBeenCalledTimes(4);
    const retained = registered.get('cm_course_read');
    releaseAgain();
    await new Promise((r) => setTimeout(r, 0));
    expect(registered.size).toBe(0);
    expect((await retained.execute({})).error.code).toBe('ACCESS_REQUIRED');
  });
});
