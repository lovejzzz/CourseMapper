import {
  CROSS_PACKAGE_UNIT_CLASS_VERSION,
  TEXTURE_UNIT_CLASS,
  classifyCrossPackageTexturePath,
} from './crossPackageTextureUnitClass.js';

export const CROSS_PACKAGE_TEXTURE_AUDIT_VERSION = '1.0.0';
export const CROSS_PACKAGE_TEXTURE_EXTRACTION_VERSION = '1.0.0';
export const CROSS_PACKAGE_TEXTURE_MASK_VERSION = '1.0.0';
export const CROSS_PACKAGE_TEXTURE_MIN_WORDS = 8;

const ARRAY_MARKER = '#';
const SLOT_MARKER = '§';
const NUMBER_MARKER = 'xnumx';
const TRACE_SYMBOL = Symbol.for('coursemapper.blueprintRealizationTrace');
const INTERNAL_MIRROR_KEYS = new Set([
  'blueprintGrounding',
  'blueprintQualityReceipt',
  'slideDeckSequenceGuide',
  'sourceGrounding',
]);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordCount(value) {
  return String(value || '').match(/\p{Script=Han}|[\p{L}\p{N}]+(?:['’ʼ-][\p{L}\p{N}]+)*/gu)?.length || 0;
}

export function normalizeCrossPackageTextureText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/…/g, '...')
    .replace(/^\s*(?:\d+(?:\.\d+)*|[A-Za-z])[\s.):;-]+(?=\p{L})/u, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim()
    .toLowerCase();
}

export function normalizeCrossPackageTexturePath(path = []) {
  return path.map((part) => (typeof part === 'number' ? ARRAY_MARKER : String(part))).join('.');
}

export function maskCrossPackageTextureText(value, slotValues = []) {
  let masked = String(value || '');
  const slots = [...new Set((slotValues || []).map((slot) => String(slot || '').trim()).filter(Boolean))]
    .filter((slot) => slot.length >= 3)
    .sort((left, right) => right.length - left.length || left.localeCompare(right));
  for (const slot of slots) {
    masked = masked.replace(new RegExp(escapeRegExp(slot), 'gi'), ` ${SLOT_MARKER} `);
  }
  masked = masked.replace(/\d+(?:[.,:/-]\d+)*/g, ` ${NUMBER_MARKER} `);
  return normalizeCrossPackageTextureText(masked);
}

function collectStrings(value, output, seen) {
  if (value == null) return;
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim();
    if (text.length >= 3 && text.length <= 1200) output.push(text);
    return;
  }
  if (typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry) => collectStrings(entry, output, seen));
    return;
  }
  Object.values(value).forEach((entry) => collectStrings(entry, output, seen));
}

export function collectCrossPackageInputSlots(...sources) {
  const values = [];
  const seen = new WeakSet();
  sources.forEach((source) => collectStrings(source, values, seen));
  return [...new Set(values)].sort((left, right) => right.length - left.length || left.localeCompare(right));
}

function numericValue(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function deriveContext(value, path, context) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return context;
  const normalizedPath = normalizeCrossPackageTexturePath(path);
  const lessonNumber =
    numericValue(value.lessonNumber) ||
    numericValue(value.weekNumber) ||
    (/(?:lessonPlans\.lessonPlans|slideDecks\.decks|rubrics\.rubrics|discussions\.discussions|quizBank\.quizzes|studyGuides\.studyGuides)\.#$/.test(
      normalizedPath,
    )
      ? numericValue(path.at(-1) + 1)
      : context.lessonNumber);
  return { ...context, lessonNumber };
}

function traceByText(compiledPackage) {
  const events = Array.isArray(compiledPackage?.[TRACE_SYMBOL]) ? compiledPackage[TRACE_SYMBOL] : [];
  const index = new Map();
  for (const event of events) {
    const key = normalizeCrossPackageTextureText(event?.selectedText);
    if (!key) continue;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(event);
  }
  return index;
}

function matchTrace(text, traceIndex, context) {
  const matches = traceIndex.get(normalizeCrossPackageTextureText(text)) || [];
  if (matches.length === 0) return null;
  return (
    matches.find((event) => Number(event.lessonNumber) === Number(context.lessonNumber)) ||
    (matches.length === 1 ? matches[0] : null)
  );
}

