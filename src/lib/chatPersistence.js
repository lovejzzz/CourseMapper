/**
 * chatPersistence.js — Save, load, search, and manage chat conversations.
 * Conversations persist across page reloads via localStorage.
 * Each conversation has a title, messages, and metadata.
 */

import { sanitizeMessagesForPersistence } from './messageSanitizer';

const STORAGE_KEY = 'coursemapper-conversations';
const MAX_CONVERSATIONS = 50;
const QUOTA_RETRY_CONVERSATIONS = 20;
const COMPACT_MESSAGE_LIMIT = 80;
const HARD_COMPACT_MESSAGE_LIMIT = 30;
const COMPACT_TEXT_CHARS = 4000;
const HARD_COMPACT_TEXT_CHARS = 1200;

function isQuotaError(error) {
  return (
    error?.name === 'QuotaExceededError' ||
    error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error?.code === 22 ||
    error?.code === 1014 ||
    /quota/i.test(String(error?.message || ''))
  );
}

function compactValue(value, maxChars) {
  if (typeof value === 'string') {
    return value.length > maxChars ? `${value.slice(0, maxChars)}... [truncated]` : value;
  }
  if (Array.isArray(value)) return value.map((entry) => compactValue(entry, maxChars));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, compactValue(entry, maxChars)]));
  }
  return value;
}

function compactMessagesForStorage(messages, { limit = COMPACT_MESSAGE_LIMIT, maxChars = COMPACT_TEXT_CHARS } = {}) {
  const list = Array.isArray(messages) ? messages : [];
  const trimmed = list.slice(-limit);
  const firstUser = list.find((message) => message?.role === 'user');
  if (firstUser && !trimmed.includes(firstUser)) trimmed.unshift(firstUser);
  while (trimmed.length > limit) trimmed.splice(1, 1);
  return trimmed.map((message) => compactValue(message, maxChars));
}

function pruneConversationStorage(conversations, keepCount, activeId) {
  const sorted = [...conversations].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const kept = [];
  const removed = [];

  for (const conversation of sorted) {
    if (conversation.id === activeId || kept.length < keepCount) kept.push(conversation);
    else removed.push(conversation);
  }

  for (const conversation of removed) {
    localStorage.removeItem(`${STORAGE_KEY}:${conversation.id}`);
  }

  return kept;
}

function removeConversationPayloadsExcept(activeId) {
  if (
    typeof localStorage === 'undefined' ||
    typeof localStorage.length !== 'number' ||
    typeof localStorage.key !== 'function'
  ) {
    return;
  }
  const keepKey = `${STORAGE_KEY}:${activeId}`;
  const keys = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(`${STORAGE_KEY}:`) && key !== keepKey) keys.push(key);
  }
  for (const key of keys) localStorage.removeItem(key);
}

function writeConversationStorage(conversations, id, messages) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  localStorage.setItem(`${STORAGE_KEY}:${id}`, JSON.stringify(messages));
}

/**
 * Get all saved conversations, sorted by most recent.
 * @returns {Array<{id: string, title: string, createdAt: string, updatedAt: string, messageCount: number, preview: string}>}
 */
export function listConversations() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return data.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  } catch {
    return [];
  }
}

/**
 * Save or update a conversation.
 * @param {string} id - Conversation ID (generate with crypto.randomUUID or Date.now)
 * @param {Array} messages - Full message array
 * @param {string} [title] - Optional title (auto-generated from first user message if omitted)
 */
