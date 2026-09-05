import { sanitizeProjectSnapshot } from './projectSnapshotSanitizer';

export function stripMessageSecrets(value) {
  return sanitizeProjectSnapshot(value);
}

export function sanitizeMessagesForPersistence(messages) {
  if (!Array.isArray(messages)) return [];
  return stripMessageSecrets(messages);
}
