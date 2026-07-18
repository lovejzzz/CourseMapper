/**
 * @vitest-environment happy-dom
 *
 * v0.16.54 — older and provider-authored list entries may use labeled objects.
 * Editable course text must render their useful value without crashing React.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import AssignmentsView from '../src/components/deliverables/AssignmentsView.jsx';
import { editableTextValue } from '../src/components/deliverables/shared/SharedComponents.jsx';

describe('v0.16.54 resilient editable text', () => {
  it('extracts human text from legacy labeled objects', () => {
    expect(editableTextValue({ step: 'Record the evidence.' })).toBe('Record the evidence.');
    expect(editableTextValue({ name: 'Evidence checklist' })).toBe('Evidence checklist');
  });

  it('renders object-shaped assignment instructions and deliverables', () => {
    const html = renderToStaticMarkup(
      <AssignmentsView
        data={{
          assignments: [
            {
              title: 'Legacy Assignment',
              instructions: ['Open each file.', { step: 'Record any missing assignment details.' }],
              deliverables: ['Audit memo', { name: 'Evidence checklist' }],
            },
          ],
        }}
      />,
    );

    expect(html).toContain('Record any missing assignment details.');
    expect(html).toContain('Evidence checklist');
    expect(html).not.toContain('[object Object]');
  });
});
