import React from 'react';

// v0.20.08: the teacher's own material, shown verbatim where it is used.
const LABELS = {
  en: { passage: 'Text', dialogue: 'Dialogue', facts: 'Facts', data: 'Given', heading: 'Your material' },
  zh: { passage: '原文', dialogue: '对话', facts: '史料与事实', data: '已知条件', heading: '教学材料' },
};

export default function SuppliedMaterialCard({ material, heading, className = '' }) {
  const blocks = Array.isArray(material?.blocks) ? material.blocks.filter((block) => block?.lines?.length) : [];
  if (blocks.length === 0) return null;
  const labels = LABELS[material.language === 'zh' ? 'zh' : 'en'];
  return (
    <section
      className={`supplied-material rounded-lg border border-slate-200 bg-slate-50/70 p-3 ${className}`}
      data-testid="supplied-material"
      lang={material.language === 'zh' ? 'zh-CN' : undefined}
    >
      <h4 className="text-xs font-semibold text-slate-500 mb-1.5">{heading || labels.heading}</h4>
      <div className="space-y-2.5">
        {blocks.map((block, index) => (
          <div key={index}>
            {blocks.length > 1 || block.title ? (
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {block.title
                  ? `${labels[block.kind] || labels.passage} · ${block.title}`
                  : labels[block.kind] || labels.passage}
              </p>
            ) : null}
            {block.kind === 'passage' || block.kind === 'dialogue' ? (
              <blockquote className="mt-1 border-l-2 border-slate-300 pl-3 text-sm leading-relaxed text-slate-800">
                {block.lines.map((line, lineIndex) => (
                  <p key={lineIndex}>{line}</p>
                ))}
              </blockquote>
            ) : (
              <ul className="mt-1 space-y-1 text-sm leading-relaxed text-slate-800">
                {block.lines.map((line, lineIndex) => (
                  <li key={lineIndex} className="flex gap-2">
                    <span className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
