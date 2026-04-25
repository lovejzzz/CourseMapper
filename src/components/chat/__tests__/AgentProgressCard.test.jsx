import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AgentProgressCard from '../AgentProgressCard';

describe('AgentProgressCard', () => {
  it('uses persisted run timing for completed work', () => {
    const html = renderToStaticMarkup(
      <AgentProgressCard
        status="complete"
        startedAt={1000}
        endedAt={15200}
        steps={[
          { label: 'Read slides', status: 'done' },
          { label: 'Generate image', status: 'done' },
          { label: 'Verify export', status: 'done' },
        ]}
      />,
    );

    expect(html).toContain('3 steps');
    expect(html).toContain('14s');
    expect(html).not.toContain('0s');
  });

  it('describes sub-second completed work without showing 0s', () => {
    const html = renderToStaticMarkup(
      <AgentProgressCard
        status="complete"
        startedAt={1000}
        endedAt={1000}
        steps={[{ label: 'Verify slides', status: 'done' }]}
      />,
    );

    expect(html).toContain('under 1s');
    expect(html).not.toContain('0s');
  });
});
