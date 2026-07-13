import fs from 'node:fs/promises';

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { auditScionBrowserBaseContract } from '../scripts/scionBrowserBaseAudit.mjs';

let contract;

beforeAll(async () => {
  contract = JSON.parse(await fs.readFile('evaluation/scion-adapters/base-contracts/gemma-4-e2b.json', 'utf8'));
});

function jsonResponse(payload) {
  return { ok: true, status: 200, json: async () => payload };
}

function goodHubPayload(identity, { includeArtifact = false } = {}) {
  return {
    id: identity.modelId,
    sha: identity.revision,
    private: false,
    gated: false,
    disabled: false,
    cardData: {
      license: identity.license,
      ...(includeArtifact ? { base_model: identity.declaredBaseModelId } : {}),
    },
    siblings: includeArtifact
      ? [
          {
            rfilename: identity.file,
            size: identity.bytes,
            lfs: { sha256: identity.sha256, size: identity.bytes },
          },
        ]
      : [],
  };
}

describe('Scion browser base audit', () => {
  it('verifies the actual production GGUF, exact QAT parent, and packaged runtime assets', async () => {
    const fetchImpl = vi.fn(async (url) =>
      jsonResponse(
        String(url).includes(contract.browserArtifact.modelId)
          ? goodHubPayload(contract.browserArtifact, { includeArtifact: true })
          : goodHubPayload(contract.trainingBase),
      ),
    );
    const report = await auditScionBrowserBaseContract({ contract, fetchImpl });

    expect(report).toMatchObject({
      status: 'pass',
      mode: 'base-only',
      adapterActive: false,
      modelBackendRequired: false,
      onlineVerified: true,
      issues: [],
      activeWeightIdentity: {
        modelId: 'google/gemma-4-E2B-it-qat-q4_0-gguf',
        bytes: 3349514112,
      },
      trainingBase: { modelId: 'google/gemma-4-E2B-it-qat-q4_0-unquantized' },
    });
    expect(report.runtimeAssets).toHaveLength(2);
    expect(report.runtimeAssets.every((asset) => asset.issues.length === 0)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('fails closed when the immutable Hub file digest changes', async () => {
    const browserHub = goodHubPayload(contract.browserArtifact, { includeArtifact: true });
    browserHub.siblings[0].lfs.sha256 = '0'.repeat(64);
    const fetchImpl = async (url) =>
      jsonResponse(
        String(url).includes(contract.browserArtifact.modelId) ? browserHub : goodHubPayload(contract.trainingBase),
      );
    const report = await auditScionBrowserBaseContract({ contract, fetchImpl });

    expect(report).toMatchObject({ status: 'blocked', onlineVerified: false, adapterActive: false });
    expect(report.issues).toContain(`hub-file-sha256:${contract.browserArtifact.file}`);
  });

  it('rejects a mislabeled adapter or a model-backend dependency before online checks', async () => {
    const mutated = structuredClone(contract);
    mutated.adapter.adapterActive = true;
    mutated.adapter.reportedMode = 'adapter-active';
    mutated.distribution.modelBackendRequired = true;
    const fetchImpl = vi.fn();
    const report = await auditScionBrowserBaseContract({ contract: mutated, fetchImpl });

    expect(report).toMatchObject({ status: 'blocked', onlineVerified: false });
    expect(report.issues).toEqual(
      expect.arrayContaining(['adapter-mode', 'adapter-active-claim', 'model-backend-claim']),
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
