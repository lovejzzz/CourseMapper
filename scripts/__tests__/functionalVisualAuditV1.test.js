import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import sharp from 'sharp';

import { captureFunctionalVisualAuditV1, verifyFunctionalVisualAuditV1 } from '../lib/functionalVisualAuditV1.mjs';
import { capturePackageRenderAuditV1, captureRenderAuditV1 } from '../lib/renderAuditV1.mjs';
import {
  buildFunctionalVisualTaskContract,
  functionalVisualTaskContractHash,
} from '../../src/lib/functionalVisualTaskContract.js';
import { extractBriefQualityContract } from '../../src/lib/briefQualityContract.js';
import { evaluateFunctionalVisualRights } from '../../src/lib/functionalVisualRights.js';

const FIXTURE_SOURCE_BRIEF =
  'Every lesson must require students to analyze a concrete visual and annotate or compare it. Original CourseMapper-native visuals are allowed and must disclose their rights boundary.';

async function makeSlidePng(filePath) {
  const overlay = Buffer.from(
    '<svg width="200" height="120"><rect x="20" y="15" width="160" height="90" fill="#17324d"/></svg>',
  );
  await sharp({ create: { width: 200, height: 120, channels: 3, background: '#ffffff' } })
    .composite([{ input: overlay }])
    .png()
    .toFile(filePath);
}

function taskSlideXml() {
  const shapes = [
    '<p:cNvPr id="1" name="cmSpecimenPanel"/>',
    ...Array.from({ length: 4 }, (_, index) => `<p:cNvPr id="${index + 2}" name="cmSpecimenGrid"/>`),
    ...Array.from({ length: 3 }, (_, index) => `<p:cNvPr id="${index + 6}" name="cmSpecimenBar"/>`),
    '<p:cNvPr id="9" name="cmSpecimenFocal"/>',
    '<p:cNvPr id="10" name="cmSpecimenDirection"/>',
  ].join('');
  return `<?xml version="1.0"?><p:sld xmlns:p="p" xmlns:a="a"><p:cSld>${shapes}<a:t>Visual provenance: original CourseMapper-native vector; no external image asset. Analyze this specimen: annotate one feature or compare two paths; connect it to the course artifact and test it against the lesson source.</a:t></p:cSld></p:sld>`;
}

function fixtureTaskContract(concept = 'composition') {
  return buildFunctionalVisualTaskContract({
    lessonNumber: 1,
    lessonTitle: 'Lesson 1: Evidence',
    objectives: ['Analyze composition evidence.'],
    concept,
    secondary: 'balance',
    productActions: ['analyze', 'annotate'],
    learnerArtifact: 'annotated comparison',
    successCriterion: 'Name the visible relationship.',
  });
}

function fixtureVisibleTask(concept = 'composition') {
  const cardText =
    `Analyze the ${concept} specimen: annotate one visible relationship. ` +
    'Test it against CM-SRC-L01; carry the supported observation into CM-PROD-L01 (annotated comparison).';
  const authoredSummary = `Visual provenance for ${concept}: original CourseMapper-native vector; no external image asset. ${cardText}`;
  const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
  const authoredBullets = [
    authoredSummary,
    `Study the ${concept} specimen and annotate the evidence.`,
    `Separate observation from interpretation for ${concept}.`,
    'Test the interpretation against CM-SRC-L01 using this criterion: Name the visible relationship.',
    'Rights boundary: Original native visual.',
  ];
  return {
    protocol: 'coursemapper-visible-functional-task-v1',
    cardText,
    cardTextSha256: digest(cardText),
    authoredSummary,
    authoredSummarySha256: digest(authoredSummary),
    authoredBullets,
    authoredBulletsSha256: digest(JSON.stringify(authoredBullets)),
    provenanceLabel: 'VISUAL PROVENANCE · ORIGINAL NATIVE · NO EXTERNAL IMAGE ASSET',
    conceptBinding: concept,
    processAction: 'analyze',
    productActions: ['analyze', 'annotate'],
    sourceBindingId: 'CM-SRC-L01',
    learnerProductId: 'CM-PROD-L01',
    artifact: 'annotated comparison',
    successCriterion: 'Name the visible relationship.',
    rightsDisclosure: 'Original native visual.',
  };
}

