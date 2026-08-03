#!/usr/bin/env node
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { inspectEvidenceRecord } from './lib/evidenceRecord.mjs';

const repoRoot = process.cwd();
const execFileAsync = promisify(execFile);
const PRODUCTION_CHECKPOINT_SUCCESSOR_POLICY_PATH = 'release-contracts/production-checkpoint-successor-policy.json';
const VALID_CONTRACT_STATUSES = new Set([
  'verified-current',
  'historical',
  'superseded',
  'manual-only',
  'carry-forward',
]);
const VALID_PROOF_SCOPES = new Set([
  'unit',
  'gold-audit',
  'browser-live',
  'browser-smoke',
  'ci-fast',
  'ci-deep',
  'live-provider',
  'manual-human',
  'static-audit',
  'stress-fixture',
  'course-graph',
  'compiled-output',
  'doc',
  'build',
  'format',
  'lint',
]);
const VALID_PROOF_BUCKET_STATUSES = new Set([
  'success',
  'pending-push',
  'pending',
  'not-current',
  'not-applicable',
  'not-used',
  'local-only',
  'manual-only',
]);
const REQUIRED_PROOF_BUCKETS = ['local', 'ciFast', 'ciDeep', 'liveProvider', 'manualHuman'];
const UNSUPPORTED_PROFESSOR_ADOPTION_RELEASE_CLAIMS = [
  {
    label: 'professor approval claim',
    pattern: /\b(?:professors?|instructors?)\s+approved\b/i,
  },
  {
    label: 'public course author endorsement claim',
    pattern: /\b(?:endorsed|approved)\s+by\s+(?:the\s+)?(?:public\s+)?(?:course\s+)?authors?\b/i,
  },
  {
    label: 'external validation complete claim',
    pattern: /\bexternal validation complete\b/i,
  },
];

