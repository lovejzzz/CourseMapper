import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import AgentQualityControl from '../AgentQualityControl';

describe('AgentQualityControl', () => {
  it('keeps the honest evidence score and report action in Agent', () => {
    const html = renderToStaticMarkup(
      <AgentQualityControl
        quality={{
          status: 'graded',
          score: 89,
          grade: 'B',
          readiness: { score: 34, maxScore: 100 },
        }}
        trustStatus={{ blocked: false, clean: false }}
        onOpen={() => {}}
      />,
    );

    expect(html).toContain('data-testid="agent-quality-control"');
    expect(html).toContain('Agent quality report');
    expect(html).toContain('data-testid="agent-quality-score"');
    expect(html).toContain('Evidence 34/100');
    expect(html).toContain('Open the honest package quality score, reasons, and improvement actions');
  });
});