export function saveConversation(id, messages, title) {
  try {
    const conversations = listConversations();
    const safeMessages = sanitizeMessagesForPersistence(messages);
    const visibleMessages = safeMessages.filter((m) => m.role === 'user' || m.role === 'assistant');

    // Auto-generate title from first user message
    const autoTitle = title || visibleMessages.find((m) => m.role === 'user')?.text?.slice(0, 60) || 'New conversation';

    const preview = visibleMessages.slice(-1)[0]?.text?.slice(0, 100) || '';
    const now = new Date().toISOString();

    const existing = conversations.findIndex((c) => c.id === id);
    const entry = {
      id,
      title: autoTitle,
      createdAt: existing >= 0 ? conversations[existing].createdAt : now,
      updatedAt: now,
      messageCount: visibleMessages.length,
      preview,
    };

    if (existing >= 0) {
      conversations[existing] = entry;
    } else {
      conversations.unshift(entry);
    }

    // Keep within limit
    while (conversations.length > MAX_CONVERSATIONS) {
      const removed = conversations.pop();
      localStorage.removeItem(`${STORAGE_KEY}:${removed.id}`);
    }

    // Store messages separately to keep index lightweight.
    try {
      writeConversationStorage(conversations, id, safeMessages);
    } catch (error) {
      if (!isQuotaError(error)) throw error;

      const prunedConversations = pruneConversationStorage(conversations, QUOTA_RETRY_CONVERSATIONS, id);
      try {
        writeConversationStorage(prunedConversations, id, compactMessagesForStorage(safeMessages));
      } catch (retryError) {
        if (!isQuotaError(retryError)) throw retryError;
        const hardPrunedConversations = pruneConversationStorage(prunedConversations, 1, id);
        const hardCompactedMessages = compactMessagesForStorage(safeMessages, {
          limit: HARD_COMPACT_MESSAGE_LIMIT,
          maxChars: HARD_COMPACT_TEXT_CHARS,
        });
        try {
          writeConversationStorage(hardPrunedConversations, id, hardCompactedMessages);
        } catch (hardRetryError) {
          if (!isQuotaError(hardRetryError)) throw hardRetryError;
          removeConversationPayloadsExcept(id);
          writeConversationStorage([entry], id, hardCompactedMessages);
        }
      }
    }

    return entry;
  } catch (err) {
    console.warn('Failed to save conversation:', err);
    return null;
  }
}

/**
 * Load a conversation's messages by ID.
 * @param {string} id
 * @returns {Array|null}
 */
export function loadConversation(id) {
  try {
    const data = localStorage.getItem(`${STORAGE_KEY}:${id}`);
    if (!data) return null;
    const parsed = JSON.parse(data);
    const safeMessages = sanitizeMessagesForPersistence(parsed);
    if (JSON.stringify(safeMessages) !== JSON.stringify(parsed)) {
      localStorage.setItem(`${STORAGE_KEY}:${id}`, JSON.stringify(safeMessages));
    }
    return safeMessages;
  } catch {
    return null;
  }
}

/**
 * Delete a conversation.
 * @param {string} id
 */
export function deleteConversation(id) {
  try {
    const conversations = listConversations().filter((c) => c.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    localStorage.removeItem(`${STORAGE_KEY}:${id}`);
  } catch {
    /* ignore */
  }
}

/**
 * Search conversations by keyword (searches titles and message content).
 * @param {string} query
 * @returns {Array<{id: string, title: string, matches: number}>}
 */
export function searchConversations(query) {
  if (!query || query.trim().length < 2) return [];
  const lower = query.toLowerCase();
  const conversations = listConversations();
  const results = [];

  for (const conv of conversations) {
    let matches = 0;
    if (conv.title.toLowerCase().includes(lower)) matches += 2;
    if (conv.preview.toLowerCase().includes(lower)) matches += 1;

    // Check full messages for deeper search
    try {
      const messages = JSON.parse(localStorage.getItem(`${STORAGE_KEY}:${conv.id}`) || '[]');
      for (const m of messages) {
        const text = (m.text || m.content || '').toLowerCase();
        if (text.includes(lower)) matches++;
      }
    } catch {
      /* ignore */
    }

    if (matches > 0) results.push({ ...conv, matches });
  }

  return results.sort((a, b) => b.matches - a.matches);
}

/**
 * Generate a new conversation ID.
 */
export function newConversationId() {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
