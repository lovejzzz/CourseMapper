import { expect, test } from '@playwright/test';

test('course outline progress explains slow starts, streamed titles, retry, and stop on desktop and phone', async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  // Render the production component with controlled provider events so long pauses
  // and retries are deterministic and do not download a model in CI.
  await page.evaluate(async () => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { default: Progress } = await import('/src/components/CourseMapLiveProgress.jsx');
    const activity = await import('/src/lib/courseMapActivity.js');
    const host = document.createElement('div');
    document.body.replaceChildren(host);
    host.style.cssText = 'max-width:1000px;padding:24px;margin:24px auto';
    const root = ReactDOM.createRoot(host);
    window.progressFixture = {
      ...activity,
      state: activity.startCourseMapActivity(12),
      render() {
        root.render(
          React.createElement(Progress, {
            activity: this.state,
            onStop: () => {
              host.textContent = 'Build stopped';
            },
          }),
        );
      },
    };
    window.progressFixture.render();
  });
  const panel = page.getByTestId('course-map-live-progress');
  await expect(panel).toContainText('Step 1 of 3');
  await expect(panel.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
  await page.evaluate(() => {
    const f = window.progressFixture;
    f.state = { ...f.state, startedAt: Date.now() - 95000, lastUpdateAt: Date.now() - 95000 };
    f.render();
  });
  await expect(panel).toContainText('This step is taking longer');
  await page.screenshot({ path: testInfo.outputPath('slow-start-desktop.png') });
  await page.evaluate(() => {
    const f = window.progressFixture;
    f.state = f.receiveCourseMapText(f.state, 'streamed outline', {
      sessions: [
        { order: 1, title: 'HTML foundations' },
        { order: 2, title: 'Responsive layouts' },
      ],
    });
    f.render();
  });
  await expect(panel).toContainText('2 of 12 lesson titles received');
  await expect(panel).not.toContainText('No new update');
  await expect(panel).toContainText('Preview only');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await expect(panel.getByRole('button', { name: 'Stop build' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect
    .poll(() => panel.locator('.text-slate-600').evaluate((element) => getComputedStyle(element).color))
    .toBe('rgb(148, 163, 184)');
  await expect
    .poll(() =>
      panel.getByText('1. HTML foundations', { exact: true }).evaluate((element) => getComputedStyle(element).color),
    )
    .toBe('rgb(203, 213, 225)');
  await page.screenshot({ path: testInfo.outputPath('streaming-phone.png') });
  await page.evaluate(() => {
    const f = window.progressFixture;
    f.state = f.receiveCourseMapActivityEvent(f.state, { type: 'streamRetryCall', task: 'nativeSkeleton' });
    f.render();
  });
  await expect(panel).toContainText('Retrying automatically');
  await expect(panel).not.toContainText('HTML foundations');
  await panel.getByRole('button', { name: 'Stop build' }).click();
  await expect(page.getByText('Build stopped', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
