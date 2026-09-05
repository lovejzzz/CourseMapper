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

describe('getAgentTurnModel (v0.9 per-turn routing)', async () => {
  const { getAgentTurnModel } = await import('../agentModelRouting.js');

  it('escalates OpenAI mini models for critique/authorship turns', () => {
    const result = getAgentTurnModel({
      provider: 'openai',
      modelId: 'gpt-5.4-mini',
      userMessage: 'What do you think of the Lesson 4 assignment? Review it honestly.',
    });
    expect(result.escalated).toBe(true);
    expect(result.modelId).toBe('gpt-5.5');
  });

  it('keeps mini models for targeted edits and reads', () => {
    const result = getAgentTurnModel({
      provider: 'openai',
      modelId: 'gpt-5.4-mini',
      userMessage: 'Rename Lesson 2 to Intro to NLP',
    });
    expect(result.escalated).toBe(false);
    expect(result.modelId).toBe('gpt-5.4-mini');
  });

  it('never reroutes non-OpenAI or non-mini configurations', () => {
    expect(
      getAgentTurnModel({ provider: 'anthropic', modelId: 'claude-haiku-4-5', userMessage: 'critique lesson 1' })
        .escalated,
    ).toBe(false);
    expect(
      getAgentTurnModel({ provider: 'openai', modelId: 'gpt-5.5', userMessage: 'critique lesson 1' }).escalated,
    ).toBe(false);
  });
});
