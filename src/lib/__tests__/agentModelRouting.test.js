import { describe, expect, it } from 'vitest';
import { getModelRoutingAdvice } from '../agentModelRouting';

describe('getModelRoutingAdvice', () => {
  it('escalates OpenAI mini models only after concrete blockers remain', () => {
    const advice = getModelRoutingAdvice({
      provider: 'openai',
      modelId: 'gpt-5.4-mini',
      confidence: 'Needs attention',
      exportStatus: 'passed',
    });

    expect(advice.shouldEscalate).toBe(true);
    expect(advice.nextModel).toBe('gpt-5.5');
  });

  it('keeps the current model when the package is ready', () => {
    const advice = getModelRoutingAdvice({
      provider: 'openai',
      modelId: 'gpt-5.4-mini',
      confidence: 'Excellent',
      exportStatus: 'passed',
    });

    expect(advice.shouldEscalate).toBe(false);
    expect(advice.nextModel).toBe('gpt-5.4-mini');
  });
});
