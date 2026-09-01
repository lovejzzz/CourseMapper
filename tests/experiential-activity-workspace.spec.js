import { expect, test } from '@playwright/test';
import { APP_VERSION } from '../src/lib/appVersion.js';

const SCION_MODEL_LABEL = `Scion V${APP_VERSION}`;

const activityPacket = {
  protocol: 'scion-experiential-activity-v1',
  activityType: 'Maritime monitoring negotiation simulation',
  scenario:
    'Two coastal delegations dispute responsibility for a patrol collision while a civilian convoy approaches the same corridor. A neutral mediation team must secure monitored passage before the convoy deadline.',
  roles: [
    {
      name: 'Coastal navigation delegation',
      goal: 'Keep civilian passage open without accepting unsupported responsibility.',
      constraint: 'Cannot authorize another state to command its patrol vessel.',
      privateInformation: 'Its shore radar record contains a six-minute outage.',
    },
    {
      name: 'Convoy access delegation',
      goal: 'Secure independently monitored passage for the civilian convoy.',
      constraint: 'Cannot accept a route that omits inspection access for the damaged vessel.',
      privateInformation: 'The convoy has only one safe arrival window.',
    },
  ],
  evidence: [
    'The collision record timestamps the impact but does not establish which patrol crossed first.',
    'The civilian convoy log records two unanswered radio calls before the impact.',
  ],
  phases: [
    {
      title: 'Radar outage confirmed',
      information: 'A technician confirms that the shore radar record was unavailable for six minutes.',
      requiredDecision: 'Revise the attribution claim and record whether monitored passage remains acceptable.',
    },
    {
      title: 'Medical access request',
      information: 'The convoy reports that one vessel needs access to the nearest port before the deadline.',
      requiredDecision: 'Record whether the corridor protocol changes and cite the evidence and constraint used.',
    },
  ],
  artifact: {
    title: 'Monitored corridor protocol',
    requirements: [
      'State the permitted route and timing window.',
      'Assign one neutral monitoring action.',
      'Name the evidence threshold that triggers revision.',
    ],
  },
  timing: [
    { phase: 'Briefing', minutes: 8 },
    { phase: 'Role preparation', minutes: 12 },
    { phase: 'Evidence review', minutes: 10 },
    { phase: 'First update', minutes: 15 },
    { phase: 'Second update', minutes: 15 },
    { phase: 'Protocol and debrief', minutes: 15 },
  ],
  totalMinutes: 75,
  activityLogFields: [
    'Phase and time',
    'Evidence inspected',
    'Constraint or uncertainty',
    'Decision, action, interpretation, or revision',
    'Reason and next check',
  ],
  debriefPrompts: [
    'Which collision record changed the attribution claim, and which uncertainty remained?',
    'Which constraint most shaped the monitored corridor protocol?',
  ],
  safetyBoundary:
    'Use only the fictional maritime record supplied here and do not map participant roles onto a current conflict.',
};

