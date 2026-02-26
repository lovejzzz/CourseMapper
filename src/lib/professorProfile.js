/**
 * professorProfile.js
 *
 * localStorage CRUD for the professor's persistent profile.
 * Profile data is used as lowest-priority defaults for all deliverables
 * and injected into prompts by buildConfigInstructions().
 *
 * Storage key: 'coursemapper-professorProfile'
 */

import { saveProfile as cloudSaveProfile, loadProfile as cloudLoadProfile } from './cloudStorage';

const STORAGE_KEY = 'coursemapper-professorProfile';

const DEFAULTS = {
  name: '',
  institution: '',
  department: '',
  defaultSessionLength: '75 min',
  citationStyle: 'APA 7',
  lateWorkPolicy: '',
  accommodationStatement: '',
  academicIntegrityStatement: '',
  mentalHealthStatement: '',
  // Feature 3.1 — Institution policy fields
  institutionTemplateId: '',
  policyTitleIX: '',
  policyGradeScale: '',
  // Feature 8.3 — AI Teaching Assistant Persona
  assistantName: 'Aria',
  assistantTone: 'collegial',
  assistantFocus: '',
};

/**
 * Load the professor's profile from localStorage.
 * Returns a merged object with DEFAULTS filled in for missing fields.
 */
export function getProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const stored = raw ? JSON.parse(raw) : {};
    return { ...DEFAULTS, ...stored };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * Save a complete profile object to localStorage.
 * If uid is provided, also fire-and-forget save to Firestore.
 */
export function saveProfile(profile, uid) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULTS, ...profile }));
  } catch (e) {
    console.warn('Professor profile save failed:', e);
  }
  if (uid) {
    cloudSaveProfile(uid, { profile: { ...DEFAULTS, ...profile } })
      .catch(e => console.warn('[Cloud] profile save failed:', e));
  }
}

/**
 * Apply a partial update (patch) to the stored profile.
 */
export function updateProfile(patch, uid) {
  const current = getProfile();
  saveProfile({ ...current, ...patch }, uid);
  return { ...current, ...patch };
}

/**
 * Reset profile to empty defaults.
 */
export function resetProfile() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/** Legacy alias used in some imports */
export const clearProfile = resetProfile;

/**
 * On sign-in: load profile from Firestore and merge with localStorage.
 * Cloud wins on conflict.
 */
export async function mergeCloudProfile(uid) {
  try {
    const cloudData = await cloudLoadProfile(uid);
    if (cloudData?.profile) {
      const local = getProfile();
      const merged = { ...DEFAULTS, ...local, ...cloudData.profile };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      return merged;
    }
    // No cloud profile yet — push local to cloud
    const local = getProfile();
    if (local.name || local.institution) {
      cloudSaveProfile(uid, { profile: local }).catch(() => {});
    }
    return local;
  } catch (e) {
    console.warn('[Cloud] merge profile failed:', e);
    return getProfile();
  }
}
