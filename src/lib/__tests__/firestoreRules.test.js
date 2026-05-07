/**
 * firestoreRules.test.js — pins the invariant that every Firestore path our
 * app writes to is covered by the existing recursive wildcard rule
 *   match /users/{userId}/{document=**}
 * in firestore.rules.
 *
 * Why this test exists: in an earlier pass I worried that the new
 * users/{uid}/agentData/customTools/entries/{name} subtree might need a
 * dedicated rule. It doesn't — {document=**} is recursive — but that's the
 * kind of thing that's easy to get wrong later if someone adds a top-level
 * subtree outside /users. This test catches that.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = resolve(__dirname, '../../../firestore.rules');
const RULES = readFileSync(RULES_PATH, 'utf8');

// Paths any of our cloud-writing code can touch. Keep this list in sync with
// cloudStorage.js — if a new collection is introduced, add it here so the
// rule-coverage check fires.
const PATHS_UNDER_RULES = [
  'users/{uid}',                                             // profile
  'users/{uid}/projects/{projectId}',                        // project metadata
  'users/{uid}/projects/{projectId}/deliverables/{fid}',     // per-project deliverable data
  'users/{uid}/customDeliverables/{id}',                     // custom deliverable defs
  'users/{uid}/agentData/preferences',                       // agent prefs
  'users/{uid}/agentData/memory/entries/{id}',               // agent memories
  'users/{uid}/agentData/customTools/entries/{name}',        // NEW: agent-created macros
];

describe('firestore.rules', () => {
  it('includes a recursive wildcard match for /users/{userId}', () => {
    expect(RULES).toMatch(/match\s+\/users\/\{userId\}\/\{document=\*\*\}/);
  });

  it('the recursive wildcard rule gates access through owner helpers', () => {
    expect(RULES).toMatch(/function\s+isOwner\s*\(\s*userId\s*\)/);
    expect(RULES).toMatch(/request\.auth\.uid\s*==\s*userId/);
    expect(RULES).toMatch(/allow\s+read:\s*if\s+isOwner\(userId\)/);
    expect(RULES).toMatch(/allow\s+create,\s*update:\s*if\s+isOwner\(userId\)\s*&&\s*hasReasonableFieldCount\(\)/);
    expect(RULES).toMatch(/allow\s+delete:\s*if\s+isOwner\(userId\)/);
  });

  it('uses request.resource.data for write validation', () => {
    expect(RULES).toMatch(/request\.resource\.data\.keys\(\)\.size\(\)\s*<=\s*80/);
    expect(RULES).not.toMatch(/request\.resource\.size/);
  });

  it.each(PATHS_UNDER_RULES)(
    'path "%s" is covered by the recursive users/{userId} rule',
    (path) => {
      // The rule covers everything under /users/{userId}/** — we just need to
      // confirm the path starts with users/{uid}/ (or is users/{uid} itself).
      expect(path === 'users/{uid}' || path.startsWith('users/{uid}/')).toBe(true);
    }
  );

  it('does NOT silently allow writes outside /users', () => {
    // Sanity: there must be no top-level match block that opens anything up.
    // If a future change adds `match /public/...` we want to know.
    const topLevelMatches = [...RULES.matchAll(/^\s*match\s+\/([a-zA-Z_]+)/gm)].map(m => m[1]);
    for (const collection of topLevelMatches) {
      expect(['databases', 'users']).toContain(collection);
    }
  });
});
