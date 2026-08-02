import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AgentWorkingSetPanel, { buildAgentWorkingSetSummary } from '../AgentWorkingSetPanel';
import { getWorkspacePlanActionKey } from '../WorkspacePlanCard';
import { buildAgentSourceContextMessage } from '../../../lib/agentSourceContext';
import { buildLandingAgentContextMessages } from '../../../lib/landingAgentContext';

const courseMap = {
  courseName: 'Applied ML',
  lessons: [{ title: 'Lesson 1' }, { title: 'Lesson 2' }, { title: 'Lesson 3' }],
};

const workspacePlan = {
  actions: [
    {
      priority: 'P0',
      title: 'Audit package warnings',
      safeMode: 'review-only',
      target: 'Package',
      intent: { type: 'audit_package', featureIds: ['lessonPlans'] },
    },
    {
      priority: 'P1',
      title: 'Sync stale slide decks',
      safeMode: 'needs-approval',
      target: 'Slide Decks',
      intent: { type: 'sync_stale_deliverables', featureIds: ['slideDecks'] },
    },
  ],
};

describe('AgentWorkingSetPanel', () => {
  it('summarizes the Agent working set from current workspace state', () => {
    const summary = buildAgentWorkingSetSummary({
      courseMap,
      activeTab: 'lessonPlans',
      selectedFeatures: ['courseMap', 'lessonPlans', 'slideDecks', 'quizBank', 'studyGuides'],
      lessonScope: { type: 'specific', indices: [0, 2] },
      pendingSyncFeatureIds: ['slideDecks'],
      packageQualityPass: { status: 'blocked', blockers: 1 },
      agentDryRun: true,
      deliverables: {
        lessonPlans: { status: 'done', data: { lessonPlans: [] } },
        slideDecks: { status: 'done', stale: true, data: { slideDecks: [] } },
        quizBank: { status: 'failed', error: 'Provider failed' },
      },
      messages: [
        {
          role: 'workspacePlan',
          plan: workspacePlan,
          actionStates: {
            [getWorkspacePlanActionKey(workspacePlan.actions[0], 0)]: { status: 'done' },
            [getWorkspacePlanActionKey(workspacePlan.actions[1], 1)]: { status: 'sent' },
          },
        },
      ],
    });

    expect(summary).toMatchObject({
      activeTarget: 'Lesson Plans',
      scopeLabel: '2/3 lessons',
      toolStateLabel: 'AI connected',
      selectedFeatureCount: 4,
      readyFeatureCount: 2,
      missingFeatureCount: 1,
      staleFeatureCount: 1,
      failedFeatureCount: 1,
      packageStatus: expect.objectContaining({ label: 'Refine' }),
      planStatus: expect.objectContaining({ hasPlan: true, label: '1 done, 1 sent' }),
    });
    expect(summary.selectedFeatureLabels).toEqual(['Lesson Plans', 'Slide Decks', 'Quiz & Exam Bank']);
    expect(summary.hiddenSelectedFeatureCount).toBe(1);
  });

  it.each([
    ['bigint', (receipt) => ({ ...receipt, adversarialValue: 1n })],
    [
      'circular',
      (receipt) => {
        const circular = { ...receipt };
        circular.self = circular;
        return circular;
      },
    ],
    [
      'accessor',
      (receipt) => {
        const accessor = { ...receipt };
        Object.defineProperty(accessor, 'dynamic', { enumerable: true, get: () => 'value' });
        return accessor;
      },
    ],
    [
      'non-enumerable property',
      (receipt) => {
        const hidden = { ...receipt };
        Object.defineProperty(hidden, 'hidden', { value: 'state', enumerable: false });
        return hidden;
      },
    ],
    ['sparse array', (receipt) => ({ ...receipt, adversarialValue: Array(1) })],
  ])('shows Refine in Agent when Export must reject an invalid %s receipt', (_label, makeInvalidReceipt) => {
    const packageQualityPass = {
      status: 'ready',
      blockers: 0,
      warnings: 0,
      quality: { status: 'graded', score: 100, grade: 'A', findingCounts: { p0: 0, p1: 0, p2: 0 } },
      receipt: makeInvalidReceipt({ exportFailed: 0, exportWarningCount: 0 }),
    };
    const summary = buildAgentWorkingSetSummary({
      courseMap,
      selectedFeatures: ['courseMap'],
      packageQualityPass,
    });
    const html = renderToStaticMarkup(
      <AgentWorkingSetPanel
        courseMap={courseMap}
        selectedFeatures={['courseMap']}
        packageQualityPass={packageQualityPass}
      />,
    );

    expect(summary.packageStatus.label).toBe('Refine');
    expect(html).toContain('Refine');
    expect(html).not.toContain('Package ready');
  });

  it('renders a compact status receipt above the conversation', () => {
    const messages = [
      ...buildLandingAgentContextMessages({
        promptText: 'Build an applied machine learning lab course.',
        files: [{ name: 'syllabus.pdf' }],
        parsedFiles: [{ name: 'syllabus.pdf', text: 'Weekly notebook labs and model evaluation.' }],
      }),
      buildAgentSourceContextMessage([{ name: 'rubric.docx', text: 'Use model cards and validation evidence.' }]),
    ].filter(Boolean);
    const html = renderToStaticMarkup(
      <AgentWorkingSetPanel
        courseMap={courseMap}
        activeTab="slideDecks"
        selectedFeatures={['courseMap', 'slideDecks', 'rubrics']}
        messages={messages}
        pendingSyncFeatureIds={['slideDecks']}
        packageQualityPass={{ status: 'running' }}
        isAgentProviderReady={false}
        deliverables={{
          slideDecks: { status: 'done', stale: true, data: { slideDecks: [] } },
          rubrics: { status: 'generating' },
        }}
      />,
    );

    expect(html).toContain('data-testid="agent-working-set-panel"');
    expect(html).toContain('Finishing package');
    expect(html).toContain('3 lessons');
    expect(html).toContain('1 ready, 1 running');
    expect(html).toContain('Finishing');
    expect(html).toContain('Details');
    expect(html).not.toContain('prompt + 2 materials + 2 source notes');
    expect(html).not.toContain('Local tools');
    expect(html).not.toContain('stale');
    expect(html).not.toContain('Selected');
  });

  it('surfaces the latest workspace plan state in the working set', () => {
    const actionStates = {
      [getWorkspacePlanActionKey(workspacePlan.actions[0], 0)]: { status: 'error' },
      [getWorkspacePlanActionKey(workspacePlan.actions[1], 1)]: { status: 'running' },
    };
    const html = renderToStaticMarkup(
      <AgentWorkingSetPanel
        courseMap={courseMap}
        activeTab="lessonPlans"
        selectedFeatures={['courseMap', 'lessonPlans', 'slideDecks']}
        messages={[
          { role: 'workspacePlan', plan: { actions: [{ title: 'Old plan step' }] } },
          { role: 'workspacePlan', plan: workspacePlan, actionStates },
        ]}
        deliverables={{
          lessonPlans: { status: 'done', data: { lessonPlans: [] } },
          slideDecks: { status: 'done', data: { slideDecks: [] } },
        }}
      />,
    );

    expect(html).toContain('Workspace ready');
    expect(html).toContain('Details');
    expect(html).not.toContain('Plan:');
    expect(html).not.toContain('1 running, 1 blocked');
    expect(html).not.toContain('Old plan step');
  });

  it('marks untouched workspace plans as ready in the working set', () => {
    const summary = buildAgentWorkingSetSummary({
      courseMap,
      selectedFeatures: ['courseMap', 'lessonPlans'],
      deliverables: { lessonPlans: { status: 'done', data: { lessonPlans: [] } } },
      messages: [{ role: 'workspacePlan', plan: workspacePlan }],
    });

    expect(summary.planStatus).toMatchObject({
      hasPlan: true,
      label: '2 ready',
    });
  });

  it('keeps no-key restored workspaces calm while local checks are available', () => {
    const summary = buildAgentWorkingSetSummary({
      courseMap,
      selectedFeatures: ['courseMap', 'lessonPlans'],
      isAgentProviderReady: false,
      deliverables: { lessonPlans: { status: 'done', data: { lessonPlans: [] } } },
    });
    const html = renderToStaticMarkup(
      <AgentWorkingSetPanel
        courseMap={courseMap}
        selectedFeatures={['courseMap', 'lessonPlans']}
        isAgentProviderReady={false}
        deliverables={{ lessonPlans: { status: 'done', data: { lessonPlans: [] } } }}
      />,
    );

    expect(summary.toolStateLabel).toBe('Local checks available');
    expect(html).toContain('Workspace open');
    expect(html).toContain('3 lessons');
    expect(html).toContain('1 ready');
    expect(html).not.toContain('Needs your decision');
  });

  it('summarizes recent Agent activity from receipts and run progress', () => {
    const summary = buildAgentWorkingSetSummary({
      courseMap,
      selectedFeatures: ['courseMap', 'lessonPlans'],
      deliverables: { lessonPlans: { status: 'done', data: { lessonPlans: [] } } },
      messages: [
        {
          role: 'agentProgress',
          status: 'complete',
          steps: [
            { tool: 'inspect_workspace', label: 'Inspect workspace', status: 'done' },
            { tool: 'plan_workspace_next_step', label: 'Plan next step', status: 'done' },
          ],
        },
        {
          role: 'agentReceipt',
          receipt: {
            title: 'Planning receipt',
            status: 'done',
            target: 'Workspace',
            actionStates: {
              'audit-quality|Check package|audit-package|agent-receipt': { status: 'done' },
            },
          },
        },
      ],
    });

    expect(summary.activityStatus).toMatchObject({
      hasActivity: true,
      activities: [
        expect.objectContaining({ title: 'Planning receipt', label: '1 done' }),
        expect.objectContaining({ title: 'Run complete', label: '2 tools' }),
      ],
    });
  });

  it('renders recent Agent activity in the compact receipt', () => {
    const html = renderToStaticMarkup(
      <AgentWorkingSetPanel
        courseMap={courseMap}
        selectedFeatures={['courseMap', 'lessonPlans']}
        deliverables={{ lessonPlans: { status: 'done', data: { lessonPlans: [] } } }}
        messages={[
          {
            role: 'agentReceipt',
            receipt: {
              title: 'Planning receipt',
              status: 'done',
              target: 'Workspace',
              actionStates: {
                'audit-quality|Check package|audit-package|agent-receipt': { status: 'done' },
              },
            },
          },
        ]}
      />,
    );

    expect(html).toContain('Workspace ready');
    expect(html).not.toContain('Planning receipt');
    expect(html).not.toContain('1 done');
  });

  it('does not duplicate package summaries in the working-set activity strip', () => {
    const summary = buildAgentWorkingSetSummary({
      courseMap,
      selectedFeatures: ['courseMap', 'lessonPlans'],
      deliverables: { lessonPlans: { status: 'done', data: { lessonPlans: [] } } },
      messages: [
        {
          role: 'packageSummary',
          summary: {
            ready: true,
            confidence: 'Excellent',
            tone: 'excellent',
          },
        },
      ],
    });
    const html = renderToStaticMarkup(
      <AgentWorkingSetPanel
        courseMap={courseMap}
        selectedFeatures={['courseMap', 'lessonPlans']}
        deliverables={{ lessonPlans: { status: 'done', data: { lessonPlans: [] } } }}
        messages={[
          {
            role: 'packageSummary',
            summary: {
              ready: true,
              confidence: 'Excellent',
              tone: 'excellent',
            },
          },
        ]}
      />,
    );

    expect(summary.activityStatus).toMatchObject({ hasActivity: false, activities: [] });
    expect(html).not.toContain('Package check');
    expect(html).not.toContain('Excellent');
  });

  it('names a generation failure as a stopped build instead of a finish review', () => {
    const props = {
      courseMap,
      selectedFeatures: ['courseMap', 'lessonPlans'],
      deliverables: {},
      packageQualityPass: { status: 'blocked', blockers: 1 },
      generationError: 'AI generation failed: Course map generation stopped at 2 of 3 lessons.',
    };
    const summary = buildAgentWorkingSetSummary(props);
    const html = renderToStaticMarkup(<AgentWorkingSetPanel {...props} />);

    expect(summary.packageStatus.label).toBe('Build stopped');
    expect(html).toContain('Build stopped');
    expect(html).not.toContain('Package refinement');
  });

  it('does not render before the workspace has course or deliverable context', () => {
    const html = renderToStaticMarkup(<AgentWorkingSetPanel deliverables={{}} selectedFeatures={[]} />);

    expect(html).toBe('');
  });
});
