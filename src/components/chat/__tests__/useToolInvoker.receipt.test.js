import { describe, expect, it } from 'vitest';
import {
  buildModelAgentReceiptFromProgress,
  deriveModelAgentReceiptIntent,
  shouldNotifyDirectDeliverableEdit,
  projectAgentDeliverableActionToCanonicalPatch,
} from '../useToolInvoker';

describe('buildModelAgentReceiptFromProgress', () => {
  it('summarizes model-driven edits and checks as a completed Agent receipt', () => {
    const receiptMessage = buildModelAgentReceiptFromProgress(
      {
        status: 'complete',
        startedAt: 100,
        endedAt: 350,
        runMeta: {
          mode: 'Auto-fix',
          target: 'Lesson Plans',
          providerCallCount: 2,
          maxProviderCallCount: 20,
          stopReason: 'respond',
        },
        steps: [
          {
            tool: 'edit_deliverables',
            label: 'Edit deliverables',
            status: 'done',
            summary: '2 changes applied',
            targets: ['Lesson Plans'],
            startedAt: 125,
            endedAt: 250,
          },
          {
            tool: 'validate_course',
            label: 'Validate course materials',
            status: 'done',
            summary: '0 issues',
            targets: ['Package'],
          },
        ],
      },
      { runId: 'agent-run-test' },
    );

    expect(receiptMessage).toMatchObject({
      role: 'agentReceipt',
      runId: 'agent-run-test',
      receipt: {
        title: 'Content update receipt',
        status: 'done',
        badge: 'Complete',
        mode: 'Auto-fix',
        target: 'Lesson Plans, Package',
        intent: expect.objectContaining({
          type: 'content_edit',
          label: 'Content update',
          mutatesWorkspace: true,
          readOnly: false,
        }),
        runStats: {
          toolCount: 2,
          actionCount: 1,
          checkCount: 1,
          issueCount: 0,
          readOnly: false,
          mutatesWorkspace: true,
          providerCallCount: 2,
          maxProviderCallCount: 20,
          stopReason: 'respond',
          durationMs: 250,
        },
        toolManifest: [
          {
            tool: 'edit_deliverables',
            label: 'Edit deliverables',
            status: 'done',
            summary: '2 changes applied',
            targets: ['Lesson Plans'],
            durationMs: 125,
          },
          {
            tool: 'validate_course',
            label: 'Validate course materials',
            status: 'done',
            summary: '0 issues',
            targets: ['Package'],
          },
        ],
        changed: ['Edit deliverables: 2 changes applied'],
        checked: ['Validate course materials: 0 issues'],
        next: 'Audit quality or plan the next downstream update from the changed workspace.',
      },
    });
  });

  it('makes read-only model runs explicit instead of implying hidden edits', () => {
    const receiptMessage = buildModelAgentReceiptFromProgress(
      {
        status: 'complete',
        steps: [
          {
            tool: 'inspect_workspace',
            label: 'Inspect workspace',
            status: 'done',
            summary: 'Found 8 generated sections',
            targets: ['Workspace'],
          },
          {
            tool: 'plan_workspace_next_step',
            label: 'Plan next step',
            status: 'done',
            summary: 'Highest impact: sync stale deck',
            targets: ['Workspace'],
          },
        ],
      },
      { dryRun: true, activeTab: 'slideDecks' },
    );

    expect(receiptMessage.receipt).toMatchObject({
      title: 'Workspace plan ready',
      status: 'done',
      mode: 'No workspace edits',
      target: 'Workspace',
      intent: expect.objectContaining({
        type: 'workspace_plan',
        label: 'Workspace plan',
        readOnly: true,
      }),
      changed: ['No workspace edits'],
      checked: ['Inspect workspace: Found 8 generated sections', 'Plan next step: Highest impact: sync stale deck'],
      next: 'Choose a plan action, or run a quality audit before changing content.',
    });
  });

  it('marks partial and failed tool outcomes as review or blocked receipts', () => {
    const reviewReceipt = buildModelAgentReceiptFromProgress({
      status: 'complete',
      steps: [
        {
          tool: 'edit_deliverables',
          label: 'Edit deliverables',
          status: 'partial',
          summary: '2 applied - 1 failed',
          targets: ['Study Guides'],
        },
      ],
    });
    const blockedReceipt = buildModelAgentReceiptFromProgress({
      status: 'error',
      steps: [
        {
          tool: 'finalize_package',
          label: 'Finish package',
          status: 'error',
          summary: 'Course FAQ failed to generate',
          targets: ['Package'],
        },
      ],
    });

    expect(reviewReceipt.receipt).toMatchObject({
      title: 'Content update needs review',
      status: 'review',
      badge: 'Review',
      issues: ['Edit deliverables: 2 applied - 1 failed'],
      next: 'Review the partial result before applying more changes.',
    });
    expect(blockedReceipt.receipt).toMatchObject({
      title: 'Package finish needs attention',
      status: 'blocked',
      badge: 'Blocked',
      intent: expect.objectContaining({
        type: 'finish_package',
        label: 'Package finish',
      }),
      issues: ['Finish package: Course FAQ failed to generate'],
      next: 'Review the package issue, then retry the smallest safe finish action.',
    });
  });

  it('classifies the highest-impact tool intent from a mixed model tool batch', () => {
    expect(
      deriveModelAgentReceiptIntent([{ tool: 'inspect_workspace' }, { tool: 'review_package_readiness' }]),
    ).toMatchObject({
      type: 'package_audit',
      label: 'Quality audit',
      toolNames: ['inspect_workspace', 'review_package_readiness'],
      toolCount: 2,
      readOnly: true,
    });

    expect(
      deriveModelAgentReceiptIntent([{ tool: 'plan_workspace_next_step' }, { tool: 'finalize_package' }]),
    ).toMatchObject({
      type: 'finish_package',
      label: 'Package finish',
      mutatesWorkspace: true,
    });
  });

  it('does not create empty receipts before tool activity exists', () => {
    expect(buildModelAgentReceiptFromProgress({ status: 'complete', steps: [] })).toBeNull();
    expect(buildModelAgentReceiptFromProgress(null)).toBeNull();
  });
});

