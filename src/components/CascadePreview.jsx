import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { DELIVERABLE_OUTBOUND_MAP, getAffectedFeatures, getOutboundTargets } from '../lib/syncDependencies';
import { FEATURES, COLOR_MAP } from '../lib/featureCatalog';
import { useCourse } from '../contexts/CourseContext';

const TOOLTIP_W = 260;
const TOOLTIP_MAX_H = 140;

function humanize(key) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function getFeature(id) {
  return FEATURES.find((f) => f.id === id);
}

/**
 * CascadePreview — floating tooltip showing what a change will cascade into.
 *
 * Exactly one of `fieldKey` (course map column hover) or `featureId` (tab hover)
 * should be set at a time.
 */
export default function CascadePreview({ fieldKey, featureId, position, deliverables }) {
  const { selectedFeatures } = useCourse();
  const affected = useMemo(() => {
    if (fieldKey) {
      // Course map cell hover — use FIELD_DEPENDENCY_MAP via public API
      return getAffectedFeatures(fieldKey, selectedFeatures).filter((f) => f !== featureId); // don't show self
    }
    if (featureId && featureId !== 'courseMap') {
      // Deliverable tab hover — use DELIVERABLE_OUTBOUND_MAP
      return getOutboundTargets(featureId).filter((f) => selectedFeatures?.includes(f));
    }
    return [];
  }, [fieldKey, featureId, selectedFeatures]);

  // Filter to only deliverables that are generated (done)
  const actionable = useMemo(() => {
    return affected.filter((id) => {
      const d = deliverables?.[id];
      return d?.status === 'done';
    });
  }, [affected, deliverables]);

  const staleOnes = useMemo(() => {
    return affected.filter((id) => deliverables?.[id]?.stale);
  }, [affected, deliverables]);

  if (affected.length === 0) return null;

  // Viewport clamping
  const clampedX = Math.min(position.x, window.innerWidth - TOOLTIP_W - 16);
  const clampedY = Math.min(position.y, window.innerHeight - TOOLTIP_MAX_H - 16);

  const label = fieldKey ? humanize(fieldKey) : getFeature(featureId)?.label || featureId;

  return createPortal(
    <div
      className="fixed z-[9999] bg-white/95 backdrop-blur-xl rounded-xl border border-slate-200/60 shadow-xl p-3 pointer-events-none animate-spring-in"
      style={{ left: clampedX, top: clampedY, width: TOOLTIP_W }}
    >
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
        {fieldKey ? `Editing "${label}" will affect:` : `Editing ${label} cascades to:`}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {affected.map((id) => {
          const feat = getFeature(id);
          if (!feat) return null;
          const colors = COLOR_MAP[feat.color];
          const d = deliverables?.[id];
          const isStale = d?.stale;
          const isDone = d?.status === 'done';
          return (
            <span
              key={id}
              className={`${colors.badge} text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1`}
            >
              {/* Status micro-dot */}
              <span
                className={`w-1.5 h-1.5 rounded-full ${isStale ? 'bg-amber-400' : isDone ? 'bg-emerald-400' : 'bg-slate-300'}`}
              />
              {feat.label}
            </span>
          );
        })}
      </div>
      {staleOnes.length > 0 && (
        <p className="text-[9px] text-amber-500 mt-1.5 font-medium">
          {staleOnes.length === 1 ? '1 deliverable' : `${staleOnes.length} deliverables`} already out of sync
        </p>
      )}
    </div>,
    document.body,
  );
}
