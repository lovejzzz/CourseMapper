// src/contexts/CourseContext.jsx — Course-data state (map, columns, features, config)
import React, { createContext, useCallback, useContext, useState } from 'react';
import { DEFAULT_COLUMNS } from '../components/ColumnEditor';

const CourseContext = createContext(null);

export function CourseProvider({ children }) {
  // ── Feature / deliverable selection ──
  const [selectedFeatures, setSelectedFeatures] = useState(['courseMap']);
  const [deliverableConfig, setDeliverableConfig] = useState({});

  // ── Lesson scope ──
  const [lessonScope, setLessonScope] = useState({ type: 'all' });

  // ── Prompt & files ──
  const [promptText, setPromptText] = useState('');
  const [files, setFiles] = useState([]);

  // ── Column layout ──
  const [columns, setColumns] = useState([...DEFAULT_COLUMNS]);

  // ── Core course map data ──
  const [courseMap, setCourseMap] = useState(null);
  const [oldCourseMap, setOldCourseMap] = useState(null);

  // ── Edit tracking ──
  const [userEdits, setUserEdits] = useState([]);
  const [hasGenerated, setHasGenerated] = useState(false);

  // ── Slide theme ──
  const [slideTheme, setSlideTheme] = useState(null); // null = auto-rotate, 0-4 = specific theme

  // Starting from the landing brief is a new project boundary. Preserve the
  // brief and attached files, but discard every generated/project-owned value
  // before AppFlow mounts so a previous course cannot seed its graph, feature
  // selection, or compiler configuration into the next course.
  const resetGeneratedProjectState = useCallback(() => {
    setSelectedFeatures(['courseMap']);
    setDeliverableConfig({});
    setLessonScope({ type: 'all' });
    setColumns([...DEFAULT_COLUMNS]);
    setCourseMap(null);
    setOldCourseMap(null);
    setUserEdits([]);
    setHasGenerated(false);
    setSlideTheme(null);
  }, []);

  return (
    <CourseContext.Provider
      value={{
        selectedFeatures,
        setSelectedFeatures,
        deliverableConfig,
        setDeliverableConfig,
        lessonScope,
        setLessonScope,
        promptText,
        setPromptText,
        files,
        setFiles,
        columns,
        setColumns,
        courseMap,
        setCourseMap,
        oldCourseMap,
        setOldCourseMap,
        userEdits,
        setUserEdits,
        hasGenerated,
        setHasGenerated,
        slideTheme,
        setSlideTheme,
        resetGeneratedProjectState,
      }}
    >
      {children}
    </CourseContext.Provider>
  );
}

export function useCourse() {
  const ctx = useContext(CourseContext);
  if (!ctx) throw new Error('useCourse must be used within a CourseProvider');
  return ctx;
}
