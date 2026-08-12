import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export const RENDER_AUDIT_V1_PROTOCOL = 'coursemapper-render-audit-v1';
export const PACKAGE_RENDER_AUDIT_V1_PROTOCOL = 'coursemapper-package-render-audit-v1';
export const RENDER_AUDIT_V1_METRICS = 'coursemapper-tiled-occupancy-v1';
export const RENDER_AUDIT_V1_MIN_BODY_OCCUPANCY = 0.2;
export const RENDER_AUDIT_V1_EXEMPT_ROLES = Object.freeze([
  'cover',
  'title-slide',
  'section-divider',
  'sparse-worksheet',
]);

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const FINDING_TYPES = Object.freeze([
  'clipping',
  'overflow',
  'out-of-bounds-table',
  'accidental-blank',
  'trailing-blank',
  'missing-glyph',
  'overlap',
  'low-body-occupancy',
]);

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function rounded(value) {
  return Number(Number(value || 0).toFixed(6));
}

function safeRelativePath(value) {
  const candidate = String(value || '')
    .trim()
    .replace(/\\/g, '/');
  if (!candidate || path.posix.isAbsolute(candidate)) return '';
  const normalized = path.posix.normalize(candidate);
  if (normalized === '..' || normalized.startsWith('../')) return '';
  return normalized;
}

function roleFor(roles, itemId, index) {
  return String(roles?.[itemId] || roles?.[String(index)] || 'body').trim();
}

function roleIsSupported(kind, role) {
  if (role === 'body') return true;
  if (!RENDER_AUDIT_V1_EXEMPT_ROLES.includes(role)) return false;
  // A sparse worksheet is a deliberate, inspectable spreadsheet layout (for
  // example, one module per printed sheet). It must never waive the occupancy
  // floor for Word pages or slides.
  if (role === 'sparse-worksheet') return kind === 'xlsx';
  return true;
}

function expectedItemId(kind, index) {
  return `${kind === 'pptx' ? 'slide' : 'page'}-${index}`;
}

function renderNamePattern(kind) {
  return kind === 'pptx' ? /^slide-(\d+)\.png$/i : /^page-(\d+)\.png$/i;
}

async function fileRecord(filePath, root) {
  const bytes = await fs.readFile(filePath);
  return {
    path: path.relative(root, filePath).split(path.sep).join('/'),
    bytes: bytes.length,
    sha256: sha256(bytes),
  };
}

export async function measureRenderedImage(filePath, { gridSize = 32, tileForegroundRatio = 0.0025 } = {}) {
  const { data, info } = await sharp(filePath)
    .flatten({ background: '#ffffff' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const foreground = new Uint8Array(info.width * info.height);
  let foregroundPixels = 0;
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    let lightestDistance = 0;
    for (let channel = 0; channel < Math.min(channels, 3); channel += 1) {
      lightestDistance = Math.max(lightestDistance, 255 - data[pixel * channels + channel]);
    }
    if (lightestDistance >= 8) {
      foreground[pixel] = 1;
      foregroundPixels += 1;
    }
  }

  let occupiedTiles = 0;
  for (let tileY = 0; tileY < gridSize; tileY += 1) {
    const startY = Math.floor((tileY * info.height) / gridSize);
    const endY = Math.max(startY + 1, Math.floor(((tileY + 1) * info.height) / gridSize));
    for (let tileX = 0; tileX < gridSize; tileX += 1) {
      const startX = Math.floor((tileX * info.width) / gridSize);
      const endX = Math.max(startX + 1, Math.floor(((tileX + 1) * info.width) / gridSize));
      let tileForeground = 0;
      const tilePixels = (endX - startX) * (endY - startY);
      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) tileForeground += foreground[y * info.width + x];
      }
      if (tileForeground / tilePixels >= tileForegroundRatio) occupiedTiles += 1;
    }
  }

  const foregroundRatio = foregroundPixels / (info.width * info.height);
  return {
    protocol: RENDER_AUDIT_V1_METRICS,
    width: info.width,
    height: info.height,
    gridSize,
    foregroundRatio: rounded(foregroundRatio),
    layoutOccupancyRatio: rounded(occupiedTiles / (gridSize * gridSize)),
    blank: foregroundRatio < 0.0005,
  };
}

