import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_VERSION, CURRENT_RELEASE, CURRENT_RELEASE_CHANGELOG } from '../src/lib/releaseManifest';
import { LATEST_RELEASE } from '../src/lib/latestRelease';

describe('current release truth ledger', () => {
  it('keeps current release surfaces on the same manifest version', () => {
    const packageVersion = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
    expect(APP_VERSION).toBe(packageVersion);
    expect(CURRENT_RELEASE.version).toBe(APP_VERSION);
    expect(CURRENT_RELEASE_CHANGELOG.version).toBe(APP_VERSION);
    expect(LATEST_RELEASE.version).toBe(APP_VERSION);
    expect(CURRENT_RELEASE.highlights.length).toBeGreaterThan(0);
    expect(LATEST_RELEASE.highlights.length).toBeGreaterThan(0);
    expect(CURRENT_RELEASE.proof.contract).toBe(`release-contracts/v${APP_VERSION}.json`);
  });

  it('keeps the current release contract aligned to changelog claims', () => {
    const contract = JSON.parse(fs.readFileSync(CURRENT_RELEASE.proof.contract, 'utf8'));
    expect(contract.version).toBe(APP_VERSION);
    expect(contract.claims).toHaveLength(CURRENT_RELEASE.highlights.length);
    expect(contract.claims.map((claim) => claim.changelogHighlightIndex)).toEqual(
      CURRENT_RELEASE.highlights.map((_, index) => index),
    );
  });
});
