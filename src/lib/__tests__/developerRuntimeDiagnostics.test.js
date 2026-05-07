import { describe, expect, it } from 'vitest';
import { formatBytes, getDeveloperRuntimeDiagnostics } from '../developerRuntimeDiagnostics';

function snapshot(overrides = {}) {
  return {
    provider: 'openai',
    modelId: 'gpt-5.4-mini',
    modelName: 'GPT-5.4 Mini',
    selectedFeatures: ['courseMap', 'lessonPlans', 'quizBank'],
    deliverables: {
      lessonPlans: { status: 'done', data: { lessonPlans: [] }, stale: true },
      quizBank: { status: 'error', error: 'Failed' },
    },
    deliverableConfig: {
      quizBank: { customUserPrompt: 'Generate questions without course content.' },
      lessonPlans: { extraInstructions: 'Keep it concise.' },
    },
    columns: [{ key: 'topic' }, { key: 'objectives', enabled: false }],
    courseMap: { lessons: [{ title: 'Week 1', sections: [{ topic: 'Intro' }] }] },
    ...overrides,
  };
}

describe('developerRuntimeDiagnostics', () => {
  it('summarizes provider, deliverable, prompt, and storage risk', () => {
    const diagnostics = getDeveloperRuntimeDiagnostics(snapshot(), 2);

    expect(diagnostics.providerLabel).toBe('openai');
    expect(diagnostics.modelLabel).toBe('GPT-5.4 Mini');
    expect(diagnostics.apiKeyPolicy).toContain('not included');
    expect(diagnostics.counts).toEqual(
      expect.objectContaining({
        selectedDeliverables: 2,
        generatedSelected: 1,
        errors: 1,
        stale: 1,
        promptOverrides: 2,
        promptRisks: 1,
        enabledColumns: 1,
        columns: 2,
      }),
    );
    expect(diagnostics.risks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: 'error', title: 'Generation Errors' }),
        expect.objectContaining({ level: 'warning', title: 'Stale Outputs' }),
        expect.objectContaining({ level: 'warning', title: 'Prompt Placeholder Risk' }),
        expect.objectContaining({ level: 'info', title: 'Pending Developer Edits' }),
      ]),
    );
  });

  it('flags missing provider/model and missing selected outputs', () => {
    const diagnostics = getDeveloperRuntimeDiagnostics(
      snapshot({
        provider: '',
        modelId: '',
        modelName: '',
        deliverables: {},
        deliverableConfig: {},
      }),
    );

    expect(diagnostics.risks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Provider Missing' }),
        expect.objectContaining({ title: 'Model Missing' }),
        expect.objectContaining({ title: 'Missing Outputs' }),
      ]),
    );
  });

  it('formats byte counts for compact display', () => {
    expect(formatBytes(0)).toBe('0 KB');
    expect(formatBytes(999)).toBe('1 KB');
    expect(formatBytes(1_500_000)).toBe('1.5 MB');
  });
});
