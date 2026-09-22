// v0.20.07: on desktop the export and assistant panels are drawers that open
// from the workspace header. Narrow layouts use the Content/Assistant/Export
// switcher instead, where the header buttons are hidden.
export async function openWorkspaceDrawer(page, drawer) {
  await page.getByTestId('workspace-shell').waitFor({ state: 'visible' });
  const button = page.getByTestId(`workspace-drawer-${drawer}`);
  const switcher = page.getByTestId('mobile-workspace-switcher');
  if (await switcher.isVisible().catch(() => false)) return;
  await button.waitFor({ state: 'visible' });
  await page.waitForFunction(
    (id) => !document.querySelector(`[data-testid="workspace-drawer-${id}"]`)?.disabled,
    drawer,
  );
  if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
}
