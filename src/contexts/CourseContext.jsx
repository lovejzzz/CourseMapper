// src/contexts/CourseContext.jsx — Course-data state (map, columns, features, config)
import React, { createContext, useContext, useState } from 'react';
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
