import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import FocusTrap from 'focus-trap-react';
import { DELIVERABLE_OUTBOUND_MAP } from '../lib/syncDependencies';
import { FEATURES, COLOR_MAP } from '../lib/featureCatalog';
import { useCourse } from '../contexts/CourseContext';

// ── Node layout (fixed positions in SVG viewBox 360×400) ────────────────────
const NODE_W = 90;
const NODE_H = 32;
const NODE_POSITIONS = {
  courseMap: { x: 10, y: 170 },
  lessonPlans: { x: 130, y: 30 },
  slideDecks: { x: 130, y: 100 },
  studyGuides: { x: 130, y: 170 },
  assignments: { x: 130, y: 240 },
  rubrics: { x: 130, y: 310 },
  quizBank: { x: 260, y: 65 },
  discussions: { x: 260, y: 170 },
  courseFaq: { x: 260, y: 275 },
  syllabus: { x: 260, y: 360 },
};

// ── Color hex values for SVG fills ──────────────────────────────────────────
const COLOR_HEX = {
  indigo: { fill: '#eef2ff', stroke: '#6366f1', text: '#4338ca' },
  violet: { fill: '#f5f3ff', stroke: '#8b5cf6', text: '#6d28d9' },
  amber: { fill: '#fffbeb', stroke: '#f59e0b', text: '#b45309' },
  emerald: { fill: '#ecfdf5', stroke: '#10b981', text: '#047857' },
  sky: { fill: '#f0f9ff', stroke: '#0ea5e9', text: '#0369a1' },
  rose: { fill: '#fff1f2', stroke: '#f43f5e', text: '#be123c' },
  orange: { fill: '#fff7ed', stroke: '#f97316', text: '#c2410c' },
  teal: { fill: '#f0fdfa', stroke: '#14b8a6', text: '#0f766e' },
  cyan: { fill: '#ecfeff', stroke: '#06b6d4', text: '#0e7490' },
};

// courseMap → all deliverables (simplified — the real mapping is per-field)
const COURSE_MAP_TARGETS = [
  'lessonPlans',
  'slideDecks',
  'studyGuides',
  'assignments',
  'rubrics',
  'quizBank',
  'discussions',
  'syllabus',
];

function getFeature(id) {
  return FEATURES.find((f) => f.id === id);
}

function statusColor(deliverables, id) {
  const d = deliverables?.[id];
  if (!d) return '#cbd5e1'; // slate-300
  if (d.stale) return '#fbbf24'; // amber-400
  if (d.status === 'done') return '#34d399'; // emerald-400
  if (d.status === 'streaming') return '#818cf8'; // indigo-400
  if (d.status === 'error') return '#f87171'; // red-400
  return '#cbd5e1';
}

