import React from 'react';
import { FEATURES } from '../lib/featureCatalog';
import {
  isRenderedDeliverableCollectionFeature,
  renderedDeliverableCollection,
} from '../lib/renderedDeliverableRoot.js';

const FEATURE_LABELS = new Map(FEATURES.map((feature) => [feature.id, feature.label]));

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16.862 4.487 19.5 7.125M4.5 19.5l4.125-.75L19.5 7.875 16.125 4.5 5.25 15.375 4.5 19.5z"
      />
    </svg>
  );
}

function getFeatureLabel(featureId) {
  if (featureId === 'courseMap') return 'Course Map';
  return FEATURE_LABELS.get(featureId) || featureId;
}

function getFeatureCount(featureId, deliverables) {
  if (featureId === 'courseMap') return 1;
  const data = deliverables?.[featureId]?.data;
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === 'object') {
    if (isRenderedDeliverableCollectionFeature(featureId)) {
      return renderedDeliverableCollection(featureId, data).length;
    }
    const firstArray = Object.values(data).find(Array.isArray);
    if (firstArray) return firstArray.length;
    return 1;
  }
  return 0;
}

function summarizeQualityCaveats(quality) {
  if (!quality || quality.status !== 'graded') return [];
  const findings = Array.isArray(quality.findings) ? quality.findings : [];
  const caveats = findings.filter((finding) => finding?.severity === 'P0' || finding?.severity === 'P1');
  if (caveats.length > 0) return caveats.slice(0, 2);
  const counts = quality.findingCounts || {};
  const count = Number(counts.p0 || 0) + Number(counts.p1 || 0);
  return count > 0
    ? [
        {
          severity: counts.p0 ? 'P0' : 'P1',
          detail: `${count} higher-priority quality ${count === 1 ? 'finding' : 'findings'}`,
        },
      ]
    : [];
}

export default function FinishedPackageOverview({
  courseMap,
  selectedFeatures = [],
  deliverables = {},
  packageQualityPass,
  onEditCourseMap,
  onOpenFeature,
  onOpenQualityReport,
}) {
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  const featureIds = ['courseMap', ...selectedFeatures.filter((featureId) => featureId !== 'courseMap')];
  const materialRows = featureIds.map((featureId) => ({
    id: featureId,
    label: getFeatureLabel(featureId),
    count: getFeatureCount(featureId, deliverables),
    ready: featureId === 'courseMap' || deliverables?.[featureId]?.status === 'done',
  }));
  const readyCount = materialRows.filter((row) => row.ready).length;
  const grade = packageQualityPass?.quality?.grade || 'A';
  const score = packageQualityPass?.quality?.score;
  const readinessScore = packageQualityPass?.quality?.readiness?.score;
  const readinessMax = packageQualityPass?.quality?.readiness?.maxScore || 100;
  const texture = packageQualityPass?.quality?.texture?.score;
  const qualityCaveats = summarizeQualityCaveats(packageQualityPass?.quality);
  const repairsApplied = Number(packageQualityPass?.repairsApplied || packageQualityPass?.receipt?.autoFixedCount || 0);
  const exportChecked = Number(packageQualityPass?.receipt?.exportChecked || 0);

  return (
    <section
      data-testid="finished-package-overview"
      className="rounded-squircle-sm border border-slate-200/70 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
              <CheckIcon />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-slate-900">Finished package</h2>
              <p className="mt-0.5 text-sm font-medium text-slate-500">
                {lessons.length} lessons · {readyCount}/{materialRows.length} materials ready
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
            {Number.isFinite(readinessScore) && (
              <button
                type="button"
                onClick={() => onOpenQualityReport?.(true)}
                className="tactile rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700"
              >
                Evidence {readinessScore}/{readinessMax}
              </button>
            )}
            {Number.isFinite(score) && (
              <button
                type="button"
                onClick={() => onOpenQualityReport?.(true)}
                className={`tactile rounded-full border px-3 py-1 ${
                  Number.isFinite(readinessScore)
                    ? 'border-slate-200 bg-slate-50 text-slate-600'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}
              >
                Conformance {score} · {grade}
              </button>
            )}
            {Number.isFinite(texture) && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
                Texture {texture}
              </span>
            )}
            {qualityCaveats.length > 0 && (
              <button
                type="button"
                data-testid="finished-overview-quality-caveats"
                onClick={() => onOpenQualityReport?.(true)}
                title={qualityCaveats.map((finding) => `${finding.severity}: ${finding.detail}`).join(' · ')}
                className="tactile rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-800"
              >
                Review {qualityCaveats.length} quality {qualityCaveats.length === 1 ? 'caveat' : 'caveats'}
              </button>
            )}
            {repairsApplied > 0 && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
                {repairsApplied} safe repairs
              </span>
            )}
            {exportChecked > 0 && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
                {exportChecked} exports checked
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="finished-overview-edit-map"
            onClick={() => onEditCourseMap?.(true)}
            className="tactile inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <EditIcon />
            Edit course map
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {materialRows.map((row) => (
          <button
            key={row.id}
            type="button"
            data-testid="finished-overview-material"
            onClick={() => (row.id === 'courseMap' ? onEditCourseMap?.(true) : onOpenFeature?.(row.id))}
            className="tactile flex min-h-[68px] items-start gap-3 rounded-lg border border-slate-200/70 bg-slate-50/60 px-3 py-3 text-left hover:border-indigo-200 hover:bg-indigo-50/50"
          >
            <span
              className={`mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${
                row.ready ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'
              }`}
            >
              <CheckIcon />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-slate-800">{row.label}</span>
              <span className="mt-0.5 block text-xs font-medium text-slate-500">
                {row.count > 0 ? `${row.count} item${row.count === 1 ? '' : 's'}` : 'Ready'}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
