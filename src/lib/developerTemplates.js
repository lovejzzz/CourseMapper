/**
 * Developer Templates — reusable project setup defaults.
 *
 * Templates intentionally exclude project content such as courseMap lessons,
 * generated deliverables, chat history, and files. They persist the setup a
 * developer wants future projects to start with.
 */

import {
  loadDeveloperTemplates as cloudLoadDeveloperTemplates,
  saveDeveloperTemplate as cloudSaveDeveloperTemplate,
  deleteDeveloperTemplate as cloudDeleteDeveloperTemplate,
} from './cloudStorage';

const STORAGE_KEY = 'coursemapper-developer-templates';

function now() {
  return Date.now();
}

function makeId() {
  return `devtpl_${now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function safeParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function readMap() {
  try {
    return safeParse(localStorage.getItem(STORAGE_KEY), {});
  } catch {
    return {};
  }
}

function writeMap(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // localStorage may be full or blocked; template save should fail softly.
  }
}

function cleanSelectedFeatures(value) {
  const features = Array.isArray(value) ? value.filter(Boolean) : [];
  return ['courseMap', ...features.filter(id => id !== 'courseMap')];
}

function cleanObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function extractDeveloperTemplateData(snapshot = {}) {
  return {
    selectedFeatures: cleanSelectedFeatures(snapshot.selectedFeatures),
    deliverableConfig: cleanObject(snapshot.deliverableConfig),
    lessonScope: cleanObject(snapshot.lessonScope),
    slideTheme: snapshot.slideTheme ?? null,
    provider: snapshot.provider || '',
    modelId: snapshot.modelId || '',
    modelName: snapshot.modelName || '',
    columns: Array.isArray(snapshot.columns) ? snapshot.columns : undefined,
  };
}

export function listDeveloperTemplates() {
  return Object.values(readMap())
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function getDeveloperTemplate(id) {
  return readMap()[id] || null;
}

export function saveDeveloperTemplate(template, uid) {
  const map = readMap();
  const id = template.id || makeId();
  const previous = map[id] || {};
  const saved = {
    ...previous,
    ...template,
    id,
    name: (template.name || previous.name || 'Developer Template').trim(),
    data: extractDeveloperTemplateData(template.data || {}),
    createdAt: previous.createdAt || template.createdAt || now(),
    updatedAt: now(),
  };
  map[id] = saved;
  writeMap(map);
  if (uid) cloudSaveDeveloperTemplate(uid, id, saved).catch(() => {});
  return saved;
}

export function saveDeveloperTemplateFromSnapshot(snapshot, name, uid) {
  return saveDeveloperTemplate({
    name,
    data: extractDeveloperTemplateData(snapshot),
  }, uid);
}

export function deleteDeveloperTemplate(id, uid) {
  const map = readMap();
  delete map[id];
  writeMap(map);
  if (uid) cloudDeleteDeveloperTemplate(uid, id).catch(() => {});
}

export async function mergeCloudDeveloperTemplates(uid) {
  if (!uid) return listDeveloperTemplates();
  try {
    const localMap = readMap();
    const cloudMap = await cloudLoadDeveloperTemplates(uid);
    const merged = { ...cloudMap };
    Object.entries(localMap).forEach(([id, localTemplate]) => {
      const cloudTemplate = cloudMap[id];
      if (!cloudTemplate || (localTemplate.updatedAt || 0) >= (cloudTemplate.updatedAt || 0)) {
        merged[id] = localTemplate;
      }
    });
    writeMap(merged);
    Object.values(localMap).forEach((template) => {
      cloudSaveDeveloperTemplate(uid, template.id, template).catch(() => {});
    });
    return listDeveloperTemplates();
  } catch {
    return listDeveloperTemplates();
  }
}
