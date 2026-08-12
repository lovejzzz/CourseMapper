#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { evaluateVerifiedCoherentDraftV1 } from './lib/verifiedCoherentDraftV1.mjs';
import { deriveVerifiedCoherentDraftCampaignEvidence } from './lib/verifiedCoherentDraftEvidenceV1.mjs';

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : '';
}

export async function main(argv = process.argv.slice(2)) {
  const campaignPath = option(argv, '--campaign');
  if (!campaignPath) throw new Error('Usage: node scripts/verifiedCoherentDraftV1Audit.mjs --campaign <campaign.json>');
  const policyPath = path.resolve(
    option(argv, '--policy') || 'evaluation/output-quality/verified-coherent-draft-v1.policy.json',
  );
  const [campaign, policy] = await Promise.all(
    [path.resolve(campaignPath), policyPath].map(async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'))),
  );
  // Campaign JSON supplies paths and preregistered metadata only. Every score,
  // family hash, claim count, and review binding is re-derived from the bound
  // ZIP and receipt bytes here; caller-authored promotion values are ignored.
  const derivedCampaign = await deriveVerifiedCoherentDraftCampaignEvidence(campaign, policy);
  const result = evaluateVerifiedCoherentDraftV1(derivedCampaign, policy);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.earned ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}
