/**
 * docTheme.js — designed DOCX themes (v0.9.1 Phase 3).
 *
 * Three restrained, professional palettes with a consistent type scale.
 * Theme choice persists locally; exporters read the active theme so every
 * document in a package shares one visual voice. Covers and TOC are added
 * for multi-lesson documents by the exporters.
 */

const STORAGE_KEY = 'coursemapper-doc-theme';

export const DOC_THEMES = {
  indigo: {
    id: 'indigo',
    label: 'Indigo (default)',
    accent: '2B579A',
    accentSoft: 'D6E4F0',
    headingColor: '1F3864',
    metaColor: '7A869A',
    ruleColor: 'C9D6E8',
  },
  graphite: {
    id: 'graphite',
    label: 'Graphite',
    accent: '3D3D3D',
    accentSoft: 'E6E6E6',
    headingColor: '262626',
    metaColor: '8C8C8C',
    ruleColor: 'D4D4D4',
  },
  forest: {
    id: 'forest',
    label: 'Forest',
    accent: '1E6B52',
    accentSoft: 'DCEDE5',
    headingColor: '174E3D',
    metaColor: '7D9489',
    ruleColor: 'C5DCD2',
  },
};

export function getDocTheme() {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    return DOC_THEMES[id] || DOC_THEMES.indigo;
  } catch {
    return DOC_THEMES.indigo;
  }
}

export function setDocTheme(id) {
  try {
    if (DOC_THEMES[id]) localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* preference is best-effort */
  }
}
