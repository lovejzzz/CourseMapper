import { expect, test } from '@playwright/test';

async function restoreGeneratedWorkspace(page) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(
      'coursemapper-project',
      JSON.stringify({
        formatVersion: 1,
        hasGenerated: true,
        provider: 'openai',
        modelId: 'gpt-4o-mini',
        modelName: 'GPT-4o mini',
        courseMap: {
          courseName: 'Mobile Layout Course',
          semester: 'Spring 2026',
          lessons: [
            {
              title: 'Lesson 1',
              learningGoals: ['Goal 1'],
              topics: ['Topic 1'],
              learningObjectives: ['Objective 1'],
              weeklyAssessments: ['Assessment 1'],
              asynchronousActivities: ['Activity 1'],
              synchronousActivities: ['Discussion 1'],
            },
          ],
        },
        columns: [],
        userEdits: [],
        chatHistory: [],
        fileNames: [],
        versionHistory: [],
        selectedFeatures: ['courseMap', 'lessonPlans', 'slideDecks'],
        deliverableConfig: { lessonPlans: {}, slideDecks: { slideCount: 3 } },
        lessonScope: { type: 'all' },
        promptText: 'Mobile layout course',
        activeTab: 'lessonPlans',
        deliverables: {
          lessonPlans: {
            status: 'done',
            data: {
              lessonPlans: [
                {
                  lessonTitle: 'Lesson 1',
                  overview: 'A practical lesson plan for mobile layout testing.',
                  activities: ['Discuss responsive workspace patterns.'],
                },
              ],
            },
            error: null,
            stale: false,
          },
          slideDecks: {
            status: 'done',
            data: {
              decks: [
                {
                  lessonTitle: 'Lesson 1',
                  slides: [
                    { title: 'Intro', bullets: ['A'] },
                    { title: 'Practice', bullets: ['B'] },
                  ],
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
  });
  await page.reload();
  await expect(page.locator('button:has-text("Resume")')).toBeVisible({ timeout: 10000 });
  const savedSessionDismissButton = page.getByRole('button', { name: 'Dismiss saved session' });
  await expect
    .poll(async () => (await savedSessionDismissButton.boundingBox())?.width || 0, { timeout: 2000 })
    .toBeGreaterThanOrEqual(43.9);
  const savedSessionCopy = await page.getByTestId('saved-session-copy').boundingBox();
  const savedSessionDismiss = await savedSessionDismissButton.boundingBox();
  expect(savedSessionCopy.width).toBeGreaterThan(140);
  expect(savedSessionDismiss.height).toBeGreaterThanOrEqual(43.9);
  await page.locator('button:has-text("Resume")').click();
  await expect(page.getByTestId('workspace-shell')).toBeVisible({ timeout: 10000 });
}

async function expectNoHorizontalOverflow(page) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.body.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 2);
}

test.describe('Generated workspace mobile layout', () => {
  for (const viewport of [
    { label: 'phone', width: 390, height: 844 },
    { label: 'tablet', width: 768, height: 1024 },
  ]) {
    test(`keeps content, agent, and export panels within a ${viewport.label} viewport`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await restoreGeneratedWorkspace(page);

      await expect(page.getByTestId('mobile-workspace-switcher')).toBeVisible();
      await expect(page.getByTestId('workspace-content-panel')).toBeVisible();
      await expect(page.getByTestId('workspace-agent-panel')).toBeHidden();
      await expectNoHorizontalOverflow(page);

      const switcherTransitionProperties = await page
        .getByTestId('mobile-workspace-switcher')
        .getByRole('button')
        .first()
        .evaluate((button) => getComputedStyle(button).transitionProperty);
      expect(switcherTransitionProperties).not.toContain('all');
      expect(switcherTransitionProperties).not.toContain('background');
      expect(switcherTransitionProperties).not.toContain('color');

      const fullscreen = page.getByRole('button', { name: 'Full screen' });
      if (viewport.width < 640) await expect(fullscreen).toBeHidden();
      else await expect(fullscreen).toBeVisible();

      const switcherTargetHeights = await page
        .getByTestId('mobile-workspace-switcher')
        .getByRole('button')
        .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
      expect(Math.min(...switcherTargetHeights)).toBeGreaterThanOrEqual(44);

      const courseTitleWhiteSpace = await page
        .getByRole('heading', { level: 1 })
        .evaluate((heading) => window.getComputedStyle(heading).whiteSpace);
      expect(courseTitleWhiteSpace).toBe('normal');

      const workspaceFooterStyle = await page.locator('footer').evaluate((footer) => {
        const text = footer.querySelector('p');
        const style = window.getComputedStyle(text || footer);
        const rgb = (style.color.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
        const luminance = rgb.reduce((sum, channel, index) => {
          const normalized = channel / 255;
          const linear = normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
          return sum + linear * [0.2126, 0.7152, 0.0722][index];
        }, 0);
        return {
          fontSize: Number.parseFloat(style.fontSize),
          contrastOnWhite: 1.05 / (luminance + 0.05),
        };
      });
      expect(workspaceFooterStyle.fontSize).toBeGreaterThanOrEqual(12);
      expect(workspaceFooterStyle.contrastOnWhite).toBeGreaterThanOrEqual(4.5);

      await page
        .getByTestId('workspace-deliverable-tabs')
        .getByRole('button', { name: 'Course Map', exact: true })
        .click();
      if (viewport.width < 640) {
        await expect(page.getByText('Swipe the table to review every course-map field.')).toBeVisible();
        const tableOverflow = await page.getByRole('grid', { name: 'Course Map' }).evaluate((table) => ({
          clientWidth: table.parentElement?.clientWidth || 0,
          scrollWidth: table.parentElement?.scrollWidth || 0,
        }));
        expect(tableOverflow.scrollWidth).toBeGreaterThan(tableOverflow.clientWidth);

        const scrollRegion = page.getByRole('region', { name: 'Scrollable course map' });
        await scrollRegion.focus();
        await scrollRegion.press('ArrowRight');
        await expect
          .poll(() => scrollRegion.evaluate((region) => region.scrollLeft), { timeout: 2000 })
          .toBeGreaterThan(0);
      } else {
        await expect(page.getByText('Swipe the table to review every course-map field.')).toBeHidden();
      }

      const collapseLessonTarget = await page.getByRole('button', { name: 'Collapse lesson 1' }).boundingBox();
      // Chromium may report an exact 44px CSS target a fraction below 44
      // after device-pixel conversion (for example 43.99997px at 768px).
      expect(collapseLessonTarget.width).toBeGreaterThanOrEqual(43.9);
      expect(collapseLessonTarget.height).toBeGreaterThanOrEqual(43.9);

      await page.getByTestId('mobile-workspace-switcher').getByRole('button', { name: 'Agent' }).click();
      await expect(
        page.getByTestId('mobile-workspace-switcher').getByRole('button', { name: 'Agent' }),
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('workspace-agent-panel')).toBeVisible();
      await expect(page.getByTestId('workspace-content-panel')).toBeHidden();
      await expectNoHorizontalOverflow(page);

      await page.getByTestId('mobile-workspace-switcher').getByRole('button', { name: 'Export' }).click();
      await expect(
        page.getByTestId('mobile-workspace-switcher').getByRole('button', { name: 'Export' }),
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('workspace-export-panel')).toBeVisible();
      await expect(page.getByTestId('workspace-agent-panel')).toBeHidden();
      await expectNoHorizontalOverflow(page);
    });
  }
});