function typedSpatialTaskSlideXml({
  includeGeometryInvariants = false,
  invalidRelationEndpoint = false,
  reverseRelation = false,
  mismatchedContract = false,
  omitCounterexample = false,
  sourceResolution = 'native-evidence-specimen',
  includeNativeVerification = true,
  tamperRenderedGeometry = false,
  substituteVisibleTask = false,
  assetRightsClass = 'original-native-owner-controlled',
} = {}) {
  const taskContract = fixtureTaskContract(mismatchedContract ? 'syntax sequence' : 'composition');
  if (omitCounterexample) {
    delete taskContract.counterexample;
    taskContract.contractSha256 = functionalVisualTaskContractHash(taskContract);
  }
  const entities = [
    { id: 'primary-mass', geometry: { x: 5, y: 18, w: 42, h: 20 } },
    { id: 'secondary-mass', geometry: { x: 5, y: 58, w: 27, h: 14 } },
    { id: 'focal-anchor', geometry: { x: 75, y: 16, w: 16, h: 28 } },
    { id: 'thirds-frame', geometry: { x: 2, y: 5, w: 96, h: 84 } },
  ];
  const relations = [
    {
      id: 'eye-path',
      type: 'directs-attention-to',
      from: reverseRelation ? 'focal-anchor' : 'primary-mass',
      to: invalidRelationEndpoint ? 'missing-anchor' : reverseRelation ? 'primary-mass' : 'focal-anchor',
      visibleStatement: 'The primary mass directs attention to A.',
    },
    {
      id: 'counter-balance',
      type: 'counterbalances',
      from: 'secondary-mass',
      to: 'primary-mass',
      visibleStatement: 'The secondary mass counterbalances A.',
    },
  ];
  const typedSpecimen = {
    protocol: 'coursemapper-typed-evidence-specimen-v1',
    lessonNumber: 1,
    specimenKind: 'spatial-composition',
    conceptBinding: 'composition',
    taskContract,
    taskContractSha256: taskContract.contractSha256,
    entities,
    relations,
    expectedObservation: {
      id: 'expected-l1',
      claim: 'The path leads toward A.',
      evidenceIds: ['primary-mass', 'secondary-mass', 'focal-anchor', 'eye-path', 'counter-balance'],
    },
    learnerProduct: {
      id: 'CM-PROD-L01',
      actions: ['analyze', 'annotate'],
      artifact: 'annotated comparison',
      criterion: 'Name the visible relationship.',
    },
    answerRubricBinding: {
      expectedObservationId: 'expected-l1',
      scoringUse: 'Compare the claim with visible evidence.',
    },
    sourceBinding: {
      id: 'CM-SRC-L01',
      label: 'Lesson 1 evidence packet',
      resolution: sourceResolution,
      ...(sourceResolution === 'native-evidence-specimen' && includeNativeVerification
        ? { verificationRule: 'Inspect the typed entities and relations before interpreting the specimen.' }
        : {}),
    },
    rightsBinding: {
      mode: 'open-or-public-domain-or-original-native',
      assetRightsClass,
      disclosure: 'Original native visual.',
    },
  };
  typedSpecimen.visibleTask = fixtureVisibleTask('composition');
  const contract = encodeURIComponent(JSON.stringify(typedSpecimen));
  const renderedGeometry = Object.fromEntries(
    entities.map((entity) => [
      entity.id,
      {
        x: entity.geometry.x / 20,
        y: entity.geometry.y / 20,
        w: entity.geometry.w / 20,
        h: entity.geometry.h / 20,
      },
    ]),
  );
  if (tamperRenderedGeometry) renderedGeometry['primary-mass'].w = 0.2;
  const emu = (value) => Math.round(value * 914400);
  const shape = (name, id, geometry, transform = '') =>
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/></p:nvSpPr><p:spPr><a:xfrm${transform}><a:off x="${emu(geometry.x)}" y="${emu(geometry.y)}"/><a:ext cx="${emu(geometry.w)}" cy="${emu(geometry.h)}"/></a:xfrm></p:spPr></p:sp>`;
  const entityShapes = entities
    .map((entity, index) => shape(`cmEntity_${entity.id}`, index + 2, renderedGeometry[entity.id]))
    .join('');
  const relationShape = (relation, id) => {
    const from = renderedGeometry[relation.from];
    const to = renderedGeometry[relation.to];
    if (!from || !to) return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="cmRelation_${relation.id}"/></p:nvSpPr></p:sp>`;
    const start = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
    const end = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
    const geometry = {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      w: Math.abs(end.x - start.x),
      h: Math.abs(end.y - start.y),
    };
    const transform = `${end.x < start.x ? ' flipH="1"' : ''}${end.y < start.y ? ' flipV="1"' : ''}`;
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="cmRelation_${relation.id}"/></p:nvSpPr><p:spPr><a:xfrm${transform}><a:off x="${emu(geometry.x)}" y="${emu(geometry.y)}"/><a:ext cx="${emu(geometry.w)}" cy="${emu(geometry.h)}"/></a:xfrm><a:ln><a:tailEnd type="triangle"/></a:ln></p:spPr></p:sp>`;
  };
  const relationShapes = relations.map((relation, index) => relationShape(relation, 30 + index)).join('');
  const invariantShapes = includeGeometryInvariants
    ? ['thirds-v1', 'thirds-v2', 'thirds-h1', 'thirds-h2', 'eye-path']
        .map((id, index) => `<p:cNvPr id="${index + 10}" name="cmInvariant_${id}"/>`)
        .join('')
    : '';
  const visibleCard = substituteVisibleTask
    ? 'Observe before interpreting. Test the claim against CM-SRC-L01. Carry evidence into CM-PROD-L01.'
    : typedSpecimen.visibleTask.cardText;
  return `<?xml version="1.0"?><p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:cNvPr id="1" name="cmSpecimenPanel"/>${entityShapes}${relationShapes}${invariantShapes}<a:t>${typedSpecimen.visibleTask.provenanceLabel}. ${visibleCard}</a:t></p:cSld><p:extLst><p:ext uri="{A15E42C8-6D34-4EAE-9D52-COURSEMAPPER01}"><cm:specimenContract xmlns:cm="https://edutool.dev/ns/coursemapper/specimen-contract/v1" encoding="uri-json">${contract}</cm:specimenContract></p:ext></p:extLst></p:sld>`;
}

function typedContrastTaskSlideXml(taskContract, { tamperMarkStyle = false } = {}) {
  const entities = [
    { id: 'field-high', label: 'HIGH', geometry: { x: 4, y: 10, w: 42, h: 76 }, fill: '1E3A5F' },
    { id: 'field-low', label: 'LOW', geometry: { x: 54, y: 10, w: 42, h: 76 }, fill: 'CBD5E1' },
    { id: 'mark-high', label: 'A', geometry: { x: 17, y: 32, w: 16, h: 27 }, fill: 'F6C90E' },
    {
      id: 'mark-low',
      label: 'A',
      geometry: { x: 67, y: 32, w: 16, h: 27 },
      fill: tamperMarkStyle ? '2E86AB' : 'F6C90E',
    },
  ];
  const relations = [
    {
      id: 'high-separation',
      type: 'tonal-separation',
      from: 'mark-high',
      to: 'field-high',
      visibleStatement: 'A separates strongly from the high field.',
    },
    {
      id: 'low-separation',
      type: 'tonal-separation',
      from: 'mark-low',
      to: 'field-low',
      visibleStatement: 'A separates weakly from the low field.',
    },
  ];
  const typedSpecimen = {
    protocol: 'coursemapper-typed-evidence-specimen-v1',
    lessonNumber: 1,
    specimenKind: 'contrast-encoding-comparison',
    conceptBinding: 'color contrast',
    taskContract,
    taskContractSha256: taskContract.contractSha256,
    entities: entities.map(({ id, label, geometry }) => ({ id, label, geometry })),
    relations,
    expectedObservation: {
      id: 'expected-l1',
      claim: 'The identical mark has greater tonal separation from the high field.',
      evidenceIds: [...entities.map((entity) => entity.id), ...relations.map((relation) => relation.id)],
    },
    learnerProduct: {
      id: 'CM-PROD-L01',
      actions: ['analyze', 'annotate'],
      artifact: 'annotated comparison',
      criterion: 'Name the visible relationship.',
    },
    answerRubricBinding: { expectedObservationId: 'expected-l1', scoringUse: 'Compare the visible contrast.' },
    sourceBinding: {
      id: 'CM-SRC-L01',
      label: 'Lesson 1 evidence packet',
      resolution: 'native-evidence-specimen',
      verificationRule: 'Inspect the typed entities and relations before interpreting the specimen.',
    },
    rightsBinding: {
      mode: 'open-or-public-domain-or-original-native',
      assetRightsClass: 'original-native-owner-controlled',
      disclosure: 'Original native visual.',
    },
  };
  typedSpecimen.visibleTask = fixtureVisibleTask('color contrast');
  const emu = (value) => Math.round((value / 20) * 914400);
  const entityShapes = entities
    .map(
      (entity, index) =>
        `<p:sp><p:nvSpPr><p:cNvPr id="${index + 2}" name="cmEntity_${entity.id}"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(entity.geometry.x)}" y="${emu(entity.geometry.y)}"/><a:ext cx="${emu(entity.geometry.w)}" cy="${emu(entity.geometry.h)}"/></a:xfrm><a:prstGeom prst="${entity.id.startsWith('mark-') ? 'ellipse' : 'rect'}"/><a:solidFill><a:srgbClr val="${entity.fill}"><a:alpha val="92000"/></a:srgbClr></a:solidFill></p:spPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="${index + 12}" name="cmEntityLabel_${entity.id}"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(entity.geometry.x)}" y="${emu(entity.geometry.y)}"/><a:ext cx="${emu(entity.geometry.w)}" cy="${emu(entity.geometry.h)}"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>${entity.label}</a:t></a:r></a:p></p:txBody></p:sp>`,
    )
    .join('');
  const relationShapes = relations
    .map((relation, index) => {
      const from = entities.find((entity) => entity.id === relation.from).geometry;
      const to = entities.find((entity) => entity.id === relation.to).geometry;
      const start = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
      const end = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
      return `<p:sp><p:nvSpPr><p:cNvPr id="${index + 30}" name="cmRelation_${relation.id}"/></p:nvSpPr><p:spPr><a:xfrm${end.x < start.x ? ' flipH="1"' : ''}${end.y < start.y ? ' flipV="1"' : ''}><a:off x="${emu(Math.min(start.x, end.x))}" y="${emu(Math.min(start.y, end.y))}"/><a:ext cx="${emu(Math.abs(end.x - start.x))}" cy="${emu(Math.abs(end.y - start.y))}"/></a:xfrm><a:ln><a:tailEnd type="triangle"/></a:ln></p:spPr></p:sp>`;
    })
    .join('');
  const encoded = encodeURIComponent(JSON.stringify(typedSpecimen));
  return `<?xml version="1.0"?><p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:cNvPr id="1" name="cmSpecimenPanel"/>${entityShapes}${relationShapes}<a:t>${typedSpecimen.visibleTask.provenanceLabel}. ${typedSpecimen.visibleTask.cardText}</a:t></p:cSld><p:extLst><p:ext uri="{A15E42C8-6D34-4EAE-9D52-COURSEMAPPER01}"><cm:specimenContract xmlns:cm="https://edutool.dev/ns/coursemapper/specimen-contract/v1" encoding="uri-json">${encoded}</cm:specimenContract></p:ext></p:extLst></p:sld>`;
}

describe('functional-visual-audit-v1', () => {
  let root;

  afterEach(async () => {
    if (root) await fs.rm(root, { recursive: true, force: true });
    root = null;
  });

  async function fixture({
    relevant = true,
    slideXml = taskSlideXml(),
    taskContract = fixtureTaskContract(),
    manifestLessonObjectives = taskContract.upstreamRequirement.objectives,
    manifestAssessmentObjectives = taskContract.upstreamRequirement.objectives,
    manifestAssessmentTitle = 'annotated comparison',
    sourceBrief = FIXTURE_SOURCE_BRIEF,
    manifestAssetRightsClass = 'original-native-owner-controlled',
  } = {}) {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'functional-visual-audit-v1-'));
    const packageDir = path.join(root, 'package');
    const deckDir = path.join(packageDir, 'Slide Decks');
    const renderDir = path.join(root, 'renders/deck');
    const receiptDir = path.join(root, 'render-receipts');
    await Promise.all([
      fs.mkdir(deckDir, { recursive: true }),
      fs.mkdir(renderDir, { recursive: true }),
      fs.mkdir(receiptDir, { recursive: true }),
    ]);
    const deckPath = path.join(deckDir, 'Lesson 01 - Evidence - Slide Decks.pptx');
    const pptx = new JSZip();
    pptx.file('ppt/slides/slide1.xml', slideXml);
    pptx.file(
      'ppt/notesSlides/notesSlide1.xml',
      '<?xml version="1.0"?><p:notes xmlns:p="p" xmlns:a="a"><a:t>EXPECTED OBSERVATION [expected-l1] The path leads toward A. ANSWER/RUBRIC LINK [expected-l1]</a:t></p:notes>',
    );
    await fs.writeFile(deckPath, await pptx.generateAsync({ type: 'nodebuffer' }));
    await makeSlidePng(path.join(renderDir, 'slide-1.png'));
    await fs.writeFile(path.join(root, 'package.zip'), 'bound package bytes');
    const manifestVisibleTask = fixtureVisibleTask(taskContract?.upstreamRequirement?.conceptBinding || 'composition');
    const manifestContract = extractBriefQualityContract(sourceBrief, { lessonCount: 1 });
    const manifestRights = evaluateFunctionalVisualRights(manifestContract, {
      sourceBinding: {
        resolution: 'native-evidence-specimen',
        verificationRule: 'Inspect the typed entities and relations before interpreting the specimen.',
      },
      rightsBinding: {
        assetRightsClass: manifestAssetRightsClass,
        disclosure: 'Original native visual.',
      },
    });
    await fs.writeFile(
      path.join(packageDir, 'PACKAGE_MANIFEST.json'),
      JSON.stringify({
        lessons: [
          {
            lessonNumber: 1,
            title: taskContract.upstreamRequirement.lessonTitle,
            objectives: manifestLessonObjectives,
          },
        ],
        assessments: [
          {
            id: 'A1.1',
            lesson: 1,
            title: manifestAssessmentTitle,
            objectives: manifestAssessmentObjectives,
          },
        ],
        generationConstraints: {
          briefQualityContract: manifestContract,
          sourceBriefBinding: {
            protocol: 'coursemapper-source-brief-binding-v1',
            text: sourceBrief,
            utf8Bytes: Buffer.byteLength(sourceBrief, 'utf8'),
            sha256: crypto.createHash('sha256').update(sourceBrief).digest('hex'),
          },
        },
        functionalVisualBindings: [
          {
            protocol: 'coursemapper-functional-visual-binding-v1',
            lessonNumber: 1,
            taskContract: {
              protocol: taskContract.protocol,
              contractId: taskContract.contractId,
              contractSha256: taskContract.contractSha256,
              upstreamRequirementSha256: taskContract.upstreamRequirementSha256,
              constructFamily: taskContract.constructFamily,
              predicateIds: taskContract.predicates.map((predicate) => predicate.id),
              counterexampleStateId: taskContract.counterexample.stateId,
            },
            visibleTask: {
              protocol: manifestVisibleTask.protocol,
              hashBound: true,
              cardTextSha256: manifestVisibleTask.cardTextSha256,
              authoredSummarySha256: manifestVisibleTask.authoredSummarySha256,
              authoredBulletsSha256: manifestVisibleTask.authoredBulletsSha256,
              sourceBindingId: manifestVisibleTask.sourceBindingId,
              learnerProductId: manifestVisibleTask.learnerProductId,
              artifact: manifestVisibleTask.artifact,
              successCriterion: manifestVisibleTask.successCriterion,
              rightsDisclosure: manifestVisibleTask.rightsDisclosure,
            },
            source: {
              bindingId: 'CM-SRC-L01',
              label: 'Lesson 1 evidence packet',
              resolution: 'native-evidence-specimen',
              resolved: true,
            },
            rights: manifestRights,
            product: {
              bindingId: 'CM-PROD-L01',
              label: 'annotated comparison',
              assessmentId: 'A1.1',
              resolved: true,
            },
          },
        ],
      }),
    );
    const reviewedAt = '2026-08-04T22:00:00.000Z';
    const child = await captureRenderAuditV1({
      root,
      sourcePath: path.relative(root, deckPath),
      renderDirectory: path.relative(root, renderDir),
      kind: 'pptx',
      inspection: {
        status: 'complete',
        reviewerId: 'fixture-reviewer',
        reviewedAt,
        reviewedItemIds: ['slide-1'],
      },
      renderer: { id: 'fixture-renderer', version: '1' },
      replay: { command: 'render fixture', environment: 'vitest' },
      capturedAt: reviewedAt,
    });
    await fs.writeFile(path.join(receiptDir, 'deck.json'), JSON.stringify(child));
    const aggregate = await capturePackageRenderAuditV1({
      root,
      packagePath: 'package.zip',
      packageDirectory: 'package',
      receiptDirectory: 'render-receipts',
      capturedAt: reviewedAt,
    });
    await fs.writeFile(path.join(root, 'package-render.json'), JSON.stringify(aggregate));
    await fs.writeFile(
      path.join(root, 'inspection.json'),
      JSON.stringify({
        protocol: 'coursemapper-functional-visual-inspection-v1',
        reviewerId: 'fixture-reviewer',
        reviewedAt,
        lessons: [
          {
            lessonNumber: 1,
            relevant,
            pedagogicallyUsable: true,
            taskLinked: true,
            rightsBoundaryClear: true,
            slidePath: 'package/Slide Decks/Lesson 01 - Evidence - Slide Decks.pptx',
            slideNumber: 1,
            visibleSourceBinding: 'CM-SRC-L01',
            visibleAssessmentBinding: 'CM-PROD-L01',
            taskContractSha256: taskContract.contractSha256,
            disciplinaryRelevanceReason:
              'The composition task asks learners to inspect the encoded masses and eye path.',
            pedagogicalValidityReason:
              'The visible contrast and bounded inference are usable for the declared analysis task.',
            observation:
              'The native specimen exposes grid, scale, contrast, and direction, and the visible task uses it.',
          },
        ],
      }),
    );
    return captureFunctionalVisualAuditV1({
      root,
      packagePath: 'package.zip',
      packageDirectory: 'package',
      packageRenderReceiptPath: 'package-render.json',
      inspectionPath: 'inspection.json',
      capturedAt: reviewedAt,
    });
  }

  it('binds native structure, visible task text, render coverage, human review, and hashes', async () => {
    const receipt = await fixture({ slideXml: typedSpatialTaskSlideXml({ includeGeometryInvariants: true }) });
    expect(receipt.status, JSON.stringify(receipt.lessons[0], null, 2)).toBe('passed');
    expect(receipt.summary).toMatchObject({ requiredLessonCount: 1, passedLessonCount: 1, functionalRate: 1 });
    await expect(verifyFunctionalVisualAuditV1(receipt, { root })).resolves.toMatchObject({
      valid: true,
      passed: true,
      functionalRate: 1,
    });
    expect(receipt.lessons[0].structuredChecks).toMatchObject({
      visibleTaskContract: true,
      visibleTaskMeaningPreserved: true,
      visibleProvenance: true,
    });
  });

  it('accepts objectives bound to the explicitly linked assessment when they are narrower than the lesson', async () => {
    const taskContract = fixtureTaskContract();
    const receipt = await fixture({
      taskContract,
      slideXml: typedSpatialTaskSlideXml({ includeGeometryInvariants: true }),
      manifestLessonObjectives: ['Evaluate the broader lesson construct.'],
    });
    expect(receipt.status, JSON.stringify(receipt.lessons[0], null, 2)).toBe('passed');
    expect(receipt.lessons[0].structuredChecks.sourceRequirementBound).toBe(true);
  });

  it('rejects assessment objectives unless the linked assessment title and lesson also resolve', async () => {
    const taskContract = fixtureTaskContract();
    const receipt = await fixture({
      taskContract,
      slideXml: typedSpatialTaskSlideXml({ includeGeometryInvariants: true }),
      manifestLessonObjectives: ['Evaluate the broader lesson construct.'],
      manifestAssessmentTitle: 'different artifact',
    });
    expect(receipt.status).toBe('failed');
    expect(receipt.lessons[0].structuredChecks.sourceRequirementBound).toBe(false);
  });

  it('rejects generic exporter prose even when provenance and binding IDs remain visible', async () => {
    const receipt = await fixture({
      slideXml: typedSpatialTaskSlideXml({ includeGeometryInvariants: true, substituteVisibleTask: true }),
    });
    expect(receipt.status).toBe('failed');
    expect(receipt.lessons[0].structuredChecks.visibleTaskContract).toBe(true);
    expect(receipt.lessons[0].structuredChecks.visibleTaskMeaningPreserved).toBe(false);
    expect(receipt.lessons[0].issues).toContain('structured check failed: visibleTaskMeaningPreserved');
  });

  it('reads the machine contract from a slide extension without leaking it into accessibility descriptions', () => {
    const xml = typedSpatialTaskSlideXml({ includeGeometryInvariants: true });
    expect(xml).toContain('<cm:specimenContract');
    expect(xml).not.toMatch(/descr="CM_SPECIMEN_CONTRACT_V1:/);
  });

  it('verifies actual fill, opacity, label text, contrast ordering, and a falsifying style mutation', async () => {
    const taskContract = fixtureTaskContract('color contrast');
    const receipt = await fixture({
      taskContract,
      slideXml: typedContrastTaskSlideXml(taskContract),
    });
    expect(receipt.status, JSON.stringify(receipt.lessons[0], null, 2)).toBe('passed');
    expect(receipt.lessons[0].structuredChecks).toMatchObject({
      predicateResults: {
        'marks-match': true,
        'mark-styles-match': true,
        'high-contrast-exceeds-low': true,
      },
      counterexamplePredicateResults: { 'high-contrast-exceeds-low': false },
      counterexamplePresent: true,
      relationDirectionSatisfied: true,
    });
  });

  it('rejects the identical-mark claim when immutable OOXML uses a different mark fill', async () => {
    const taskContract = fixtureTaskContract('color contrast');
    const receipt = await fixture({
      taskContract,
      slideXml: typedContrastTaskSlideXml(taskContract, { tamperMarkStyle: true }),
    });
    expect(receipt.status).toBe('failed');
    expect(receipt.lessons[0].structuredChecks.predicateResults['mark-styles-match']).toBe(false);
  });

  it('does not call a structurally present visual functional when human relevance review fails', async () => {
    const receipt = await fixture({
      relevant: false,
      slideXml: typedSpatialTaskSlideXml({ includeGeometryInvariants: true }),
    });
    expect(receipt.status).toBe('failed');
    expect(receipt.lessons[0].issues).toContain('manual relevance/task/rights inspection did not pass');
  });

  it('rejects legacy generic source and course-artifact marker phrases', async () => {
    const receipt = await fixture();
    expect(receipt.status).toBe('failed');
    expect(receipt.lessons[0].structuredChecks).toMatchObject({
      typedSpecimenContract: false,
      visibleSourceLink: false,
      visibleAssessmentLink: false,
    });
  });

  it('rejects a typed specimen whose label contract lacks the specimen-kind geometry', async () => {
    const receipt = await fixture({ slideXml: typedSpatialTaskSlideXml() });
    expect(receipt.status).toBe('failed');
    expect(receipt.lessons[0].structuredChecks).toMatchObject({
      typedSpecimenContract: true,
      observableGeometry: true,
      specimenKindInvariant: false,
    });
  });

  it('accepts a typed spatial specimen only when the actual thirds guides and eye path are rendered', async () => {
    const receipt = await fixture({ slideXml: typedSpatialTaskSlideXml({ includeGeometryInvariants: true }) });
    expect(receipt.status).toBe('passed');
    expect(receipt.lessons[0].structuredChecks).toMatchObject({
      geometryKindSupported: true,
      observableGeometry: true,
      specimenKindInvariant: true,
      renderedOoxmlGeometry: true,
    });
  });

  it('rejects exported OOXML geometry that contradicts a passing compiler sidecar', async () => {
    const receipt = await fixture({
      slideXml: typedSpatialTaskSlideXml({ includeGeometryInvariants: true, tamperRenderedGeometry: true }),
    });
    expect(receipt.status).toBe('failed');
    expect(receipt.lessons[0].structuredChecks).toMatchObject({
      renderedOoxmlGeometry: true,
      renderedPredicatesSatisfied: false,
    });
  });

  it('accepts an original native specimen only with an inspectable verification and rights contract', async () => {
    const receipt = await fixture({
      slideXml: typedSpatialTaskSlideXml({
        includeGeometryInvariants: true,
        sourceResolution: 'native-evidence-specimen',
      }),
    });
    expect(receipt.status).toBe('passed');
    expect(receipt.lessons[0].structuredChecks).toMatchObject({ typedSpecimenContract: true });

    const missingVerification = await fixture({
      slideXml: typedSpatialTaskSlideXml({
        includeGeometryInvariants: true,
        sourceResolution: 'native-evidence-specimen',
        includeNativeVerification: false,
      }),
    });
    expect(missingVerification.status).toBe('failed');
    expect(missingVerification.lessons[0].structuredChecks).toMatchObject({ typedSpecimenContract: false });
  });

  it('rejects an owner-controlled native specimen when the byte-bound brief requires open or public-domain visuals only', async () => {
    const strictBrief =
      'Every lesson must require students to analyze a concrete visual and annotate or compare it. Use only verifiable open or public-domain visuals and preserve attribution and license boundaries.';
    const receipt = await fixture({
      sourceBrief: strictBrief,
      slideXml: typedSpatialTaskSlideXml({
        includeGeometryInvariants: true,
        sourceResolution: 'native-evidence-specimen',
      }),
    });
    expect(receipt.status).toBe('failed');
    expect(receipt.lessons[0].structuredChecks).toMatchObject({
      nativeSourceStructurallyResolved: true,
      rightsRequirementSatisfied: false,
    });
    expect(receipt.lessons[0].issues).toContain('structured check failed: rightsRequirementSatisfied');
  });

  it('accepts a public-domain native specimen when the byte-bound brief requires open or public-domain visuals only', async () => {
    const strictBrief =
      'Every lesson must require students to analyze a concrete visual and annotate or compare it. Use only verifiable open or public-domain visuals and preserve attribution and license boundaries.';
    const receipt = await fixture({
      sourceBrief: strictBrief,
      manifestAssetRightsClass: 'public-domain',
      slideXml: typedSpatialTaskSlideXml({
        includeGeometryInvariants: true,
        sourceResolution: 'native-evidence-specimen',
        assetRightsClass: 'public-domain',
      }),
    });
    expect(receipt.status, JSON.stringify(receipt.lessons[0], null, 2)).toBe('passed');
    expect(receipt.lessons[0].structuredChecks).toMatchObject({
      typedSpecimenContract: true,
      nativeSourceStructurallyResolved: true,
      rightsRequirementSatisfied: true,
      attributionRequirementSatisfied: true,
    });
  });

  it('rejects a typed relation whose endpoint is not a declared entity', async () => {
    const receipt = await fixture({
      slideXml: typedSpatialTaskSlideXml({ includeGeometryInvariants: true, invalidRelationEndpoint: true }),
    });
    expect(receipt.status).toBe('failed');
    expect(receipt.lessons[0].structuredChecks).toMatchObject({
      typedSpecimenContract: false,
      typedRelationsRendered: false,
    });
  });

  it('rejects valid geometry whose task-contract identity does not match the frozen upstream construct', async () => {
    const receipt = await fixture({
      slideXml: typedSpatialTaskSlideXml({ includeGeometryInvariants: true, mismatchedContract: true }),
    });
    expect(receipt.status).toBe('failed');
    expect(receipt.lessons[0].structuredChecks).toMatchObject({
      taskContractValid: false,
      sourceRequirementBound: false,
    });
  });

  it('rejects a reversed rendered relation even when the expected prose is unchanged', async () => {
    const receipt = await fixture({
      slideXml: typedSpatialTaskSlideXml({ includeGeometryInvariants: true, reverseRelation: true }),
    });
    expect(receipt.status).toBe('failed');
    expect(receipt.lessons[0].structuredChecks).toMatchObject({
      renderedPredicatesSatisfied: false,
      relationDirectionSatisfied: false,
    });
  });

  it('rejects a missing counterexample contract even when every manual judgment is positive', async () => {
    const receipt = await fixture({
      slideXml: typedSpatialTaskSlideXml({ includeGeometryInvariants: true, omitCounterexample: true }),
    });
    expect(receipt.status).toBe('failed');
    expect(receipt.lessons[0].structuredChecks).toMatchObject({ counterexamplePresent: false });
    expect(receipt.lessons[0].manualInspection).toMatchObject({
      relevant: true,
      pedagogicallyUsable: true,
      taskLinked: true,
      rightsBoundaryClear: true,
    });
  });
});