export function extractCrossPackageTextureUnits(
  compiledPackage,
  { packageId = 'package', inputSlots = [], minWords = CROSS_PACKAGE_TEXTURE_MIN_WORDS } = {},
) {
  const units = [];
  const unclassified = new Set();
  const traceIndex = traceByText(compiledPackage);

  function walk(value, path = [], context = { lessonNumber: null, stepIndex: null }) {
    if (typeof value === 'string') {
      if (wordCount(value) < minWords) return;
      const normalizedPath = normalizeCrossPackageTexturePath(path);
      const classification = classifyCrossPackageTexturePath(normalizedPath);
      if (!classification) return;
      if (classification.classId === 'unclassified') {
        unclassified.add(normalizedPath);
        return;
      }
      const rawText = String(value).replace(/\s+/g, ' ').trim();
      const rawKey = normalizeCrossPackageTextureText(rawText);
      const trace = matchTrace(rawText, traceIndex, context);
      const consumedSlots = Array.isArray(trace?.consumedSlots) ? trace.consumedSlots : null;
      const field = String(path.at(-1) ?? '');
      const feature = String(path[0] || 'unknown');
      const positionKey =
        context.lessonNumber != null
          ? [
              feature,
              `lesson:${context.lessonNumber}`,
              context.stepIndex == null ? 'step:-' : `step:${context.stepIndex}`,
              `field:${field}`,
            ].join('|')
          : null;
      units.push({
        id: `${packageId}:${units.length + 1}`,
        packageId,
        feature,
        path: path.join('.'),
        normalizedPath,
        field,
        lessonNumber: context.lessonNumber,
        stepIndex: context.stepIndex,
        positionKey,
        classId: classification.classId,
        salience: classification.salience,
        owner: trace?.ownerId || classification.owner,
        provenance: trace ? 'compiler-frame' : 'unknown',
        poolId: trace?.poolId || null,
        variantIndex: Number.isInteger(trace?.index) ? trace.index : null,
        rawText,
        rawKey,
        inputMaskedText: maskCrossPackageTextureText(rawText, inputSlots),
        consumedMaskedText: consumedSlots == null ? null : maskCrossPackageTextureText(rawText, consumedSlots),
        consumedSlots,
      });
      return;
    }
    if (!value || typeof value !== 'object') return;
    const nextContext = deriveContext(value, path, context);
    if (Array.isArray(value)) {
      value.forEach((entry, index) => {
        const normalizedParent = normalizeCrossPackageTexturePath(path);
        const stepIndex = /\.outline$/.test(normalizedParent) ? index : nextContext.stepIndex;
        walk(entry, [...path, index], { ...nextContext, stepIndex });
      });
      return;
    }
    for (const [key, entry] of Object.entries(value)) {
      if (INTERNAL_MIRROR_KEYS.has(key)) continue;
      walk(entry, [...path, key], nextContext);
    }
  }

  walk(compiledPackage);
  return {
    units,
    unclassifiedPaths: [...unclassified].sort(),
    versions: {
      audit: CROSS_PACKAGE_TEXTURE_AUDIT_VERSION,
      extraction: CROSS_PACKAGE_TEXTURE_EXTRACTION_VERSION,
      unitClass: CROSS_PACKAGE_UNIT_CLASS_VERSION,
      mask: CROSS_PACKAGE_TEXTURE_MASK_VERSION,
    },
  };
}

function viewText(unit, maskView) {
  if (maskView === 'raw') return unit.rawKey;
  if (maskView === 'inputMask') return unit.inputMaskedText;
  if (maskView === 'consumedSlot') return unit.consumedMaskedText;
  throw new Error(`Unknown cross-package mask view: ${maskView}`);
}

function comparisonKey(unit, comparisonView, text) {
  if (comparisonView === 'pathFree') return text;
  if (comparisonView === 'pathAware') return `${unit.normalizedPath}\u0000${text}`;
  if (comparisonView === 'samePosition') return unit.positionKey ? `${unit.positionKey}\u0000${text}` : null;
  throw new Error(`Unknown cross-package comparison view: ${comparisonView}`);
}

function roundRate(value) {
  return Number(value.toFixed(6));
}

