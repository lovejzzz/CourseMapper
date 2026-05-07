import React, { useCallback, useRef } from 'react';

const MIN_WIDTH = 280;
const MAX_WIDTH = 500;

export default function ResizeHandle({ onWidthChange }) {
  const draggingRef = useRef(false);

  const onMouseDown = useCallback(
    (e) => {
      e.preventDefault();
      draggingRef.current = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMouseMove = (e) => {
        if (!draggingRef.current) return;
        const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
        onWidthChange(newWidth);
      };

      const onMouseUp = () => {
        draggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [onWidthChange],
  );

  return (
    <div
      onMouseDown={onMouseDown}
      className="w-1.5 flex-shrink-0 cursor-col-resize group relative self-stretch"
      title="Drag to resize"
    >
      <div className="absolute inset-y-0 -left-1 -right-1" />
      <div className="h-full w-px mx-auto bg-slate-200/60 group-hover:bg-indigo-400/60 transition-colors" />
      {/* Drag indicator dots */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="w-1 h-1 rounded-full bg-indigo-400" />
        <div className="w-1 h-1 rounded-full bg-indigo-400" />
        <div className="w-1 h-1 rounded-full bg-indigo-400" />
      </div>
    </div>
  );
}