export default function DependencyMap({ isOpen, onClose, deliverables }) {
  const { selectedFeatures } = useCourse();
  const [focused, setFocused] = useState(null);

  // Build inbound map (reverse of outbound)
  const inboundMap = useMemo(() => {
    const inv = {};
    // courseMap feeds all
    for (const t of COURSE_MAP_TARGETS) {
      (inv[t] ||= []).push('courseMap');
    }
    for (const [src, targets] of Object.entries(DELIVERABLE_OUTBOUND_MAP)) {
      for (const t of targets) {
        (inv[t] ||= []).push(src);
      }
    }
    return inv;
  }, []);

  // All edges
  const edges = useMemo(() => {
    const result = [];
    // courseMap → all
    for (const t of COURSE_MAP_TARGETS) {
      if (NODE_POSITIONS[t]) result.push({ from: 'courseMap', to: t });
    }
    for (const [src, targets] of Object.entries(DELIVERABLE_OUTBOUND_MAP)) {
      for (const t of targets) {
        if (NODE_POSITIONS[src] && NODE_POSITIONS[t]) {
          result.push({ from: src, to: t });
        }
      }
    }
    return result;
  }, []);

  // Focus state
  const upstream = focused ? inboundMap[focused] || [] : [];
  const downstream = focused
    ? focused === 'courseMap'
      ? COURSE_MAP_TARGETS
      : DELIVERABLE_OUTBOUND_MAP[focused] || []
    : [];
  const connectedSet = new Set(focused ? [focused, ...upstream, ...downstream] : []);

  if (!isOpen) return null;

  const visibleNodes = Object.keys(NODE_POSITIONS);

  return createPortal(
    <FocusTrap focusTrapOptions={{ clickOutsideDeactivates: true }}>
      <div
        className="fixed inset-0 z-[9998] bg-black/20 backdrop-blur-sm flex items-center justify-center"
        onClick={onClose}
      >
        <div
          className="bg-white/95 backdrop-blur-lg rounded-2xl shadow-2xl border border-slate-200/60 p-6 w-full max-w-lg animate-spring-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-800">Dependency Map</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Click a node to see what it feeds and what feeds it</p>
            </div>
            <button
              onClick={onClose}
              className="tactile p-2 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all"
              aria-label="Close dependency map"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* SVG Graph */}
          <svg viewBox="0 0 360 400" className="w-full" style={{ maxHeight: '360px' }}>
            <defs>
              <marker
                id="arrow"
                viewBox="0 0 10 6"
                refX="10"
                refY="3"
                markerWidth="8"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 3 L 0 6 z" fill="#94a3b8" />
              </marker>
              <marker
                id="arrow-up"
                viewBox="0 0 10 6"
                refX="10"
                refY="3"
                markerWidth="8"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 3 L 0 6 z" fill="#6366f1" />
              </marker>
              <marker
                id="arrow-down"
                viewBox="0 0 10 6"
                refX="10"
                refY="3"
                markerWidth="8"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 3 L 0 6 z" fill="#f59e0b" />
              </marker>
            </defs>

            {/* Edges */}
            {edges.map(({ from, to }, i) => {
              const a = NODE_POSITIONS[from];
              const b = NODE_POSITIONS[to];
              const x1 = a.x + NODE_W;
              const y1 = a.y + NODE_H / 2;
              const x2 = b.x;
              const y2 = b.y + NODE_H / 2;
              const mx = (x1 + x2) / 2;

              const isUpstream = focused && from === focused;
              const isDownstream = focused && to === focused;
              const isConnected = focused && connectedSet.has(from) && connectedSet.has(to);
              const dimmed = focused && !isConnected;

              let stroke = '#e2e8f0'; // slate-200
              let strokeWidth = 1.5;
              let marker = 'url(#arrow)';
              if (isUpstream) {
                stroke = '#f59e0b';
                strokeWidth = 2.5;
                marker = 'url(#arrow-down)';
              } else if (isDownstream) {
                stroke = '#6366f1';
                strokeWidth = 2.5;
                marker = 'url(#arrow-up)';
              }

              return (
                <path
                  key={i}
                  d={`M ${x1} ${y1} Q ${mx} ${y1} ${mx} ${(y1 + y2) / 2} Q ${mx} ${y2} ${x2} ${y2}`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  markerEnd={marker}
                  opacity={dimmed ? 0.1 : 1}
                  style={{ transition: 'all 0.3s ease' }}
                />
              );
            })}

            {/* Nodes */}
            {visibleNodes.map((id) => {
              const pos = NODE_POSITIONS[id];
              const feat = getFeature(id);
              if (!feat) return null;
              const colors = COLOR_HEX[feat.color] || COLOR_HEX.indigo;
              const isFocused = focused === id;
              const isUp = upstream.includes(id);
              const isDown = downstream.includes(id);
              const dimmed = focused && !connectedSet.has(id);
              const status = id === 'courseMap' ? '#34d399' : statusColor(deliverables, id);

              return (
                <g
                  key={id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setFocused(focused === id ? null : id);
                  }}
                  style={{ cursor: 'pointer', transition: 'opacity 0.3s ease' }}
                  opacity={dimmed ? 0.15 : 1}
                >
                  {/* Glow ring when focused */}
                  {isFocused && (
                    <rect
                      x={pos.x - 3}
                      y={pos.y - 3}
                      width={NODE_W + 6}
                      height={NODE_H + 6}
                      rx={12}
                      fill="none"
                      stroke={colors.stroke}
                      strokeWidth={2}
                      opacity={0.4}
                    />
                  )}
                  {/* Upstream ring */}
                  {isUp && (
                    <rect
                      x={pos.x - 2}
                      y={pos.y - 2}
                      width={NODE_W + 4}
                      height={NODE_H + 4}
                      rx={11}
                      fill="none"
                      stroke="#6366f1"
                      strokeWidth={1.5}
                      strokeDasharray="4 2"
                    />
                  )}
                  {/* Downstream ring */}
                  {isDown && (
                    <rect
                      x={pos.x - 2}
                      y={pos.y - 2}
                      width={NODE_W + 4}
                      height={NODE_H + 4}
                      rx={11}
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth={1.5}
                      strokeDasharray="4 2"
                    />
                  )}
                  {/* Node body */}
                  <rect
                    x={pos.x}
                    y={pos.y}
                    width={NODE_W}
                    height={NODE_H}
                    rx={9}
                    fill={colors.fill}
                    stroke={colors.stroke}
                    strokeWidth={1.5}
                  />
                  {/* Label */}
                  <text
                    x={pos.x + NODE_W / 2}
                    y={pos.y + NODE_H / 2 + 1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="8"
                    fontWeight="600"
                    fill={colors.text}
                  >
                    {feat.label.length > 14 ? feat.label.slice(0, 12) + '…' : feat.label}
                  </text>
                  {/* Status dot */}
                  <circle cx={pos.x + NODE_W - 6} cy={pos.y + 6} r={3.5} fill={status} stroke="white" strokeWidth={1} />
                </g>
              );
            })}
          </svg>

          {/* Legend */}
          <div className="mt-4 flex items-center gap-4 text-[10px] text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Generated
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Stale
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" /> Not generated
            </span>
          </div>

          {/* Focus detail */}
          {focused && (
            <div className="mt-3 p-3 bg-slate-50/80 rounded-xl border border-slate-200/40 animate-spring-in">
              <p className="text-[11px] font-bold text-slate-600 mb-2">{getFeature(focused)?.label || focused}</p>
              <div className="flex flex-col gap-1.5">
                {upstream.length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] text-indigo-500 font-semibold whitespace-nowrap mt-0.5">
                      ← Feeds in:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {upstream.map((id) => {
                        const f = getFeature(id);
                        const c = COLOR_MAP[f?.color || 'indigo'];
                        return (
                          <span key={id} className={`${c.badge} text-[9px] font-semibold px-1.5 py-0.5 rounded-full`}>
                            {f?.label || id}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
                {downstream.length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] text-amber-500 font-semibold whitespace-nowrap mt-0.5">
                      → Affects:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {downstream.map((id) => {
                        const f = getFeature(id);
                        const c = COLOR_MAP[f?.color || 'indigo'];
                        return (
                          <span key={id} className={`${c.badge} text-[9px] font-semibold px-1.5 py-0.5 rounded-full`}>
                            {f?.label || id}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
                {upstream.length === 0 && downstream.length === 0 && (
                  <p className="text-[10px] text-slate-400 italic">No cascade connections</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </FocusTrap>,
    document.body,
  );
}
