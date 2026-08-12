import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

import { PACKAGE_RENDER_AUDIT_V1_PROTOCOL, verifyPackageRenderAuditV1 } from './renderAuditV1.mjs';
import { extractBriefQualityContract } from '../../src/lib/briefQualityContract.js';
import { evaluateFunctionalVisualRights } from '../../src/lib/functionalVisualRights.js';

export const FUNCTIONAL_VISUAL_AUDIT_V1_PROTOCOL = 'coursemapper-functional-visual-audit-v1';
export const FUNCTIONAL_VISUAL_INSPECTION_V1_PROTOCOL = 'coursemapper-functional-visual-inspection-v1';
export const FUNCTIONAL_VISUAL_AUDIT_V1_MIN_RATE = 0.8;
const FUNCTIONAL_VISUAL_TASK_CONTRACT_PROTOCOL = 'coursemapper-functional-visual-task-contract-v1';
const EMU_PER_INCH = 914400;

const SHA256_RE = /^[a-f0-9]{64}$/;

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

function safeRelativePath(value) {
  const candidate = String(value || '')
    .trim()
    .replace(/\\/g, '/');
  if (!candidate || path.posix.isAbsolute(candidate)) return '';
  const normalized = path.posix.normalize(candidate);
  if (normalized === '..' || normalized.startsWith('../')) return '';
  return normalized;
}

async function fileRecord(filePath, root) {
  const bytes = await fs.readFile(filePath);
  return {
    path: path.relative(root, filePath).split(path.sep).join('/'),
    bytes: bytes.length,
    sha256: sha256(bytes),
  };
}

function receiptHash(receipt) {
  const body = { ...receipt };
  delete body.receiptSha256;
  return sha256(canonicalJson(body));
}

async function walkFiles(directory) {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await walkFiles(candidate)));
    else if (entry.isFile()) result.push(candidate);
  }
  return result;
}

function lessonNumberFromPath(filePath) {
  const match = String(filePath || '').match(/(?:^|\/)Lesson\s+0*(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function namedShapeMeasurements(xml, prefix) {
  const measurements = [];
  const shapeBlocks = String(xml || '').matchAll(/<p:(sp|cxnSp|graphicFrame)\b[\s\S]*?<\/p:\1>/gi);
  for (const match of shapeBlocks) {
    const block = match[0];
    const name = decodeXml(block.match(/<p:cNvPr\b[^>]*\bname="([^"]+)"/i)?.[1] || '');
    const id = name.match(new RegExp(`^${prefix}([a-z0-9-]+)$`, 'i'))?.[1] || '';
    if (!id) continue;
    const transform = block.match(/<a:xfrm\b([^>]*)>([\s\S]*?)<\/a:xfrm>/i);
    const offset = transform?.[2]?.match(/<a:off\b[^>]*\bx="(-?\d+)"[^>]*\by="(-?\d+)"/i);
    const extent = transform?.[2]?.match(/<a:ext\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/i);
    if (!transform || !offset || !extent) continue;
    const attributes = transform[1] || '';
    const shapeProperties = block.match(/<p:spPr\b[^>]*>[\s\S]*?<\/p:spPr>/i)?.[0] || '';
    const solidFill = shapeProperties.match(/<a:solidFill\b[^>]*>([\s\S]*?)<\/a:solidFill>/i)?.[1] || '';
    const fillColor = String(
      solidFill.match(/<a:srgbClr\b[^>]*\bval="([a-f0-9]{6})"/i)?.[1] ||
        solidFill.match(/<a:schemeClr\b[^>]*\bval="([^"]+)"/i)?.[1] ||
        '',
    ).toUpperCase();
    const alpha = Number(solidFill.match(/<a:alpha\b[^>]*\bval="(\d+)"/i)?.[1]);
    const visibleText = decodeXml([...block.matchAll(/<a:t>([\s\S]*?)<\/a:t>/gi)].map((item) => item[1]).join(' '))
      .replace(/\s+/g, ' ')
      .trim();
    measurements.push({
      id,
      geometry: {
        x: Number(offset[1]) / EMU_PER_INCH,
        y: Number(offset[2]) / EMU_PER_INCH,
        w: Number(extent[1]) / EMU_PER_INCH,
        h: Number(extent[2]) / EMU_PER_INCH,
      },
      flipH: /\bflipH="(?:1|true)"/i.test(attributes),
      flipV: /\bflipV="(?:1|true)"/i.test(attributes),
      arrowAtEnd: /<a:tailEnd\b[^>]*\btype="(?!none\b)[^"]+"/i.test(block),
      style: {
        fillColor,
        opacity: Number.isFinite(alpha) ? alpha / 100000 : fillColor ? 1 : 0,
        shapeType: String(shapeProperties.match(/<a:prstGeom\b[^>]*\bprst="([^"]+)"/i)?.[1] || ''),
      },
      visibleText,
    });
  }
  return measurements;
}

async function inspectPptx(filePath) {
  const bytes = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(bytes);
  const slideEntries = Object.entries(zip.files)
    .filter(([name]) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((left, right) => Number(left[0].match(/slide(\d+)/i)?.[1]) - Number(right[0].match(/slide(\d+)/i)?.[1]));
  const slides = [];
  for (const [name, entry] of slideEntries) {
    const xml = await entry.async('string');
    const slideNumber = Number(name.match(/slide(\d+)/i)?.[1]);
    const notesEntry = zip.files[`ppt/notesSlides/notesSlide${slideNumber}.xml`];
    const notesXml = notesEntry ? await notesEntry.async('string') : '';
    const text = decodeXml([...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) => match[1]).join(' '))
      .replace(/\s+/g, ' ')
      .trim();
    const notesText = decodeXml([...notesXml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) => match[1]).join(' '))
      .replace(/\s+/g, ' ')
      .trim();
    const encodedContract =
      xml.match(/<cm:specimenContract\b[^>]*\bencoding="uri-json"[^>]*>([\s\S]*?)<\/cm:specimenContract>/i)?.[1] || '';
    let typedSpecimen = null;
    if (encodedContract) {
      try {
        typedSpecimen = JSON.parse(decodeURIComponent(decodeXml(encodedContract).trim()));
      } catch {
        typedSpecimen = null;
      }
    }
    const renderedLabels = new Map(
      namedShapeMeasurements(xml, 'cmEntityLabel_').map((item) => [item.id, item.visibleText]),
    );
    const renderedEntities = namedShapeMeasurements(xml, 'cmEntity_').map((item) => ({
      ...item,
      visibleText: renderedLabels.get(item.id) || item.visibleText,
    }));
    const renderedRelations = namedShapeMeasurements(xml, 'cmRelation_');
    slides.push({
      name,
      text,
      notesText,
      typedSpecimen,
      renderedEntities,
      renderedRelations,
      entityIds: renderedEntities.map((item) => item.id),
      relationIds: renderedRelations.map((item) => item.id),
      invariantIds: [...xml.matchAll(/name="cmInvariant_([a-z0-9-]+)"/gi)].map((match) => match[1]),
      hubCount: (xml.match(/name="cmVizHub"/g) || []).length,
      spokeCount: (xml.match(/name="cmVizSpoke"/g) || []).length,
      hubLabelCount: (xml.match(/name="cmVizHubLabel"/g) || []).length,
      spokeLabelCount: (xml.match(/name="cmVizSpokeLabel"/g) || []).length,
      specimenPanelCount: (xml.match(/name="cmSpecimenPanel"/g) || []).length,
      specimenGridCount: (xml.match(/name="cmSpecimenGrid"/g) || []).length,
      specimenBarCount: (xml.match(/name="cmSpecimenBar"/g) || []).length,
      specimenFocalCount: (xml.match(/name="cmSpecimenFocal"/g) || []).length,
      specimenDirectionCount: (xml.match(/name="cmSpecimenDirection"/g) || []).length,
    });
  }
  return { bytes, slides };
}

