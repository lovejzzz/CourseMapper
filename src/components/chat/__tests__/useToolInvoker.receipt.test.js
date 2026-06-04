import { describe, expect, it } from 'vitest';
import {
  buildAgentStateDiffsFromToolResult,
  buildModelAgentReceiptFromProgress,
  deriveAgentPlanningState,
  deriveAgentVerificationState,
  deriveModelAgentReceiptIntent,
  shouldRequirePlanningBeforeTool,
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
            stateDiffs: [
              {
                status: 'changed',
                action: 'editItem',
                target: 'Lesson Plans',
                featureId: 'lessonPlans',
                lessonIndex: 0,
                path: 'lessonPlans.0.learningObjectives',
                before: 'Explain model evaluation.',
                after: 'Analyze validation evidence.',
              },
            ],
          },
          {
            tool: 'read_deliverable',
            label: 'Read lesson plans',
            status: 'done',
            summary: 'Verified 2 lesson plans',
            targets: ['Lesson Plans'],
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
          toolCount: 3,
          actionCount: 1,
          checkCount: 2,
          issueCount: 0,
          readOnly: false,
          mutatesWorkspace: true,
          verificationStatus: 'verified',
          stateDiffCount: 1,
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
            tool: 'read_deliverable',
            label: 'Read lesson plans',
            status: 'done',
            summary: 'Verified 2 lesson plans',
            targets: ['Lesson Plans'],
          },
          {
            tool: 'validate_course',
            label: 'Validate course materials',
            status: 'done',
            summary: '0 issues',
            targets: ['Package'],
          },
        ],
        verification: expect.objectContaining({
          required: true,
          status: 'verified',
          checkedAfterMutation: true,
          label: 'Verified after mutation via Read lesson plans, Validate course materials',
          mutationTools: ['Edit deliverables'],
          verifierTools: ['Read lesson plans', 'Validate course materials'],
        }),
        changed: ['Edit deliverables: 2 changes applied'],
        checked: ['Read lesson plans: Verified 2 lesson plans', 'Validate course materials: 0 issues'],
        stateDiffs: [
          expect.objectContaining({
            status: 'changed',
            action: 'editItem',
            target: 'Lesson Plans',
            before: 'Explain model evaluation.',
            after: 'Analyze validation evidence.',
          }),
        ],
        next: 'Audit quality or plan the next downstream update from the changed workspace.',
        quality: expect.objectContaining({
          score: expect.any(Number),
          label: expect.any(String),
          dimensions: expect.arrayContaining([
            expect.objectContaining({ id: 'intent' }),
            expect.objectContaining({ id: 'safety' }),
            expect.objectContaining({ id: 'verification', score: 100 }),
            expect.objectContaining({ id: 'response', status: 'not_scored' }),
            expect.objectContaining({ id: 'recovery' }),
          ]),
        }),
      },
    });
    expect(receiptMessage.receipt.quality.score).toBeGreaterThanOrEqual(90);
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
      runStats: expect.objectContaining({
        verificationStatus: 'not_required',
      }),
      verification: expect.objectContaining({
        required: false,
        status: 'not_required',
      }),
      next: 'Choose a plan action, or run a quality audit before changing content.',
    });
  });

  it('marks clean mutations that skip read-back verification as review receipts', () => {
    const receiptMessage = buildModelAgentReceiptFromProgress({
      status: 'complete',
      steps: [
        {
          tool: 'edit_deliverables',
          label: 'Edit deliverables',
          status: 'done',
          summary: '1 change applied',
          targets: ['Quiz & Exam Bank'],
        },
      ],
    });

    expect(receiptMessage.receipt).toMatchObject({
      title: 'Content update needs review',
      status: 'review',
      badge: 'Review',
      runStats: expect.objectContaining({
        issueCount: 1,
        verificationStatus: 'missing',
      }),
      verification: expect.objectContaining({
        required: true,
        status: 'missing',
        checkedAfterMutation: false,
        issue: 'Verification missing after workspace mutation',
        mutationTools: ['Edit deliverables'],
      }),
      changed: ['Edit deliverables: 1 change applied'],
      checked: ['Tool result status'],
      issues: ['Verification missing after workspace mutation'],
      next: 'Read back the edited state before applying more changes or reporting it as complete.',
      quality: expect.objectContaining({
        dimensions: expect.arrayContaining([
          expect.objectContaining({
            id: 'verification',
            score: 20,
            status: 'fail',
          }),
        ]),
      }),
    });
    expect(receiptMessage.receipt.quality.score).toBeLessThan(85);
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

    expect(deriveModelAgentReceiptIntent([{ tool: 'save_preference' }])).toMatchObject({
      type: 'agent_memory',
      label: 'Agent memory',
      mutatesWorkspace: false,
      mutatesAgentState: true,
      readOnly: false,
    });
  });

  it('requires verification after the latest mutation, not just any earlier check', () => {
    expect(
      deriveAgentVerificationState([
        { tool: 'read_deliverable', label: 'Read quiz', status: 'done' },
        { tool: 'edit_deliverables', label: 'Edit deliverables', status: 'done' },
      ]),
    ).toMatchObject({
      status: 'missing',
      checkedAfterMutation: false,
    });

    expect(
      deriveAgentVerificationState([
        { tool: 'edit_course_map', label: 'Edit course map', status: 'done' },
        { tool: 'read_lesson', label: 'Read lesson', status: 'done' },
      ]),
    ).toMatchObject({
      status: 'verified',
      checkedAfterMutation: true,
      verifierTools: ['Read lesson'],
    });
  });

  it('requires planner evidence before serious package mutation when expected', () => {
    const plannedReceipt = buildModelAgentReceiptFromProgress(
      {
        status: 'complete',
        steps: [
          {
            tool: 'inspect_workspace',
            label: 'Inspect workspace',
            status: 'done',
            summary: 'Found package readiness gaps',
            targets: ['Workspace'],
          },
          {
            tool: 'repair_package_readiness',
            label: 'Repair package readiness',
            status: 'done',
            summary: '1 repaired, 0 failed',
            targets: ['Package'],
            stateDiffs: [
              {
                status: 'changed',
                action: 'repair_package_readiness',
                target: 'Quiz & Exam Bank',
                before: 'Generated deliverable state',
                after: 'added scoring metadata',
              },
            ],
          },
          {
            tool: 'review_package_readiness',
            label: 'Review package readiness',
            status: 'done',
            summary: '0 blockers',
            targets: ['Package'],
          },
        ],
      },
      {
        finalResponse: { chatReply: 'I inspected the workspace, repaired quiz metadata, and verified readiness.' },
        qualityExpectations: { intent: 'package_repair', requiresPlan: true, requiresVerification: true },
      },
    );
    const unplannedReceipt = buildModelAgentReceiptFromProgress(
      {
        status: 'complete',
        steps: [
          {
            tool: 'repair_package_readiness',
            label: 'Repair package readiness',
            status: 'done',
            summary: '1 repaired, 0 failed',
            targets: ['Package'],
            stateDiffs: [
              {
                status: 'changed',
                action: 'repair_package_readiness',
                target: 'Quiz & Exam Bank',
                before: 'Generated deliverable state',
                after: 'added scoring metadata',
              },
            ],
          },
          {
            tool: 'review_package_readiness',
            label: 'Review package readiness',
            status: 'done',
            summary: '0 blockers',
            targets: ['Package'],
          },
        ],
      },
      {
        finalResponse: { chatReply: 'I repaired quiz metadata and verified readiness.' },
        qualityExpectations: { intent: 'package_repair', requiresPlan: true, requiresVerification: true },
      },
    );

    expect(plannedReceipt.receipt.planning).toMatchObject({
      required: true,
      status: 'planned',
      checkedBeforeMutation: true,
      plannerTools: ['Inspect workspace'],
    });
    expect(plannedReceipt.receipt.runStats).toMatchObject({ planningStatus: 'planned' });
    expect(plannedReceipt.receipt.quality.score).toBeGreaterThanOrEqual(90);

    expect(unplannedReceipt.receipt.planning).toMatchObject({
      required: true,
      status: 'review',
      checkedBeforeMutation: false,
      issue: 'Planning did not happen before serious mutation.',
    });
    expect(unplannedReceipt.receipt.quality.score).toBeLessThan(plannedReceipt.receipt.quality.score);
    expect(unplannedReceipt.receipt.quality.dimensions.find((dimension) => dimension.id === 'intent')).toMatchObject({
      status: 'review',
      issues: ['Planning did not happen before serious mutation.'],
    });
  });

  it('does not require planner evidence for a simple targeted edit with read-back verification', () => {
    const planning = deriveAgentPlanningState([
      { tool: 'edit_course_map', label: 'Edit course map', status: 'done' },
      { tool: 'read_lesson', label: 'Read lesson', status: 'done' },
    ]);

    expect(planning).toMatchObject({
      required: false,
      status: 'not_required',
      hasPlan: false,
    });
  });

  it('blocks serious mutation tools until a prior planning step has completed', () => {
    expect(shouldRequirePlanningBeforeTool('finalize_package', [], { requiresPlan: true })).toBe(true);
    expect(
      shouldRequirePlanningBeforeTool(
        'repair_package_readiness',
        [{ tool: 'inspect_workspace', label: 'Inspect workspace', status: 'done' }],
        { requiresPlan: true },
      ),
    ).toBe(false);
    expect(
      shouldRequirePlanningBeforeTool(
        'edit_deliverables',
        [{ tool: 'inspect_workspace', label: 'Inspect workspace', status: 'error' }],
        { requiresPlan: true },
      ),
    ).toBe(true);
    expect(shouldRequirePlanningBeforeTool('edit_course_map', [], {})).toBe(false);
  });

  it('does not create empty receipts before tool activity exists', () => {
    expect(buildModelAgentReceiptFromProgress({ status: 'complete', steps: [] })).toBeNull();
    expect(buildModelAgentReceiptFromProgress(null)).toBeNull();
  });
});

