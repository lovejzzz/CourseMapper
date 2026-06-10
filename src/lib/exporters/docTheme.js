/**
 * docTheme.js — designed DOCX themes (v0.9.1 Phase 3, retyped v0.12.0).
 *
 * Three restrained, professional palettes with a consistent type scale.
 * Theme choice persists locally; exporters read the active theme so every
 * document in a package shares one visual voice. Covers and TOC are added
 * for multi-lesson documents by the exporters.
 *
 * v0.12.0: added the editorial font pairing and table tokens. Fonts are
 * deliberately limited to faces installed on every Windows and macOS
 * machine (Georgia, Calibri) so the downloaded file renders as designed
 * instead of silently falling back.
 */

const STORAGE_KEY = 'coursemapper-doc-theme';

// Editorial pairing: serif display for headings, clean sans for body.
export const DOC_FONTS = {
  heading: 'Georgia',
  body: 'Calibri',
};

export const DOC_THEMES = {
  indigo: {
    id: 'indigo',
    label: 'Indigo (default)',
    accent: '2B579A',
    accentSoft: 'D6E4F0',
    headingColor: '1F3864',
    metaColor: '7A869A',
    ruleColor: 'C9D6E8',
    bandFill: 'F3F7FB',
    calloutFill: 'EEF4FA',
  },
  graphite: {
    id: 'graphite',
    label: 'Graphite',
    accent: '3D3D3D',
    accentSoft: 'E6E6E6',
    headingColor: '262626',
    metaColor: '8C8C8C',
    ruleColor: 'D4D4D4',
    bandFill: 'F5F5F5',
    calloutFill: 'F0F0F0',
  },
  forest: {
    id: 'forest',
    label: 'Forest',
    accent: '1E6B52',
    accentSoft: 'DCEDE5',
    headingColor: '174E3D',
    metaColor: '7D9489',
    ruleColor: 'C5DCD2',
    bandFill: 'F1F8F4',
    calloutFill: 'EAF4EF',
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
