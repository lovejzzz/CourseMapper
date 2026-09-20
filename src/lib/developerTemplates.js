import { accountStorageKey } from './accountStorage';
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
import { assertNoDeveloperSecrets } from './developerSecretDiagnostics';

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

function readMap(uid) {
  try {
    return safeParse(localStorage.getItem(accountStorageKey(STORAGE_KEY, uid)), {});
  } catch {
    return {};
  }
}

function writeMap(map, uid) {
  try {
    localStorage.setItem(accountStorageKey(STORAGE_KEY, uid), JSON.stringify(map));
  } catch {
    // localStorage may be full or blocked; template save should fail softly.
  }
}

function cleanSelectedFeatures(value) {
  const features = Array.isArray(value) ? value.filter(Boolean) : [];
  return ['courseMap', ...features.filter((id) => id !== 'courseMap')];
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

export function listDeveloperTemplates(uid) {
  return Object.values(readMap(uid)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function getDeveloperTemplate(id, uid) {
  return readMap(uid)[id] || null;
}

export function saveDeveloperTemplate(template, uid) {
  const map = readMap(uid);
  const id = template.id || makeId();
  const previous = map[id] || {};
  const data = extractDeveloperTemplateData(template.data || {});
  assertNoDeveloperSecrets(data, 'Developer template');
  const saved = {
    ...previous,
    ...template,
    id,
    name: (template.name || previous.name || 'Developer Template').trim(),
    data,
    createdAt: previous.createdAt || template.createdAt || now(),
    updatedAt: now(),
  };
  map[id] = saved;
  writeMap(map, uid);
  if (uid) cloudSaveDeveloperTemplate(uid, id, saved).catch(() => {});
  return saved;
}

export function saveDeveloperTemplateFromSnapshot(snapshot, name, uid) {
  return saveDeveloperTemplate(
    {
      name,
      data: extractDeveloperTemplateData(snapshot),
    },
    uid,
  );
}

export function deleteDeveloperTemplate(id, uid) {
  const map = readMap(uid);
  delete map[id];
  writeMap(map, uid);
  if (uid) cloudDeleteDeveloperTemplate(uid, id).catch(() => {});
}

export async function mergeCloudDeveloperTemplates(uid) {
  if (!uid) return listDeveloperTemplates(uid);
  try {
    const localMap = readMap(uid);
    const cloudMap = await cloudLoadDeveloperTemplates(uid);
    const merged = { ...cloudMap };
    Object.entries(localMap).forEach(([id, localTemplate]) => {
      const cloudTemplate = cloudMap[id];
      if (!cloudTemplate || (localTemplate.updatedAt || 0) >= (cloudTemplate.updatedAt || 0)) {
        merged[id] = localTemplate;
      }
    });
    writeMap(merged, uid);
    Object.values(localMap).forEach((template) => {
      cloudSaveDeveloperTemplate(uid, template.id, template).catch(() => {});
    });
    return listDeveloperTemplates(uid);
  } catch {
    return listDeveloperTemplates(uid);
  }
}