function summarizeItems(items, findings, minimumBodyOccupancy) {
  const lowOccupancyBodyItemIds = items
    .filter(
      (item) => item.role === 'body' && !item.metrics.blank && item.metrics.layoutOccupancyRatio < minimumBodyOccupancy,
    )
    .map((item) => item.id);
  const blankItemIds = items.filter((item) => item.metrics.blank).map((item) => item.id);
  const findingCounts = Object.fromEntries(FINDING_TYPES.map((type) => [type, 0]));
  for (const finding of findings) {
    if (Object.hasOwn(findingCounts, finding.type)) findingCounts[finding.type] += 1;
  }
  if (items.at(-1)?.metrics.blank && findingCounts['trailing-blank'] === 0) findingCounts['trailing-blank'] = 1;
  findingCounts['accidental-blank'] = Math.max(findingCounts['accidental-blank'], blankItemIds.length);
  return {
    itemCount: items.length,
    reviewedItemCount: 0,
    blankItemIds,
    lowOccupancyBodyItemIds,
    findingCounts,
  };
}

function receiptHash(receipt) {
  const body = { ...receipt };
  delete body.receiptSha256;
  return sha256(canonicalJson(body));
}

async function walkFiles(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walkFiles(candidate)));
    else if (entry.isFile()) files.push(candidate);
  }
  return files;
}

