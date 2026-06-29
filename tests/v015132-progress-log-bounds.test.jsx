/**
 * @vitest-environment happy-dom
 *
 * v0.15.132 - Progress log bounds.
 *
 * Long provider activity logs must not auto-expand during generation, and
 * opening the log should render a bounded tail instead of every event.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import ProgressPanel from '../src/components/ProgressPanel.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function render(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

let mounted = [];
afterEach(() => {
  mounted.forEach((m) => m.unmount());
  mounted = [];
});

function mount(element) {
  const m = render(element);
  mounted.push(m);
  return m;
}

function longActivityLog(count = 120) {
  return Array.from({ length: count }, (_, index) => ({
    type: index === count - 1 ? 'done' : 'progress',
    message: `provider activity event ${String(index + 1).padStart(3, '0')}`,
    at: Date.UTC(2026, 5, 29, 12, 0, 0) + index,
  }));
}

function panelProps(overrides = {}) {
  return {
    currentStep: 'done',
    activeTab: 'courseMap',
    deliverables: {
      syllabus: { status: 'generating' },
      lessonPlans: { status: 'queued' },
    },
    delivGenerationLog: longActivityLog(),
    syncLog: [],
    isDelivGenerating: true,
    isSyncing: false,
    currentDelivFeatures: new Set(['syllabus']),
    delivProgress: { perFeature: {} },
    delivTimings: {},
    ...overrides,
  };
}

describe('v0.15.132 progress log bounds', () => {
  it('does not auto-open long provider activity logs while deliverables are generating', () => {
    const { container } = mount(<ProgressPanel {...panelProps()} />);

    const activityButton = container.querySelector('button[aria-label="Expand activity log"]');
    expect(activityButton).not.toBeNull();
    expect(activityButton.getAttribute('aria-expanded')).toBe('false');
    expect(activityButton.textContent).toContain('(120)');
    expect(container.textContent).not.toContain('provider activity event 001');
    expect(container.textContent).not.toContain('provider activity event 120');
  });

  it('renders only the latest activity tail when a long log is opened', () => {
    const { container } = mount(<ProgressPanel {...panelProps()} />);
    const activityButton = container.querySelector('button[aria-label="Expand activity log"]');

    act(() => {
      activityButton.click();
    });

    expect(container.textContent).toContain('Showing latest 80 of 120 events');
    expect(container.textContent).not.toContain('provider activity event 001');
    expect(container.textContent).not.toContain('provider activity event 040');
    expect(container.textContent).toContain('provider activity event 041');
    expect(container.textContent).toContain('provider activity event 120');
  });

  it('still auto-opens short sync logs because they explain user-triggered updates', () => {
    const { container } = mount(
      <ProgressPanel
        {...panelProps({
          delivGenerationLog: [],
          syncLog: [
            {
              type: 'start',
              featureId: 'lessonPlans',
              message: 'Refreshing after course map edit',
              at: Date.UTC(2026, 5, 29, 12, 0, 0),
            },
          ],
          isDelivGenerating: false,
          isSyncing: true,
        })}
      />,
    );

    expect(container.querySelector('button[aria-label="Collapse activity log"]')).not.toBeNull();
    expect(container.textContent).toContain('[Auto-sync] Lesson Plans: Refreshing after course map edit');
  });
});