describe('buildAgentStateDiffsFromToolResult', () => {
  it('extracts course-map before and after values from edit patches', () => {
    const diffs = buildAgentStateDiffsFromToolResult(
      'edit_course_map',
      { patches: [{ lessonIndex: 0, field: 'title', value: 'Verified Agent Loops' }] },
      { applied: 1, failed: 0, details: [{ patch: 'title', success: true, message: 'ok' }] },
      {
        courseMap: {
          lessons: [{ title: 'Old Agent Loops', sections: [{ topicSection: 'Agent loops' }] }],
        },
      },
    );

    expect(diffs).toEqual([
      expect.objectContaining({
        status: 'changed',
        action: 'editTitle',
        target: 'Course Map',
        path: 'title',
        before: 'Old Agent Loops',
        after: 'Verified Agent Loops',
      }),
    ]);
  });

  it('extracts deliverable edit diffs and preserves failed-action reasons', () => {
    const diffs = buildAgentStateDiffsFromToolResult(
      'edit_deliverables',
      {
        actions: [
          {
            type: 'editItem',
            featureId: 'quizBank',
            lessonIndex: 0,
            path: ['quizzes', 0, 'qs', 0, 'q'],
            value: 'What proves the verifier ran?',
          },
          {
            type: 'addItem',
            featureId: 'rubrics',
            lessonIndex: 99,
            item: { cn: 'Ghost criterion' },
          },
        ],
      },
      {
        applied: 1,
        failed: 1,
        details: [
          { action: 'editItem', featureId: 'quizBank', lessonIndex: 0, success: true, message: 'Updated' },
          {
            action: 'addItem',
            featureId: 'rubrics',
            lessonIndex: 99,
            success: false,
            message: 'Lesson index out of range.',
          },
        ],
      },
      {
        deliverables: {
          quizBank: {
            data: {
              quizzes: [{ qs: [{ q: 'What proves the tool ran?' }] }],
            },
          },
        },
      },
    );

    expect(diffs).toEqual([
      expect.objectContaining({
        status: 'changed',
        action: 'editItem',
        target: 'Quiz & Exam Bank',
        before: 'What proves the tool ran?',
        after: 'What proves the verifier ran?',
      }),
      expect.objectContaining({
        status: 'failed',
        action: 'addItem',
        target: 'Rubrics',
        after: 'Ghost criterion',
        reason: 'Lesson index out of range.',
      }),
    ]);
  });

  it('includes skipped mutation actions with reasons', () => {
    const diffs = buildAgentStateDiffsFromToolResult(
      'retry_package_weak_spots',
      { maxActions: 4 },
      {
        started: 0,
        pending: 0,
        failed: 0,
        details: [],
        skipped: [
          {
            featureId: 'courseFaq',
            lessonIndex: 3,
            message: 'FAQ item is missing.',
            reason: 'Issue needs whole-feature repair because the lesson item is missing or out of range.',
          },
        ],
      },
    );

    expect(diffs).toEqual([
      expect.objectContaining({
        status: 'skipped',
        action: 'skipped',
        target: 'Course FAQ',
        lessonIndex: 3,
        reason: 'Issue needs whole-feature repair because the lesson item is missing or out of range.',
      }),
    ]);
  });

  it('extracts package repair diffs from repaired feature summaries', () => {
    const diffs = buildAgentStateDiffsFromToolResult(
      'repair_package_readiness',
      {},
      {
        applied: 1,
        failed: 0,
        repairs: [
          {
            featureId: 'quizBank',
            label: 'Quiz & Exam Bank',
            success: true,
            changes: ['added scoring metadata', 'normalized point totals'],
            message: 'Quiz & Exam Bank repaired',
          },
        ],
      },
    );

    expect(diffs).toEqual([
      expect.objectContaining({
        status: 'changed',
        action: 'repair_package_readiness',
        target: 'Quiz & Exam Bank',
        featureId: 'quizBank',
        before: 'Generated deliverable state',
        after: 'added scoring metadata; normalized point totals',
      }),
    ]);
  });

  it('extracts finalize-package repair diffs without inventing unrelated changes', () => {
    const diffs = buildAgentStateDiffsFromToolResult(
      'finalize_package',
      {},
      {
        confidence: 'Good with assumptions',
        repairsApplied: 1,
        repairs: [
          {
            featureId: 'discussions',
            label: 'Discussion Prompts',
            success: true,
            changes: ['converted artifact labels to sourceArtifacts'],
          },
        ],
      },
    );

    expect(diffs).toEqual([
      expect.objectContaining({
        status: 'changed',
        action: 'finalize_package',
        target: 'Discussion Prompts',
        featureId: 'discussions',
        after: 'converted artifact labels to sourceArtifacts',
      }),
    ]);
  });

  it('extracts localized retry diffs from retry details', () => {
    const diffs = buildAgentStateDiffsFromToolResult(
      'retry_package_weak_spots',
      { maxActions: 2 },
      {
        started: 1,
        pending: 1,
        failed: 0,
        details: [
          {
            featureId: 'slideDecks',
            label: 'Slide Decks',
            lessonIndex: 0,
            source: 'readiness',
            success: true,
            pending: true,
            message: 'Regeneration started for slideDecks Lesson 1',
          },
        ],
      },
    );

    expect(diffs).toEqual([
      expect.objectContaining({
        status: 'pending',
        action: 'regenerateLesson',
        target: 'Slide Decks',
        featureId: 'slideDecks',
        lessonIndex: 0,
        before: 'readiness issue',
        after: 'Regeneration started for slideDecks Lesson 1',
      }),
    ]);
  });

  it('extracts undo diffs without claiming to know the restored field', () => {
    const diffs = buildAgentStateDiffsFromToolResult(
      'undo_last',
      {},
      { success: true, message: 'Last deliverable edit undone.' },
      { activeTab: 'lessonPlans' },
    );

    expect(diffs).toEqual([
      expect.objectContaining({
        status: 'changed',
        action: 'undo_last',
        target: 'Lesson Plans',
        before: 'Latest deliverable state',
        after: 'Last deliverable edit undone.',
      }),
    ]);
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
