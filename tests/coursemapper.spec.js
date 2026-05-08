// @ts-check
import { test, expect } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function loadApp(page) {
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });
}

function isAppFlowRequest(url) {
  return /\/src\/AppFlow\.jsx(?:$|\?)/.test(url) || /\/assets\/AppFlow-[^/]+\.js$/.test(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. LANDING PAGE
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });
  });

  test('renders logo and tagline', async ({ page }) => {
    await expect(page.locator('img[alt="Course Mapper"]')).toBeVisible();
    await expect(page.locator('h1')).toHaveText('Everything you need to teach a course.');
    await expect(page.locator('text=Describe your course')).toBeVisible();
  });

  test('shows example chips when prompt and files are empty', async ({ page }) => {
    await expect(page.locator('button:has-text("Intro to Psychology")')).toBeVisible();
    await expect(page.locator('button:has-text("Research Methods")')).toBeVisible();
    await expect(page.locator('button:has-text("Social Policy")')).toBeVisible();
  });

  test('clicking example chip fills the prompt textarea', async ({ page }) => {
    await page.locator('button:has-text("Intro to Psychology")').click();
    const value = await page.locator('textarea').inputValue();
    expect(value).toContain('Introduction to Psychology');
    expect(value).toContain('15-week');
  });

  test('example chips disappear after prompt is filled', async ({ page }) => {
    await page.locator('button:has-text("Intro to Psychology")').click();
    await expect(page.locator('button:has-text("Research Methods")')).not.toBeVisible();
  });

  test('textarea accepts typed input', async ({ page }) => {
    const textarea = page.locator('textarea');
    await textarea.fill('My custom course about machine learning');
    await expect(textarea).toHaveValue('My custom course about machine learning');
  });

  test('Continue button is disabled without API key', async ({ page }) => {
    const continueBtn = page.locator('button:has-text("Continue")');
    await expect(continueBtn).toBeVisible();
    await expect(continueBtn).toBeDisabled();
  });

  test('Continue button is disabled with API key but no prompt', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('coursemapper-apikey', 'sk-proj-test1234567890123456789012345678901234567890123456');
      localStorage.setItem('coursemapper-modelid', 'gpt-4o');
    });
    await page.reload();
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });
    // Even with API key, empty prompt should keep button disabled
    await expect(page.locator('button:has-text("Continue")')).toBeDisabled();
  });

  test('footer links are present and correct', async ({ page }) => {
    await expect(page.locator('a[href="#/changelog"]')).toBeVisible();
    await expect(page.locator('a[href="#/privacy"]')).toBeVisible();
    await expect(page.locator('a[href="#/terms"]')).toBeVisible();
    await expect(page.locator('text=NYU Silver School')).toBeVisible();
  });

  test('dark mode toggle exists and works', async ({ page }) => {
    const toggle = page.locator('button[aria-label*="mode"]');
    await expect(toggle).toBeVisible();

    await toggle.click();
    expect(await page.locator('html').getAttribute('class')).toContain('dark');

    await toggle.click();
    expect((await page.locator('html').getAttribute('class')) || '').not.toContain('dark');
  });

  test('dark mode persists across page reload', async ({ page }) => {
    await page.locator('button[aria-label*="mode"]').click();
    expect(await page.locator('html').getAttribute('class')).toContain('dark');

    await page.reload();
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });
    expect(await page.locator('html').getAttribute('class')).toContain('dark');
  });

  test('ModelConfig panel is visible for unconfigured state', async ({ page }) => {
    // When no API key is stored, the full ModelConfig should show (not collapsed)
    await expect(page.locator('text=AI Configuration')).toBeVisible({ timeout: 5000 });
  });

  test('Attach files button is present', async ({ page }) => {
    await expect(page.locator('button:has-text("Attach files")')).toBeVisible();
  });

  test('file format hints are visible', async ({ page }) => {
    await expect(page.locator('text=.pdf .docx .xlsx .pptx .txt and more')).toBeVisible();
  });

  test('.coursemapper file hint is visible', async ({ page }) => {
    await expect(page.locator('text=.coursemapper')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. LAZY SHELL
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Lazy Shell', () => {
  test('keeps AppFlow off the landing page until Continue is clicked', async ({ page }) => {
    await page.route('https://api.openai.com/v1/models', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ id: 'gpt-4o-mini', created: 1 }],
        }),
      }),
    );
    await page.route('https://api.openai.com/v1/chat/completions', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [{ message: { content: 'ok' } }],
        }),
      }),
    );

    const appFlowRequests = [];
    page.on('request', (request) => {
      if (isAppFlowRequest(request.url())) appFlowRequests.push(request.url());
    });

    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('coursemapper-provider', 'openai');
      localStorage.setItem('coursemapper-apikey', 'sk-proj-test1234567890123456789012345678901234567890123456');
      localStorage.setItem('coursemapper-modelid', 'gpt-4o-mini');
      localStorage.setItem('coursemapper-modelname', 'GPT-4o mini');
    });

    await page.goto('/');
    await expect(page.locator('h1:has-text("Everything you need")')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Connected').first()).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(250);
    expect(appFlowRequests.length, 'AppFlow should not be requested on initial landing load').toBe(0);

    await page.locator('button:has-text("Intro to Psychology")').click();
    await page.locator('button:has-text("Continue")').click();
    await expect(page.locator('text=Choose deliverables')).toBeVisible({ timeout: 10000 });
    expect(appFlowRequests.length, 'AppFlow should be requested after leaving landing').toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. CONFIGURE GENERATION
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Configure Generation', () => {
  test('shows Course FAQ settings when expanded', async ({ page }) => {
    await page.route('https://api.openai.com/v1/models', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ id: 'gpt-4o-mini', created: 1 }],
        }),
      }),
    );
    await page.route('https://api.openai.com/v1/chat/completions', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [{ message: { content: 'ok' } }],
        }),
      }),
    );

    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('coursemapper-provider', 'openai');
      localStorage.setItem('coursemapper-apikey', 'sk-proj-test1234567890123456789012345678901234567890123456');
      localStorage.setItem('coursemapper-modelid', 'gpt-4o-mini');
      localStorage.setItem('coursemapper-modelname', 'GPT-4o mini');
    });

    await page.goto('/');
    await expect(page.locator('text=Connected').first()).toBeVisible({ timeout: 10000 });
    await page.locator('textarea').fill('Build a 12-lesson course with a student FAQ.');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.locator('text=Choose deliverables')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Course FAQ/ }).click();
    await page.getByRole('button', { name: /Configure & Generate/ }).click();

    await expect(page.locator('h1:has-text("Configure generation")')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Expand Course FAQ settings' }).click();

    await expect(page.getByText('Questions per lesson')).toBeVisible();
    await expect(page.getByText('Question categories')).toBeVisible();
    await expect(page.getByText('Answer depth')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Course Logistics' })).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. HASH ROUTING
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Hash Routing', () => {
  test('/ renders the landing page', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1:has-text("Everything you need")')).toBeVisible({ timeout: 10000 });
  });

  test('#/changelog renders the changelog page', async ({ page }) => {
    await page.goto('/#/changelog');
    await expect(page.locator('h1:has-text("Changelog")')).toBeVisible({ timeout: 10000 });
  });

  test('#/privacy renders the privacy policy', async ({ page }) => {
    await page.goto('/#/privacy');
    await expect(page.locator('h1:has-text("Privacy")')).toBeVisible({ timeout: 10000 });
  });

  test('#/terms renders the terms of service', async ({ page }) => {
    await page.goto('/#/terms');
    await expect(page.locator('h1:has-text("Terms")')).toBeVisible({ timeout: 10000 });
  });

  test('#/faq redirects to #/', async ({ page }) => {
    await page.goto('/#/faq');
    await expect(page.locator('h1:has-text("Everything you need")')).toBeVisible({ timeout: 10000 });
  });

  test('footer link navigates to privacy page', async ({ page }) => {
    await loadApp(page);
    await page.locator('a[href="#/privacy"]').click();
    await expect(page.locator('h1:has-text("Privacy")')).toBeVisible({ timeout: 5000 });
  });

  test('footer link navigates to changelog', async ({ page }) => {
    await loadApp(page);
    await page.locator('a[href="#/changelog"]').first().click();
    await expect(page.locator('text=AI Teaching Agent').or(page.locator('text=0.5')).first()).toBeVisible({
      timeout: 5000,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. WORKSPACE DELIVERABLE TABS
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Workspace Deliverable Tabs', () => {
  async function restoreWorkspaceWithSlideDecks(page) {
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
            courseName: 'Drag Test Course',
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
          selectedFeatures: ['courseMap', 'slideDecks'],
          deliverableConfig: { slideDecks: { slideCount: 3 } },
          lessonScope: { type: 'all' },
          promptText: 'Drag test course',
          activeTab: 'slideDecks',
          deliverables: {
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
    await page.locator('button:has-text("Resume")').click();
    await expect(
      page.getByTestId('workspace-deliverable-tabs').getByRole('button', { name: /Slide Decks/ }),
    ).toBeVisible({
      timeout: 10000,
    });
  }

  test('shows trash only while dragging and confirms deliverable deletion', async ({ page }) => {
    await restoreWorkspaceWithSlideDecks(page);

    await expect(page.locator('text=Drop to delete')).not.toBeVisible();

    const deliverableTabs = page.getByTestId('workspace-deliverable-tabs');
    const slideTab = deliverableTabs.getByRole('button', { name: /Slide Decks/ });
    const tabBox = await slideTab.boundingBox();
    expect(tabBox).not.toBeNull();
    await page.mouse.move(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(tabBox.x + tabBox.width + 60, tabBox.y + tabBox.height / 2, { steps: 8 });

    const trash = page.locator('[aria-label="Drop to remove Slide Decks"]');
    await expect(trash).toBeVisible({ timeout: 5000 });
    const trashBox = await trash.boundingBox();
    expect(trashBox).not.toBeNull();
    await page.mouse.move(trashBox.x + trashBox.width / 2, trashBox.y + trashBox.height / 2, { steps: 6 });
    await page.mouse.up();

    await expect(page.locator('text=Remove deliverable?')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Slide Decks').first()).toBeVisible();
    await page.locator('button:has-text("Remove")').click();

    await expect(deliverableTabs.getByRole('button', { name: /Slide Decks/ })).not.toBeVisible();
    await expect(deliverableTabs.getByRole('button', { name: 'Course Map', exact: true })).toBeVisible();
    await expect(page.locator('text=Course Map Preview')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. DARK MODE COMPREHENSIVE
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Dark Mode', () => {
  test('applies dark class to html element', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });

    expect((await page.locator('html').getAttribute('class')) || '').not.toContain('dark');
    await page.locator('button[aria-label*="mode"]').click();
    expect(await page.locator('html').getAttribute('class')).toContain('dark');
  });

  test('stores preference in localStorage', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });

    await page.locator('button[aria-label*="mode"]').click();
    expect(await page.evaluate(() => localStorage.getItem('coursemapper-theme'))).toBe('dark');
  });

  test('respects system dark preference on first visit', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('coursemapper-theme'));
    await page.reload();
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });

    expect(await page.locator('html').getAttribute('class')).toContain('dark');
  });

  test('respects system light preference on first visit', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('coursemapper-theme'));
    await page.reload();
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });

    expect((await page.locator('html').getAttribute('class')) || '').not.toContain('dark');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. RESPONSIVENESS
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Responsiveness', () => {
  test('landing page at mobile width (375px)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loadApp(page);

    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('textarea')).toBeVisible();

    const logo = page.locator('img[alt="Course Mapper"]');
    const box = await logo.boundingBox();
    expect(box.width).toBeLessThanOrEqual(375);
  });

  test('landing page at tablet width (768px)', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await loadApp(page);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('textarea')).toBeVisible();
  });

  test('landing page at desktop width (1440px)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadApp(page);
    const h1Box = await page.locator('h1').boundingBox();
    expect(h1Box.x).toBeGreaterThan(100);
  });

  test('no horizontal overflow at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loadApp(page);
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(376); // 1px tolerance
  });

  test('no horizontal overflow at desktop width', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loadApp(page);
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(1281);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. LOCAL STORAGE & STATE PERSISTENCE
// ─────────────────────────────────────────────────────────────────────────────

test.describe('State Persistence', () => {
  test('API key persists across reloads', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => localStorage.setItem('coursemapper-apikey', 'sk-test-key-12345'));
    await page.reload();
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });
    // Key may be obfuscated after reload (secureStorage), so just verify it's still stored
    const stored = await page.evaluate(() => localStorage.getItem('coursemapper-apikey'));
    expect(stored).toBeTruthy();
    expect(stored.length).toBeGreaterThan(0);
  });

  test('provider selection persists across reloads', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => localStorage.setItem('coursemapper-provider', 'google'));
    await page.reload();
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });
    expect(await page.evaluate(() => localStorage.getItem('coursemapper-provider'))).toBe('google');
  });

  test('dark mode preference persists', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => localStorage.setItem('coursemapper-theme', 'dark'));
    await page.reload();
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });
    expect(await page.locator('html').getAttribute('class')).toContain('dark');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. ACCESSIBILITY
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Accessibility', () => {
  test('dark mode toggle has aria-label', async ({ page }) => {
    await loadApp(page);
    const darkToggle = page.locator('button[aria-label*="mode"]');
    await expect(darkToggle).toBeVisible();
    expect(await darkToggle.getAttribute('aria-label')).toBeTruthy();
  });

  test('page has lang="en"', async ({ page }) => {
    await loadApp(page);
    expect(await page.locator('html').getAttribute('lang')).toBe('en');
  });

  test('page has a title', async ({ page }) => {
    await loadApp(page);
    expect(await page.title()).toBe('Course Mapper');
  });

  test('images have alt text', async ({ page }) => {
    await loadApp(page);
    const images = page.locator('img');
    const count = await images.count();
    for (let i = 0; i < count; i++) {
      expect(await images.nth(i).getAttribute('alt'), `Image ${i} missing alt text`).toBeTruthy();
    }
  });

  test('textarea has meaningful placeholder', async ({ page }) => {
    await loadApp(page);
    const placeholder = await page.locator('textarea').getAttribute('placeholder');
    expect(placeholder).toBeTruthy();
    expect(placeholder.length).toBeGreaterThan(10);
  });

  test('interactive elements are keyboard focusable', async ({ page }) => {
    await loadApp(page);
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(['BUTTON', 'A', 'INPUT', 'TEXTAREA']).toContain(focused);
  });

  test('hidden file input is not visible', async ({ page }) => {
    await loadApp(page);
    const hiddenInput = page.locator('#landing-file-input');
    await expect(hiddenInput).toBeHidden();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. ERROR HANDLING
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Error Handling', () => {
  test('no console errors on initial page load', async ({ page }) => {
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await loadApp(page);
    await page.waitForTimeout(2000);

    const realErrors = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('net::ERR') && !e.includes('Failed to load resource'),
    );
    expect(realErrors).toEqual([]);
  });

  test('no unhandled promise rejections on load', async ({ page }) => {
    const rejections = [];
    page.on('pageerror', (error) => rejections.push(error.message));

    await loadApp(page);
    await page.waitForTimeout(2000);
    expect(rejections).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. LAYOUT & VISUAL
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Layout & Visual', () => {
  test('landing page content is vertically centered', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loadApp(page);
    const h1Box = await page.locator('h1').boundingBox();
    expect(h1Box.y).toBeGreaterThan(50);
    expect(h1Box.y).toBeLessThan(500);
  });

  test('footer is at the bottom of the page', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loadApp(page);
    const footerBox = await page.locator('footer').boundingBox();
    expect(footerBox.y + footerBox.height).toBeGreaterThan(700);
  });

  test('logo loads successfully', async ({ page }) => {
    await loadApp(page);
    const logo = page.locator('img[alt="Course Mapper"]');
    await expect(logo).toBeVisible();
    // Check the image actually loaded (naturalWidth > 0)
    const loaded = await logo.evaluate((img) => img.naturalWidth > 0);
    expect(loaded).toBe(true);
  });

  test('example chips have correct styling classes', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });

    const chip = page.locator('button:has-text("Intro to Psychology")');
    const classes = await chip.getAttribute('class');
    expect(classes).toContain('tactile');
    expect(classes).toContain('rounded-full');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. MODEL CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Model Configuration', () => {
  test('ModelConfig shows AI Configuration title when expanded', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });

    // In unconfigured state, ModelConfig should be expanded with its title
    await expect(page.locator('text=AI Configuration')).toBeVisible({ timeout: 5000 });
  });

  test('ModelConfig renders with pre-configured provider in localStorage', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('coursemapper-provider', 'openai');
      localStorage.setItem('coursemapper-apikey', 'sk-proj-test1234567890123456789012345678901234567890123456');
      localStorage.setItem('coursemapper-modelid', 'gpt-4o');
      localStorage.setItem('coursemapper-modelname', 'GPT-4o');
    });
    await page.reload();
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });

    // With a pre-configured (but fake) key, AI Configuration section should render
    await expect(page.locator('text=AI Configuration')).toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. STATIC PAGES
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Static Pages', () => {
  test('changelog page has version entries', async ({ page }) => {
    await page.goto('/#/changelog');
    await page.waitForTimeout(1000);
    const body = await page.locator('body').textContent();
    expect(body).toContain('0.5');
    expect(body.length).toBeGreaterThan(200);
  });

  test('privacy page has required content', async ({ page }) => {
    await page.goto('/#/privacy');
    await page.waitForTimeout(1000);
    const body = await page.locator('body').textContent();
    expect(body).toContain('Privacy');
    expect(body).toContain('data');
  });

  test('terms page has required content', async ({ page }) => {
    await page.goto('/#/terms');
    await page.waitForTimeout(1000);
    const body = await page.locator('body').textContent();
    expect(body).toContain('Terms');
  });

  test('changelog page has header with logo', async ({ page }) => {
    await page.goto('/#/changelog');
    // Router renders landing (display:none) + changelog; pick the visible (last) logo
    await expect(page.locator('img[alt="Course Mapper"]').last()).toBeVisible({ timeout: 10000 });
  });

  test('privacy page has header with logo', async ({ page }) => {
    await page.goto('/#/privacy');
    await expect(page.locator('img[alt="Course Mapper"]').last()).toBeVisible({ timeout: 10000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. PERFORMANCE
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Performance', () => {
  test('landing page loads in under 5 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });
    expect(Date.now() - start).toBeLessThan(5000);
  });

  test('landing page has reasonable DOM node count', async ({ page }) => {
    await loadApp(page);
    const nodeCount = await page.evaluate(() => document.querySelectorAll('*').length);
    expect(nodeCount).toBeLessThan(500);
  });

  test('rapid dark mode toggling does not break the page', async ({ page }) => {
    await loadApp(page);
    const toggle = page.locator('button[aria-label*="mode"]');
    for (let i = 0; i < 20; i++) await toggle.click();
    await expect(page.locator('h1')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. EDGE CASES
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Edge Cases', () => {
  test('double-clicking example chip does not duplicate text', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });

    const chip = page.locator('button:has-text("Intro to Psychology")');
    await chip.dblclick();
    const value = await page.locator('textarea').inputValue();
    // Should contain the text just once (not duplicated)
    const count = (value.match(/Introduction to Psychology/g) || []).length;
    expect(count).toBe(1);
  });

  test('pasting long text into textarea works', async ({ page }) => {
    await loadApp(page);
    const longText = 'A'.repeat(5000);
    await page.locator('textarea').fill(longText);
    const value = await page.locator('textarea').inputValue();
    expect(value.length).toBe(5000);
  });

  test('special characters in prompt do not break UI', async ({ page }) => {
    await loadApp(page);
    await page.locator('textarea').fill('<script>alert("xss")</script> & "quotes" \'apostrophes\'');
    // Page should still be functional
    await expect(page.locator('h1')).toBeVisible();
    // The text should be in the textarea as-is (no script execution)
    const value = await page.locator('textarea').inputValue();
    expect(value).toContain('<script>');
  });
});