export async function captureRenderAuditV1({
  root = process.cwd(),
  sourcePath,
  renderDirectory,
  kind,
  roles = {},
  findings = [],
  inspection = {},
  renderer = {},
  replay = {},
  minimumBodyOccupancy = RENDER_AUDIT_V1_MIN_BODY_OCCUPANCY,
  capturedAt = new Date().toISOString(),
} = {}) {
  if (!['docx', 'pptx', 'xlsx'].includes(kind)) throw new Error('kind must be docx, pptx, or xlsx');
  const absoluteRoot = path.resolve(root);
  const absoluteSource = path.resolve(absoluteRoot, sourcePath || '');
  const absoluteRenderDirectory = path.resolve(absoluteRoot, renderDirectory || '');
  const source = await fileRecord(absoluteSource, absoluteRoot);
  const pattern = renderNamePattern(kind);
  const renderFiles = (await fs.readdir(absoluteRenderDirectory))
    .map((name) => ({ name, match: name.match(pattern) }))
    .filter((entry) => entry.match)
    .sort((left, right) => Number(left.match[1]) - Number(right.match[1]));
  if (renderFiles.length === 0) throw new Error(`No rendered ${kind} PNGs found in ${renderDirectory}`);

  const items = [];
  for (let offset = 0; offset < renderFiles.length; offset += 1) {
    const index = offset + 1;
    if (Number(renderFiles[offset].match[1]) !== index)
      throw new Error(`Rendered ${kind} item sequence is not contiguous`);
    const id = expectedItemId(kind, index);
    const role = roleFor(roles, id, index);
    if (!roleIsSupported(kind, role)) {
      throw new Error(`Unsupported render role ${role} for ${id}`);
    }
    const filePath = path.join(absoluteRenderDirectory, renderFiles[offset].name);
    items.push({
      id,
      index,
      role,
      file: await fileRecord(filePath, absoluteRoot),
      metrics: await measureRenderedImage(filePath),
    });
  }

  const declaredFindings = findings.map((finding) => ({
    type: String(finding?.type || ''),
    itemId: String(finding?.itemId || ''),
    observation: String(finding?.observation || '').trim(),
  }));
  const occupancyFindings = items
    .filter(
      (item) => item.role === 'body' && !item.metrics.blank && item.metrics.layoutOccupancyRatio < minimumBodyOccupancy,
    )
    .map((item) => ({
      type: 'low-body-occupancy',
      itemId: item.id,
      observation: `Body layout occupancy ${item.metrics.layoutOccupancyRatio.toFixed(6)} is below ${minimumBodyOccupancy.toFixed(6)}.`,
    }));
  const normalizedFindings = [...declaredFindings, ...occupancyFindings].filter(
    (finding, index, all) =>
      all.findIndex((candidate) => candidate.type === finding.type && candidate.itemId === finding.itemId) === index,
  );
  const reviewedItemIds = [...new Set((inspection?.reviewedItemIds || []).map(String))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  const summary = summarizeItems(items, normalizedFindings, minimumBodyOccupancy);
  summary.reviewedItemCount = reviewedItemIds.length;
  const qualityPass =
    summary.itemCount > 0 &&
    inspection?.status === 'complete' &&
    Boolean(String(inspection?.reviewerId || '').trim()) &&
    Boolean(String(inspection?.reviewedAt || '').trim()) &&
    summary.reviewedItemCount === summary.itemCount &&
    summary.blankItemIds.length === 0 &&
    summary.lowOccupancyBodyItemIds.length === 0 &&
    Object.values(summary.findingCounts).every((count) => count === 0);

  const receipt = {
    schemaVersion: 1,
    protocol: RENDER_AUDIT_V1_PROTOCOL,
    capturedAt,
    kind,
    source,
    renderer: {
      id: String(renderer?.id || '').trim(),
      version: String(renderer?.version || '').trim(),
    },
    replay: {
      command: String(replay?.command || '').trim(),
      environment: String(replay?.environment || '').trim(),
    },
    policy: {
      metricsProtocol: RENDER_AUDIT_V1_METRICS,
      minimumBodyOccupancy,
      exemptRoles: [...RENDER_AUDIT_V1_EXEMPT_ROLES],
      blankForegroundThreshold: 0.0005,
    },
    items,
    inspection: {
      status: inspection?.status === 'complete' ? 'complete' : 'not-reviewed',
      reviewerId: String(inspection?.reviewerId || '').trim(),
      reviewedAt: String(inspection?.reviewedAt || '').trim(),
      reviewedItemIds,
      claimBoundary:
        'Visual inspection is hash-bound process evidence, not proof of accessibility, factual accuracy, or classroom effectiveness.',
    },
    findings: normalizedFindings,
    summary,
    status: qualityPass ? 'passed' : 'failed',
    claimBoundary:
      'This receipt proves reproducible rendering, page/slide coverage, raster occupancy, declared structural findings, and a hash-bound inspection record only.',
  };
  return { ...receipt, receiptSha256: receiptHash(receipt) };
}

function validateReceiptShape(receipt) {
  const issues = [];
  if (receipt?.protocol !== RENDER_AUDIT_V1_PROTOCOL) issues.push('unsupported protocol');
  if (!['docx', 'pptx', 'xlsx'].includes(receipt?.kind)) issues.push('unsupported artifact kind');
  if (!HASH_PATTERN.test(String(receipt?.receiptSha256 || ''))) issues.push('missing receipt hash');
  else if (receiptHash(receipt) !== receipt.receiptSha256) issues.push('receipt hash mismatch');
  if (!safeRelativePath(receipt?.source?.path)) issues.push('unsafe source path');
  if (!HASH_PATTERN.test(String(receipt?.source?.sha256 || ''))) issues.push('invalid source hash');
  if (!receipt?.renderer?.id || !receipt?.renderer?.version) issues.push('renderer identity is incomplete');
  if (!receipt?.replay?.command || !receipt?.replay?.environment) issues.push('replay instructions are incomplete');
  if (receipt?.policy?.metricsProtocol !== RENDER_AUDIT_V1_METRICS) issues.push('unsupported metrics protocol');
  if (receipt?.policy?.minimumBodyOccupancy !== RENDER_AUDIT_V1_MIN_BODY_OCCUPANCY) {
    issues.push('body occupancy policy drift');
  }
  if (canonicalJson(receipt?.policy?.exemptRoles || []) !== canonicalJson(RENDER_AUDIT_V1_EXEMPT_ROLES)) {
    issues.push('exempt role policy drift');
  }
  const items = Array.isArray(receipt?.items) ? receipt.items : [];
  if (items.length === 0) issues.push('no rendered items');
  for (let offset = 0; offset < items.length; offset += 1) {
    const item = items[offset];
    const index = offset + 1;
    if (item?.index !== index || item?.id !== expectedItemId(receipt.kind, index))
      issues.push(`item ${index} sequence mismatch`);
    if (!roleIsSupported(receipt.kind, item?.role)) {
      issues.push(`${item?.id || index} has unsupported role`);
    }
    if (!safeRelativePath(item?.file?.path) || !HASH_PATTERN.test(String(item?.file?.sha256 || ''))) {
      issues.push(`${item?.id || index} has invalid file evidence`);
    }
    if (item?.metrics?.protocol !== RENDER_AUDIT_V1_METRICS)
      issues.push(`${item?.id || index} metrics protocol mismatch`);
    for (const field of ['foregroundRatio', 'layoutOccupancyRatio']) {
      if (!Number.isFinite(item?.metrics?.[field]) || item.metrics[field] < 0 || item.metrics[field] > 1) {
        issues.push(`${item?.id || index} has invalid ${field}`);
      }
    }
  }
  const findings = Array.isArray(receipt?.findings) ? receipt.findings : [];
  for (const finding of findings) {
    if (!FINDING_TYPES.includes(finding?.type)) issues.push(`unsupported finding type ${finding?.type || 'missing'}`);
    if (!items.some((item) => item.id === finding?.itemId) || !finding?.observation)
      issues.push('finding evidence is incomplete');
  }
  const expectedSummary = summarizeItems(items, findings, RENDER_AUDIT_V1_MIN_BODY_OCCUPANCY);
  const reviewedItemIds = Array.isArray(receipt?.inspection?.reviewedItemIds)
    ? [...new Set(receipt.inspection.reviewedItemIds.map(String))].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      )
    : [];
  expectedSummary.reviewedItemCount = reviewedItemIds.length;
  if (canonicalJson(receipt?.summary) !== canonicalJson(expectedSummary)) issues.push('summary does not reproduce');
  if (
    receipt?.inspection?.status !== 'complete' ||
    !receipt?.inspection?.reviewerId ||
    !receipt?.inspection?.reviewedAt
  ) {
    issues.push('visual inspection is incomplete');
  }
  if (canonicalJson(reviewedItemIds) !== canonicalJson(items.map((item) => item.id))) {
    issues.push('visual inspection does not cover every item');
  }
  const expectedPass =
    items.length > 0 &&
    reviewedItemIds.length === items.length &&
    expectedSummary.blankItemIds.length === 0 &&
    expectedSummary.lowOccupancyBodyItemIds.length === 0 &&
    Object.values(expectedSummary.findingCounts).every((count) => count === 0) &&
    !issues.some((issue) => issue.startsWith('visual inspection'));
  if (receipt?.status !== (expectedPass ? 'passed' : 'failed')) issues.push('status does not reproduce');
  return issues;
}

