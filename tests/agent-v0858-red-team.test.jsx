import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  AGENT_CLOSED_LOOP_SCENARIOS,
  EXPORT_TORTURE_SCENARIOS,
  LIVE_PROVIDER_SCENARIOS,
  QUALITY_RED_TEAM_SCENARIOS,
  RECOVERY_SCENARIOS,
  V0858_MINIMUMS,
  V0858_REQUIRED_AGENT_CATEGORIES,
  validateV0858ScenarioInventory,
} from './lib/v0858RedTeamScenarios.js';
import { preValidateAction } from '../src/lib/agentActions.js';
import { AGENT_TOOLS } from '../src/lib/agentTools.js';
import { buildAgentSystemPrompt } from '../src/lib/agentPrompts.js';
import AgentWorkingSetPanel, { buildAgentWorkingSetSummary } from '../src/components/chat/AgentWorkingSetPanel.jsx';
import PackageSummaryCard from '../src/components/chat/PackageSummaryCard.jsx';

function baseCourseMap() {
  return {
    courseName: 'V0.8.58 Red Team Seminar',
    semester: 'Fall 2026',
    lessons: [
      {
        title: 'Foundations',
        sections: [{ learningObjectives: 'Define reliability', topicSection: 'Agent safety' }],
      },
      {
        title: 'Practice Lab',
        sections: [{ learningObjectives: 'Apply validation checks', topicSection: 'Tool execution' }],
      },
      {
        title: 'Recovery',
        sections: [{ learningObjectives: 'Evaluate recovery evidence', topicSection: 'Readback verification' }],
      },
    ],
  };
}

function baseDeliverables() {
  return {
    quizBank: {
      status: 'done',
      data: {
        quizzes: [
          {
            lt: 'Foundations',
            qs: [{ q: 'What does a verifier check?', ty: 'short_answer', bl: 'Understand', pt: 2 }],
          },
          {
            lt: 'Practice Lab',
            qs: [{ q: 'Which action should be validated first?', ty: 'multiple_choice', bl: 'Apply', pt: 2 }],
          },
          {
            lt: 'Recovery',
            qs: [{ q: 'What evidence proves a repair worked?', ty: 'short_answer', bl: 'Analyze', pt: 3 }],
          },
        ],
      },
    },
    lessonPlans: {
      status: 'done',
      data: {
        lessonPlans: [
          { lt: 'Foundations', ob: 'Define reliability', ol: [{ tm: 'Safety', de: 'Name the contract' }] },
          { lt: 'Practice Lab', ob: 'Use validation', ol: [{ tm: 'Tools', de: 'Validate mutations' }] },
          { lt: 'Recovery', ob: 'Verify recovery', ol: [{ tm: 'Evidence', de: 'Read state back' }] },
        ],
      },
    },
  };
}

describe('v0.8.58 red-team scenario inventory', () => {
  it('meets the release minimums with specific named scenarios', () => {
    const validation = validateV0858ScenarioInventory();

    expect(validation.ok, validation.errors.join('\n')).toBe(true);
    expect(AGENT_CLOSED_LOOP_SCENARIOS.length).toBeGreaterThanOrEqual(V0858_MINIMUMS.agentClosedLoop);
    expect(EXPORT_TORTURE_SCENARIOS.length).toBeGreaterThanOrEqual(V0858_MINIMUMS.exportTorture);
    expect(RECOVERY_SCENARIOS.length).toBeGreaterThanOrEqual(V0858_MINIMUMS.recovery);
    expect(QUALITY_RED_TEAM_SCENARIOS.length).toBeGreaterThanOrEqual(V0858_MINIMUMS.quality);
    expect(LIVE_PROVIDER_SCENARIOS.length).toBeGreaterThanOrEqual(V0858_MINIMUMS.liveProvider);
  });

  it('keeps every required agent risk category represented', () => {
    const categories = new Set(AGENT_CLOSED_LOOP_SCENARIOS.map((scenario) => scenario.category));

    for (const category of V0858_REQUIRED_AGENT_CATEGORIES) {
      expect(categories.has(category), `Missing category: ${category}`).toBe(true);
    }
  });

  it('marks missing deliverable cases as no-ghost-artifact refusals', () => {
    const missingCases = AGENT_CLOSED_LOOP_SCENARIOS.filter(
      (scenario) => scenario.category === 'missing-stale-deliverable',
    );

    expect(missingCases.length).toBeGreaterThan(0);
    for (const scenario of missingCases) {
      expect(scenario.expected.refusesGhostArtifact, scenario.id).toBe(true);
      expect(scenario.expected.explainsGenerateFirstPath, scenario.id).toBe(true);
      expect(scenario.expected.noStateMutation, scenario.id).toBe(true);
    }
  });
});

