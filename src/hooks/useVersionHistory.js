import { useState, useCallback, useRef } from 'react';

/**
 * Manages version history with undo/redo/jump and push.
 * Uses a ref mirror of activeVersion so callbacks always see current value.
 */
export default function useVersionHistory(setCourseMap, setDownloadedFile) {
  const [versionHistory, setVersionHistory] = useState([]);
  const [activeVersion, setActiveVersion] = useState(-1);
  const activeRef = useRef(-1);
  const historyRef = useRef([]);

  const syncActive = (val) => { activeRef.current = val; setActiveVersion(val); };

  const pushVersion = useCallback((map, label) => {
    if (!map) return;
    const snapshot = JSON.parse(JSON.stringify(map));
    const entry = { courseMap: snapshot, timestamp: Date.now(), label };
    setVersionHistory(prev => {
      const next = [...prev, entry];
      historyRef.current = next;
      syncActive(next.length - 1);
      return next;
    });
  }, []);

  const jumpToVersion = useCallback((idx) => {
    const hist = historyRef.current;
    if (idx < 0 || idx >= hist.length) return;
    const version = hist[idx];
    setCourseMap(JSON.parse(JSON.stringify(version.courseMap)));
    syncActive(idx);
    setDownloadedFile('');
  }, [setCourseMap, setDownloadedFile]);

  const undo = useCallback(() => {
    const cur = activeRef.current;
    if (cur > 0) jumpToVersion(cur - 1);
  }, [jumpToVersion]);

  const redo = useCallback(() => {
    const cur = activeRef.current;
    const hist = historyRef.current;
    if (cur < hist.length - 1) jumpToVersion(cur + 1);
  }, [jumpToVersion]);

  const resetHistory = useCallback(() => {
    historyRef.current = [];
    syncActive(-1);
    setVersionHistory([]);
  }, []);

  return {
    versionHistory,
    activeVersion,
    pushVersion,
    jumpToVersion,
    undo,
    redo,
    resetHistory,
  };
}