async function verifyFile(record, root, label, { image = false, expectedMetrics = null } = {}) {
  const issues = [];
  const relativePath = safeRelativePath(record?.path);
  if (!relativePath) return [`${label} path is unsafe`];
  const absolutePath = path.join(root, relativePath);
  const bytes = await fs.readFile(absolutePath).catch(() => null);
  if (!bytes) return [`${label} is missing`];
  if (bytes.length !== record.bytes) issues.push(`${label} byte count mismatch`);
  if (sha256(bytes) !== record.sha256) issues.push(`${label} hash mismatch`);
  if (image && expectedMetrics) {
    const measured = await measureRenderedImage(absolutePath);
    if (canonicalJson(measured) !== canonicalJson(expectedMetrics)) issues.push(`${label} metrics mismatch`);
  }
  return issues;
}

export async function verifyRenderAuditV1(receipt, { root = process.cwd(), verifyFiles = true } = {}) {
  const issues = validateReceiptShape(receipt);
  if (verifyFiles) {
    issues.push(...(await verifyFile(receipt?.source, root, 'source')));
    for (const item of Array.isArray(receipt?.items) ? receipt.items : []) {
      issues.push(
        ...(await verifyFile(item.file, root, item.id || 'rendered item', {
          image: true,
          expectedMetrics: item.metrics,
        })),
      );
    }
  }
  return {
    valid: issues.length === 0,
    passed: issues.length === 0 && receipt?.status === 'passed',
    issues,
    receiptSha256: receipt?.receiptSha256 || '',
    itemCount: Array.isArray(receipt?.items) ? receipt.items.length : 0,
  };
}