describe('projectAgentDeliverableActionToCanonicalPatch', () => {
  it('projects agent artifact edits into canonical course-map patches', () => {
    const projection = projectAgentDeliverableActionToCanonicalPatch(
      {
        type: 'editItem',
        featureId: 'lessonPlans',
        path: ['lessonPlans', 0, 'learningObjectives'],
        value: ['Analyze validation evidence before choosing a model.'],
      },
      {
        courseMap: {
          lessons: [
            {
              title: 'Model Evaluation',
              sections: [{ learningObjectives: 'Explain model evaluation.' }],
            },
          ],
        },
        deliverables: {
          lessonPlans: {
            status: 'done',
            data: {
              lessonPlans: [
                { lessonTitle: 'Lesson 1: Model Evaluation', learningObjectives: ['Explain model evaluation.'] },
              ],
            },
          },
        },
      },
    );

    expect(projection.patch).toMatchObject({
      field: 'learningObjectives',
      label: 'learning objectives',
      lessonIndex: 0,
      sourceFeatureId: 'lessonPlans',
    });
    expect(projection.patch.value).toContain('Analyze validation evidence');
    expect(projection.editContext.toLowerCase()).toContain('learning objectives');
  });

  it('classifies local slide wording edits as artifact-local', () => {
    const projection = projectAgentDeliverableActionToCanonicalPatch(
      {
        type: 'editItem',
        featureId: 'slideDecks',
        path: ['decks', 0, 'slides', 1, 'title'],
        value: 'Cleaner slide title',
      },
      {
        courseMap: {
          lessons: [{ title: 'Model Evaluation', sections: [{ topicSection: 'Evaluation metrics' }] }],
        },
        deliverables: {
          slideDecks: {
            status: 'done',
            data: {
              decks: [
                {
                  lessonTitle: 'Lesson 1: Model Evaluation',
                  slides: [{ title: 'Intro' }, { title: 'Old slide title' }],
                },
              ],
            },
          },
        },
      },
    );

    expect(projection).toMatchObject({
      localOnly: true,
      editContext: expect.stringContaining('Cleaner slide title'),
    });
  });

  it('lets chat skip stale sync notifications for local-only direct edits', () => {
    expect(
      shouldNotifyDirectDeliverableEdit({
        action: 'editItem',
        featureId: 'slideDecks',
        lessonIndex: 0,
        success: true,
        syncPolicy: 'localOnly',
        localOnly: true,
      }),
    ).toBe(false);

    expect(
      shouldNotifyDirectDeliverableEdit({
        action: 'editItem',
        featureId: 'slideDecks',
        lessonIndex: 0,
        success: true,
        syncPolicy: 'auto',
      }),
    ).toBe(true);

    expect(
      shouldNotifyDirectDeliverableEdit({
        action: 'editItem',
        featureId: 'slideDecks',
        lessonIndex: 0,
        success: false,
        syncPolicy: 'auto',
      }),
    ).toBe(false);
  });

  it('queues ambiguous course-design artifact edits as canonical patch requests', () => {
    const projection = projectAgentDeliverableActionToCanonicalPatch(
      {
        type: 'editItem',
        featureId: 'lessonPlans',
        path: ['lessonPlans', 0, 'customInstruction'],
        value: 'Use a named patient-triage dataset for every practice task.',
      },
      {
        courseMap: {
          lessons: [{ title: 'Model Evaluation', sections: [{ topicSection: 'Evaluation metrics' }] }],
        },
        deliverables: {
          lessonPlans: {
            status: 'done',
            data: {
              lessonPlans: [{ lessonTitle: 'Lesson 1: Model Evaluation', customInstruction: 'Use sample data.' }],
            },
          },
        },
      },
    );

    expect(projection.patch).toBeUndefined();
    expect(projection.patchRequest).toMatchObject({
      sourceFeatureId: 'lessonPlans',
      lessonIndex: 0,
      label: 'course-design edit',
      artifactValue: 'Use a named patient-triage dataset for every practice task.',
      confidence: 'needs-model-mapping',
    });
    expect(projection.canonicalPatchRequests).toHaveLength(1);
  });
});
