import { expect, test } from '@playwright/test';

for (const pageCase of [
  { route: 'privacy', heading: 'Privacy Policy' },
  { route: 'terms', heading: 'Terms of Service' },
]) {
  test(`${pageCase.heading} keeps a readable measure at 320px`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto(`/#/${pageCase.route}`);

    await expect(page.getByRole('heading', { name: pageCase.heading, level: 1 })).toBeVisible();
    const policyPanel = page.locator('main .glass').first();
    const panelBox = await policyPanel.boundingBox();
    expect(panelBox.x).toBeGreaterThanOrEqual(8);
    expect(panelBox.width).toBeGreaterThanOrEqual(280);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(page.viewportSize().width - 8);

    const metrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.body.scrollWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 2);
  });
}