export async function capturePackageRenderAuditV1({
  root = process.cwd(),
  packagePath,
  packageDirectory,
  receiptDirectory,
  capturedAt = new Date().toISOString(),
} = {}) {
  const absoluteRoot = path.resolve(root);
  const absolutePackageDirectory = path.resolve(absoluteRoot, packageDirectory || '');
  const absoluteReceiptDirectory = path.resolve(absoluteRoot, receiptDirectory || '');
  const packageFile = await fileRecord(path.resolve(absoluteRoot, packagePath || ''), absoluteRoot);
  const expectedArtifacts = (await walkFiles(absolutePackageDirectory))
    .filter((filePath) => /\.(?:docx|pptx|xlsx)$/i.test(filePath))
    .map((filePath) => path.relative(absoluteRoot, filePath).split(path.sep).join('/'))
    .sort();
  const receiptFiles = (await walkFiles(absoluteReceiptDirectory))
    .filter((filePath) => /\.json$/i.test(filePath))
    .sort();
  const artifacts = [];
  const issues = [];
  for (const receiptPath of receiptFiles) {
    let receipt;
    try {
      receipt = JSON.parse(await fs.readFile(receiptPath, 'utf8'));
    } catch (error) {
      issues.push(`${path.relative(absoluteRoot, receiptPath)} is not valid JSON: ${error.message}`);
      continue;
    }
    if (receipt?.protocol !== RENDER_AUDIT_V1_PROTOCOL) continue;
    const verification = await verifyRenderAuditV1(receipt, { root: absoluteRoot });
    const receiptFile = await fileRecord(receiptPath, absoluteRoot);
    artifacts.push({
      sourcePath: safeRelativePath(receipt?.source?.path),
      kind: receipt?.kind,
      receiptFile,
      receiptSha256: receipt?.receiptSha256 || '',
      itemCount: verification.itemCount,
      passed: verification.passed,
      issues: verification.issues,
    });
  }
  artifacts.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
  const coveredArtifacts = artifacts.map((entry) => entry.sourcePath).filter(Boolean);
  const missingArtifacts = expectedArtifacts.filter((artifactPath) => !coveredArtifacts.includes(artifactPath));
  const unexpectedArtifacts = coveredArtifacts.filter((artifactPath) => !expectedArtifacts.includes(artifactPath));
  const duplicateArtifacts = coveredArtifacts.filter(
    (artifactPath, index) => coveredArtifacts.indexOf(artifactPath) !== index,
  );
  if (missingArtifacts.length > 0) issues.push(`missing render receipts: ${missingArtifacts.join(', ')}`);
  if (unexpectedArtifacts.length > 0) issues.push(`unexpected render receipts: ${unexpectedArtifacts.join(', ')}`);
  if (duplicateArtifacts.length > 0)
    issues.push(`duplicate render receipts: ${[...new Set(duplicateArtifacts)].join(', ')}`);
  for (const artifact of artifacts) {
    if (!artifact.passed)
      issues.push(`${artifact.sourcePath || artifact.receiptFile.path} did not pass its render audit`);
  }
  const receipt = {
    schemaVersion: 1,
    protocol: PACKAGE_RENDER_AUDIT_V1_PROTOCOL,
    capturedAt,
    packageFile,
    packageDirectory: safeRelativePath(path.relative(absoluteRoot, absolutePackageDirectory)),
    receiptDirectory: safeRelativePath(path.relative(absoluteRoot, absoluteReceiptDirectory)),
    policy: {
      childProtocol: RENDER_AUDIT_V1_PROTOCOL,
      requiredExtensions: ['docx', 'pptx', 'xlsx'],
      coverage: 'every-office-artifact',
      aggregation: 'all-children-must-pass-no-averaging',
    },
    artifacts,
    summary: {
      expectedArtifactCount: expectedArtifacts.length,
      coveredArtifactCount: coveredArtifacts.length,
      passedArtifactCount: artifacts.filter((entry) => entry.passed).length,
      renderedItemCount: artifacts.reduce((sum, entry) => sum + entry.itemCount, 0),
      missingArtifacts,
      unexpectedArtifacts,
      duplicateArtifacts: [...new Set(duplicateArtifacts)],
    },
    issues,
    status: issues.length === 0 && expectedArtifacts.length > 0 ? 'passed' : 'failed',
    claimBoundary:
      'This aggregate proves that every DOCX, PPTX, and XLSX in the bound package has one independently replayable render-audit-v1 receipt; it does not add claims beyond those child receipts.',
  };
  return { ...receipt, receiptSha256: receiptHash(receipt) };
}

