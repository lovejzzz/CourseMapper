import { describe, expect, it } from 'vitest';

import {
  buildReport,
  buildScenarioCatalog,
  parseArgs,
  scoreResponseQuality,
  selectScenarioCount,
  workspaceFixture,
} from '../realBrowserAgentQualityLoop.mjs';

describe('realBrowserAgentQualityLoop helpers', () => {
  it('parses CLI options and selects smoke/full scenario counts', () => {
    expect(parseArgs(['--profile', 'full', '--tasks=25', '--stop-on-failure'])).toMatchObject({
      profile: 'full',
      tasks: '25',
      stopOnFailure: true,
    });
    expect(selectScenarioCount({ profile: 'smoke' })).toBe(10);
    expect(selectScenarioCount({ profile: 'full' })).toBe(25);
    expect(selectScenarioCount({ tasks: '300' })).toBe(25);
  });

  it('owns a first-class 25-scenario agent catalog', () => {
    const scenarios = buildScenarioCatalog();
    const names = scenarios.map((scenario) => scenario.name);

    expect(scenarios).toHaveLength(25);
    expect(names).toContain('missing rubric refusal');
    expect(names).toContain('broad destructive request asks first');
    expect(names).toContain('ambiguous assignment edit asks first');
    expect(names).toContain('finish package after edits');
    expect(scenarios.filter((scenario) => scenario.expectConfirmation)).toHaveLength(3);
    expect(scenarios.filter((scenario) => scenario.expectMutation)).toHaveLength(13);
  });

  it('scores response quality beyond state mutation success', () => {
    const falseFailure = scoreResponseQuality(
      { expectMutation: true },
      {
        stateOk: true,
        changed: true,
        lastAssistant: 'Renaming did not take effect in the verified course map.',
      },
    );
    expect(falseFailure.ok).toBe(false);
    expect(falseFailure.issues).toContain('successful mutation response looks like a failure');

    const readbackContradiction = scoreResponseQuality(
      { expectMutation: true },
      {
        stateOk: true,
        changed: true,
        lastAssistant: 'The verified readback still shows the old title, so the rename did not reflect yet.',
      },
    );
    expect(readbackContradiction.ok).toBe(false);
    expect(readbackContradiction.issues).toContain('successful mutation response looks like a failure');

    const scopedReceipt = scoreResponseQuality(
      { expectMutation: true, responseMustInclude: ['ZIP'] },
      {
        stateOk: true,
        changed: true,
        lastAssistant: 'Added the ZIP reminder and verified it. The rest of Lesson 2 stayed unchanged.',
      },
    );
    expect(scopedReceipt).toMatchObject({ ok: true, score: 100 });

    const numberWordCount = scoreResponseQuality(
      { expectReadOnly: true, responseMustInclude: ['3'] },
      {
        stateOk: true,
        changed: false,
        lastAssistant: 'Three lesson plans are ready.',
      },
    );
    expect(numberWordCount).toMatchObject({ ok: true, score: 100 });

    const unnecessaryQuestion = scoreResponseQuality(
      { expectMutation: true },
      {
        stateOk: true,
        changed: true,
        lastAssistant: 'Added the checklist. Would you like me to do anything else?',
      },
    );
    expect(unnecessaryQuestion.ok).toBe(false);
    expect(unnecessaryQuestion.issues).toContain('response asks an unnecessary question');

    const quotedEditedQuestion = scoreResponseQuality(
      { expectMutation: true, responseMustInclude: ['quiz'] },
      {
        stateOk: true,
        changed: true,
        lastAssistant: 'Updated the quiz question to ask, “What evidence proves export readiness?”',
      },
    );
    expect(quotedEditedQuestion).toMatchObject({ ok: true, score: 100 });

    const usefulReply = scoreResponseQuality(
      { expectMutation: true, responseMustInclude: ['checklist'] },
      {
        stateOk: true,
        changed: true,
        lastAssistant: 'Added the submission checklist and verified the updated assignment.',
      },
    );
    expect(usefulReply).toMatchObject({ ok: true, score: 100 });
  });

  it('keeps missing-deliverable fixtures realistic', () => {
    const fixture = workspaceFixture();

    expect(fixture.selectedFeatures).toContain('rubrics');
    expect(fixture.deliverables.rubrics).toBeUndefined();
    expect(fixture.deliverables.studyGuides).toBeUndefined();
    expect(fixture.deliverables.lessonPlans.status).toBe('done');
  });

  it('writes response-quality metrics into reports', () => {
    const report = buildReport({
      runStarted: new Date('2026-06-07T00:00:00.000Z'),
      finishedAt: new Date('2026-06-07T00:01:00.000Z'),
      modelId: 'gpt-test',
      profile: 'smoke',
      consoleErrors: [],
      failedRequests: [],
      results: [
        {
          status: 'PASS',
          name: 'safe edit',
          changed: true,
          detail: 'state changed',
          responseOk: true,
          responseScore: 100,
          responseIssues: [],
          lastAssistant: 'Done.',
        },
        {
          status: 'FAIL',
          name: 'bad reply',
          changed: true,
          detail: 'state changed',
          responseOk: false,
          responseScore: 75,
          responseIssues: ['successful mutation response looks like a failure'],
          lastAssistant: 'Could not do it.',
        },
      ],
    });

    expect(report).toContain('Response quality: 88/100 average; 1 failed response check(s)');
    expect(report).toContain('bad reply');
    expect(report).toContain('successful mutation response looks like a failure');
  });
});