function summarizeClusters(units, { maskView, comparisonView }) {
  const eligible = units.filter((unit) => viewText(unit, maskView));
  const grouped = new Map();
  for (const unit of eligible) {
    const text = viewText(unit, maskView);
    const key = comparisonKey(unit, comparisonView, text);
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(unit);
  }

  const clusters = [];
  for (const [key, members] of grouped) {
    const packageCounts = new Map();
    members.forEach((member) => packageCounts.set(member.packageId, (packageCounts.get(member.packageId) || 0) + 1));
    const packageSupport = packageCounts.size;
    if (packageSupport < 2) continue;
    const occurrenceCount = members.length;
    const maxOccurrencesInOnePackage = Math.max(...packageCounts.values());
    clusters.push({
      key,
      packageSupport,
      occurrenceCount,
      supportBurden: packageSupport - 1,
      crossPackageExcess: occurrenceCount - maxOccurrencesInOnePackage,
      intraPackageExcess: [...packageCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0),
      classId: members[0].classId,
      salience: members[0].salience,
      owner: members[0].owner,
      field: members[0].field,
      normalizedPath: comparisonView === 'pathFree' ? null : members[0].normalizedPath,
      positionKey: comparisonView === 'samePosition' ? members[0].positionKey : null,
      representativeRawText: members[0].rawText,
      representativeComparedText: viewText(members[0], maskView),
      occurrences: members
        .map((member) => ({
          packageId: member.packageId,
          feature: member.feature,
          path: member.path,
          normalizedPath: member.normalizedPath,
          lessonNumber: member.lessonNumber,
          stepIndex: member.stepIndex,
          rawText: member.rawText,
          comparedText: viewText(member, maskView),
          provenance: member.provenance,
          poolId: member.poolId,
          variantIndex: member.variantIndex,
        }))
        .sort(
          (left, right) =>
            left.packageId.localeCompare(right.packageId) ||
            String(left.path).localeCompare(String(right.path)) ||
            left.rawText.localeCompare(right.rawText),
        ),
    });
  }

  clusters.sort(
    (left, right) =>
      right.packageSupport - left.packageSupport ||
      right.occurrenceCount - left.occurrenceCount ||
      left.key.localeCompare(right.key),
  );
  const supportDistribution = {};
  clusters.forEach((cluster) => {
    supportDistribution[cluster.packageSupport] = (supportDistribution[cluster.packageSupport] || 0) + 1;
  });
  const denominator = eligible.length || 1;
  const exposedOccurrences = clusters.reduce((sum, cluster) => sum + cluster.occurrenceCount, 0);
  const supportBurden = clusters.reduce((sum, cluster) => sum + cluster.supportBurden, 0);
  const crossPackageExcess = clusters.reduce((sum, cluster) => sum + cluster.crossPackageExcess, 0);
  const intraPackageExcess = clusters.reduce((sum, cluster) => sum + cluster.intraPackageExcess, 0);
  return {
    maskView,
    comparisonView,
    eligibleUnitCount: eligible.length,
    clusterCount: clusters.length,
    supportDistribution,
    metrics: {
      supportBurden,
      supportBurdenRate: roundRate(supportBurden / denominator),
      exposedOccurrences,
      readerExposureRate: roundRate(exposedOccurrences / denominator),
      crossPackageExcess,
      crossPackageExcessRate: roundRate(crossPackageExcess / denominator),
      intraPackageExcess,
      intraPackageExcessRate: roundRate(intraPackageExcess / denominator),
    },
    clusters,
  };
}

export function buildCrossPackageTextureResult(packages = [], options = {}) {
  const extracted = packages.map((entry) => {
    if (Array.isArray(entry.units)) {
      return {
        packageId: entry.packageId,
        units: entry.units,
        unclassifiedPaths: entry.unclassifiedPaths || [],
      };
    }
    return {
      packageId: entry.packageId,
      ...extractCrossPackageTextureUnits(entry.compiled, {
        packageId: entry.packageId,
        inputSlots: entry.inputSlots,
        minWords: options.minWords,
      }),
    };
  });
  const allUnits = extracted.flatMap((entry) => entry.units);
  const teachingUnits = allUnits.filter((unit) => unit.classId === TEXTURE_UNIT_CLASS.TEACHING_PROSE);
  const views = {};
  for (const maskView of ['raw', 'inputMask', 'consumedSlot']) {
    views[maskView] = {};
    for (const comparisonView of ['pathFree', 'pathAware', 'samePosition']) {
      views[maskView][comparisonView] = summarizeClusters(teachingUnits, { maskView, comparisonView });
    }
  }
  const classCounts = allUnits.reduce((counts, unit) => {
    counts[unit.classId] = (counts[unit.classId] || 0) + 1;
    return counts;
  }, {});
  return {
    auditVersion: CROSS_PACKAGE_TEXTURE_AUDIT_VERSION,
    versions: {
      extraction: CROSS_PACKAGE_TEXTURE_EXTRACTION_VERSION,
      unitClass: CROSS_PACKAGE_UNIT_CLASS_VERSION,
      mask: CROSS_PACKAGE_TEXTURE_MASK_VERSION,
    },
    packageCount: extracted.length,
    packageIds: extracted.map((entry) => entry.packageId).sort(),
    eligibleUnitCount: allUnits.length,
    teachingUnitCount: teachingUnits.length,
    classCounts,
    unclassifiedPaths: [...new Set(extracted.flatMap((entry) => entry.unclassifiedPaths))].sort(),
    provenance: {
      compilerFrame: teachingUnits.filter((unit) => unit.provenance === 'compiler-frame').length,
      unknown: teachingUnits.filter((unit) => unit.provenance === 'unknown').length,
    },
    views,
  };
}

