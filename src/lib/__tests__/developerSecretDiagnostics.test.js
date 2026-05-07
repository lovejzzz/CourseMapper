import { describe, expect, it } from 'vitest';
import { assertNoDeveloperSecrets, getDeveloperSecretFindings } from '../developerSecretDiagnostics';

describe('developerSecretDiagnostics', () => {
  it('flags sensitive field names recursively', () => {
    const findings = getDeveloperSecretFindings({
      deliverableConfig: {
        slideDecks: {
          apiKey: 'sk-test-secret',
        },
      },
    });

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 'error',
          path: 'deliverableConfig.slideDecks.apiKey',
          kind: 'sensitive-field',
        }),
      ]),
    );
  });

  it('flags key-like string values even under neutral fields', () => {
    const findings = getDeveloperSecretFindings({
      notes: 'Use sk-proj-abcdefghijklmnopqrstuvwxyz123456 for the demo',
    });

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'notes',
          kind: 'secret-value',
        }),
      ]),
    );
  });

  it('throws with a precise path for unsafe developer data', () => {
    expect(() => assertNoDeveloperSecrets({ accessToken: 'token-value' }, 'Template')).toThrow('accessToken');
  });
});
