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
      modeLabel: 'Review only',
      selectedFeatureCount: 4,
      readyFeatureCount: 2,
      missingFeatureCount: 1,
      staleFeatureCount: 1,
      failedFeatureCount: 1,
      packageStatus: expect.objectContaining({ label: 'Needs attention' }),
      planStatus: expect.objectContaining({ hasPlan: true, label: '1 done, 1 sent' }),
    });
    expect(summary.selectedFeatureLabels).toEqual(['Lesson Plans', 'Slide Decks', 'Quiz & Exam Bank']);
    expect(summary.hiddenSelectedFeatureCount).toBe(1);
  });

  it('renders compact status chips above the composer', () => {
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
    expect(html).toContain('Working set');
    expect(html).toContain('Slide Decks');
    expect(html).toContain('Brief');
    expect(html).toContain('prompt + 2 materials + 2 source notes');
    expect(html).toContain('Mode');
    expect(html).toContain('Local tools');
    expect(html).toContain('3 lessons');
    expect(html).toContain('1 ready, 1 running, 1 stale');
    expect(html).toContain('Package');
    expect(html).toContain('Finishing');
    expect(html).toContain('Selected: Slide Decks, Rubrics');
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

    expect(html).toContain('data-testid="agent-working-plan"');
    expect(html).toContain('Plan');
    expect(html).toContain('1 running, 1 blocked');
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
              'audit-quality|Audit quality|audit-package|agent-receipt': { status: 'done' },
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

  it('renders recent Agent activity chips above the composer', () => {
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
                'audit-quality|Audit quality|audit-package|agent-receipt': { status: 'done' },
              },
            },
          },
        ]}
      />,
    );

    expect(html).toContain('data-testid="agent-working-activity-0"');
    expect(html).toContain('Planning receipt');
    expect(html).toContain('1 done');
  });

  it('does not render before the workspace has course or deliverable context', () => {
    const html = renderToStaticMarkup(<AgentWorkingSetPanel deliverables={{}} selectedFeatures={[]} />);

    expect(html).toBe('');
  });
});
