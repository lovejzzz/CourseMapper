// @ts-check
import { test, expect } from '@playwright/test';
import { APP_VERSION } from '../src/lib/appVersion.js';

const SCION_MODEL_LABEL = `Scion V${APP_VERSION}`;

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

const landingSetupButton = (page) => page.getByTestId('landing-setup-button');

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
    await expect(page.locator('img[alt="EduTool.dev"]')).toBeVisible();
    await expect(page.locator('h1')).toHaveText('Turn a syllabus into a teachable course.');
    await expect(page.getByRole('heading', { name: 'Turn a syllabus into a teachable course.' })).toBeVisible();
    await expect(page.getByText('Start with what you have.')).toHaveCount(0);
    await expect(page.getByText('From source to package')).toHaveCount(0);
  });

  test('keeps the headline on one line at desktop width', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.reload();
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });

    const whiteSpace = await page.locator('h1').evaluate((el) => window.getComputedStyle(el).whiteSpace);
    expect(whiteSpace).toBe('nowrap');
  });

  test('shows example chips when prompt and files are empty', async ({ page }) => {
    const chips = page.getByTestId('course-example-chip');

    await expect(chips).toHaveCount(3);
    const labels = (await chips.allTextContents()).map((label) => label.trim()).filter(Boolean);
    expect(new Set(labels).size).toBe(3);
  });

  test('clicking example chip fills the prompt textarea', async ({ page }) => {
    const chip = page.getByTestId('course-example-chip').first();
    const expectedPrompt = await chip.getAttribute('data-example-text');

    await chip.click();
    const value = await page.locator('textarea').inputValue();
    expect(value).toBe(expectedPrompt);
    expect(value).toMatch(/\b(6|7|8|9|10|11|12|13|14|15)-week\b/);
  });

  test('example chips disappear after prompt is filled', async ({ page }) => {
    await page.getByTestId('course-example-chip').first().click();
    await expect(page.getByTestId('course-example-chip')).toHaveCount(0);
  });

  test('try label refreshes the visible sample courses', async ({ page }) => {
    const chips = page.getByTestId('course-example-chip');
    const before = await chips.allTextContents();

    await page.getByTestId('sample-courses-shuffle').click();

    await expect
      .poll(async () => (await chips.allTextContents()).join('|'), { timeout: 5000 })
      .not.toBe(before.join('|'));
  });

  test('textarea accepts typed input', async ({ page }) => {
    const textarea = page.locator('textarea');
    await textarea.fill('My custom course about machine learning');
    await expect(textarea).toHaveValue('My custom course about machine learning');
  });

  test('Continue button is disabled without course input', async ({ page }) => {
    const continueBtn = landingSetupButton(page);
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
    await expect(landingSetupButton(page)).toBeDisabled();
  });

  test('footer links are present and correct', async ({ page }) => {
    await expect(page.getByRole('link', { name: /^v\d+\.\d+\.\d+$/ })).toBeVisible();
    await expect(page.locator('a[href="#/privacy"]')).toBeVisible();
    await expect(page.locator('a[href="#/terms"]')).toBeVisible();
    await expect(page.locator('a[href="#/contact"]')).toHaveText('Contact');
  });

  test('contact route shows the privacy-preserving support channel', async ({ page }) => {
    await page.getByRole('link', { name: 'Contact' }).click();

    await expect(page.locator('h1:has-text("Contact")')).toBeVisible();
    await expect(page.getByRole('link', { name: 'General support' })).toBeVisible();
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  });

  test('dark mode toggle exists and works', async ({ page }) => {
    const toggle = page.locator('button[aria-label*="mode"]');
    const composer = page.getByTestId('landing-course-composer');
    await expect(toggle).toBeVisible();

    // Theme-bearing surfaces must change together. Animating the composer's
    // background used to leave its attachment footer light while the nested
    // textarea had already turned dark during the first 300 ms.
    const transitionProperties = await composer.evaluate((node) => getComputedStyle(node).transitionProperty);
    expect(transitionProperties).not.toContain('all');
    expect(transitionProperties).not.toContain('background');

    await toggle.click();
    expect(await page.locator('html').getAttribute('class')).toContain('dark');
    await expect(page.locator('img[alt="EduTool.dev"]')).toHaveAttribute('src', /CMlogo-dark\.png$/);
    await expect
      .poll(() => composer.evaluate((node) => getComputedStyle(node).backgroundColor))
      .not.toMatch(/rgba?\(255,\s*255,\s*255/);

    await toggle.click();
    expect((await page.locator('html').getAttribute('class')) || '').not.toContain('dark');
    await expect(page.locator('img[alt="EduTool.dev"]')).toHaveAttribute('src', /CMlogo\.png$/);
  });

  test('dark mode persists across page reload', async ({ page }) => {
    await page.locator('button[aria-label*="mode"]').click();
    expect(await page.locator('html').getAttribute('class')).toContain('dark');

    await page.reload();
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });
    expect(await page.locator('html').getAttribute('class')).toContain('dark');
  });

  test('connected Scion starts collapsed and Edit reveals its configuration', async ({ page }) => {
    await expect(page.getByTestId('ai-config-summary')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('AI Configuration')).toHaveCount(0);
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByText('AI Configuration')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('scion-model-boundary')).toContainText('It is fully free—and always will be.');
    await expect(page.getByText(/It combines source-grounded evidence/)).toHaveCount(0);
  });

  test('provider picker offers public Scion and cloud providers', async ({ page }) => {
    await page.getByRole('button', { name: 'Edit' }).click();
    const options = await page.getByLabel('Provider').locator('option').allTextContents();

    expect(options).toEqual(['Scion', 'OpenAI', 'Anthropic', 'Google', 'DeepSeek']);
    expect(options.join(' ')).not.toContain('Local');
    await expect(page.getByLabel('API')).toBeDisabled();
    await expect(page.getByLabel('API')).toHaveValue('No API key required');
    await expect(page.getByLabel('Model')).toHaveValue('scion-public');
    await expect(page.getByLabel('Model').locator('option')).toHaveText([SCION_MODEL_LABEL]);
  });

  test('explains missing provider credentials without blaming the course brief', async ({ page }) => {
    await page.getByLabel('Describe your course').fill('UX Design Studio with critique and usability testing.');
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Provider').selectOption('openai');

    await expect(page.getByTestId('landing-requirement')).toHaveText('Add your OpenAI API key to continue.');
    await expect(page.getByTestId('landing-requirement')).not.toContainText('Describe a course');
  });

  test('Resume restores the saved project model instead of the landing-page model', async ({ page }) => {
    await page.route('https://api.openai.com/v1/models', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: [{ id: 'gpt-4o-mini', created: 1 }] }),
      });
    });
    await page.route('https://api.openai.com/v1/chat/completions', async (route) => {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [] }) });
    });

    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('coursemapper-provider', 'openai');
      localStorage.setItem('coursemapper-apikey', 'sk-proj-landing-test-key');
      localStorage.setItem('coursemapper-modelid', 'gpt-4o-mini');
      localStorage.setItem('coursemapper-modelname', 'GPT-4o mini');
      localStorage.setItem(
        'coursemapper-project',
        JSON.stringify({
          formatVersion: 1,
          hasGenerated: true,
          provider: 'google',
          modelId: 'gemini-2.5-pro',
          modelName: 'Gemini 2.5 Pro',
          courseMap: {
            courseName: 'Resume Model Test',
            lessons: [
              {
                title: 'Lesson 1',
                learningGoals: ['Goal'],
                topics: ['Topic'],
                learningObjectives: ['Objective'],
                weeklyAssessments: ['Assessment'],
                asynchronousActivities: ['Activity'],
                synchronousActivities: ['Discussion'],
              },
            ],
          },
          columns: [],
          userEdits: [],
          chatHistory: [],
          fileNames: [],
          versionHistory: [],
          selectedFeatures: ['courseMap'],
          lessonScope: { type: 'all' },
          deliverableConfig: {},
          promptText: 'Resume model test',
          activeTab: 'courseMap',
          deliverables: {},
        }),
      );
    });
    await page.reload();

    await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Resume' }).click();

    await expect(page.getByTestId('workspace-model-config-trigger')).toHaveText('Gemini 2.5 Pro', { timeout: 10000 });
    const restored = await page.evaluate(() => ({
      provider: localStorage.getItem('coursemapper-provider'),
      modelId: localStorage.getItem('coursemapper-modelid'),
      modelName: localStorage.getItem('coursemapper-modelname'),
    }));
    expect(restored).toEqual({
      provider: 'google',
      modelId: 'gemini-2.5-pro',
      modelName: 'Gemini 2.5 Pro',
    });
  });

  test('restored Scion workspaces never expose the internal model id', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(
        'coursemapper-project',
        JSON.stringify({
          formatVersion: 2,
          hasGenerated: true,
          provider: 'public',
          modelId: 'scion-public',
          modelName: '',
          courseMap: {
            courseName: 'Scion Display Contract',
            lessons: [
              {
                title: 'Lesson 1',
                sections: [
                  {
                    learningGoals: 'Explain one design decision.',
                    topicSection: 'Interface evidence',
                    learningObjectives: 'Evaluate an interface choice.',
                    weeklyAssessments: 'Design rationale',
                  },
                ],
              },
            ],
          },
          columns: [],
          userEdits: [],
          chatHistory: [],
          fileNames: [],
          versionHistory: [],
          selectedFeatures: ['courseMap'],
          lessonScope: { type: 'all' },
          deliverableConfig: {},
          promptText: 'Scion display contract',
          activeTab: 'courseMap',
          deliverables: {},
        }),
      );
    });
    await page.reload();

    await page.getByRole('button', { name: 'Resume' }).click();
    await expect(page.getByTestId('workspace-header')).toContainText(SCION_MODEL_LABEL, { timeout: 10000 });
    await expect(page.getByTestId('workspace-model-config-trigger')).toHaveText(SCION_MODEL_LABEL);
    await expect(page.getByTestId('workspace-shell')).not.toContainText('scion-public');
  });

  test('entering a new brief discards a detected saved project before setup begins', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem(
        'coursemapper-project',
        JSON.stringify({
          formatVersion: 2,
          hasGenerated: true,
          provider: 'scion-public',
          modelId: 'scion-public',
          modelName: 'Scion',
          courseMap: {
            courseName: 'Old Python Programming Course',
            lessons: [
              {
                title: 'Lesson 1: Python Loops',
                sections: [{ topicSection: 'while loops', learningObjectives: 'Trace Python loops.' }],
              },
            ],
          },
          selectedFeatures: ['courseMap', 'quizBank'],
          lessonScope: { type: 'specific', indices: [0] },
          deliverableConfig: { quizBank: { questionsPerLesson: 12 } },
          promptText: 'Old Python course',
          deliverables: {},
        }),
      );
    });
    await page.reload();

    await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible({ timeout: 10000 });
    await page.locator('textarea').fill('Create a new three-lesson user experience design studio.');
    await page.getByTestId('landing-setup-button').click();

    await expect(page.getByRole('heading', { name: 'Choose materials' })).toBeVisible({ timeout: 10000 });
    expect(await page.evaluate(() => localStorage.getItem('coursemapper-project'))).toBeNull();
    await expect(page.getByText('Old Python Programming Course')).toHaveCount(0);
    await expect(page.getByText('Python Loops')).toHaveCount(0);
  });

  test('Start New Project clears a restored browser project', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(
        'coursemapper-project',
        JSON.stringify({
          formatVersion: 1,
          hasGenerated: true,
          provider: 'webllm',
          modelId: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
          modelName: 'Local browser model',
          courseMap: {
            courseName: 'Start New Project Test',
            lessons: [
              {
                title: 'Lesson 1',
                learningGoals: ['Goal'],
                topics: ['Topic'],
                learningObjectives: ['Objective'],
                weeklyAssessments: ['Assessment'],
                asynchronousActivities: ['Activity'],
                synchronousActivities: ['Discussion'],
              },
            ],
          },
          columns: [],
          userEdits: [],
          chatHistory: [],
          fileNames: [],
          versionHistory: [],
          selectedFeatures: ['courseMap'],
          lessonScope: { type: 'all' },
          deliverableConfig: {},
          promptText: 'Start new project test',
          activeTab: 'courseMap',
          deliverables: {},
        }),
      );
    });
    await page.reload();

    await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Resume' }).click();
    await expect(page.getByText('Course Map Preview')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('workspace-more-menu-trigger').click();
    await page.getByTestId('workspace-menu-new-project').click();

    await expect(page.locator('h1')).toHaveText('Turn a syllabus into a teachable course.');
    await expect(page.getByTestId('new-project-confirmation')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('coursemapper-project'))).toBeNull();
  });

  test('Edit keeps the connected model picker open while refreshing models', async ({ page }) => {
    await page.route('https://generativelanguage.googleapis.com/v1beta/models?**', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          models: [
            {
              name: 'models/gemini-2.5-pro',
              displayName: 'Gemini 2.5 Pro',
              supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
              inputTokenLimit: 1048576,
              outputTokenLimit: 65536,
            },
            {
              name: 'models/gemini-2.5-flash',
              displayName: 'Gemini 2.5 Flash',
              supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
              inputTokenLimit: 1048576,
              outputTokenLimit: 65536,
            },
          ],
        }),
      });
    });
    await page.route('https://generativelanguage.googleapis.com/v1beta/models/*:generateContent?**', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
        }),
      });
    });

    await page.evaluate(() => {
      localStorage.setItem('coursemapper-provider', 'google');
      localStorage.setItem('coursemapper-apikey', 'AIzaLandingEditModelPickerUnitTestKey000000000');
      localStorage.setItem('coursemapper-modelid', 'gemini-2.5-pro');
      localStorage.setItem('coursemapper-modelname', 'Gemini 2.5 Pro');
    });
    await page.reload();

    await expect(page.getByText('Google · Gemini 2.5 Pro')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /^Edit$/ }).click();

    const modelSelect = page.locator('#ai-model-select');
    await expect(modelSelect).toBeVisible({ timeout: 1000 });
    await expect(modelSelect).toHaveValue('gemini-2.5-pro');

    await page.waitForTimeout(1200);
    await expect(page.getByText('AI Configuration')).toBeVisible();
    await expect(modelSelect).toBeVisible();
    await modelSelect.selectOption('gemini-2.5-flash');
    await expect(modelSelect).toHaveValue('gemini-2.5-flash');
  });

  test('opening a .coursemapper file restores its provider and model', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('coursemapper-provider', 'openai');
      localStorage.setItem('coursemapper-modelid', 'gpt-4o-mini');
      localStorage.setItem('coursemapper-modelname', 'GPT-4o mini');
    });
    await page.reload();

    const project = {
      formatVersion: 1,
      hasGenerated: true,
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-5-20250929',
      modelName: 'Claude Sonnet 4.5',
      courseMap: {
        courseName: 'Opened Project Model Test',
        lessons: [
          {
            title: 'Lesson 1',
            learningGoals: ['Goal'],
            topics: ['Topic'],
            learningObjectives: ['Objective'],
            weeklyAssessments: ['Assessment'],
            asynchronousActivities: ['Activity'],
            synchronousActivities: ['Discussion'],
          },
        ],
      },
      columns: [],
      userEdits: [],
      chatHistory: [],
      fileNames: [],
      versionHistory: [],
      selectedFeatures: ['courseMap'],
      lessonScope: { type: 'all' },
      deliverableConfig: {},
      promptText: 'Opened project model test',
      activeTab: 'courseMap',
      deliverables: {},
    };

    await page.locator('#landing-file-input').setInputFiles({
      name: 'Opened Project.coursemapper',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(project)),
    });

    await expect(page.getByTestId('workspace-model-config-trigger')).toHaveText('Claude Sonnet 4.5', {
      timeout: 10000,
    });
    const restored = await page.evaluate(() => ({
      provider: localStorage.getItem('coursemapper-provider'),
      modelId: localStorage.getItem('coursemapper-modelid'),
      modelName: localStorage.getItem('coursemapper-modelname'),
    }));
    expect(restored).toEqual({
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-5-20250929',
      modelName: 'Claude Sonnet 4.5',
    });
  });

  test('opening a legacy .coursemapper file sanitizes restored project content', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();

    const secret = 'sk-proj-abcdefghijklmnopqrstuvwxyz1234567890';
    const project = {
      hasGenerated: true,
      provider: 'webllm',
      modelId: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
      modelName: 'Local browser model',
      promptText: `Legacy prompt ${secret}`,
      courseMap: {
        courseName: 'Legacy Project',
        lessons: [
          {
            title: `Lesson ${secret}`,
            learningGoals: ['Goal'],
            topics: ['Topic'],
            learningObjectives: ['Objective'],
            weeklyAssessments: ['Assessment'],
            asynchronousActivities: ['Activity'],
            synchronousActivities: ['Discussion'],
            apiKey: secret,
          },
        ],
      },
      columns: [],
      userEdits: [],
      chatHistory: [{ role: 'assistant', text: `Do not restore ${secret}` }],
      fileNames: [],
      versionHistory: [],
      selectedFeatures: ['courseMap'],
      lessonScope: { type: 'all' },
      deliverableConfig: {},
      activeTab: 'courseMap',
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: { notes: `Plan ${secret}` },
        },
      },
    };

    await page.locator('#landing-file-input').setInputFiles({
      name: 'Legacy Unsafe Project.coursemapper',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(project)),
    });

    await expect(page.locator('body')).toContainText('Lesson [redacted secret]', { timeout: 10000 });
    await expect(page.locator('body')).not.toContainText(secret);
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
  test('prefetches AppFlow while the landing page stays interactive', async ({ page }) => {
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
    await expect(page.locator('h1:has-text("Turn a syllabus")')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Connected').first()).toBeVisible({ timeout: 10000 });
    await expect.poll(() => appFlowRequests.length, { timeout: 5000 }).toBeGreaterThan(0);
    await expect(page.getByTestId('landing-requirement')).toBeVisible();

    await page.getByTestId('course-example-chip').first().click();
    await landingSetupButton(page).click();
    await expect(page.getByRole('heading', { name: 'Choose materials' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading…')).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. CONFIGURE GENERATION
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Configure Generation', () => {
  test('keeps first-run primary CTAs in view on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
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
    await page.locator('textarea').fill('Build an 8-lesson Spanish for Healthcare Professionals course.');
    await landingSetupButton(page).click();

    await expect(page.getByRole('heading', { name: 'Choose materials' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('feature-select-sticky-action')).toBeVisible();
    await expect(page.getByTestId('feature-select-continue')).toBeVisible();
    await page.getByTestId('feature-select-continue').click();

    await expect(page.getByRole('heading', { name: 'Configure materials' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('config-sticky-action')).toBeVisible();
    await expect(page.getByTestId('config-generate-button')).toBeVisible();
    const courseMapSettings = page.getByRole('button', { name: 'Expand Course Map settings' });
    await expect(courseMapSettings).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('deliverable-preview-courseMap')).toHaveCount(0);
    await courseMapSettings.click();
    await expect(page.getByTestId('deliverable-preview-courseMap')).toContainText('Course Map — 8 lessons');
    await expect(page.getByTestId('preview-course-context')).toContainText('Spanish for Healthcare Professionals');
    await expect(page.getByTestId('deliverable-preview-courseMap')).not.toContainText('Machine Learning');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Open Course Map full-screen preview' }).click();
    const previewDialog = page.getByRole('dialog', { name: /Course Map — 8 items/ });
    await expect(previewDialog).toBeVisible();
    await expect
      .poll(async () => Math.abs((await previewDialog.boundingBox())?.x || 0), { timeout: 2000 })
      .toBeLessThanOrEqual(1);
    const previewDialogBox = await previewDialog.boundingBox();
    expect(previewDialogBox.x).toBeLessThanOrEqual(1);
    expect(previewDialogBox.y).toBeLessThanOrEqual(1);
    expect(previewDialogBox.width).toBeGreaterThanOrEqual(389);
    expect(previewDialogBox.height).toBeGreaterThanOrEqual(843);
    const dialogOwnsViewportTop = await page.evaluate(() =>
      Boolean(document.elementFromPoint(window.innerWidth / 2, 24)?.closest('[role="dialog"]')),
    );
    expect(dialogOwnsViewportTop).toBe(true);
    await page.keyboard.press('Escape');
    await expect(previewDialog).toBeHidden();

    await expect(page.getByTestId('config-top-advanced-toggle')).toBeVisible();
    await expect(page.locator('text=Model-tuned defaults')).toHaveCount(0);
    await page.getByTestId('config-top-advanced-toggle').click();
    await expect(page.locator('text=Model-tuned defaults')).toBeVisible();
  });

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
    await landingSetupButton(page).click();

    await expect(page.getByRole('heading', { name: 'Choose materials' })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Course FAQ/ }).click();
    await page.getByTestId('feature-select-continue').click();

    await expect(page.getByRole('heading', { name: 'Configure materials' })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Expand Course FAQ settings' }).click();

    await expect(page.getByText('Questions per lesson')).toBeVisible();
    await expect(page.getByText('Question categories')).toBeVisible();
    await expect(page.getByText('Answer depth')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Course Logistics' })).toBeVisible();
  });

  test('uses selected model capabilities to tune configure defaults', async ({ page }) => {
    await page.route('https://api.openai.com/v1/models', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ id: 'gpt-5-future-long', created: 1 }],
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
    await page.route('https://api.openai.com/v1/responses', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          output_text: 'ok',
          output: [{ content: [{ type: 'output_text', text: 'ok' }] }],
        }),
      }),
    );

    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('coursemapper-provider', 'openai');
      localStorage.setItem('coursemapper-apikey', 'sk-proj-test1234567890123456789012345678901234567890123456');
      localStorage.setItem('coursemapper-modelid', 'gpt-5-future-long');
      localStorage.setItem('coursemapper-modelname', 'GPT-5 Future Long');
      localStorage.setItem(
        'coursemapper-model-capabilities-current',
        JSON.stringify({
          provider: 'openai',
          modelId: 'gpt-5-future-long',
          modelName: 'GPT-5 Future Long',
          maxOutputTokens: 131072,
          quality: 'high',
          structuredOutput: { supportsStrictSchema: true, jsonReliability: 'high' },
          reasoning: { supported: true },
        }),
      );
    });

    await page.goto('/');
    await expect(page.locator('text=Connected').first()).toBeVisible({ timeout: 10000 });
    await page.locator('textarea').fill('Build a 12-lesson course with slide decks.');
    await landingSetupButton(page).click();

    await expect(page.getByRole('heading', { name: 'Choose materials' })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Slide Decks/ }).click();
    await page.getByTestId('feature-select-continue').click();

    await expect(page.getByRole('heading', { name: 'Configure materials' })).toBeVisible({ timeout: 10000 });
    await page.getByTestId('config-top-advanced-toggle').click();
    await expect(page.getByText('Model-tuned defaults')).toBeVisible();
    await expect(page.getByText(/uses detailed defaults\./)).toBeVisible();
    await expect(page.getByText('Long output')).toBeVisible();
    await page.getByRole('button', { name: 'Expand Slide Decks settings' }).click();
    await expect(page.getByText('Model default: 14.')).toBeVisible();
    await expect(page.getByText('Model default: Full script.')).toBeVisible();
    await page.getByRole('button', { name: 'Advanced options' }).click();
    await expect(page.getByRole('button', { name: 'Auto (Detailed)' })).toBeVisible();
  });

  test('saves institution profile defaults from the configure screen', async ({ page }) => {
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
    await page.locator('textarea').fill('Build a 12-lesson course with reusable institution policies.');
    await landingSetupButton(page).click();

    await expect(page.getByRole('heading', { name: 'Choose materials' })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Course FAQ/ }).click();
    await page.getByTestId('feature-select-continue').click();

    await expect(page.getByRole('heading', { name: 'Configure materials' })).toBeVisible({ timeout: 10000 });
    await page.getByTestId('config-top-advanced-toggle').click();
    await expect(page.getByTestId('institution-profile-card')).toBeVisible();
    await page.getByRole('button', { name: /Institution profile/ }).click();

    await page.getByLabel('Institution').fill('NYU Silver');
    await page.getByLabel('AI Use').fill('Students may use AI for brainstorming but must cite substantial assistance.');

    await expect
      .poll(() =>
        page.evaluate(() => JSON.parse(localStorage.getItem('coursemapper-professorProfile') || '{}').institution),
      )
      .toBe('NYU Silver');
    await expect(page.getByTestId('institution-profile-card')).toContainText('Saved');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. HASH ROUTING
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Hash Routing', () => {
  test('/ renders the landing page', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1:has-text("Turn a syllabus")')).toBeVisible({ timeout: 10000 });
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

  test('#/contact renders the contact page', async ({ page }) => {
    await page.goto('/#/contact');
    await expect(page.locator('h1:has-text("Contact")')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('link', { name: 'General support' })).toBeVisible();
  });

  test('#/faq redirects to #/', async ({ page }) => {
    await page.goto('/#/faq');
    await expect(page.locator('h1:has-text("Turn a syllabus")')).toBeVisible({ timeout: 10000 });
  });

  test('footer link navigates to privacy page', async ({ page }) => {
    await loadApp(page);
    await page.locator('a[href="#/privacy"]').click();
    await expect(page.locator('h1:has-text("Privacy")')).toBeVisible({ timeout: 5000 });
  });

  test('footer link navigates to changelog', async ({ page }) => {
    await loadApp(page);
    await page.locator('a[href="#/changelog"]').first().click();
    await expect(page.locator('h1:has-text("Changelog")')).toBeVisible({ timeout: 5000 });
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
    await slideTab.click();
    await expect(page.locator('text=Drop to delete')).not.toBeVisible();
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

    const logo = page.locator('img[alt="EduTool.dev"]');
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
    await expect(page).toHaveTitle('Course Mapper — Free course maps and teaching materials');
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
    const logo = page.locator('img[alt="EduTool.dev"]');
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

    const chip = page.getByTestId('course-example-chip').first();
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

    // Public Scion is ready without a key, so first-run configuration starts
    // collapsed. Editing the compact summary still reveals the full panel.
    await expect(page.getByTestId('ai-config-summary')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /^Edit$/ }).click();
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

  test('entering the website reconnects to the last selected model', async ({ page }) => {
    await page.route('https://api.openai.com/v1/models', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { id: 'gpt-5.4-mini', created: 3 },
            { id: 'gpt-4o-mini', created: 2 },
          ],
        }),
      });
    });
    await page.route('https://api.openai.com/v1/chat/completions', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }),
      });
    });
    await page.route('https://api.openai.com/v1/responses', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ output: [{ content: [{ type: 'output_text', text: '{"ok":true}' }] }] }),
      });
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
    await expect(page.getByText('Connected')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /^Edit$/ }).click();

    const modelSelect = page.locator('#ai-model-select');
    await expect(modelSelect).toBeVisible({ timeout: 1000 });
    await expect(modelSelect).toHaveValue('gpt-4o-mini');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('coursemapper-modelid'))).toBe('gpt-4o-mini');
  });

  test('provider picker restores saved credentials without rendering secret values', async ({ page }) => {
    const openaiKey = 'sk-proj-openai-saved-key-for-e2e-1234567890';
    const googleKey = 'AIzaGoogleSavedKeyForE2E00000000000000000';
    await page.route('https://api.openai.com/v1/models', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: [{ id: 'gpt-4o-mini', created: 2 }] }),
      });
    });
    await page.route('https://api.openai.com/v1/chat/completions', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }),
      });
    });
    await page.route('https://generativelanguage.googleapis.com/v1beta/models?**', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          models: [
            {
              name: 'models/gemini-2.5-flash',
              displayName: 'Gemini 2.5 Flash',
              supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
              outputTokenLimit: 65536,
            },
          ],
        }),
      });
    });
    await page.route('https://generativelanguage.googleapis.com/v1beta/models/*:generateContent?**', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }),
      });
    });
    await page.addInitScript(
      ({ googleKey, openaiKey }) => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('coursemapper-provider', 'openai');
        localStorage.setItem('coursemapper-apikey-provider:openai', openaiKey);
        localStorage.setItem('coursemapper-apikey-provider:google', googleKey);
        localStorage.setItem('coursemapper-modelid', 'gpt-4o-mini');
        localStorage.setItem('coursemapper-modelname', 'GPT-4o mini');
      },
      { googleKey, openaiKey },
    );

    await page.goto('/');
    await expect(page.getByText('Connected')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /^Edit$/ }).click();

    const providerSelect = page.locator('#ai-provider-select');
    const apiKeyInput = page.locator('#ai-api-key-input');
    await expect(apiKeyInput).toHaveValue('');
    await expect(apiKeyInput).toHaveAttribute('placeholder', /Saved API key/);

    await providerSelect.selectOption('google');
    await expect(apiKeyInput).toHaveValue('');
    await expect(apiKeyInput).toHaveAttribute('placeholder', /Saved API key/);

    await providerSelect.selectOption('anthropic');
    await expect(apiKeyInput).toHaveValue('');
    await expect(apiKeyInput).not.toHaveAttribute('placeholder', /Saved API key/);

    await providerSelect.selectOption('openai');
    await expect(apiKeyInput).toHaveValue('');
    await expect(apiKeyInput).toHaveAttribute('placeholder', /Saved API key/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. STATIC PAGES
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Static Pages', () => {
  test('changelog page has version entries', async ({ page }) => {
    await page.goto('/#/changelog');
    // The changelog is a large, lazy route. Wait for its semantic ready
    // boundary instead of sampling body text after an arbitrary second; a
    // busy CI runner can still be showing the landing/suspense shell then.
    await expect(page.locator('h1:has-text("Changelog")')).toBeVisible({ timeout: 15000 });
    const body = await page.locator('body').textContent();
    expect(body).toContain('0.16.24');
    expect(body).toContain('Eight Small Readings');
    expect(body).toContain('0.15.12');
    expect(body).toContain('0.15.7');
    expect(body).toContain('0.15.6');
    expect(body).toContain('0.15.5');
    expect(body).toContain('0.15.4');
    expect(body).toContain('0.5');
    expect(body.length).toBeGreaterThan(200);
  });

  test('privacy page has required content', async ({ page }) => {
    await page.goto('/#/privacy');
    await expect(page.locator('h1:has-text("Privacy")')).toBeVisible({ timeout: 10000 });
    const body = await page.locator('body').textContent();
    expect(body).toContain('Privacy');
    expect(body).toContain('data');
  });

  test('terms page has required content', async ({ page }) => {
    await page.goto('/#/terms');
    await expect(page.locator('h1:has-text("Terms")')).toBeVisible({ timeout: 10000 });
    const body = await page.locator('body').textContent();
    expect(body).toContain('Terms');
  });

  test('changelog page has header with logo', async ({ page }) => {
    await page.goto('/#/changelog');
    // Router renders landing (display:none) + changelog; pick the visible (last) logo
    await expect(page.locator('img[alt="EduTool.dev"]').last()).toBeVisible({ timeout: 10000 });
  });

  test('privacy page has header with logo', async ({ page }) => {
    await page.goto('/#/privacy');
    await expect(page.locator('img[alt="EduTool.dev"]').last()).toBeVisible({ timeout: 10000 });
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

    const chip = page.getByTestId('course-example-chip').first();
    const expectedPrompt = await chip.getAttribute('data-example-text');

    await chip.dblclick();
    const value = await page.locator('textarea').inputValue();
    expect(value).toBe(expectedPrompt);
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