function geometryFor(entities, id) {
  const geometry = entities.find((item) => String(item?.id || '') === id)?.geometry;
  if (!geometry) return null;
  const values = ['x', 'y', 'w', 'h'].map((key) => Number(geometry[key]));
  return values.every(Number.isFinite) ? { x: values[0], y: values[1], w: values[2], h: values[3] } : null;
}

function sameSize(left, right, tolerance = 0.01) {
  return Boolean(left && right && Math.abs(left.w - right.w) <= tolerance && Math.abs(left.h - right.h) <= tolerance);
}

function normalizedVisibleText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function sameRenderedStyle(left, right, tolerance = 0.001) {
  if (!left || !right) return false;
  return Boolean(
    String(left.style?.fillColor || '') === String(right.style?.fillColor || '') &&
    String(left.style?.shapeType || '') === String(right.style?.shapeType || '') &&
    Math.abs(Number(left.style?.opacity || 0) - Number(right.style?.opacity || 0)) <= tolerance &&
    normalizedVisibleText(left.visibleText) === normalizedVisibleText(right.visibleText),
  );
}

function relativeLuminance(hex) {
  if (!/^[A-F0-9]{6}$/i.test(String(hex || ''))) return null;
  const channels = String(hex)
    .match(/.{2}/g)
    .map((pair) => Number.parseInt(pair, 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function renderedContrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground?.style?.fillColor);
  const backgroundLuminance = relativeLuminance(background?.style?.fillColor);
  if (!Number.isFinite(foregroundLuminance) || !Number.isFinite(backgroundLuminance)) return null;
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function containedBy(inner, outer) {
  if (!inner || !outer) return false;
  const centerX = inner.x + inner.w / 2;
  const centerY = inner.y + inner.h / 2;
  return centerX > outer.x && centerX < outer.x + outer.w && centerY > outer.y && centerY < outer.y + outer.h;
}

function shapeCenter(geometry) {
  return geometry ? { x: geometry.x + geometry.w / 2, y: geometry.y + geometry.h / 2 } : null;
}

function lineEndpoints(measurement) {
  const geometry = measurement?.geometry;
  if (!geometry) return null;
  return {
    start: {
      x: geometry.x + (measurement.flipH ? geometry.w : 0),
      y: geometry.y + (measurement.flipV ? geometry.h : 0),
    },
    end: {
      x: geometry.x + (measurement.flipH ? 0 : geometry.w),
      y: geometry.y + (measurement.flipV ? 0 : geometry.h),
    },
  };
}

function pointDistance(left, right) {
  if (!left || !right) return Number.POSITIVE_INFINITY;
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function renderedDirectionMatches(measurement, fromGeometry, toGeometry) {
  const endpoints = lineEndpoints(measurement);
  const from = shapeCenter(fromGeometry);
  const to = shapeCenter(toGeometry);
  if (!measurement?.arrowAtEnd || !endpoints || !from || !to) return false;
  const direct = pointDistance(endpoints.start, from) + pointDistance(endpoints.end, to);
  const reversed = pointDistance(endpoints.start, to) + pointDistance(endpoints.end, from);
  return direct + 0.001 < reversed;
}

function taskContractHash(contract = {}) {
  const body = { ...contract };
  delete body.contractSha256;
  return sha256(canonicalJson(body));
}

function taskRequirementHash(requirement = {}) {
  return sha256(canonicalJson(requirement));
}

function relationForPredicate(relations, predicate) {
  return relations.find(
    (relation) =>
      String(relation?.from || '') === String(predicate?.from || '') &&
      String(relation?.to || '') === String(predicate?.to || '') &&
      String(relation?.type || '') === String(predicate?.relationType || ''),
  );
}

function evaluateTaskPredicate(predicate, typed, renderedEntities, renderedRelations) {
  const relations = Array.isArray(typed?.relations) ? typed.relations : [];
  const renderedEntityIds = new Set(renderedEntities.map((item) => item.id));
  const renderedRelationIds = new Set(renderedRelations.map((item) => item.id));
  const geometry = (id) =>
    renderedEntityIds.has(String(id || '')) ? geometryFor(renderedEntities, String(id || '')) : null;
  const entity = (id) => renderedEntities.find((item) => item.id === String(id || '')) || null;
  const tolerance = Number.isFinite(Number(predicate?.tolerance)) ? Number(predicate.tolerance) : 0.01;
  switch (predicate?.operator) {
    case 'area-greater-than': {
      const left = geometry(predicate.left);
      const right = geometry(predicate.right);
      return Boolean(left && right && left.w * left.h > right.w * right.h + tolerance);
    }
    case 'same-size':
      return sameSize(geometry(predicate.left), geometry(predicate.right), tolerance);
    case 'same-style':
      return sameRenderedStyle(entity(predicate.left), entity(predicate.right), tolerance);
    case 'text-differs':
      return Boolean(
        entity(predicate.left) &&
        entity(predicate.right) &&
        normalizedVisibleText(entity(predicate.left)?.visibleText) !==
          normalizedVisibleText(entity(predicate.right)?.visibleText),
      );
    case 'contrast-greater-than': {
      const leftRatio = renderedContrastRatio(entity(predicate.leftForeground), entity(predicate.leftBackground));
      const rightRatio = renderedContrastRatio(entity(predicate.rightForeground), entity(predicate.rightBackground));
      return Boolean(Number.isFinite(leftRatio) && Number.isFinite(rightRatio) && leftRatio > rightRatio + tolerance);
    }
    case 'contained-by':
      return containedBy(geometry(predicate.inner), geometry(predicate.outer));
    case 'dimensions-differ': {
      const left = geometry(predicate.left);
      const right = geometry(predicate.right);
      return Boolean(
        left && right && (Math.abs(left.w - right.w) > tolerance || Math.abs(left.h - right.h) > tolerance),
      );
    }
    case 'directed-relation': {
      const relation = relationForPredicate(relations, predicate);
      const renderedRelation = renderedRelations.find((item) => item.id === relation?.id);
      return Boolean(
        relation &&
        renderedEntityIds.has(String(predicate.from || '')) &&
        renderedEntityIds.has(String(predicate.to || '')) &&
        renderedRelationIds.has(String(relation.id || '')) &&
        renderedDirectionMatches(renderedRelation, geometry(predicate.from), geometry(predicate.to)),
      );
    }
    case 'declared-relation': {
      const relation = relationForPredicate(relations, predicate);
      return Boolean(
        relation &&
        renderedEntityIds.has(String(predicate.from || '')) &&
        renderedEntityIds.has(String(predicate.to || '')) &&
        renderedRelationIds.has(String(relation.id || '')),
      );
    }
    default:
      return false;
  }
}

function applyCounterexampleMutation(typed, renderedEntities, renderedRelations, mutation) {
  const nextTyped = structuredClone(typed || {});
  const nextEntities = structuredClone(renderedEntities || []);
  const nextRelations = structuredClone(renderedRelations || []);
  const entity = (id) => nextEntities.find((item) => item.id === String(id || '')) || null;
  const target = entity(mutation?.entityId);
  const source = entity(mutation?.fromEntityId);
  switch (mutation?.operator) {
    case 'scale': {
      const widthFactor = Number(mutation.widthFactor);
      const heightFactor = Number(mutation.heightFactor);
      if (!target?.geometry || !Number.isFinite(widthFactor) || !Number.isFinite(heightFactor)) return null;
      const centerX = target.geometry.x + target.geometry.w / 2;
      const centerY = target.geometry.y + target.geometry.h / 2;
      target.geometry.w *= widthFactor;
      target.geometry.h *= heightFactor;
      target.geometry.x = centerX - target.geometry.w / 2;
      target.geometry.y = centerY - target.geometry.h / 2;
      break;
    }
    case 'copy-geometry':
      if (!target || !source?.geometry) return null;
      target.geometry = structuredClone(source.geometry);
      break;
    case 'copy-style':
      if (!target || !source?.style) return null;
      target.style = structuredClone(source.style);
      break;
    case 'copy-text':
      if (!target || !source) return null;
      target.visibleText = source.visibleText;
      break;
    case 'set-text':
      if (!target || !String(mutation?.value || '').trim()) return null;
      target.visibleText = String(mutation.value);
      break;
    case 'reverse-relation': {
      const relation = (nextTyped.relations || []).find((item) => item?.id === mutation?.relationId);
      if (!relation) return null;
      [relation.from, relation.to] = [relation.to, relation.from];
      break;
    }
    default:
      return null;
  }
  return { typed: nextTyped, renderedEntities: nextEntities, renderedRelations: nextRelations };
}

function expectedOutcomesMatch(expected, actual) {
  const entries = Object.entries(expected || {});
  return entries.length > 0 && entries.every(([id, value]) => typeof value === 'boolean' && actual[id] === value);
}

function taskContractChecks(typed, renderedEntities, renderedRelations, manifestLesson, manifestAssessment) {
  const contract = typed?.taskContract;
  const observables = Array.isArray(contract?.observables) ? contract.observables : [];
  const predicates = Array.isArray(contract?.predicates) ? contract.predicates : [];
  const observableIds = observables.map((observable) => String(observable?.entityId || ''));
  const predicateIds = predicates.map((predicate) => String(predicate?.id || ''));
  const sourceRequirement = contract?.upstreamRequirement || {};
  const normalizeRequirementText = (value) =>
    String(value || '')
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .replace(/[.!?。！？]+$/u, '')
      .trim()
      .toLowerCase();
  const manifestObjectives = new Set(
    (Array.isArray(manifestLesson?.objectives) ? manifestLesson.objectives : [])
      .map(normalizeRequirementText)
      .filter(Boolean),
  );
  const requirementObjectives = (Array.isArray(sourceRequirement?.objectives) ? sourceRequirement.objectives : [])
    .map(normalizeRequirementText)
    .filter(Boolean);
  const assessmentObjectives = new Set(
    (Array.isArray(manifestAssessment?.objectives) ? manifestAssessment.objectives : [])
      .map(normalizeRequirementText)
      .filter(Boolean),
  );
  const lessonObjectivesBound = requirementObjectives.every((objective) => manifestObjectives.has(objective));
  const assessmentObjectivesBound = Boolean(
    manifestAssessment &&
    Number(manifestAssessment?.lesson) === Number(manifestLesson?.lessonNumber) &&
    String(manifestAssessment?.title || '').trim() === String(typed?.learnerProduct?.artifact || '').trim() &&
    requirementObjectives.every((objective) => assessmentObjectives.has(objective)),
  );
  const sourceRequirementBound = Boolean(
    manifestLesson &&
    Number(sourceRequirement?.lessonNumber) === Number(manifestLesson?.lessonNumber) &&
    normalizeRequirementText(sourceRequirement?.lessonTitle) === normalizeRequirementText(manifestLesson?.title) &&
    requirementObjectives.length > 0 &&
    (lessonObjectivesBound || assessmentObjectivesBound) &&
    taskRequirementHash(sourceRequirement) === contract?.upstreamRequirementSha256 &&
    normalizeRequirementText(sourceRequirement?.conceptBinding) === normalizeRequirementText(typed?.conceptBinding),
  );
  const supportedOperators = new Set([
    'area-greater-than',
    'same-size',
    'same-style',
    'text-differs',
    'contrast-greater-than',
    'contained-by',
    'dimensions-differ',
    'directed-relation',
    'declared-relation',
  ]);
  const contractIdentityValid = Boolean(
    contract?.protocol === FUNCTIONAL_VISUAL_TASK_CONTRACT_PROTOCOL &&
    /^VTC-L\d{2,}$/i.test(String(contract?.contractId || '')) &&
    Number(contract?.lessonNumber) === Number(typed?.lessonNumber) &&
    contract?.constructFamily === typed?.specimenKind &&
    typed?.taskContractSha256 === contract?.contractSha256 &&
    /^[a-f0-9]{64}$/.test(String(contract?.contractSha256 || '')) &&
    taskContractHash(contract) === contract?.contractSha256 &&
    observables.length >= 3 &&
    new Set(observableIds).size === observableIds.length &&
    observables.every(
      (observable) =>
        String(observable?.renderedSelector || '') === `cmEntity_${observable?.entityId}` &&
        observable?.measurement === 'normalized-slide-geometry' &&
        observable?.units === 'percent-of-specimen-canvas' &&
        Number.isFinite(Number(observable?.tolerance)),
    ) &&
    predicates.length >= 1 &&
    new Set(predicateIds).size === predicateIds.length &&
    predicates.every((predicate) => supportedOperators.has(predicate?.operator)),
  );
  const predicateResults = Object.fromEntries(
    predicates.map((predicate) => [
      String(predicate?.id || ''),
      evaluateTaskPredicate(predicate, typed, renderedEntities, renderedRelations),
    ]),
  );
  const renderedPredicatesSatisfied = Boolean(
    contractIdentityValid && predicates.length > 0 && Object.values(predicateResults).every(Boolean),
  );
  const directionalPredicates = predicates.filter((predicate) => predicate?.operator === 'directed-relation');
  const relationDirectionSatisfied = Boolean(
    directionalPredicates.length === 0 ||
    directionalPredicates.every((predicate) => predicateResults[predicate.id] === true),
  );
  const counterexample = contract?.counterexample;
  const baseExpectedOutcomes = counterexample?.baseState?.expectedPredicateOutcomes || {};
  const counterexampleExpectedOutcomes = counterexample?.expectedPredicateOutcomes || {};
  const mutatedState = applyCounterexampleMutation(
    typed,
    renderedEntities,
    renderedRelations,
    counterexample?.mutation,
  );
  const mutatedPredicateResults = mutatedState
    ? Object.fromEntries(
        predicates.map((predicate) => [
          String(predicate?.id || ''),
          evaluateTaskPredicate(
            predicate,
            mutatedState.typed,
            mutatedState.renderedEntities,
            mutatedState.renderedRelations,
          ),
        ]),
      )
    : {};
  const mutatedPredicateIds = Object.keys(counterexampleExpectedOutcomes);
  const counterexamplePresent = Boolean(
    counterexample?.required === true &&
    String(counterexample?.stateId || '').trim() &&
    mutatedState &&
    expectedOutcomesMatch(baseExpectedOutcomes, predicateResults) &&
    expectedOutcomesMatch(counterexampleExpectedOutcomes, mutatedPredicateResults) &&
    mutatedPredicateIds.every((id) => predicateIds.includes(id)) &&
    mutatedPredicateIds.some((id) => predicateResults[id] !== mutatedPredicateResults[id]),
  );
  const inferencePredicateIds = Array.isArray(contract?.inference?.predicateIds)
    ? contract.inference.predicateIds.map(String)
    : [];
  const inferenceBound = Boolean(
    String(contract?.inference?.id || '').trim() &&
    inferencePredicateIds.length > 0 &&
    inferencePredicateIds.every((id) => predicateIds.includes(id)),
  );
  return {
    taskContractValid: contractIdentityValid && inferenceBound,
    sourceRequirementBound,
    renderedPredicatesSatisfied,
    relationDirectionSatisfied,
    counterexamplePresent,
    predicateResults,
    counterexamplePredicateResults: mutatedPredicateResults,
  };
}

function typedGeometryChecks(typed, renderedEntities, invariantIds) {
  const renderedEntityIds = new Set(renderedEntities.map((item) => item.id));
  const has = (id) => renderedEntityIds.has(id) && Boolean(geometryFor(renderedEntities, id));
  const relationTypes = new Set((Array.isArray(typed?.relations) ? typed.relations : []).map((item) => item?.type));
  switch (typed?.specimenKind) {
    case 'spatial-composition': {
      const guides = ['thirds-v1', 'thirds-v2', 'thirds-h1', 'thirds-h2'];
      return {
        geometryKindSupported: true,
        observableGeometry: ['primary-mass', 'secondary-mass', 'focal-anchor'].every(has),
        // The eye path is already measured as a directed rendered relation.
        // Requiring a second invariant-named copy made the exported slide draw
        // the same arrow twice. The independent thirds guides remain the
        // spatial-composition invariant set.
        specimenKindInvariant: guides.every((id) => invariantIds.has(id)),
      };
    }
    case 'frame-perspective-comparison': {
      const wideFrame = geometryFor(renderedEntities, 'frame-wide');
      const tightFrame = geometryFor(renderedEntities, 'frame-tight');
      const wideSubject = geometryFor(renderedEntities, 'subject-wide');
      const tightSubject = geometryFor(renderedEntities, 'subject-tight');
      return {
        geometryKindSupported: true,
        observableGeometry: ['frame-wide', 'frame-tight', 'subject-wide', 'subject-tight'].every(has),
        specimenKindInvariant:
          sameSize(wideSubject, tightSubject) &&
          containedBy(wideSubject, wideFrame) &&
          containedBy(tightSubject, tightFrame) &&
          Boolean(wideFrame && tightFrame && (wideFrame.w !== tightFrame.w || wideFrame.h !== tightFrame.h)) &&
          relationTypes.has('same-subject') &&
          relationTypes.has('reframes'),
      };
    }
    case 'context-boundary-comparison': {
      const imageA = geometryFor(renderedEntities, 'image-a');
      const imageB = geometryFor(renderedEntities, 'image-b');
      const tokenA = geometryFor(renderedEntities, 'image-token-a');
      const tokenB = geometryFor(renderedEntities, 'image-token-b');
      return {
        geometryKindSupported: true,
        observableGeometry: [
          'image-a',
          'image-b',
          'image-token-a',
          'image-token-b',
          'context-card',
          'missing-card',
        ].every(has),
        specimenKindInvariant:
          sameSize(tokenA, tokenB) &&
          containedBy(tokenA, imageA) &&
          containedBy(tokenB, imageB) &&
          relationTypes.has('same-subject') &&
          relationTypes.has('changes-claim-boundary'),
      };
    }
    case 'contrast-encoding-comparison': {
      const fieldHigh = geometryFor(renderedEntities, 'field-high');
      const fieldLow = geometryFor(renderedEntities, 'field-low');
      const markHigh = geometryFor(renderedEntities, 'mark-high');
      const markLow = geometryFor(renderedEntities, 'mark-low');
      return {
        geometryKindSupported: true,
        observableGeometry: ['field-high', 'field-low', 'mark-high', 'mark-low'].every(has),
        specimenKindInvariant:
          sameSize(markHigh, markLow) &&
          containedBy(markHigh, fieldHigh) &&
          containedBy(markLow, fieldLow) &&
          relationTypes.has('tonal-separation'),
      };
    }
    case 'hierarchy-ranking': {
      const first = geometryFor(renderedEntities, 'rank-1');
      const second = geometryFor(renderedEntities, 'rank-2');
      const third = geometryFor(renderedEntities, 'rank-3');
      return {
        geometryKindSupported: true,
        observableGeometry: ['rank-1', 'rank-2', 'rank-3', 'attention-anchor'].every(has),
        specimenKindInvariant:
          Boolean(
            first &&
            second &&
            third &&
            first.w > second.w &&
            second.w > third.w &&
            first.h > second.h &&
            second.h > third.h,
          ) && relationTypes.has('precedes'),
      };
    }
    case 'evidence-relationship':
      return {
        geometryKindSupported: true,
        observableGeometry: ['evidence-a', 'evidence-b', 'claim-anchor'].every(has),
        specimenKindInvariant: relationTypes.has('supports') && relationTypes.has('qualifies'),
      };
    default:
      return { geometryKindSupported: false, observableGeometry: false, specimenKindInvariant: false };
  }
}

function manualRowFor(inspection, lessonNumber) {
  return (Array.isArray(inspection?.lessons) ? inspection.lessons : []).find(
    (row) => Number(row?.lessonNumber) === Number(lessonNumber),
  );
}

function validateManualInspection(inspection, requiredLessonNumbers) {
  const issues = [];
  if (inspection?.protocol !== FUNCTIONAL_VISUAL_INSPECTION_V1_PROTOCOL)
    issues.push('unsupported manual inspection protocol');
  if (!String(inspection?.reviewerId || '').trim()) issues.push('manual inspection reviewer is missing');
  if (!String(inspection?.reviewedAt || '').trim()) issues.push('manual inspection date is missing');
  for (const lessonNumber of requiredLessonNumbers) {
    const row = manualRowFor(inspection, lessonNumber);
    if (!row) issues.push(`lesson ${lessonNumber} has no manual relevance inspection`);
    else if (!String(row.observation || '').trim()) issues.push(`lesson ${lessonNumber} manual observation is missing`);
    else if (!String(row.slidePath || '').trim() || !Number.isInteger(Number(row.slideNumber)))
      issues.push(`lesson ${lessonNumber} manual inspection lacks an artifact/slide locator`);
    else if (!String(row.visibleSourceBinding || '').trim() || !String(row.visibleAssessmentBinding || '').trim())
      issues.push(`lesson ${lessonNumber} manual inspection lacks quoted visible source/product bindings`);
    else if (!SHA256_RE.test(String(row.taskContractSha256 || '')))
      issues.push(`lesson ${lessonNumber} manual inspection lacks a task-contract digest`);
    else if (!String(row.disciplinaryRelevanceReason || '').trim())
      issues.push(`lesson ${lessonNumber} manual inspection lacks a disciplinary-relevance reason`);
    else if (!String(row.pedagogicalValidityReason || '').trim())
      issues.push(`lesson ${lessonNumber} manual inspection lacks a pedagogical-validity reason`);
  }
  return issues;
}

function structuredChecks(slide, productActions, manifestLesson = null, manifestAssessment = null, contract = null) {
  const text = String(slide?.text || '');
  const normalizedSlideText = normalizedVisibleText(text);
  const actionChecks = {
    analyze: /\banaly[sz]e\b/i.test(text),
    annotate: /\bannotat(?:e|es|ed|ing|ion)\b/i.test(text),
    compare: /\bcompar(?:e|es|ed|ing|ison)\b/i.test(text),
  };
  const requiredProductActionPresent = productActions.some((action) => actionChecks[action] === true);
  const typed = slide?.typedSpecimen;
  const entities = Array.isArray(typed?.entities) ? typed.entities : [];
  const relations = Array.isArray(typed?.relations) ? typed.relations : [];
  const entityIds = new Set(entities.map((item) => String(item?.id || '')));
  const renderedEntities = Array.isArray(slide?.renderedEntities) ? slide.renderedEntities : [];
  const renderedRelations = Array.isArray(slide?.renderedRelations) ? slide.renderedRelations : [];
  const renderedEntityIds = new Set(renderedEntities.map((item) => item.id));
  const renderedRelationIds = new Set(renderedRelations.map((item) => item.id));
  const invariantIds = new Set(Array.isArray(slide?.invariantIds) ? slide.invariantIds : []);
  const evidenceIds = Array.isArray(typed?.expectedObservation?.evidenceIds)
    ? typed.expectedObservation.evidenceIds.map(String)
    : [];
  const hasTypedContractMarker = Boolean(typed);
  const visibleTask = typed?.visibleTask || null;
  const rightsEvaluation = evaluateFunctionalVisualRights(contract, typed);
  const visibleTaskContractValid = Boolean(
    visibleTask?.protocol === 'coursemapper-visible-functional-task-v1' &&
    String(visibleTask?.cardText || '').trim() &&
    sha256(String(visibleTask.cardText)) === String(visibleTask?.cardTextSha256 || '') &&
    String(visibleTask?.authoredSummary || '').trim() &&
    sha256(String(visibleTask.authoredSummary)) === String(visibleTask?.authoredSummarySha256 || '') &&
    Array.isArray(visibleTask?.authoredBullets) &&
    visibleTask.authoredBullets.length === 5 &&
    visibleTask.authoredBullets.every((bullet) => String(bullet || '').trim()) &&
    sha256(JSON.stringify(visibleTask.authoredBullets)) === String(visibleTask?.authoredBulletsSha256 || '') &&
    String(visibleTask?.conceptBinding || '').trim() === String(typed?.conceptBinding || '').trim() &&
    String(visibleTask?.sourceBindingId || '').trim() === String(typed?.sourceBinding?.id || '').trim() &&
    String(visibleTask?.learnerProductId || '').trim() === String(typed?.learnerProduct?.id || '').trim() &&
    String(visibleTask?.artifact || '').trim() === String(typed?.learnerProduct?.artifact || '').trim() &&
    String(visibleTask?.successCriterion || '').trim() === String(typed?.learnerProduct?.criterion || '').trim() &&
    String(visibleTask?.rightsDisclosure || '').trim() === String(typed?.rightsBinding?.disclosure || '').trim() &&
    String(visibleTask?.provenanceLabel || '').trim(),
  );
  const typedContractValid = Boolean(
    typed?.protocol === 'coursemapper-typed-evidence-specimen-v1' &&
    String(typed?.specimenKind || '').trim() &&
    String(typed?.conceptBinding || '').trim() &&
    entities.length >= 3 &&
    relations.length >= 1 &&
    entityIds.size === entities.length &&
    relations.every(
      (item) =>
        /^[a-z0-9-]+$/.test(String(item?.id || '')) &&
        entityIds.has(String(item?.from || '')) &&
        entityIds.has(String(item?.to || '')) &&
        String(item?.visibleStatement || '').trim(),
    ) &&
    String(typed?.expectedObservation?.id || '').trim() &&
    String(typed?.expectedObservation?.claim || '').trim() &&
    evidenceIds.length >= 2 &&
    evidenceIds.every((id) => entityIds.has(id) || relations.some((item) => item.id === id)) &&
    Array.isArray(typed?.learnerProduct?.actions) &&
    typed.learnerProduct.actions.includes('analyze') &&
    /^CM-PROD-L\d{2,}$/i.test(String(typed?.learnerProduct?.id || '')) &&
    String(typed?.learnerProduct?.artifact || '').trim() &&
    String(typed?.learnerProduct?.criterion || '').trim() &&
    typed?.answerRubricBinding?.expectedObservationId === typed?.expectedObservation?.id &&
    String(typed?.answerRubricBinding?.scoringUse || '').trim() &&
    /^CM-SRC-L\d{2,}$/i.test(String(typed?.sourceBinding?.id || '')) &&
    String(typed?.sourceBinding?.label || '').trim() &&
    ['source-ledger', 'course-map-source-cue', 'native-evidence-specimen'].includes(typed?.sourceBinding?.resolution) &&
    (typed?.sourceBinding?.resolution !== 'native-evidence-specimen' ||
      String(typed?.sourceBinding?.verificationRule || '').trim()) &&
    (typed?.sourceBinding?.resolution !== 'native-evidence-specimen' ||
      ['original-native-owner-controlled', 'open-licensed', 'public-domain'].includes(
        typed?.rightsBinding?.assetRightsClass,
      )) &&
    String(typed?.rightsBinding?.disclosure || '').trim() &&
    visibleTaskContractValid,
  );
  const typedEntitiesRendered = typedContractValid && entities.every((item) => renderedEntityIds.has(item.id));
  const typedRelationsRendered = typedContractValid && relations.every((item) => renderedRelationIds.has(item.id));
  const expectedObservationBound = Boolean(
    typedContractValid &&
    String(slide?.notesText || '').includes(`EXPECTED OBSERVATION [${typed.expectedObservation.id}]`) &&
    String(slide?.notesText || '').includes(`ANSWER/RUBRIC LINK [${typed.expectedObservation.id}]`),
  );
  const typedGeometry = hasTypedContractMarker
    ? typedGeometryChecks(typed, renderedEntities, invariantIds)
    : { geometryKindSupported: true, observableGeometry: true, specimenKindInvariant: true };
  const sourceBindingId = String(typed?.sourceBinding?.id || '')
    .normalize('NFKC')
    .trim();
  const assessmentBindingId = String(typed?.learnerProduct?.id || '')
    .normalize('NFKC')
    .trim();
  const exactSourceBindingVisible =
    /^CM-SRC-L\d{2,}$/i.test(sourceBindingId) && normalizedSlideText.includes(sourceBindingId.toLowerCase());
  const exactAssessmentBindingVisible =
    /^CM-PROD-L\d{2,}$/i.test(assessmentBindingId) && normalizedSlideText.includes(assessmentBindingId.toLowerCase());
  const taskChecks = taskContractChecks(typed, renderedEntities, renderedRelations, manifestLesson, manifestAssessment);
  const boundVisibleTask = normalizedVisibleText(visibleTask?.cardText);
  const boundProvenanceLabel = normalizedVisibleText(visibleTask?.provenanceLabel);
  return {
    nativeFunctionalVisual: typedEntitiesRendered && typedRelationsRendered,
    typedSpecimenContract: typedContractValid,
    visibleTaskContract: visibleTaskContractValid,
    visibleTaskMeaningPreserved:
      visibleTaskContractValid && Boolean(boundVisibleTask) && normalizedSlideText.includes(boundVisibleTask),
    typedEntitiesRendered,
    typedRelationsRendered,
    renderedOoxmlGeometry:
      typedContractValid &&
      renderedEntities.length === entities.length &&
      renderedRelations.length === relations.length &&
      renderedEntities.every((item) => Boolean(geometryFor(renderedEntities, item.id))) &&
      renderedRelations.every((item) => Boolean(geometryFor(renderedRelations, item.id))),
    geometryKindSupported: typedGeometry.geometryKindSupported,
    observableGeometry: typedGeometry.observableGeometry,
    specimenKindInvariant: typedGeometry.specimenKindInvariant,
    ...taskChecks,
    expectedObservationBound,
    visibleAnalysisAction: actionChecks.analyze,
    visibleProductAction: requiredProductActionPresent,
    visibleAssessmentLink: exactAssessmentBindingVisible,
    visibleSourceLink: exactSourceBindingVisible,
    visibleProvenance:
      visibleTaskContractValid && Boolean(boundProvenanceLabel) && normalizedSlideText.includes(boundProvenanceLabel),
    nativeSourceStructurallyResolved:
      typed?.sourceBinding?.resolution !== 'native-evidence-specimen' ||
      rightsEvaluation.nativeSourceStructurallyResolved,
    rightsRequirementSatisfied: rightsEvaluation.rightsRequirementSatisfied,
    attributionRequirementSatisfied: rightsEvaluation.attributionRequirementSatisfied,
  };
}

function allChecksPass(checks) {
  return Object.values(checks).every(Boolean);
}

function failedStructuredCheckIssues(checks = {}) {
  const issues = [];
  for (const [name, value] of Object.entries(checks)) {
    if (name === 'predicateResults' || name === 'counterexamplePredicateResults') continue;
    if (value === false) issues.push(`structured check failed: ${name}`);
  }
  for (const [predicateId, passed] of Object.entries(checks.predicateResults || {})) {
    if (!passed) issues.push(`rendered predicate failed: ${predicateId}`);
  }
  // Counterexample predicate values are measured outcomes, not pass flags;
  // an intentionally falsified predicate is commonly `false`. The aggregate
  // counterexamplePresent/task checks above own the pass/fail decision.
  return issues;
}

export async function captureFunctionalVisualAuditV1({
  root = process.cwd(),
  packagePath,
  packageDirectory,
  packageRenderReceiptPath,
  inspectionPath,
  capturedAt = new Date().toISOString(),
} = {}) {
  const absoluteRoot = path.resolve(root);
  const absolutePackageDirectory = path.resolve(absoluteRoot, packageDirectory || '');
  const manifestPath = path.join(absolutePackageDirectory, 'PACKAGE_MANIFEST.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const contract = manifest?.generationConstraints?.briefQualityContract || null;
  const sourceBriefBinding = manifest?.generationConstraints?.sourceBriefBinding || null;
  const requiredLessonNumbers = Array.isArray(contract?.requiredLessonNumbers)
    ? [...new Set(contract.requiredLessonNumbers.map(Number).filter(Number.isInteger))].sort((a, b) => a - b)
    : [];
  const productActions = Array.isArray(contract?.functionalVisual?.productActions)
    ? contract.functionalVisual.productActions.filter((action) => ['annotate', 'compare'].includes(action))
    : [];
  const inspection = JSON.parse(await fs.readFile(path.resolve(absoluteRoot, inspectionPath || ''), 'utf8'));
  const renderReceipt = JSON.parse(
    await fs.readFile(path.resolve(absoluteRoot, packageRenderReceiptPath || ''), 'utf8'),
  );
  const renderVerification = await verifyPackageRenderAuditV1(renderReceipt, { root: absoluteRoot });
  const issues = [];
  if (
    contract?.protocol !== 'coursemapper-brief-quality-contract-v1' ||
    contract?.functionalVisual?.required !== true
  ) {
    issues.push('package has no active brief functional-visual contract');
  }
  const sourceBriefText = String(sourceBriefBinding?.text || '');
  if (
    sourceBriefBinding?.protocol !== 'coursemapper-source-brief-binding-v1' ||
    !sourceBriefText ||
    Number(sourceBriefBinding?.utf8Bytes) !== Buffer.byteLength(sourceBriefText, 'utf8') ||
    String(sourceBriefBinding?.sha256 || '') !== sha256(sourceBriefText)
  ) {
    issues.push('source brief is not byte-bound');
  } else {
    const derivedContract = extractBriefQualityContract(sourceBriefText, {
      lessonCount: Array.isArray(manifest?.lessons) ? manifest.lessons.length : 0,
    });
    if (canonicalJson(derivedContract) !== canonicalJson(contract)) {
      issues.push('brief quality contract does not match the byte-bound source brief');
    }
  }
  if (requiredLessonNumbers.length === 0) issues.push('functional-visual contract has no required lessons');
  if (productActions.length === 0) issues.push('functional-visual contract has no product action');
  if (renderReceipt?.protocol !== PACKAGE_RENDER_AUDIT_V1_PROTOCOL || !renderVerification.passed) {
    issues.push('package render audit is not verified and passed');
  }
  issues.push(...validateManualInspection(inspection, requiredLessonNumbers));

  const officeFiles = (await walkFiles(absolutePackageDirectory)).filter((filePath) => /\.pptx$/i.test(filePath));
  const deckFiles = officeFiles.filter((filePath) => /(?:^|\/)Slide Decks(?:\/|$)/i.test(filePath));
  const lessons = [];
  for (const lessonNumber of requiredLessonNumbers) {
    const manifestLesson = (Array.isArray(manifest?.lessons) ? manifest.lessons : []).find(
      (lesson) => Number(lesson?.lessonNumber) === lessonNumber,
    );
    const matching = deckFiles.filter(
      (filePath) => lessonNumberFromPath(path.relative(absolutePackageDirectory, filePath)) === lessonNumber,
    );
    if (matching.length !== 1) {
      issues.push(`lesson ${lessonNumber} has ${matching.length} matching slide decks`);
      lessons.push({ lessonNumber, status: 'failed', issues: ['one slide deck is required'] });
      continue;
    }
    const deckPath = matching[0];
    const deckRecord = await fileRecord(deckPath, absoluteRoot);
    const inspected = await inspectPptx(deckPath);
    const manifestBinding = (
      Array.isArray(manifest?.functionalVisualBindings) ? manifest.functionalVisualBindings : []
    ).find((binding) => Number(binding?.lessonNumber) === lessonNumber);
    const manifestAssessment = (Array.isArray(manifest?.assessments) ? manifest.assessments : []).find(
      (assessment) =>
        String(assessment?.id || '').trim() === String(manifestBinding?.product?.assessmentId || '').trim(),
    );
    const candidates = inspected.slides.filter((slide) => /visual provenance/i.test(slide.text));
    const candidate =
      candidates.find((slide) =>
        allChecksPass(structuredChecks(slide, productActions, manifestLesson, manifestAssessment, contract)),
      ) ||
      candidates[0] ||
      null;
    const checks = structuredChecks(candidate, productActions, manifestLesson, manifestAssessment, contract);
    const manual = manualRowFor(inspection, lessonNumber) || null;
    const renderArtifact = (Array.isArray(renderReceipt?.artifacts) ? renderReceipt.artifacts : []).find(
      (artifact) => artifact?.sourcePath === deckRecord.path,
    );
    const candidateSlideNumber = Number(candidate?.name?.match(/slide(\d+)/i)?.[1]);
    const typedSourceBinding = String(candidate?.typedSpecimen?.sourceBinding?.id || '').trim();
    const typedAssessmentBinding = String(candidate?.typedSpecimen?.learnerProduct?.id || '').trim();
    const manifestBindingPass = Boolean(
      manifestBinding?.protocol === 'coursemapper-functional-visual-binding-v1' &&
      manifestBinding?.taskContract?.protocol === FUNCTIONAL_VISUAL_TASK_CONTRACT_PROTOCOL &&
      manifestBinding?.taskContract?.contractId === candidate?.typedSpecimen?.taskContract?.contractId &&
      manifestBinding?.taskContract?.contractSha256 === candidate?.typedSpecimen?.taskContractSha256 &&
      manifestBinding?.taskContract?.upstreamRequirementSha256 ===
        candidate?.typedSpecimen?.taskContract?.upstreamRequirementSha256 &&
      manifestBinding?.taskContract?.constructFamily === candidate?.typedSpecimen?.taskContract?.constructFamily &&
      canonicalJson(manifestBinding?.taskContract?.predicateIds || []) ===
        canonicalJson((candidate?.typedSpecimen?.taskContract?.predicates || []).map((predicate) => predicate.id)) &&
      manifestBinding?.taskContract?.counterexampleStateId ===
        candidate?.typedSpecimen?.taskContract?.counterexample?.stateId &&
      manifestBinding?.visibleTask?.protocol === 'coursemapper-visible-functional-task-v1' &&
      manifestBinding?.visibleTask?.hashBound === true &&
      manifestBinding?.visibleTask?.cardTextSha256 === candidate?.typedSpecimen?.visibleTask?.cardTextSha256 &&
      manifestBinding?.visibleTask?.authoredSummarySha256 ===
        candidate?.typedSpecimen?.visibleTask?.authoredSummarySha256 &&
      manifestBinding?.visibleTask?.authoredBulletsSha256 ===
        candidate?.typedSpecimen?.visibleTask?.authoredBulletsSha256 &&
      manifestBinding?.visibleTask?.sourceBindingId === candidate?.typedSpecimen?.visibleTask?.sourceBindingId &&
      manifestBinding?.visibleTask?.learnerProductId === candidate?.typedSpecimen?.visibleTask?.learnerProductId &&
      manifestBinding?.visibleTask?.artifact === candidate?.typedSpecimen?.visibleTask?.artifact &&
      manifestBinding?.visibleTask?.successCriterion === candidate?.typedSpecimen?.visibleTask?.successCriterion &&
      manifestBinding?.visibleTask?.rightsDisclosure === candidate?.typedSpecimen?.visibleTask?.rightsDisclosure &&
      manifestBinding?.source?.bindingId === typedSourceBinding &&
      manifestBinding?.source?.label === String(candidate?.typedSpecimen?.sourceBinding?.label || '').trim() &&
      manifestBinding?.source?.resolved === true &&
      manifestBinding?.rights?.nativeSourceStructurallyResolved === checks.nativeSourceStructurallyResolved &&
      manifestBinding?.rights?.rightsRequirementSatisfied === checks.rightsRequirementSatisfied &&
      manifestBinding?.rights?.attributionRequirementSatisfied === checks.attributionRequirementSatisfied &&
      manifestBinding?.rights?.promotionEligible === true &&
      manifestBinding?.product?.bindingId === typedAssessmentBinding &&
      manifestBinding?.product?.label === String(candidate?.typedSpecimen?.learnerProduct?.artifact || '').trim() &&
      manifestBinding?.product?.resolved === true,
    );
    const normalizedCandidateText = String(candidate?.text || '')
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .toLowerCase();
    const manualSourceBinding = String(manual?.visibleSourceBinding || '')
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim();
    const manualAssessmentBinding = String(manual?.visibleAssessmentBinding || '')
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim();
    const manualPass = Boolean(
      manual &&
      manual.relevant === true &&
      manual.pedagogicallyUsable === true &&
      manual.taskLinked === true &&
      manual.rightsBoundaryClear === true &&
      safeRelativePath(manual.slidePath) === deckRecord.path &&
      Number(manual.slideNumber) === candidateSlideNumber &&
      manualSourceBinding === typedSourceBinding &&
      manualAssessmentBinding === typedAssessmentBinding &&
      String(manual.taskContractSha256 || '') === String(candidate?.typedSpecimen?.taskContractSha256 || '') &&
      String(manual.disciplinaryRelevanceReason || '').trim() &&
      String(manual.pedagogicalValidityReason || '').trim() &&
      normalizedCandidateText.includes(manualSourceBinding.toLowerCase()) &&
      normalizedCandidateText.includes(manualAssessmentBinding.toLowerCase()),
    );
    const lessonIssues = [];
    if (candidates.length !== 1)
      lessonIssues.push(`expected one functional visual task slide, found ${candidates.length}`);
    lessonIssues.push(...failedStructuredCheckIssues(checks));
    if (!manifestBindingPass)
      lessonIssues.push('visible source/product identifiers do not resolve through the package manifest');
    if (!renderArtifact?.passed) lessonIssues.push('slide deck has no passed child render receipt');
    if (!manualPass) lessonIssues.push('manual relevance/task/rights inspection did not pass');
    lessons.push({
      lessonNumber,
      deck: deckRecord,
      functionalSlide: candidate
        ? {
            name: candidate.name,
            textSha256: sha256(candidate.text),
            textLength: candidate.text.length,
            renderedGeometrySource: 'ppt-slide-ooxml-a:xfrm',
            renderedEntityCount: candidate.renderedEntities.length,
            renderedRelationCount: candidate.renderedRelations.length,
            renderedGeometrySha256: sha256(
              canonicalJson({ entities: candidate.renderedEntities, relations: candidate.renderedRelations }),
            ),
          }
        : null,
      structuredChecks: checks,
      manifestBinding: manifestBinding || null,
      renderReceipt: renderArtifact
        ? {
            receiptSha256: renderArtifact.receiptSha256,
            itemCount: renderArtifact.itemCount,
            passed: renderArtifact.passed,
          }
        : null,
      manualInspection: manual
        ? {
            relevant: manual.relevant === true,
            pedagogicallyUsable: manual.pedagogicallyUsable === true,
            taskLinked: manual.taskLinked === true,
            rightsBoundaryClear: manual.rightsBoundaryClear === true,
            slidePath: safeRelativePath(manual.slidePath),
            slideNumber: Number(manual.slideNumber),
            visibleSourceBinding: manualSourceBinding,
            visibleAssessmentBinding: manualAssessmentBinding,
            taskContractSha256: String(manual.taskContractSha256 || ''),
            disciplinaryRelevanceReason: String(manual.disciplinaryRelevanceReason || '').trim(),
            pedagogicalValidityReason: String(manual.pedagogicalValidityReason || '').trim(),
            observation: String(manual.observation || '').trim(),
          }
        : null,
      issues: lessonIssues,
      status: lessonIssues.length === 0 ? 'passed' : 'failed',
    });
  }

  const passedLessonCount = lessons.filter((lesson) => lesson.status === 'passed').length;
  const functionalRate = requiredLessonNumbers.length > 0 ? passedLessonCount / requiredLessonNumbers.length : 0;
  if (functionalRate < FUNCTIONAL_VISUAL_AUDIT_V1_MIN_RATE) {
    issues.push(`functional visual rate ${functionalRate.toFixed(3)} is below ${FUNCTIONAL_VISUAL_AUDIT_V1_MIN_RATE}`);
  }
  const receipt = {
    schemaVersion: 1,
    protocol: FUNCTIONAL_VISUAL_AUDIT_V1_PROTOCOL,
    capturedAt,
    packageFile: await fileRecord(path.resolve(absoluteRoot, packagePath || ''), absoluteRoot),
    packageDirectory: safeRelativePath(path.relative(absoluteRoot, absolutePackageDirectory)),
    manifestFile: await fileRecord(manifestPath, absoluteRoot),
    packageRenderReceiptFile: await fileRecord(
      path.resolve(absoluteRoot, packageRenderReceiptPath || ''),
      absoluteRoot,
    ),
    packageRenderReceiptSha256: renderReceipt?.receiptSha256 || '',
    inspectionFile: await fileRecord(path.resolve(absoluteRoot, inspectionPath || ''), absoluteRoot),
    contract,
    policy: {
      minimumFunctionalRate: FUNCTIONAL_VISUAL_AUDIT_V1_MIN_RATE,
      aggregation: 'required-lessons-only-no-score-averaging',
      requiredEvidence: [
        'native visual structure',
        'visible analysis and product action',
        'visible assessment and source link',
        'visible provenance boundary',
        'hash-bound authored task text preserved in visible OOXML',
        'hash-bound upstream task contract',
        'predicates and relation direction measured from exported PPTX a:xfrm geometry',
        'required counterexample state',
        'passed render receipt',
        'separate manual disciplinary-relevance, pedagogical-validity, task-link, and rights inspection',
      ],
    },
    semanticAttestation: {
      reviewerId: String(inspection?.reviewerId || '').trim(),
      reviewedAt: String(inspection?.reviewedAt || '').trim(),
      taskContractSha256s: lessons.map((lesson) => lesson?.manualInspection?.taskContractSha256).filter(Boolean),
      claimBoundary:
        'This independently recorded attestation supplies reviewer judgment about disciplinary relevance and pedagogical validity. It is not deterministic compiler evidence or classroom-effectiveness evidence.',
    },
    lessons,
    summary: {
      requiredLessonCount: requiredLessonNumbers.length,
      passedLessonCount,
      failedLessonCount: requiredLessonNumbers.length - passedLessonCount,
      functionalRate: Number(functionalRate.toFixed(6)),
    },
    issues,
    status: issues.length === 0 ? 'passed' : 'failed',
    claimBoundary:
      'Deterministic checks prove task-record identity, exported-PPTX OOXML geometry, predicate direction, counterexample presence, native structure, and render coverage. The embedded sidecar supplies identifiers and intended semantics but is not used as rendered geometry evidence. The separately identified reviewer attests disciplinary relevance, pedagogical validity, task linkage, and rights boundaries. Neither layer proves classroom effectiveness, universal accessibility, or legal rights clearance.',
  };
  return { ...receipt, receiptSha256: receiptHash(receipt) };
}

async function verifyFile(record, root, label) {
  const relative = safeRelativePath(record?.path);
  if (!relative) return [`${label} path is unsafe`];
  const bytes = await fs.readFile(path.join(root, relative)).catch(() => null);
  if (!bytes) return [`${label} is missing`];
  const issues = [];
  if (bytes.length !== record.bytes) issues.push(`${label} byte count mismatch`);
  if (sha256(bytes) !== record.sha256) issues.push(`${label} hash mismatch`);
  return issues;
}

export async function verifyFunctionalVisualAuditV1(receipt, { root = process.cwd() } = {}) {
  const absoluteRoot = path.resolve(root);
  const issues = [];
  if (receipt?.protocol !== FUNCTIONAL_VISUAL_AUDIT_V1_PROTOCOL) issues.push('unsupported protocol');
  if (!SHA256_RE.test(String(receipt?.receiptSha256 || '')) || receiptHash(receipt) !== receipt.receiptSha256) {
    issues.push('receipt hash mismatch');
  }
  for (const [label, record] of [
    ['package file', receipt?.packageFile],
    ['manifest file', receipt?.manifestFile],
    ['package render receipt file', receipt?.packageRenderReceiptFile],
    ['inspection file', receipt?.inspectionFile],
  ]) {
    issues.push(...(await verifyFile(record, absoluteRoot, label)));
  }
  if (safeRelativePath(receipt?.packageDirectory)) {
    const replayed = await captureFunctionalVisualAuditV1({
      root: absoluteRoot,
      packagePath: receipt.packageFile.path,
      packageDirectory: receipt.packageDirectory,
      packageRenderReceiptPath: receipt.packageRenderReceiptFile.path,
      inspectionPath: receipt.inspectionFile.path,
      capturedAt: receipt.capturedAt,
    }).catch((error) => ({ error }));
    if (replayed.error) issues.push(`replay failed: ${replayed.error.message}`);
    else {
      const storedBody = { ...receipt };
      const replayedBody = { ...replayed };
      delete storedBody.receiptSha256;
      delete replayedBody.receiptSha256;
      if (canonicalJson(storedBody) !== canonicalJson(replayedBody)) issues.push('receipt does not reproduce');
    }
  } else issues.push('package directory is unsafe');
  return {
    valid: issues.length === 0,
    passed: issues.length === 0 && receipt?.status === 'passed',
    issues,
    receiptSha256: receipt?.receiptSha256 || '',
    functionalRate: Number(receipt?.summary?.functionalRate || 0),
  };
}
