/**
 * @vitest-environment happy-dom
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DeveloperModePanel from '../DeveloperModePanel.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('focus-trap-react', async () => {
  const React = await import('react');
  return {
    default: function MockFocusTrap({ children }) {
      return React.createElement(React.Fragment, null, children);
    },
  };
});

vi.mock('../developer/DeveloperCodeEditor.jsx', async () => {
  const React = await import('react');
  return {
    default: React.forwardRef(function MockDeveloperCodeEditor({ value, onChange, sectionId }, ref) {
      React.useImperativeHandle(ref, () => ({
        focus() {},
        getSelectionEnd() {
          return 0;
        },
        selectRange() {},
      }));

      return React.createElement('textarea', {
        'data-testid': `developer-code-editor-${sectionId}`,
        value,
        onChange: (event) => onChange(event.target.value),
      });
    }),
  };
});

function makeSnapshot(title) {
  return {
    courseMap: {
      courseName: 'Developer IDE Test',
      lessons: [{ title, sections: [{ topic: 'Intro' }] }],
    },
    selectedFeatures: ['courseMap'],
    deliverableConfig: {},
    lessonScope: { type: 'all' },
    columns: [{ key: 'topic', label: 'Topic', enabled: true }],
    deliverables: {},
    activeTab: 'courseMap',
    provider: 'openai',
    modelId: 'gpt-5.4-mini',
  };
}

function setTextareaValue(textarea, value) {
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  act(() => {
    valueSetter.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  });
}

function findButton(container, label) {
  return Array.from(container.querySelectorAll('button')).find((button) => button.textContent.includes(label));
}

describe('DeveloperModePanel workspace snapshot freshness', () => {
  let container;
  let root;
  let onApply;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    onApply = vi.fn();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  function renderPanel(snapshot) {
    act(() => {
      root.render(
        <DeveloperModePanel
          isOpen
          snapshot={snapshot}
          developerTemplates={[]}
          onApply={onApply}
          onSaveTemplate={vi.fn()}
          onClose={vi.fn()}
        />,
      );
    });
  }

  it('auto-syncs clean editor drafts when the workspace snapshot changes', () => {
    renderPanel(makeSnapshot('Week 1'));

    expect(container.querySelector('[data-testid="developer-code-editor-courseMap"]').value).toContain('Week 1');

    renderPanel(makeSnapshot('Week 2'));

    expect(container.querySelector('[data-testid="developer-code-editor-courseMap"]').value).toContain('Week 2');
    expect(container.querySelector('[data-testid="developer-status"]').textContent).toContain(
      'Synced to the current workspace code',
    );
  });

  it('blocks applying stale dirty drafts after the workspace changes elsewhere', () => {
    renderPanel(makeSnapshot('Week 1'));

    const editor = container.querySelector('[data-testid="developer-code-editor-courseMap"]');
    setTextareaValue(
      editor,
      JSON.stringify({ courseName: 'Developer IDE Test', lessons: [{ title: 'Local dirty edit', sections: [] }] }),
    );

    renderPanel(makeSnapshot('Week 2'));

    expect(container.querySelector('[data-testid="developer-workspace-stale"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="developer-code-editor-courseMap"]').value).toContain(
      'Local dirty edit',
    );
    expect(findButton(container, 'Apply & Save').disabled).toBe(true);
    expect(container.querySelector('[data-testid="developer-status"]').textContent).toContain(
      'Workspace changed outside Developer Mode',
    );
  });
});
