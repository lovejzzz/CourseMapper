/**
 * @vitest-environment happy-dom
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DeliverablePreview } from '../src/screens/Config.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function renderPreview(props) {
  await act(async () => {
    root.render(<DeliverablePreview {...props} />);
  });
}

describe('Configure deliverable preview rendered-root authority', () => {
  it('shows canonical FAQ content instead of a stale legacy alias', async () => {
    await renderPreview({
      featureId: 'courseFaq',
      delivData: {
        courseFaq: [{ question: 'Canonical setup question', answer: 'Canonical setup answer' }],
        faqs: [{ question: 'Stale alias question', answer: 'Stale alias answer' }],
      },
    });

    expect(container.textContent).toContain('Canonical setup question');
    expect(container.textContent).not.toContain('Stale alias question');
  });

  it('uses a valid legacy FAQ alias when the canonical field is malformed', async () => {
    await renderPreview({
      featureId: 'courseFaq',
      delivData: {
        courseFaq: { error: 'partial migration' },
        faqs: [{ question: 'Recovered setup question', answer: 'Recovered setup answer' }],
      },
    });

    expect(container.textContent).toContain('Recovered setup question');
  });
});
