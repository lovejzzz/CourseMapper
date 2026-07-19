import { describe, expect, it, vi } from 'vitest';
import {
  buildAgentStateDiffsFromToolResult,
  buildLocalReadOnlyFallback,
  buildModelAgentReceiptFromProgress,
  buildToolResultFallbackChatReply,
  chooseAgentFallbackText,
  deriveAgentPlanningState,
  deriveAgentVerificationState,
  deriveModelAgentReceiptIntent,
  ensureFinalResponseHasChatReply,
  findAmbiguousDeliverableMutationRequest,
  findBroadDestructiveWorkspaceMutationRequest,
  inferAgentQualityExpectations,
  normalizeAgentFinalResponse,
  stripInternalAgentMarkers,
  shouldRequirePlanningBeforeTool,
  shouldNotifyDirectDeliverableEdit,
  projectAgentDeliverableActionToCanonicalPatch,
  runAgentLoop,
} from '../useToolInvoker';

describe('buildToolResultFallbackChatReply', () => {
  it('summarizes successful mutations from tool results when the model omits a final response', () => {
    const reply = buildToolResultFallbackChatReply([
      {
        toolName: 'edit_deliverables',
        result: {
          featureId: 'assignments',
          applied: 1,
          failed: 0,
        },
      },
      {
        toolName: 'read_deliverable',
        result: {
          featureId: 'assignments',
          totalItems: 3,
        },
      },
    ]);

    expect(reply).toBe('Done. I updated the Assignment Briefs and verified the updated state.');
  });

  it('includes the changed value when tool args are available', () => {
    const reply = buildToolResultFallbackChatReply([
      {
        toolName: 'edit_deliverables',
        args: {
          actions: [
            {
              type: 'addItem',
              featureId: 'assignments',
              lessonIndex: 2,
              item: {
                title: 'Submission checklist',
                deliverables: ['Confirm file name', 'Check cited evidence'],
              },
            },
          ],
        },
        result: {
          featureId: 'assignments',
          applied: 1,
          failed: 0,
          details: [{ action: 'addItem', featureId: 'assignments', lessonIndex: 2, success: true }],
        },
      },
      {
        toolName: 'read_deliverable',
        result: {
          featureId: 'assignments',
          totalItems: 3,
        },
      },
    ]);

    expect(reply).toBe(
      'Done. I updated the Assignment Briefs and verified the updated state: Lesson 3: Submission checklist.',
    );
  });

  it('does not surface recovered internal tool failures after a later verified mutation succeeds', () => {
    const reply = buildToolResultFallbackChatReply([
      {
        toolName: 'edit_deliverables',
        result: {
          featureId: 'lessonPlans',
          error:
            'Serious workspace changes need planning before "edit_deliverables" can run. Call inspect_workspace first.',
        },
      },
      {
        toolName: 'inspect_workspace',
        result: {
          course: { lessonCount: 3 },
          generatedFeatureCount: 6,
          staleFeatureCount: 0,
          readiness: { blockerCount: 0 },
        },
      },
      {
        toolName: 'edit_deliverables',
        result: {
          featureId: 'lessonPlans',
          applied: 1,
          failed: 0,
        },
      },
      {
        toolName: 'read_deliverable',
        result: {
          featureId: 'lessonPlans',
          totalItems: 3,
        },
      },
    ]);

    expect(reply).toBe('Done. I updated the Lesson Plans and verified the updated state.');
  });

  it('keeps read-only fallback responses factual', () => {
    const reply = buildToolResultFallbackChatReply([
      {
        toolName: 'read_deliverable',
        result: {
          featureId: 'lessonPlans',
          totalItems: 3,
        },
      },
    ]);

    expect(reply).toBe('Done. I checked the workspace: 3 items loaded.');
  });

  it('preserves the checked target for read-only alignment fallbacks', () => {
    const reply = buildToolResultFallbackChatReply(
      [
        {
          toolName: 'validate_course',
          result: {
            errorCount: 0,
            warningCount: 0,
            infoCount: 0,
          },
        },
      ],
      { userMessage: 'Compare the quiz bank and lesson objectives.' },
    );

    expect(reply).toBe('Done. I checked quiz/objective alignment: 0 errors, 0 warnings, 0 info.');
  });

  it('uses missing-deliverable safety wording for failed mutation tools', () => {
    const reply = buildToolResultFallbackChatReply([
      {
        toolName: 'edit_deliverables',
        result: {
          featureId: 'rubrics',
          error: 'Rubrics has not been generated yet.',
        },
      },
    ]);

    expect(reply).toBe(
      'The Rubrics deliverable is not in this workspace yet, so I did not invent it. Generate rubrics first, then I can make that change.',
    );
  });
});