describe('v0.8.58 agent safety invariants', () => {
  it('requires readback before lesson-specific deliverable judgment in the system prompt', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap(), 'quizBank', baseDeliverables());

    expect(prompt).toContain('Lesson-specific deliverable judgments');
    expect(prompt).toContain('read_deliverable(target featureId + lessonIndex) first');
    expect(prompt).toContain('Missing/not-done deliverable: do not fabricate it');
    expect(prompt).toContain('plan/inspect -> execute -> verify -> respond');
  });

  it('reads the exact lesson deliverable item instead of relying on summary counts', () => {
    const result = AGENT_TOOLS.read_deliverable.execute(
      { featureId: 'quizBank', lessonIndex: 2 },
      { courseMap: baseCourseMap(), deliverables: baseDeliverables() },
    );

    expect(result.error).toBeUndefined();
    expect(result.data.lt).toBe('Recovery');
    expect(result.data.qs[0].q).toContain('repair worked');
    expect(result.editPaths.some((path) => path.includes('"qs"'))).toBe(true);
  });

  it('refuses missing deliverable reads and mutations without creating ghost state', () => {
    const ctx = { courseMap: baseCourseMap(), deliverables: baseDeliverables() };
    const before = JSON.stringify(ctx.deliverables);

    const readResult = AGENT_TOOLS.read_deliverable.execute({ featureId: 'rubrics', lessonIndex: 0 }, ctx);
    const validation = preValidateAction(
      {
        type: 'addItem',
        featureId: 'rubrics',
        lessonIndex: 0,
        item: { cn: 'Evidence', wt: 100 },
      },
      ctx,
    );

    expect(readResult.error).toMatch(/not generated yet/i);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toMatch(/not generated yet/i);
    expect(JSON.stringify(ctx.deliverables)).toBe(before);
    expect(ctx.deliverables.rubrics).toBeUndefined();
  });

  it('keeps the side panel compact and avoids old review-mode language', () => {
    const props = {
      courseMap: baseCourseMap(),
      activeTab: 'courseMap',
      deliverables: baseDeliverables(),
      selectedFeatures: ['courseMap', 'quizBank', 'rubrics'],
      pendingSyncFeatureIds: ['lessonPlans'],
      isAgentProviderReady: false,
    };
    const summary = buildAgentWorkingSetSummary(props);
    const html = renderToStaticMarkup(<AgentWorkingSetPanel {...props} />);

    expect(summary.toolStateLabel).toBe('Local checks available');
    expect(html).toContain('Workspace open');
    expect(html).not.toContain('Package needs review');
    expect(html).not.toContain('Needs your decision');
    expect(html).not.toContain('Review only');
  });

  it('keeps blocked package receipts instructor-facing instead of log-like', () => {
    const html = renderToStaticMarkup(
      <PackageSummaryCard
        summary={{
          tone: 'blocked',
          ready: false,
          nextAction: 'Fix remaining export blockers before download.',
          blockerCount: 1,
          warningCount: 1,
          repairsApplied: 2,
          exportChecked: 4,
          exportFailed: 1,
          topIssues: [{ severity: 'error', label: 'Rubrics', message: 'Lesson 2 scoring math needs review.' }],
        }}
      />,
    );

    expect(html).toContain('Review before export');
    expect(html).toContain('Action needed');
    expect(html).toContain('Rubrics');
    expect(html).not.toContain('retryActionCount');
    expect(html).not.toContain('toolName');
    expect(html).not.toContain('Package needs review');
  });
});