async function readText(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8');
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

function assert(condition, message, failures) {
  if (!condition) failures.push(message);
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/.test(String(value || ''));
}

function isCommit(value) {
  return /^[a-f0-9]{40}$/.test(String(value || ''));
}

function sha256Text(value) {
  return crypto
    .createHash('sha256')
    .update(String(value || ''))
    .digest('hex');
}

function recordedFailureCount(value) {
  if (Array.isArray(value)) return value.length;
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : Number.NaN;
}

function sameRecordedCount(attestation, production, replay, key) {
  const expected = Number(attestation?.[key]);
  return Number.isFinite(expected) && expected === Number(production?.[key]) && expected === Number(replay?.[key]);
}

async function validateProductionCheckpointBinding({ release, failures }) {
  const browserPath = release.proof?.browser?.path;
  const attestationPath = release.proof?.productionPackageAttestation?.path;
  if (!browserPath || !attestationPath) return;

  const browser = await readJson(browserPath).catch((error) => {
    failures.push(`Missing or unreadable production browser proof ${browserPath}: ${error.message}`);
    return null;
  });
  const attestation = await readJson(attestationPath).catch((error) => {
    failures.push(`Missing or unreadable production package attestation ${attestationPath}: ${error.message}`);
    return null;
  });
  if (!browser || !attestation) return;

  if (release.checkpointPhase === 'predeploy') {
    assert(
      browser.status === 'predeploy-candidate',
      'Predeploy releases must use predeploy-candidate browser status',
      failures,
    );
    return;
  }
  assert(
    release.checkpointPhase === 'production-checkpoint',
    'Accepted production evidence requires checkpointPhase=production-checkpoint',
    failures,
  );

  const checks = Array.isArray(browser.checks) ? browser.checks : [];
  const production = checks.find((check) => check?.mode === 'production-physical-zip-and-render-audit');
  const ruler = checks.find((check) => check?.mode === 'immutable-held-out-ruler-binding');
  const replay = checks.find(
    (check) =>
      typeof check?.command === 'string' &&
      check.command.startsWith('npm run audit:package-evidence --') &&
      check.packageSha256 === production?.zipSha256,
  );

  assert(
    browser.status === 'production-checkpoint',
    'Browser proof must declare production-checkpoint status',
    failures,
  );
  assert(production?.status === 'pass', 'Rendered production audit must pass', failures);
  assert(ruler?.status === 'pass', 'Immutable held-out ruler binding must pass', failures);
  assert(replay?.status === 'pass', 'Independent package replay must pass', failures);
  assert(
    recordedFailureCount(replay?.failures) === 0,
    'Independent package replay must record zero failures',
    failures,
  );

  assert(
    attestation.protocol === 'coursemapper-release-evidence-attestation-v1',
    'Production package attestation must use the supported evidence-attestation protocol',
    failures,
  );
  assert(
    attestation.scope === 'production-checkpoint',
    'Production package attestation scope must be production-checkpoint, not a candidate scope',
    failures,
  );
  assert(
    isCommit(attestation.deployedCodeCommit),
    'Production package attestation must bind a full deployedCodeCommit',
    failures,
  );
  assert(
    attestation.deployedCodeCommit === production?.auditedCommit,
    'Production package attestation deployedCodeCommit must match the rendered production audit',
    failures,
  );
  if (isCommit(attestation.deployedCodeCommit)) {
    const isAncestor = await execFileAsync(
      'git',
      ['merge-base', '--is-ancestor', attestation.deployedCodeCommit, 'HEAD'],
      { cwd: repoRoot },
    )
      .then(() => true)
      .catch(() => false);
    assert(
      isAncestor,
      'Production package attestation deployedCodeCommit must be an ancestor of the checkpoint evidence commit',
      failures,
    );
    if (isAncestor) {
      const policy = await execFileAsync(
        'git',
        ['show', `${attestation.deployedCodeCommit}:${PRODUCTION_CHECKPOINT_SUCCESSOR_POLICY_PATH}`],
        { cwd: repoRoot, encoding: 'utf8', maxBuffer: 1024 * 1024 },
      )
        .then(({ stdout }) => JSON.parse(stdout))
        .catch((error) => {
          failures.push(`Cannot load checkpoint successor policy from deployed commit: ${error.message}`);
          return null;
        });
      const allowedSuccessorPaths = new Set(Array.isArray(policy?.allowedPaths) ? policy.allowedPaths : []);
      assert(
        policy?.protocol === 'coursemapper-production-checkpoint-successor-policy-v1',
        'Deployed checkpoint successor policy must use the supported protocol',
        failures,
      );
      assert(
        !allowedSuccessorPaths.has('scripts/auditReleaseHistory.mjs'),
        'Checkpoint successor policy must not authorize changes to its own validator',
        failures,
      );
      const { stdout = '' } = await execFileAsync(
        'git',
        ['diff', '--name-only', `${attestation.deployedCodeCommit}..HEAD`],
        { cwd: repoRoot, encoding: 'utf8', maxBuffer: 1024 * 1024 },
      );
      const successorPaths = stdout
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .filter(Boolean);
      const disallowed = successorPaths.filter((entry) => !allowedSuccessorPaths.has(entry));
      assert(
        disallowed.length === 0,
        `Production code changed after the attested deployed commit: ${disallowed.join(', ')}`,
        failures,
      );
    }
  }
  assert(
    isSha256(attestation.packageSha256) && attestation.packageSha256 === production?.zipSha256,
    'Production package attestation packageSha256 must match the rendered production audit',
    failures,
  );
  assert(
    attestation.packageSha256 === replay?.packageSha256,
    'Production package attestation packageSha256 must match the independent replay',
    failures,
  );
  assert(
    attestation.courseContractSha256 === replay?.courseContractSha256,
    'Production package attestation courseContractSha256 must match the independent replay',
    failures,
  );
  assert(
    attestation.evidenceBundleSha256 === replay?.evidenceBundleSha256,
    'Production package attestation evidenceBundleSha256 must match the independent replay',
    failures,
  );
  assert(
    attestation.scoreLedgerSha256 === replay?.scoreLedgerSha256,
    'Production package attestation scoreLedgerSha256 must match the independent replay',
    failures,
  );
  assert(
    attestation.readinessScore === replay?.readinessScore,
    'Production package attestation readinessScore must match the independent replay',
    failures,
  );
  for (const key of ['verifiedSources', 'verifiedClaims', 'verifiedArtifacts', 'verifiedAssessmentObligations']) {
    assert(
      sameRecordedCount(attestation, production, replay, key),
      `Production ${key} must agree across attestation, rendered audit, and independent replay`,
      failures,
    );
  }
  assert(
    attestation.graderVersion === replay?.graderVersion && attestation.graderVersion === ruler?.graderVersion,
    'Production grader version must agree across attestation, replay, and ruler',
    failures,
  );
  const dimensions = attestation.observedDimensions || {};
  for (const key of [
    'curriculumFidelity',
    'evidenceGrounding',
    'instructionalTexture',
    'assessmentCoherence',
    'exportIntegrity',
  ]) {
    assert(
      Number(dimensions[key]) === Number(production?.dimensions?.[key]),
      `Production ${key} score must agree between attestation and rendered audit`,
      failures,
    );
  }
  assert(
    Object.values(dimensions).reduce((sum, value) => sum + Number(value || 0), 0) ===
      Number(attestation.readinessScore),
    'Production dimension scores must sum to readinessScore',
    failures,
  );
  const gate = attestation.releaseGate || {};
  assert(gate.passed === true, 'Production release gate must record passed=true', failures);
  assert(
    Number(attestation.readinessScore) >= Number(gate.minimumReadinessScore),
    'Production readiness score must clear the attested minimum',
    failures,
  );
  assert(
    Number(dimensions.evidenceGrounding) >= Number(gate.minimumEvidenceGrounding),
    'Production evidence-grounding score must clear the attested minimum',
    failures,
  );
  assert(
    Number(dimensions.assessmentCoherence) >= Number(gate.minimumAssessmentCoherence),
    'Production assessment-coherence score must clear the attested minimum',
    failures,
  );
  assert(
    Number(production?.p0) <= Number(gate.maximumP0),
    'Production P0 count exceeds the attested maximum',
    failures,
  );
  assert(
    Number(production?.p1) <= Number(gate.maximumP1),
    'Production P1 count exceeds the attested maximum',
    failures,
  );
  assert(production?.exportChecks === '38/38', 'Production export verification must record 38/38 checks', failures);
  assert(
    Number(production?.visualDefectsFound) === 0,
    'Rendered production audit must record zero remaining visual defects',
    failures,
  );
  assert(
    Number(production?.semanticObjects) > 0 &&
      Number(production?.semanticObjects) === Number(production?.semanticObjectsWithDescriptions),
    'Every tracked production semantic object must carry a description',
    failures,
  );
  assert(
    attestation.heldOutRuler?.path === ruler?.path,
    'Production package attestation held-out ruler path must match the browser proof',
    failures,
  );
  assert(
    attestation.heldOutRuler?.sha256 === ruler?.sha256,
    'Production package attestation held-out ruler digest must match the browser proof',
    failures,
  );
  assert(
    attestation.heldOutRuler?.graderVersion === ruler?.graderVersion,
    'Production package attestation grader version must match the held-out ruler',
    failures,
  );
  assert(
    attestation.heldOutRuler?.implementationSha256 === ruler?.implementationSha256,
    'Production package attestation implementation digest must match the held-out ruler',
    failures,
  );
}

function hasNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

async function pathExists(relativePath) {
  try {
    await fs.stat(path.join(repoRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

function normalizeAnchorPath(anchor) {
  return anchor
    .split('#')[0]
    .replace(/:\d+(?::\d+)?$/, '')
    .trim();
}

// Retired roadmaps move to docs/history/<series>/ without rewriting the
// release contracts that anchor to them — contracts are verbatim history.
const ARCHIVED_DOC_SERIES = [{ prefix: 'docs/V0.15', archiveDir: 'docs/history/v0.15' }];

async function anchorPathExists(relativePath) {
  if (await pathExists(relativePath)) return true;
  for (const series of ARCHIVED_DOC_SERIES) {
    if (!relativePath.startsWith(series.prefix)) continue;
    if (await pathExists(path.join(series.archiveDir, path.basename(relativePath)))) return true;
  }
  return false;
}

function assertNoUnsupportedProfessorAdoptionClaims({ relativePath, text, failures }) {
  for (const rule of UNSUPPORTED_PROFESSOR_ADOPTION_RELEASE_CLAIMS) {
    assert(
      !rule.pattern.test(text),
      `${relativePath} contains unsupported professor-adoption release claim: ${rule.label}`,
      failures,
    );
  }
}

async function validateContractForRelease({
  contractPath,
  contract,
  release,
  failures,
  requireVerifiedCurrent = false,
}) {
  assert(contract.version === release.version, `${contractPath} version must equal ${release.version}`, failures);
  assert(contract.title === release.title, `${contractPath} title must equal ${release.title}`, failures);
  assert(
    VALID_CONTRACT_STATUSES.has(contract.status),
    `${contractPath} has invalid status: ${contract.status}`,
    failures,
  );
  if (requireVerifiedCurrent) {
    assert(contract.status === 'verified-current', `${contractPath} status must be verified-current`, failures);
  }

  assert(
    contract.proofSummary && typeof contract.proofSummary === 'object',
    `${contractPath} must include proofSummary`,
    failures,
  );
  if (contract.proofSummary) {
    for (const bucket of REQUIRED_PROOF_BUCKETS) {
      assert(bucket in contract.proofSummary, `${contractPath} proofSummary missing ${bucket}`, failures);
    }
    assert(
      hasNonEmptyArray(contract.proofSummary.local),
      `${contractPath} proofSummary.local must list local proof commands`,
      failures,
    );
    for (const bucket of ['ciFast', 'ciDeep', 'deploy', 'liveProvider', 'manualHuman']) {
      const proof = contract.proofSummary[bucket];
      if (!proof) continue;
      assert(
        VALID_PROOF_BUCKET_STATUSES.has(proof.status),
        `${contractPath} proofSummary.${bucket}.status is invalid: ${proof.status}`,
        failures,
      );
      assert(
        proof.status !== 'success' || typeof proof.url === 'string',
        `${contractPath} proofSummary.${bucket} success must include url`,
        failures,
      );
    }
  }

  assert(hasNonEmptyArray(contract.claims), `${contractPath} must include claims`, failures);
  const seenClaimIds = new Set();
  const seenHighlightIndexes = new Set();
  for (const [index, claim] of contract.claims?.entries() || []) {
    const claimId = claim?.id;
    const label = claimId || `${contractPath} claim[${index}]`;
    assert(typeof claimId === 'string' && claimId.trim(), `${label} must include id`, failures);
    assert(!seenClaimIds.has(claimId), `${label} has a duplicate claim id`, failures);
    seenClaimIds.add(claimId);
    assert(VALID_CONTRACT_STATUSES.has(claim?.status), `${label} has invalid status: ${claim?.status}`, failures);
    assert(
      Number.isInteger(claim?.changelogHighlightIndex) &&
        claim.changelogHighlightIndex >= 0 &&
        claim.changelogHighlightIndex < release.highlights.length,
      `${label} must include a valid changelogHighlightIndex`,
      failures,
    );
    assert(
      !seenHighlightIndexes.has(claim?.changelogHighlightIndex),
      `${label} duplicates changelogHighlightIndex ${claim?.changelogHighlightIndex}`,
      failures,
    );
    seenHighlightIndexes.add(claim?.changelogHighlightIndex);
    if (requireVerifiedCurrent) {
      const boundHighlight = release.highlights[claim?.changelogHighlightIndex];
      assert(
        isSha256(claim?.highlightSha256) && claim.highlightSha256 === sha256Text(boundHighlight),
        `${label} highlightSha256 must bind the exact indexed changelog highlight`,
        failures,
      );
    }
    assert(typeof claim?.summary === 'string' && claim.summary.trim(), `${label} must include summary`, failures);
    assert(hasNonEmptyArray(claim?.anchors), `${label} must include code/doc anchors`, failures);
    assert(hasNonEmptyArray(claim?.proofCommands), `${label} must include proofCommands`, failures);
    assert(hasNonEmptyArray(claim?.proofScopes), `${label} must include proofScopes`, failures);
    for (const anchor of claim?.anchors || []) {
      assert(typeof anchor === 'string' && anchor.trim(), `${label} anchor must be a non-empty string`, failures);
      if (typeof anchor !== 'string' || !anchor.trim()) continue;
      const anchorPath = normalizeAnchorPath(anchor);
      assert(await anchorPathExists(anchorPath), `${label} anchor does not exist: ${anchor}`, failures);
    }
    for (const command of claim?.proofCommands || []) {
      assert(
        typeof command === 'string' && command.trim(),
        `${label} proofCommands must be non-empty strings`,
        failures,
      );
    }
    for (const scope of claim?.proofScopes || []) {
      assert(VALID_PROOF_SCOPES.has(scope), `${label} proofScope is invalid: ${scope}`, failures);
    }
  }
  assert(
    contract.claims?.length === release.highlights.length,
    `${contractPath} claim count must match ${release.version} highlights`,
    failures,
  );
  for (let index = 0; index < release.highlights.length; index += 1) {
    assert(seenHighlightIndexes.has(index), `${contractPath} missing claim for highlight ${index}`, failures);
  }
}

async function importRepoModule(relativePath) {
  const url = pathToFileURL(path.join(repoRoot, relativePath)).href;
  return import(`${url}?audit=${Date.now()}`);
}

async function main() {
  const failures = [];
  const packageJson = await readJson('package.json');
  const packageLock = await readJson('package-lock.json');
  const {
    APP_VERSION,
    CURRENT_RELEASE,
    CURRENT_RELEASE_CHANGELOG,
    HISTORICAL_RELEASE_CHANGELOGS = [],
  } = await importRepoModule('src/lib/releaseManifest.js');
  const { LATEST_RELEASE } = await importRepoModule('src/lib/latestRelease.js');

  assert(
    packageJson.version === APP_VERSION,
    `package.json version (${packageJson.version}) != APP_VERSION (${APP_VERSION})`,
    failures,
  );
  assert(
    packageLock.version === APP_VERSION,
    `package-lock root version (${packageLock.version}) != APP_VERSION (${APP_VERSION})`,
    failures,
  );
  assert(
    packageLock.packages?.['']?.version === APP_VERSION,
    `package-lock package version (${packageLock.packages?.['']?.version}) != APP_VERSION (${APP_VERSION})`,
    failures,
  );
  assert(CURRENT_RELEASE.version === APP_VERSION, 'CURRENT_RELEASE.version must equal APP_VERSION', failures);
  assert(
    CURRENT_RELEASE_CHANGELOG.version === APP_VERSION,
    'CURRENT_RELEASE_CHANGELOG.version must equal APP_VERSION',
    failures,
  );
  assert(LATEST_RELEASE.version === APP_VERSION, 'LATEST_RELEASE.version must equal APP_VERSION', failures);

  const changelog = await readText('src/pages/Changelog.jsx');
  assert(
    /const releases = \[\s*CURRENT_RELEASE_CHANGELOG,/.test(changelog),
    'Top changelog entry must be CURRENT_RELEASE_CHANGELOG from releaseManifest.js',
    failures,
  );

  const professorAdoptionClaimSurfacePaths = [
    'src/lib/releaseManifest.js',
    'src/pages/Changelog.jsx',
    `release-contracts/v${APP_VERSION}.json`,
  ];
  for (const surfacePath of professorAdoptionClaimSurfacePaths) {
    const surfaceText = await readText(surfacePath).catch(() => '');
    assertNoUnsupportedProfessorAdoptionClaims({
      relativePath: surfacePath,
      text: surfaceText,
      failures,
    });
  }

  const releaseContractPath = `release-contracts/v${APP_VERSION}.json`;
  const releaseContract = await readJson(releaseContractPath).catch((error) => {
    failures.push(`Missing or unreadable ${releaseContractPath}: ${error.message}`);
    return null;
  });
  if (releaseContract) {
    await validateContractForRelease({
      contractPath: releaseContractPath,
      contract: releaseContract,
      release: CURRENT_RELEASE,
      failures,
      requireVerifiedCurrent: true,
    });
    assert(
      CURRENT_RELEASE.proof?.contract === releaseContractPath,
      `CURRENT_RELEASE.proof.contract must point to ${releaseContractPath}`,
      failures,
    );
    assert(
      CURRENT_RELEASE.proof?.roadmap && (await pathExists(CURRENT_RELEASE.proof.roadmap)),
      'CURRENT_RELEASE.proof.roadmap must point to an existing roadmap',
      failures,
    );
    for (const proofKey of ['benchmark', 'browser', 'productionPackageAttestation']) {
      const inspection = await inspectEvidenceRecord(CURRENT_RELEASE.proof?.[proofKey], {
        root: repoRoot,
        requireTracked: true,
      });
      assert(
        inspection.ok,
        `CURRENT_RELEASE.proof.${proofKey} must be a tracked, hash-bound evidence record (${inspection.issues.join(', ')})`,
        failures,
      );
    }
    await validateProductionCheckpointBinding({ release: CURRENT_RELEASE, failures });
    assert(
      CURRENT_RELEASE.proof?.auditCommand === 'npm run audit:release-history',
      'CURRENT_RELEASE.proof.auditCommand must be npm run audit:release-history',
      failures,
    );
  }

  for (const historicalRelease of HISTORICAL_RELEASE_CHANGELOGS) {
    const historicalContractPath = `release-contracts/v${historicalRelease.version}.json`;
    const historicalContract = await readJson(historicalContractPath).catch((error) => {
      failures.push(`Missing or unreadable historical contract ${historicalContractPath}: ${error.message}`);
      return null;
    });
    if (historicalContract) {
      await validateContractForRelease({
        contractPath: historicalContractPath,
        contract: historicalContract,
        release: historicalRelease,
        failures,
      });
    }
  }

  const footerFiles = ['src/screens/Config.jsx', 'src/screens/FeatureSelect.jsx', 'src/AppFlow.jsx'];
  for (const file of footerFiles) {
    const source = await readText(file);
    assert(source.includes('APP_VERSION'), `${file} must render version through APP_VERSION`, failures);
    assert(!/>v\d+\.\d+(?:\.\d+)?</.test(source), `${file} must not hard-code footer version text`, failures);
  }

  const appVersionSource = await readText('src/lib/appVersion.js');
  assert(
    appVersionSource.includes('APP_VERSION') && appVersionSource.includes(APP_VERSION),
    'appVersion.js must define the current APP_VERSION',
    failures,
  );
  const releaseManifestSource = await readText('src/lib/releaseManifest.js');
  assert(
    releaseManifestSource.includes("from './appVersion.js'"),
    'releaseManifest.js must derive its version from appVersion.js',
    failures,
  );
  const latestReleaseSource = await readText('src/lib/latestRelease.js');
  assert(
    latestReleaseSource.includes("from './currentRelease.js'"),
    'latestRelease.js must derive from the first-paint currentRelease.js record',
    failures,
  );

  const movingMeans = await readText('docs/history/v0.15/V0.15.4_MOVING_THE_MEANS_ROADMAP.md');
  assert(
    movingMeans.slice(0, 800).includes('superseded as the shipped v0.15.4 plan'),
    'V0.15.4 moving-the-means roadmap must be marked superseded/carry-forward',
    failures,
  );

  const staleCommentChecks = [
    ['src/lib/nativeGraphAuthoring.js', /'prose'\s*\(default\)|prose \(default\)/i],
    ['src/lib/voicePass.js', /DEFAULT OFF/i],
    ['scripts/lib/crucibleBrowser.mjs', /absence IS the prose default/i],
    ['scripts/lib/crucibleRound.mjs', /default 'prose'/i],
    ['scripts/crucible.mjs', /default 'prose' keeps/i],
  ];
  for (const [file, pattern] of staleCommentChecks) {
    const source = await readText(file);
    assert(!pattern.test(source), `${file} still contains stale default wording: ${pattern}`, failures);
  }

  const currentRoadmapPath = CURRENT_RELEASE.proof?.roadmap;
  const currentRoadmap = currentRoadmapPath ? await readText(currentRoadmapPath) : '';
  for (const phrase of [CURRENT_RELEASE.version, 'Goal', 'Lane', 'Release Boundary']) {
    assert(
      currentRoadmap.includes(phrase),
      `${currentRoadmapPath} missing current roadmap section: ${phrase}`,
      failures,
    );
  }

  const truthLedgerRoadmap = await readText('docs/history/v0.15/V0.15.5_TRUTH_LEDGER_ROADMAP.md');
  for (const phrase of [
    'Current Release Manifest',
    'Release Contract Ledger',
    'Roadmap Truth',
    'Comment Truth',
    'Remote Proof Ritual',
  ]) {
    assert(truthLedgerRoadmap.includes(phrase), `v0.15.5 roadmap missing section: ${phrase}`, failures);
  }

  if (failures.length > 0) {
    console.error('Release history audit failed:');
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }

  console.log(
    `Release history audit passed for v${APP_VERSION}: ${releaseContract?.claims?.length || 0} claim(s) verified.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
