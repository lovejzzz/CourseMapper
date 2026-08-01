/**
 * @vitest-environment happy-dom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AgentQualityControl from '../AgentQualityControl';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('AgentQualityControl', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('keeps the honest evidence score and report action in Agent', () => {
    const onOpen = vi.fn();
    act(() => {
      root.render(
        <AgentQualityControl
          quality={{
            status: 'graded',
            score: 89,
            grade: 'B',
            readiness: { score: 34, maxScore: 100 },
          }}
          trustStatus={{ blocked: false, clean: false }}
          onOpen={onOpen}
        />,
      );
    });

    const button = container.querySelector('[data-testid="agent-quality-score"]');
    expect(container.textContent).toContain('Agent quality report');
    expect(button?.textContent).toContain('Evidence 34/100');
    expect(button?.getAttribute('aria-label')).toContain('reasons, and improvement actions');

    act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onOpen).toHaveBeenCalledWith(true);
  });

  it('shows the candid failure reason in Agent without offering a broken report action', () => {
    const onOpen = vi.fn();
    act(() => {
      root.render(
        <AgentQualityControl
          quality={{ status: 'not-graded', reason: 'quality check timed out' }}
          trustStatus={{ blocked: true, clean: false }}
          onOpen={onOpen}
        />,
      );
    });

    expect(container.querySelector('[data-testid="agent-quality-unavailable"]')?.textContent).toContain(
      'Quality unavailable',
    );
    expect(container.querySelector('[data-testid="agent-quality-reason"]')?.textContent).toContain(
      'quality check timed out',
    );
    expect(container.textContent).toContain('Run Prepare package again.');
    expect(container.textContent).not.toContain('undefined');
    expect(container.querySelector('button')).toBeNull();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('fails closed when a nominally graded result has no displayable score', () => {
    act(() => {
      root.render(
        <AgentQualityControl
          quality={{ status: 'graded', readiness: { score: 34, maxScore: 100 }, reason: '   ' }}
          trustStatus={{ blocked: false, clean: false }}
          onOpen={() => {}}
        />,
      );
    });

    expect(container.querySelector('[data-testid="agent-quality-unavailable"]')).not.toBeNull();
    expect(container.textContent).toContain('The quality grader did not return a complete result.');
    expect(container.textContent).not.toContain('undefined');
    expect(container.querySelector('button')).toBeNull();
  });
});
