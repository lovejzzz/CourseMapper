/**
 * @vitest-environment happy-dom
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';

import SetupProgress from '../src/components/SetupProgress.jsx';
import { RECOMMENDED_FEATURE_IDS } from '../src/screens/FeatureSelect.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const read = (path) => fs.readFileSync(path, 'utf8');
const mounted = [];

function render(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  const result = {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
  mounted.push(result);
  return result;
}

afterEach(() => {
  mounted.splice(0).forEach((view) => view.unmount());
});

describe('v0.16.3 first-five-minutes UX contract', () => {
  it('announces the current step across Brief, Materials, and Generate', () => {
    for (const [current, label] of [
      ['brief', 'Brief'],
      ['materials', 'Materials'],
      ['generate', 'Generate'],
    ]) {
      const { container, unmount } = render(<SetupProgress current={current} />);
      expect(container.querySelector('nav')?.getAttribute('aria-label')).toBe('Course setup progress');
      expect(container.querySelector('[aria-current="step"]')?.textContent).toContain(label);
      unmount();
      mounted.pop();
    }
  });

  it('defines a balanced recommended package without forcing every deliverable', () => {
    expect(RECOMMENDED_FEATURE_IDS).toEqual([
      'courseMap',
      'syllabus',
      'lessonPlans',
      'assignments',
      'rubrics',
      'quizBank',
    ]);
    expect(RECOMMENDED_FEATURE_IDS).not.toContain('slideDecks');
    expect(RECOMMENDED_FEATURE_IDS).not.toContain('courseFaq');
  });

  it('keeps the landing brief primary and connected Scion progressive', () => {
    const landing = read('src/screens/Landing.jsx');
    expect(landing).toContain('Turn a syllabus into a teachable course.');
    expect(landing).toContain('data-testid="ai-config-summary"');
    expect(landing).toContain('useState(isReady)');
    expect(landing).toContain('Connected');
    expect(landing).toContain('On-device');
    expect(landing).toContain('Generate full course');
    expect(landing).toContain('Customize package');
    expect(landing).toContain('data-testid="landing-requirement"');
  });

  it('keeps optional tuning collapsed and final actions reachable', () => {
    const config = read('src/screens/Config.jsx');
    const features = read('src/screens/FeatureSelect.jsx');
    expect(config).toContain('useState(null)');
    expect(config).toContain('data-testid="scion-generation-boundary"');
    expect(config).toContain('sticky top-3');
    expect(features).toContain('data-testid="feature-select-recommended"');
    expect(features).toContain('line-clamp-2');
    expect(features).toContain('Review generation');
  });

  it('prefetches the flow and keeps the mobile workspace readable by default', () => {
    const app = read('src/App.jsx');
    const preview = read('src/components/CourseMapPreview.jsx');
    const css = read('src/index.css');
    expect(app).toContain('const loadAppFlow = () => import');
    expect(app).toContain('requestIdleCallback');
    expect(preview).toContain('Swipe the table to review every course-map field.');
    expect(preview).toContain('min-w-[1100px]');
    expect(css).toMatch(/min-height:\s*44px/);
    expect(css).toMatch(/min-width:\s*44px/);
  });

  it('keeps the real browser harness on the primary full-course journey', () => {
    const harness = read('scripts/lib/crucibleBrowser.mjs');
    expect(harness).toContain("page.getByTestId('landing-quick-start')");
    expect(harness).toContain('Test the real primary journey when available.');
    expect(harness).toContain('Customize package');
  });
});