export async function verifyPackageRenderAuditV1(receipt, { root = process.cwd() } = {}) {
  const issues = [];
  const absoluteRoot = path.resolve(root);
  if (receipt?.protocol !== PACKAGE_RENDER_AUDIT_V1_PROTOCOL) issues.push('unsupported package render protocol');
  if (!HASH_PATTERN.test(String(receipt?.receiptSha256 || '')) || receiptHash(receipt) !== receipt.receiptSha256) {
    issues.push('package receipt hash mismatch');
  }
  issues.push(...(await verifyFile(receipt?.packageFile, absoluteRoot, 'package file')));
  const packageDirectory = safeRelativePath(receipt?.packageDirectory);
  const receiptDirectory = safeRelativePath(receipt?.receiptDirectory);
  if (!packageDirectory || !receiptDirectory) issues.push('package or receipt directory is unsafe');
  if (packageDirectory && receiptDirectory) {
    const replayed = await capturePackageRenderAuditV1({
      root: absoluteRoot,
      packagePath: receipt.packageFile.path,
      packageDirectory,
      receiptDirectory,
      capturedAt: receipt.capturedAt,
    }).catch((error) => ({ error }));
    if (replayed.error) issues.push(`package replay failed: ${replayed.error.message}`);
    else {
      const storedBody = { ...receipt };
      const replayedBody = { ...replayed };
      delete storedBody.receiptSha256;
      delete replayedBody.receiptSha256;
      if (canonicalJson(storedBody) !== canonicalJson(replayedBody)) issues.push('package receipt does not reproduce');
    }
  }
  return {
    valid: issues.length === 0,
    passed: issues.length === 0 && receipt?.status === 'passed',
    issues,
    receiptSha256: receipt?.receiptSha256 || '',
    artifactCount: Array.isArray(receipt?.artifacts) ? receipt.artifacts.length : 0,
  };
}