describe('ensureFinalResponseHasChatReply', () => {
  it('overrides contradictory failure text when verified mutation tools succeeded', () => {
    const response = ensureFinalResponseHasChatReply(
      {
        chatReply:
          'Renaming did not take effect in the verified course map: Lesson 2 still appears with the old title.',
      },
      [
        {
          toolName: 'edit_course_map',
          result: {
            applied: 1,
            failed: 0,
          },
        },
        {
          toolName: 'read_lesson',
          result: {
            sections: [{ topicSection: 'Format Handoff Decisions' }],
          },
        },
      ],
    );

    expect(response.chatReply).toBe('Done. I updated the Course Map and verified the updated state.');
  });

  it('does not allow a failed-only mutation to be reported as successful', () => {
    const response = ensureFinalResponseHasChatReply(
      {
        chatReply: 'Done. I renamed slide 1 to Export readiness checkpoint and verified it.',
      },
      [
        {
          toolName: 'edit_deliverables',
          result: {
            featureId: 'slideDecks',
            applied: 0,
            failed: 1,
            details: [
              {
                action: 'editItem',
                featureId: 'slideDecks',
                lessonIndex: 0,
                success: false,
                message:
                  'Serious workspace changes need planning before "edit_deliverables" can run. Call inspect_workspace first.',
              },
            ],
          },
        },
      ],
    );

    expect(response.chatReply).toContain('I could not complete');
    expect(response.chatReply).toContain('Serious workspace changes need planning');
    expect(response.chatReply).not.toContain('renamed slide 1');
  });
});

describe('findAmbiguousDeliverableMutationRequest', () => {
  const deliverables = {
    assignments: {
      status: 'done',
      data: {
        assignments: [
          { t: 'Evidence memo', ov: 'Write a memo.' },
          { t: 'Final portfolio', ov: 'Submit final work.' },
        ],
      },
    },
  };

  it('asks before editing an unspecified assignment when multiple assignments exist', () => {
    expect(findAmbiguousDeliverableMutationRequest('Shorten the assignment.', deliverables)).toMatchObject({
      featureId: 'assignments',
      count: 2,
    });
  });

  it('allows targeted assignment edits to proceed', () => {
    expect(findAmbiguousDeliverableMutationRequest('Shorten the Lesson 2 assignment.', deliverables)).toBeNull();
    expect(findAmbiguousDeliverableMutationRequest('Shorten "Final portfolio".', deliverables)).toBeNull();
  });
});

describe('normalizeAgentFinalResponse', () => {
  it('unwraps JSON-string chat replies returned inside respond args', () => {
    expect(
      normalizeAgentFinalResponse({
        chatReply: '{"chatReply":"Rewriting everything needs a scoped direction first."}',
      }),
    ).toMatchObject({
      chatReply: 'Rewriting everything needs a scoped direction first.',
    });
  });

  it('unwraps a JSON array of sentence fragments returned by browser-local Scion', () => {
    expect(
      normalizeAgentFinalResponse({
        chatReply:
          '["A melodic interval is heard one note after another","whereas a harmonic interval is heard at the same time."]',
      }),
    ).toMatchObject({
      chatReply:
        'A melodic interval is heard one note after another, whereas a harmonic interval is heard at the same time.',
    });
  });
});