async function restoreActivityWorkspace(page) {
  await page.goto('/');
  await page.evaluate(
    ({ packet, modelName }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(
        'coursemapper-project',
        JSON.stringify({
          formatVersion: 1,
          hasGenerated: true,
          provider: 'public',
          modelId: 'scion-public',
          modelName,
          courseMap: {
            courseName: 'Introduction to International Relations',
            semester: 'Fall 2026',
            lessons: [
              {
                title: 'Maritime Crisis Negotiation',
                learningGoals: ['Use incomplete evidence to negotiate a bounded de-escalation protocol.'],
                topics: ['attribution under uncertainty', 'maritime monitoring'],
                learningObjectives: ['Revise a negotiation position after synchronized evidence updates.'],
                weeklyAssessments: ['Monitored corridor protocol'],
                asynchronousActivities: ['Review the fictional collision record.'],
                synchronousActivities: ['Maritime monitoring negotiation simulation'],
              },
            ],
          },
          columns: [],
          userEdits: [],
          chatHistory: [],
          fileNames: [],
          versionHistory: [],
          selectedFeatures: ['courseMap', 'assignments'],
          deliverableConfig: { assignments: {} },
          lessonScope: { type: 'all' },
          promptText: 'Introduction to International Relations with a crisis simulation.',
          activeTab: 'assignments',
          deliverables: {
            assignments: {
              status: 'done',
              data: {
                assignments: [
                  {
                    title: 'Monitored corridor protocol — activity packet',
                    lessonNumber: 1,
                    assignmentType: 'Experiential activity packet',
                    relatedLessons: ['Maritime Crisis Negotiation'],
                    dueWeek: 'Week 1',
                    estimatedTime: '75 minutes in class',
                    overview: packet.scenario,
                    description:
                      'Use the shared briefing, role constraints, evidence, timed phases, activity log, named artifact, and debrief as one coherent activity.',
                    objectives: [
                      'Complete the protocol with a traceable connection among evidence, constraints, and action.',
                    ],
                    instructions: ['Inspect the supplied evidence before recording an initial decision.'],
                    activityPacket: packet,
                  },
                ],
              },
              error: null,
              stale: false,
            },
          },
          savedAt: Date.now(),
        }),
      );
    },
    { packet: activityPacket, modelName: SCION_MODEL_LABEL },
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByTestId('workspace-shell')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('workspace-model-config-trigger')).toHaveText('AI settings');
  await expect(page.getByTestId('workspace-agent-panel')).toContainText('Available');
  await expect(page.locator('[data-experiential-activity="true"]')).toBeVisible({ timeout: 10000 });
}

for (const viewport of [
  { label: 'phone', width: 390, height: 844 },
  { label: 'desktop', width: 1440, height: 1000 },
]) {
  test(`renders the complete Scion activity protocol without clipping at ${viewport.label} width`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await restoreActivityWorkspace(page);

    const panel = page.locator('[data-experiential-activity="true"]');
    await expect(panel.getByText('Situation', { exact: true })).toBeVisible();
    await expect(panel.getByText('Inspect Before Acting', { exact: true })).toBeVisible();
    await expect(panel.getByText('Participant or Working Roles', { exact: true })).toBeVisible();
    await expect(panel.getByText('Phases and Updates', { exact: true })).toBeVisible();
    await expect(panel.getByText('Activity Clock', { exact: true })).toBeVisible();
    await expect(panel.getByText('Activity Log', { exact: true })).toBeVisible();
    await expect(panel.getByText('Student Artifact', { exact: true })).toBeVisible();
    await expect(panel.getByText('Debrief', { exact: true })).toBeVisible();
    await expect(panel.getByText('Radar outage confirmed', { exact: true })).toBeVisible();
    await expect(panel.getByText('Medical access request', { exact: true })).toBeVisible();
    await expect(panel.getByText('Monitored corridor protocol', { exact: true })).toBeVisible();
    await expect(panel.getByText('75 minutes · 6 phases', { exact: true })).toBeVisible();
    const cardTitle = page.getByRole('heading', {
      name: 'Monitored corridor protocol — activity packet',
      exact: true,
    });
    await expect(cardTitle).toBeVisible();
    await expect(cardTitle).toHaveCSS('-webkit-line-clamp', viewport.label === 'phone' ? '2' : '1');

    const metrics = await page.evaluate(() => ({
      bodyScrollWidth: document.body.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }));
    expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 2);

    const panelBox = await panel.boundingBox();
    expect(panelBox).not.toBeNull();
    expect(panelBox.x).toBeGreaterThanOrEqual(0);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(viewport.width + 1);

    const boundary = panel.getByText('Safety and evidence boundary:', { exact: false }).first();
    const boundaryStyle = await boundary.evaluate((node) => {
      const container = node.closest('div');
      const style = getComputedStyle(container);
      return { color: style.color, backgroundColor: style.backgroundColor };
    });
    expect(boundaryStyle.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(boundaryStyle.color).not.toBe('rgb(220, 38, 38)');

    if (process.env.SCION_CAPTURE_FRAME_DIR) {
      await page.screenshot({
        fullPage: true,
        path: `${process.env.SCION_CAPTURE_FRAME_DIR}/experiential-activity-${viewport.label}.png`,
      });
    }
  });
}
