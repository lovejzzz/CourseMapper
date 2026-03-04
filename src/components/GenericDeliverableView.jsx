import React from 'react';
import { CollapsibleCard, SectionHeading, StreamingBanner } from './deliverables/shared/SharedComponents';

// ── Helpers ──

/** Convert camelCase key to readable "Title Case" label */
function camelToLabel(key) {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/^./, s => s.toUpperCase());
}

/** Keys already used for card header — skip when rendering fields */
const HEADER_KEYS = new Set(['lessonTitle', 'title', 'name', 'weekNumber', 'week', 'tiers']);

/** Short string threshold */
const SHORT_THRESHOLD = 100;

// ── Recursive Renderer ──

/**
 * Robust, recursive renderer for unpredictable JSON shapes.
 * Handles deeply nested objects, arrays of objects, and arrays of primitives cleanly.
 */
function renderValue(value, label = null, depth = 0) {
  // 1. Null / Undefined / Empty String
  if (value == null || value === '') return null;

  // 2. Primitives (String, Number, Boolean)
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const isShort = String(value).length < SHORT_THRESHOLD;

    // Depth 0: Top-level primitive field
    if (depth === 0 && label) {
      if (isShort) {
        return (
          <div key={label} className="mt-4 first:mt-0">
            <SectionHeading>{label}</SectionHeading>
            <p className="text-xs text-slate-700 leading-relaxed">{String(value)}</p>
          </div>
        );
      }
      return (
        <div key={label} className="mt-4 first:mt-0">
          <SectionHeading>{label}</SectionHeading>
          <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">{String(value)}</p>
        </div>
      );
    }

    // Depth > 0: Nested primitive field (e.g., inside an object or array)
    if (label) {
      if (isShort) {
        return (
          <div key={label} className="flex flex-wrap items-baseline gap-1 mt-1">
            <span className="text-[10px] font-bold text-violet-700 uppercase tracking-wide">{label}:</span>
            <span className="text-[11px] text-slate-700">{String(value)}</span>
          </div>
        );
      }
      return (
        <div key={label} className="mt-2">
          <span className="text-[10px] font-bold text-violet-700 uppercase tracking-wide">{label}:</span>
          <p className="text-[11px] text-slate-700 leading-relaxed mt-0.5 whitespace-pre-line border-l-2 border-violet-100 pl-2 ml-1">{String(value)}</p>
        </div>
      );
    }

    // Array element primitive
    return (
      <span className="text-[11px] text-slate-700 leading-relaxed">{String(value)}</span>
    );
  }

  // 3. Arrays
  if (Array.isArray(value)) {
    if (value.length === 0) return null;

    const isPrimitiveArray = typeof value[0] !== 'object' || value[0] === null;

    // Depth 0 array (Top-level section)
    if (depth === 0 && label) {
      return (
        <div key={label} className="mt-4 first:mt-0">
          <SectionHeading>{label}</SectionHeading>
          {isPrimitiveArray ? (
            <ul className="space-y-1.5 ml-1">
              {value.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-violet-400 mt-0.5 text-[10px]">●</span>
                  {renderValue(item, null, depth + 1)}
                </li>
              ))}
            </ul>
          ) : (
            <div className="space-y-3 mt-2">
              {value.map((item, idx) => (
                <div key={idx} className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                  {renderValue(item, null, depth + 1)}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    // Depth > 0 array (Nested)
    return (
      <div key={label} className="mt-2">
        {label && <div className="text-[10px] font-bold text-violet-700 uppercase tracking-wide mb-1">{label}:</div>}
        {isPrimitiveArray ? (
          <ul className="space-y-1 ml-2">
            {value.map((item, idx) => (
              <li key={idx} className="flex items-start gap-1.5">
                <span className="text-violet-300 mt-0.5 text-[10px]">-</span>
                {renderValue(item, null, depth + 1)}
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-2 mt-1 border-l-2 border-violet-100 pl-3 ml-1">
            {value.map((item, idx) => (
              <div key={idx} className="bg-white/50 rounded-md p-2">
                {renderValue(item, null, depth + 1)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // 4. Objects
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).filter(([k, v]) => (!label && depth === 0 ? !HEADER_KEYS.has(k) : true) && v != null && v !== '');
    if (entries.length === 0) return null;

    // Depth 0 Object
    if (depth === 0) {
      return (
        <div className="space-y-4 pt-2">
          {entries.map(([k, v]) => renderValue(v, camelToLabel(k), depth))}
        </div>
      );
    }

    // Depth > 0 Object (Nested dictionary)
    return (
      <div key={label} className="mt-2">
        {label && <div className="text-[10px] font-bold text-violet-700 uppercase tracking-wide mb-1.5">{label}</div>}
        <div className="flex flex-col gap-1.5">
          {entries.map(([k, v]) => renderValue(v, camelToLabel(k), depth + 1))}
        </div>
      </div>
    );
  }

  return null;
}

// ── Main Component ──

export default function GenericDeliverableView({ featureId, data, isStreaming, regeneratingIndex, onRegenerateLesson, onEdit }) {
  if (!data && !isStreaming) {
    return (
      <div className="glass rounded-squircle-sm p-8 text-center text-slate-400 text-sm">
        No content generated yet.
      </div>
    );
  }

  if (isStreaming && !data) {
    return <StreamingBanner />;
  }

  // Find the top-level array in the data object
  let items = null;

  if (data) {
    for (const v of Object.values(data)) {
      if (Array.isArray(v) && v.length > 0) {
        items = v;
        break;
      }
    }
  }

  // If no array found, try rendering the whole data as a single card
  if (!items && data && typeof data === 'object') {
    return (
      <div className="space-y-3 p-4">
        <CollapsibleCard title={data.title || data.name || 'Content'} subtitle="" defaultOpen accent="violet">
          {renderValue(data)}
        </CollapsibleCard>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="glass rounded-squircle-sm p-8 text-center text-slate-400 text-sm">
        No content generated yet.
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      {items.map((item, i) => {
        const title = item.lessonTitle || item.title || item.name || `Item ${i + 1}`;
        const subtitle = item.weekNumber || item.week || '';
        const isLastAndStreaming = isStreaming && i === items.length - 1;

        return (
          <CollapsibleCard
            key={i}
            title={title}
            subtitle={subtitle}
            defaultOpen={i < 3}
            accent="violet"
            streaming={isLastAndStreaming}
            regenerating={regeneratingIndex === i}
            onRegenerate={onRegenerateLesson && !isStreaming ? () => onRegenerateLesson(i) : undefined}
          >
            {renderValue(item)}
          </CollapsibleCard>
        );
      })}
    </div>
  );
}
