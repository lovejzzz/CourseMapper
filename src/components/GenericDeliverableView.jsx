import React from 'react';
import { CollapsibleCard, SectionHeading, Badge, StreamingBanner } from './DeliverableView';

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

// ── Render helpers by type ──

function renderStringField(value, label) {
  if (!value) return null;
  if (value.length < SHORT_THRESHOLD) {
    return (
      <div key={label}>
        <SectionHeading>{label}</SectionHeading>
        <p className="text-xs text-slate-700 leading-relaxed">{value}</p>
      </div>
    );
  }
  // Long string — render as a section with paragraph
  return (
    <div key={label}>
      <SectionHeading>{label}</SectionHeading>
      <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">{value}</p>
    </div>
  );
}

function renderArrayField(arr, label) {
  if (!arr || arr.length === 0) return null;
  const first = arr[0];

  // Array of strings
  if (typeof first === 'string') {
    return (
      <div key={label}>
        <SectionHeading>{label}</SectionHeading>
        <ul className="space-y-1">
          {arr.map((item, j) => (
            <li key={j} className="text-xs text-slate-700 flex gap-2 leading-relaxed">
              <span className="text-violet-400 flex-shrink-0">•</span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Array of objects — render each as a mini card
  if (typeof first === 'object' && first !== null) {
    return (
      <div key={label}>
        <SectionHeading>{label}</SectionHeading>
        <div className="space-y-2">
          {arr.map((obj, j) => (
            <div key={j} className="bg-violet-50/40 rounded-lg px-3 py-2 border border-violet-100/50">
              {renderObjectFields(obj)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

/** Render an object's fields as inline key-value pairs */
function renderObjectFields(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const entries = Object.entries(obj).filter(([, v]) => v != null && v !== '');

  return (
    <div className="space-y-1">
      {entries.map(([k, v]) => {
        const label = camelToLabel(k);
        if (typeof v === 'string') {
          if (v.length < SHORT_THRESHOLD) {
            return (
              <div key={k} className="flex flex-wrap items-baseline gap-1">
                <span className="text-[10px] font-bold text-violet-700">{label}:</span>
                <span className="text-[11px] text-slate-600">{v}</span>
              </div>
            );
          }
          return (
            <div key={k}>
              <span className="text-[10px] font-bold text-violet-700">{label}:</span>
              <p className="text-[11px] text-slate-600 leading-relaxed mt-0.5 whitespace-pre-line">{v}</p>
            </div>
          );
        }
        if (Array.isArray(v)) {
          return (
            <div key={k}>
              <span className="text-[10px] font-bold text-violet-700">{label}:</span>
              <ul className="ml-3 mt-0.5 space-y-0.5">
                {v.map((item, idx) => (
                  <li key={idx} className="text-[11px] text-slate-600 flex gap-1.5">
                    <span className="text-violet-300">–</span>
                    {typeof item === 'string' ? item : JSON.stringify(item)}
                  </li>
                ))}
              </ul>
            </div>
          );
        }
        if (typeof v === 'number' || typeof v === 'boolean') {
          return (
            <div key={k} className="flex flex-wrap items-baseline gap-1">
              <span className="text-[10px] font-bold text-violet-700">{label}:</span>
              <span className="text-[11px] text-slate-600">{String(v)}</span>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

/** Render a single item's content fields (excluding header keys) */
function renderItemContent(item) {
  const entries = Object.entries(item).filter(
    ([k, v]) => !HEADER_KEYS.has(k) && v != null && v !== ''
  );

  // Separate short strings (badges) from other fields
  const badges = [];
  const sections = [];

  for (const [key, value] of entries) {
    const label = camelToLabel(key);
    if (typeof value === 'string') {
      if (value.length < SHORT_THRESHOLD) {
        badges.push({ key, label, value });
      } else {
        sections.push({ key, label, value, type: 'string' });
      }
    } else if (Array.isArray(value)) {
      sections.push({ key, label, value, type: 'array' });
    } else if (typeof value === 'object' && value !== null) {
      sections.push({ key, label, value, type: 'object' });
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      badges.push({ key, label, value: String(value) });
    }
  }

  return (
    <div className="pt-3 space-y-4">
      {/* Short string badges at top */}
      {badges.length > 0 && (
        <div className="space-y-2">
          {badges.map(({ key, label, value }) => (
            <div key={key}>
              <SectionHeading>{label}</SectionHeading>
              <p className="text-xs text-slate-700 leading-relaxed">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Longer content sections */}
      {sections.map(({ key, label, value, type }) => {
        if (type === 'string') return renderStringField(value, label);
        if (type === 'array') return renderArrayField(value, label);
        if (type === 'object') {
          return (
            <div key={key}>
              <SectionHeading>{label}</SectionHeading>
              <div className="bg-violet-50/30 rounded-lg p-3 border border-violet-100/40">
                {renderObjectFields(value)}
              </div>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
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
  let arrayKey = null;

  if (data) {
    for (const [k, v] of Object.entries(data)) {
      if (Array.isArray(v) && v.length > 0) {
        items = v;
        arrayKey = k;
        break;
      }
    }
  }

  // If no array found, try rendering the whole data as a single card
  if (!items && data && typeof data === 'object') {
    return (
      <div className="space-y-3 p-4">
        <CollapsibleCard title={data.title || data.name || 'Content'} subtitle="" defaultOpen accent="violet">
          {renderItemContent(data)}
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
            {renderItemContent(item)}
          </CollapsibleCard>
        );
      })}
    </div>
  );
}
