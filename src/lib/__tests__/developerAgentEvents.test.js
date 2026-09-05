import { describe, expect, it } from 'vitest';
import { buildDeveloperAgentEvents } from '../developerAgentEvents';

describe('developerAgentEvents', () => {
  it('derives a structured event log from persisted chat history', () => {
    const { events, counts } = buildDeveloperAgentEvents({
      chatHistory: [
        { role: 'user', text: 'Improve lesson 1 discussion.' },
        {
          role: 'agentProgress',
          status: 'complete',
          steps: [
            { tool: 'read_deliverable', label: 'Read discussion', status: 'done', summary: 'Read 1 item' },
            { tool: 'edit_deliverables', label: 'Edit discussion', status: 'partial', summary: '1 applied, 1 failed' },
          ],
        },
        {
          role: 'changeSummary',
          summary: {
            applied: 1,
            failed: 1,
            changes: [{ featureId: 'discussions', type: 'changed', count: 1 }],
          },
        },
        {
          role: 'workspacePlan',
          plan: {
            evidence: { generatedFeatureCount: 2, staleFeatureCount: 1, failedFeatureCount: 0 },
            highestImpactAction: {
              title: 'Sync stale deliverables: Discussion Prompts',
              safeMode: 'needs-approval',
            },
          },
        },
        {
          role: 'agentReceipt',
          receipt: {
            title: 'Sync receipt',
            status: 'done',
            target: 'Discussion Prompts',
            intent: { type: 'content_edit' },
            runStats: {
              toolCount: 2,
              actionCount: 1,
              checkCount: 1,
              providerCallCount: 2,
              stopReason: 'respond',
              mutatesWorkspace: true,
            },
            toolManifest: [
              { tool: 'edit_deliverables', label: 'Edit deliverables', status: 'done' },
              { tool: 'validate_course', label: 'Validate course materials', status: 'done' },
            ],
            changed: ['Synced Discussion Prompts'],
            checked: ['Approved sync plan'],
            next: 'Check the sync card for final status.',
          },
        },
        { role: 'assistant', text: 'I updated one discussion prompt.' },
      ],
    });

    expect(counts.total).toBe(8);
    expect(counts.tools).toBe(2);
    expect(counts.warning).toBeGreaterThan(0);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'user', title: 'User request' }),
        expect.objectContaining({ type: 'agentRun', status: 'complete' }),
        expect.objectContaining({ type: 'tool', tool: 'edit_deliverables', level: 'warning' }),
        expect.objectContaining({ type: 'changeSummary', level: 'warning' }),
        expect.objectContaining({ type: 'workspacePlan', title: 'Workspace plan' }),
        expect.objectContaining({
          type: 'agentReceipt',
          title: 'Sync receipt',
          level: 'success',
          summary: expect.stringContaining('2 tools'),
          details: expect.arrayContaining([
            'intent: content_edit',
            '2 tools, 2 model calls, 1 action, 1 check, edited workspace, stop: respond',
            'tools: Edit deliverables, Validate course materials',
          ]),
        }),
      ]),
    );
  });

  it('redacts secret-like text in event summaries', () => {
    const { events } = buildDeveloperAgentEvents({
      chatHistory: [{ role: 'user', text: 'Do not expose sk-proj-secretdeveloperkey1234567890 in logs.' }],
    });

    expect(events[0].summary).toContain('[redacted key]');
    expect(events[0].summary).not.toContain('sk-proj-secretdeveloperkey');
  });
});
