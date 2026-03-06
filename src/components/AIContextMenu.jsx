import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * AIContextMenu — Right-click context menu for inline AI editing.
 * Appears at cursor position with AI actions (Improve, Expand, Simplify, etc.)
 * Constructs a targeted prompt and sends it to the chat agent.
 */

const AI_ACTIONS = [
  {
    id: 'improve',
    label: 'Improve with AI',
    icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
    prompt: (ctx) => `Please improve the following content in ${ctx.location}. Make it more specific, actionable, and pedagogically sound. Current content:\n\n"${ctx.value}"`,
  },
  {
    id: 'expand',
    label: 'Expand',
    icon: 'M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4',
    prompt: (ctx) => `Please expand the following content in ${ctx.location} with more detail, examples, or specifics. Keep the pedagogical intent but make it richer. Current content:\n\n"${ctx.value}"`,
  },
  {
    id: 'simplify',
    label: 'Simplify',
    icon: 'M13 10V3L4 14h7v7l9-11h-7z',
    prompt: (ctx) => `Please simplify the following content in ${ctx.location}. Make it more concise and clear while keeping the key pedagogical points. Current content:\n\n"${ctx.value}"`,
  },
  {
    id: 'rewrite',
    label: 'Rewrite',
    icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
    prompt: (ctx) => `Please completely rewrite the following content in ${ctx.location}. Create a fresh version that achieves the same learning goal but with different wording and approach. Current content:\n\n"${ctx.value}"`,
  },
];

function buildContext(target) {
  if (target.type === 'courseMapCell') {
    const lessonLabel = `Lesson ${(target.lessonIndex ?? 0) + 1}`;
    const field = target.columnKey || 'this cell';
    return { location: `${field} column, ${lessonLabel}`, value: target.currentValue || '' };
  }
  if (target.type === 'deliverableField') {
    const pathStr = Array.isArray(target.path) ? target.path.join(' > ') : String(target.path);
    return { location: `deliverable field (${pathStr})`, value: target.currentValue || '' };
  }
  return { location: 'this content', value: target.currentValue || '' };
}

export default function AIContextMenu({ position, target, onAction, onClose }) {
  const menuRef = useRef(null);

  // Close on outside click; handle Escape and arrow key navigation
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') { onClose(); return; }
      // Arrow key navigation within the menu
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = menuRef.current?.querySelectorAll('button[role="menuitem"]');
        if (!items || items.length === 0) return;
        const focused = document.activeElement;
        const idx = Array.from(items).indexOf(focused);
        const next = e.key === 'ArrowDown'
          ? (idx + 1) % items.length
          : (idx - 1 + items.length) % items.length;
        items[next]?.focus();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    // Focus first menu item on mount
    requestAnimationFrame(() => {
      menuRef.current?.querySelector('button[role="menuitem"]')?.focus();
    });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  if (!position || !target) return null;

  const ctx = buildContext(target);

  // Keep menu within viewport
  const menuWidth = 200;
  const menuHeight = AI_ACTIONS.length * 36 + 48;
  const x = Math.min(position.x, window.innerWidth - menuWidth - 16);
  const y = Math.min(position.y, window.innerHeight - menuHeight - 16);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999] animate-spring-in"
      style={{ left: x, top: y }}
    >
      <div role="menu" aria-label="AI editing actions" className="bg-white/95 backdrop-blur-xl rounded-xl border border-slate-200/60 shadow-xl py-1.5 min-w-[200px] overflow-hidden">
        {/* Header */}
        <div className="px-3 py-1.5 border-b border-slate-100/80">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded-md bg-gradient-to-br from-indigo-500/20 to-violet-500/20 flex items-center justify-center">
              <svg className="w-2.5 h-2.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <span className="text-[11px] font-semibold text-slate-500">AI Edit</span>
          </div>
        </div>

        {/* Actions */}
        {AI_ACTIONS.map((action) => (
          <button
            key={action.id}
            role="menuitem"
            onClick={() => {
              onAction(action.prompt(ctx));
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[12px] text-slate-700 hover:bg-indigo-50/60 hover:text-indigo-700 transition-colors"
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={action.icon} />
            </svg>
            {action.label}
          </button>
        ))}

        {/* Custom prompt option */}
        <div className="border-t border-slate-100/80 mt-0.5">
          <button
            role="menuitem"
            onClick={() => {
              onAction(`__FOCUS__${ctx.location}|||${ctx.value}`);
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[12px] text-slate-500 hover:bg-violet-50/60 hover:text-violet-700 transition-colors"
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Ask AI about this...
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
