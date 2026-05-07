// src/contexts/UIContext.jsx — UI-related state (screens, modals, panels)
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

const UIContext = createContext(null);

export function UIProvider({ children }) {
  // ── Screen flow ──
  const [screen, setScreen] = useState('landing');

  // ── Workspace tab ──
  const [activeTab, setActiveTab] = useState('courseMap');

  // ── Chat panel width (persisted to localStorage) ──
  const [chatWidth, setChatWidthRaw] = useState(() => {
    try {
      return parseInt(localStorage.getItem('coursemapper-chat-width')) || 360;
    } catch {
      return 360;
    }
  });
  const setChatWidth = useCallback((w) => {
    setChatWidthRaw(w);
    try {
      localStorage.setItem('coursemapper-chat-width', String(w));
    } catch {}
  }, []);

  // ── Help modal ──
  const [showHelp, setShowHelp] = useState(false);

  // ── Diff toggle ──
  const [showDiff, setShowDiff] = useState(false);

  // ── Add deliverable dropdown ──
  const [showAddDeliverable, setShowAddDeliverable] = useState(false);

  // ── Custom deliverable builder modal ──
  const [showCustomBuilder, setShowCustomBuilder] = useState(false);

  // ── Dependency map modal ──
  const [showDepMap, setShowDepMap] = useState(false);

  // ── New Project confirmation modal ──
  const [newProjectConfirm, setNewProjectConfirm] = useState(false);

  // ── Cloud project picker ──
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  // ── Drag-to-reorder tabs ──
  const [dragTabIdx, setDragTabIdx] = useState(null);

  // ── Cascade preview tooltip (hover state) ──
  const [cascadeHover, setCascadeHover] = useState(null);
  const cascadeTimerRef = useRef(null);
  const handleCascadeHover = useCallback((info) => {
    clearTimeout(cascadeTimerRef.current);
    if (!info) {
      setCascadeHover(null);
      return;
    }
    cascadeTimerRef.current = setTimeout(() => setCascadeHover(info), 150);
  }, []);

  // ── AI Context Menu ──
  const [aiContextMenu, setAiContextMenu] = useState(null);
  const handleAIContextMenu = useCallback((e, target) => {
    e.preventDefault();
    setAiContextMenu({ position: { x: e.clientX, y: e.clientY }, target });
  }, []);
  const closeAIContextMenu = useCallback(() => setAiContextMenu(null), []);

  // ── Unseen changes badge (amber * on tabs) ──
  const [unseenChanges, setUnseenChanges] = useState(new Set());

  // ── Agent action highlight (green ring) ──
  const [agentHighlight, setAgentHighlight] = useState(null);
  const agentHighlightTimerRef = useRef(null);
  const triggerAgentHighlight = useCallback((featureId, lessonIndex) => {
    if (agentHighlightTimerRef.current) clearTimeout(agentHighlightTimerRef.current);
    setAgentHighlight({ featureId, lessonIndex });
    agentHighlightTimerRef.current = setTimeout(() => setAgentHighlight(null), 5000);
  }, []);

  // ── Add-lessons modal ──
  const [addLessonsModal, setAddLessonsModal] = useState(null);

  const value = {
    screen,
    setScreen,
    activeTab,
    setActiveTab,
    chatWidth,
    setChatWidth,
    showHelp,
    setShowHelp,
    showDiff,
    setShowDiff,
    showAddDeliverable,
    setShowAddDeliverable,
    showCustomBuilder,
    setShowCustomBuilder,
    showDepMap,
    setShowDepMap,
    newProjectConfirm,
    setNewProjectConfirm,
    showProjectPicker,
    setShowProjectPicker,
    dragTabIdx,
    setDragTabIdx,
    cascadeHover,
    handleCascadeHover,
    aiContextMenu,
    handleAIContextMenu,
    closeAIContextMenu,
    unseenChanges,
    setUnseenChanges,
    agentHighlight,
    triggerAgentHighlight,
    addLessonsModal,
    setAddLessonsModal,
  };

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within a UIProvider');
  return ctx;
}