describe('chooseAgentFallbackText', () => {
  it('unwraps a browser-local Scion chatReply envelope before rendering it', () => {
    expect(chooseAgentFallbackText('{"chatReply":"Weak evidence should move a strong prior only modestly."}', [])).toBe(
      'Weak evidence should move a strong prior only modestly.',
    );
  });

  it('unwraps browser-local Scion sentence arrays before rendering them', () => {
    expect(chooseAgentFallbackText('["Check the named example","then explain the decisive feature."]', [])).toBe(
      'Check the named example, then explain the decisive feature.',
    );
  });

  it('unwraps a Scion reply object after a punctuation fragment', () => {
    expect(
      chooseAgentFallbackText(
        '[")",{"chatReply":"Learners will identify bias and communicate ethical data decisions."}]',
        [],
      ),
    ).toBe('Learners will identify bias and communicate ethical data decisions.');
  });

  it('removes prompt-only lesson routing markers from user-facing Agent prose', () => {
    const raw = 'Inspect Lesson 1: Intervals (toolIndex=0), then compare its examples.';
    expect(stripInternalAgentMarkers(raw)).toBe('Inspect Lesson 1: Intervals, then compare its examples.');
    expect(chooseAgentFallbackText(raw, [])).toBe('Inspect Lesson 1: Intervals, then compare its examples.');
  });

  it('removes leading JSON punctuation fragments from a small-model reply', () => {
    expect(stripInternalAgentMarkers('), A major third inverts to a minor sixth.')).toBe(
      'A major third inverts to a minor sixth.',
    );
  });

  it('removes a malformed browser-local chatReply field prefix before rendering', () => {
    const raw = 'chatReply:, Reviewing the tone contours is the highest-priority check.';
    expect(stripInternalAgentMarkers(raw)).toBe(
      'Reviewing the tone contours is the highest-priority check.',
    );
    expect(chooseAgentFallbackText(raw, [])).toBe(
      'Reviewing the tone contours is the highest-priority check.',
    );
  });

  it('replaces raw tool trace text with a concise user-facing receipt', () => {
    const reply = chooseAgentFallbackText(
      '[Agent used 2 tools: readdeliverable: Data loaded, editdeliverables: 1 applied, 0 failed]',
      [
        {
          toolName: 'edit_deliverables',
          args: {
            actions: [
              {
                type: 'editItem',
                featureId: 'lessonPlans',
                path: ['lessonPlans', 0, 'outline'],
                value: [{ time: '5 min', activity: 'Opening check', description: 'Name one export risk.' }],
              },
            ],
          },
          result: {
            featureId: 'lessonPlans',
            applied: 1,
            failed: 0,
            details: [{ action: 'editItem', featureId: 'lessonPlans', lessonIndex: 0, success: true }],
          },
        },
        {
          toolName: 'read_deliverable',
          result: { featureId: 'lessonPlans', totalItems: 3 },
        },
      ],
    );

    expect(reply).toContain('Opening check');
    expect(reply).not.toContain('Agent used');
  });

  it('never renders a browser-local pseudo tool call as Agent prose', () => {
    const raw =
      'I will proceed by planning the regeneration. plan_workspace_next_step {"tool_name":"regenerate_slide_decks","parameters":{"lesson_ids":[0,1]}}';
    expect(
      chooseAgentFallbackText(raw, [], undefined, {
        userMessage: 'Regenerate both lesson slide decks and improve the slides.',
      }),
    ).toBe(
      'I could not safely apply those slide changes from this chat reply. Use Improve slides so the app regenerates the decks directly and records a visible receipt.',
    );
  });
});

describe('buildLocalReadOnlyFallback — verified course facts', () => {
  it('answers the music-interval inversion rule from the compiler-owned frame', () => {
    const reply = buildLocalReadOnlyFallback('In one sentence, why does a major third invert to a minor sixth?', {
      courseMap: {
        courseName: 'Interval Evidence Studio',
        lessons: [
          {
            title: 'Lesson 2: Simple and Compound Intervals',
            sections: [
              {
                learningObjectives: 'Apply inversion number and quality rules.',
                supportingResources: 'Audio Set M',
              },
            ],
          },
        ],
      },
    });
    expect(reply).toContain('3 + 6 = 9');
    expect(reply).toContain('major quality changes to minor');
    expect(reply).toContain('eight semitones, not four');
  });

  it('corrects a major-sixth inversion question directly without requiring the answer in the prompt', () => {
    const reply = buildLocalReadOnlyFallback(
      'Does a major third invert to a major sixth? Explain the number and quality rule in two sentences.',
      {
        courseMap: {
          courseName: 'Interval Evidence Studio',
          lessons: [
            {
              title: 'Lesson 2: Simple and Compound Intervals',
              sections: [{ learningObjectives: 'Apply inversion number and quality rules.' }],
            },
          ],
        },
      },
    );
    expect(reply).toMatch(/^No\. A major third inverts to a minor sixth:/);
    expect(reply).toContain('3 + 6 = 9');
    expect(reply).toContain('major quality changes to minor');
  });
});

describe('findBroadDestructiveWorkspaceMutationRequest', () => {
  it('requires confirmation for full course/material replacement requests', () => {
    expect(
      findBroadDestructiveWorkspaceMutationRequest('Rewrite the entire course and replace all materials.'),
    ).toMatchObject({
      label: 'full course/materials rewrite',
    });
  });

  it('does not block safe targeted edits that mention all in another context', () => {
    expect(findBroadDestructiveWorkspaceMutationRequest('Fix all typos in Lesson 1 quiz.')).toBeNull();
  });
});

