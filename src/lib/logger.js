/**
 * Tiny logger utility — active in dev mode, tree-shaken in production.
 *
 * Usage:
 *   import { log, warn, error as logError } from '../lib/logger';
 *   log('something happened', data);
 */

const noop = () => {};

export const log   = import.meta.env.DEV ? (...args) => console.log('[CM]', ...args)   : noop;
export const warn  = import.meta.env.DEV ? (...args) => console.warn('[CM]', ...args)  : noop;
export const error = import.meta.env.DEV ? (...args) => console.error('[CM]', ...args) : noop;
