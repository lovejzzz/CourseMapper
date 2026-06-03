/**
 * @vitest-environment happy-dom
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import MessageBubble from '../MessageBubble';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('MessageBubble', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    container.remove();
  });

  it('preserves line breaks in user messages', () => {
    root = createRoot(container);
    act(() => {
      root.render(<MessageBubble role="user" text={'Project brief\n\nUploaded materials:\n- syllabus.pdf'} />);
    });

    const userMessage = container.querySelector('[data-testid="chat-message-user"] > div > div');
    expect(userMessage?.className).toContain('whitespace-pre-wrap');
    expect(userMessage?.textContent).toContain('Uploaded materials:');
  });
});