describe('inferAgentQualityExpectations', () => {
  it('does not require broad-change planning for safe targeted edits that merely mention export content', () => {
    expect(
      inferAgentQualityExpectations(
        'Add a 5-minute opening check to Lesson 1 lesson plan about export risk. Do it directly and verify it.',
        'moderate',
      ),
    ).toEqual({});
    expect(
      inferAgentQualityExpectations(
        'Update the Course FAQ cloud export failure answer so it says to use the local ZIP first.',
        'moderate',
      ),
    ).toEqual({});
  });

  it('still requires planning for package/export workflows and broad operations', () => {
    expect(inferAgentQualityExpectations('Finish the package and prepare it for download.', 'moderate')).toEqual({
      requiresPlan: true,
    });
    expect(inferAgentQualityExpectations('Rewrite the whole course.', 'complex')).toEqual({ requiresPlan: true });
  });
});

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
        next: 'Check package or plan the next downstream update from the changed workspace.',
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

  it('refuses missing deliverable style changes before any provider call', async () => {
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.fn(() => {
      throw new Error('provider should not be called for missing deliverable preflight');
    });
    globalThis.fetch = fetchSpy;

    let messages = [{ role: 'agentProgress', status: 'running' }];
    const setMessages = (updater) => {
      messages = typeof updater === 'function' ? updater(messages) : updater;
    };

    try {
      await runAgentLoop(
        'Make the rubrics easier for first-year students.',
        {},
        {
          messages: [],
          setMessages,
          setStreaming: vi.fn(),
          abortRef: { current: null },
          apiKey: 'sk-test',
          provider: 'openai',
          modelId: 'gpt-test',
          courseMap: {
            courseName: 'Climate Justice Seminar',
            lessons: [{ title: 'Lesson 1: Policy Levers', sections: [{ learningObjectives: 'Analyze policy.' }] }],
          },
          activeTab: 'courseMap',
          selectedFeatures: ['courseMap', 'lessonPlans'],
          columns: [],
          deliverableConfig: {},
          lessonFilter: null,
          delivRef: {
            current: {
              lessonPlans: { status: 'done', data: { lessonPlans: [{ lessonTitle: 'Lesson 1' }] } },
            },
          },
          executeActionRef: { current: vi.fn() },
          optimisticUpdateRef: { current: null },
          snapshotRef: { current: null },
          undoFnRef: { current: null },
          notifyEditRef: { current: null },
          uid: null,
          customToolRegistryRef: null,
          maybeRunValidation: vi.fn(),
          handleAgentFinalResponse: (response) => {
            messages = [
              ...messages,
              {
                role: 'assistant',
                text: response?.chatReply || response?.text || '',
              },
            ];
          },
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(messages).toEqual([
      {
        role: 'assistant',
        text: 'The Rubrics deliverable is not in this workspace yet, so I did not invent it. Generate rubrics first, then I can make that change.',
      },
    ]);
  });

  it('answers simple quiz-count questions locally without finishing the package', async () => {
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.fn(() => {
      throw new Error('provider should not be called for quiz count preflight');
    });
    globalThis.fetch = fetchSpy;

    let messages = [{ role: 'agentProgress', status: 'running' }];
    const setMessages = (updater) => {
      messages = typeof updater === 'function' ? updater(messages) : updater;
    };

    try {
      await runAgentLoop(
        'How many quiz questions are ready across the course? Answer in one sentence.',
        {},
        {
          messages: [],
          setMessages,
          setStreaming: vi.fn(),
          abortRef: { current: null },
          apiKey: 'sk-test',
          provider: 'openai',
          modelId: 'gpt-test',
          courseMap: {
            courseName: 'Export Reliability',
            lessons: [
              { title: 'Lesson 1', sections: [{ learningObjectives: 'Analyze evidence.' }] },
              { title: 'Lesson 2', sections: [{ learningObjectives: 'Check export quality.' }] },
            ],
          },
          activeTab: 'quizBank',
          selectedFeatures: ['courseMap', 'quizBank'],
          columns: [],
          deliverableConfig: {},
          lessonFilter: null,
          delivRef: {
            current: {
              quizBank: {
                status: 'done',
                data: {
                  quizzes: [{ qs: [{ q: 'One?' }, { q: 'Two?' }] }, { qs: [{ q: 'Three?' }, { q: 'Four?' }] }],
                },
              },
            },
          },
          executeActionRef: { current: vi.fn() },
          optimisticUpdateRef: { current: null },
          snapshotRef: { current: null },
          undoFnRef: { current: null },
          notifyEditRef: { current: null },
          uid: null,
          customToolRegistryRef: null,
          maybeRunValidation: vi.fn(),
          handleAgentFinalResponse: (response) => {
            messages = [
              ...messages,
              {
                role: 'assistant',
                text: response?.chatReply || response?.text || '',
              },
            ];
          },
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(messages).toEqual([
      {
        role: 'assistant',
        text: 'There are 4 quiz questions ready across the course, with 2 questions in each lesson.',
      },
    ]);
  });
});
