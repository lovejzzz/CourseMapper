/**
 * useTabDrag — v0.15.1 C1: the workspace tab drag/reorder/delete machinery,
 * extracted verbatim from AppFlow.
 *
 * Owns the drag payload (tabDrag) and the pointer handlers; the
 * host injects the refs it shares with the render (tab buttons, the fixed
 * trash pill) and the two outcomes (reorder via setSelectedFeatures, delete
 * via setDeleteTabConfirm). Drop detection is rect-based throughout, so the
 * trash pill can live anywhere (it is a fixed portal since v0.14.9 B3).
 */
import { useState } from 'react';

export default function useTabDrag({
  // A REF, not the array: the tab list is derived after the host's early
  // screen returns, while this hook must sit in the hooks zone above them.
  workspaceTabsRef,
  tabButtonRefs,
  trashDropRef,
  suppressTabClickRef,
  setSelectedFeatures,
  setDeleteTabConfirm,
  // dragTabIdx lives in UIContext (other surfaces dim during a drag) — the
  // host injects its setter; this hook owns only the drag payload itself.
  setDragTabIdx,
  onDragStart = null,
}) {
  const [tabDrag, setTabDrag] = useState(null);

  const handleTabPointerDown = (feature, tabIdx) => (e) => {
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setDragTabIdx(tabIdx);
    setTabDrag({
      id: feature.id,
      label: feature.label,
      index: tabIdx,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      pointerX: e.clientX,
      pointerY: e.clientY,
      originX: rect.left,
      originY: rect.top,
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      overIndex: tabIdx,
      overDelete: false,
      moved: false,
    });
    onDragStart?.();
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handleTabPointerMove = (featureId) => (e) => {
    setTabDrag((prev) => {
      if (!prev || prev.id !== featureId || prev.pointerId !== e.pointerId) return prev;
      const dx = e.clientX - prev.startX;
      const dy = e.clientY - prev.startY;
      const moved = prev.moved || Math.hypot(dx, dy) > 4;
      let overDelete = false;
      let overIndex = prev.overIndex;

      if (moved) {
        const trashRect = trashDropRef.current?.getBoundingClientRect();
        if (trashRect) {
          overDelete =
            e.clientX >= trashRect.left - 12 &&
            e.clientX <= trashRect.right + 12 &&
            e.clientY >= trashRect.top - 12 &&
            e.clientY <= trashRect.bottom + 12;
        }
        if (!overDelete) {
          let nearest = null;
          for (const [id, el] of tabButtonRefs.current.entries()) {
            if (!el || id === prev.id) continue;
            const rect = el.getBoundingClientRect();
            const yNear = e.clientY >= rect.top - 22 && e.clientY <= rect.bottom + 22;
            if (!yNear) continue;
            const centerX = rect.left + rect.width / 2;
            const distance = Math.abs(e.clientX - centerX);
            if (!nearest || distance < nearest.distance) {
              const idx = (workspaceTabsRef.current || []).findIndex((f) => f.id === id);
              nearest = { idx, distance };
            }
          }
          if (nearest) overIndex = nearest.idx;
        }
      }

      return {
        ...prev,
        pointerX: e.clientX,
        pointerY: e.clientY,
        x: prev.originX + dx,
        y: prev.originY + dy,
        overIndex,
        overDelete,
        moved,
      };
    });
  };

  const finishTabDrag = (drag) => {
    setDragTabIdx(null);
    setTabDrag(null);
    if (!drag?.moved) return;

    suppressTabClickRef.current = true;
    window.setTimeout(() => {
      suppressTabClickRef.current = false;
    }, 0);

    if (drag.overDelete && drag.id !== 'courseMap') {
      setDeleteTabConfirm({ id: drag.id, label: drag.label });
      return;
    }
    if (drag.overDelete) return;

    const dropIdx = drag.overIndex;
    if (dropIdx == null || dropIdx === drag.index) return;
    setSelectedFeatures((prev) => {
      const fromIdx = prev.indexOf(drag.id);
      if (fromIdx < 0 || dropIdx < 0 || dropIdx >= prev.length || fromIdx === dropIdx) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(dropIdx, 0, moved);
      return next;
    });
  };

  const handleTabPointerUp = (featureId) => (e) => {
    if (!tabDrag || tabDrag.id !== featureId || tabDrag.pointerId !== e.pointerId) return;
    finishTabDrag(tabDrag);
  };

  const handleTabPointerCancel = (featureId) => (e) => {
    if (!tabDrag || tabDrag.id !== featureId || tabDrag.pointerId !== e.pointerId) return;
    setDragTabIdx(null);
    setTabDrag(null);
  };

  return {
    tabDrag,
    handleTabPointerDown,
    handleTabPointerMove,
    handleTabPointerUp,
    handleTabPointerCancel,
  };
}