export function compareCrossPackageTextureResults(current, baseline, supportReference = baseline) {
  const currentView = current?.views?.inputMask?.pathFree;
  const baselineView = baseline?.views?.inputMask?.pathFree;
  const supportReferenceView = supportReference?.views?.inputMask?.pathFree;
  if (!currentView || !baselineView || !supportReferenceView) {
    throw new Error('Cross-package texture comparison requires inputMask.pathFree results.');
  }
  const universalCount = (result, view) =>
    view.clusters.filter((cluster) => cluster.packageSupport === result.packageCount).length;
  const universalHighSalienceCount = (result, view) =>
    view.clusters.filter((cluster) => cluster.packageSupport === result.packageCount && cluster.salience === 'high')
      .length;
  const measures = ['supportBurdenRate', 'readerExposureRate', 'crossPackageExcessRate', 'intraPackageExcessRate'].map(
    (key) => ({
      key,
      baseline: baselineView.metrics[key],
      current: currentView.metrics[key],
      delta: roundRate(currentView.metrics[key] - baselineView.metrics[key]),
      passed: currentView.metrics[key] <= baselineView.metrics[key],
    }),
  );
  const universal = {
    baseline: universalCount(baseline, baselineView),
    current: universalCount(current, currentView),
  };
  const universalHighSalience = {
    baseline: universalHighSalienceCount(baseline, baselineView),
    current: universalHighSalienceCount(current, currentView),
  };
  const pairLocalCount = (view) => Number(view.supportDistribution?.[2] || 0);
  const pairLocal = {
    reference: pairLocalCount(supportReferenceView),
    current: pairLocalCount(currentView),
  };
  const supportReferenceClusters = new Map(supportReferenceView.clusters.map((cluster) => [cluster.key, cluster]));
  const existingClusterGrowth = currentView.clusters
    .map((cluster) => {
      const reference = supportReferenceClusters.get(cluster.key);
      if (
        !reference ||
        (cluster.packageSupport <= reference.packageSupport && cluster.occurrenceCount <= reference.occurrenceCount)
      ) {
        return null;
      }
      return {
        key: cluster.key,
        representativeRawText: cluster.representativeRawText,
        referencePackageSupport: reference.packageSupport,
        currentPackageSupport: cluster.packageSupport,
        referenceOccurrenceCount: reference.occurrenceCount,
        currentOccurrenceCount: cluster.occurrenceCount,
      };
    })
    .filter(Boolean);
  const newUniversalHighSalience = currentView.clusters
    .filter(
      (cluster) =>
        cluster.packageSupport === current.packageCount &&
        cluster.salience === 'high' &&
        !supportReferenceClusters.has(cluster.key),
    )
    .map((cluster) => ({
      key: cluster.key,
      representativeRawText: cluster.representativeRawText,
      packageSupport: cluster.packageSupport,
      occurrenceCount: cluster.occurrenceCount,
    }));
  const provenanceCoverage = {
    threshold: 0.5,
    current:
      current.teachingUnitCount > 0
        ? roundRate(Number(current.provenance?.compilerFrame || 0) / current.teachingUnitCount)
        : 0,
  };
  const unclassifiedPaths = current.unclassifiedPaths || [];
  return {
    passed:
      measures.every((measure) => measure.passed) &&
      universal.current <= universal.baseline &&
      universalHighSalience.current <= universalHighSalience.baseline &&
      pairLocal.current <= pairLocal.reference &&
      existingClusterGrowth.length === 0 &&
      newUniversalHighSalience.length === 0 &&
      provenanceCoverage.current >= provenanceCoverage.threshold &&
      unclassifiedPaths.length === 0,
    measures,
    universal: {
      ...universal,
      passed: universal.current <= universal.baseline,
    },
    universalHighSalience: {
      ...universalHighSalience,
      passed: universalHighSalience.current <= universalHighSalience.baseline,
    },
    pairLocal: {
      ...pairLocal,
      passed: pairLocal.current <= pairLocal.reference,
    },
    existingClusterGrowth: {
      count: existingClusterGrowth.length,
      passed: existingClusterGrowth.length === 0,
      clusters: existingClusterGrowth,
    },
    newUniversalHighSalience: {
      count: newUniversalHighSalience.length,
      passed: newUniversalHighSalience.length === 0,
      clusters: newUniversalHighSalience,
    },
    provenanceCoverage: {
      ...provenanceCoverage,
      passed: provenanceCoverage.current >= provenanceCoverage.threshold,
    },
    unclassified: {
      count: unclassifiedPaths.length,
      passed: unclassifiedPaths.length === 0,
    },
  };
}
