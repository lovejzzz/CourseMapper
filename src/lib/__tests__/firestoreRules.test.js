// Fast structural guards. Actual access semantics are tested in the emulator;
// matching a path prefix alone does not prove that Firestore grants access.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const rules = readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8');
describe('firestore rule structure', () => {
  it('does not introduce a blanket users allow that bypasses project safeguards', () => {
    expect(rules).not.toMatch(/match\s+\/users\/\{\w+\}\/\{\w+=\*\*\}/);
    expect(rules).toContain("collectionId != 'projects'");
  });
  it('keeps ownership and bounded field validation', () => {
    expect(rules).toMatch(/request\.auth\s*!=\s*null/);
    expect(rules).toMatch(/request\.auth\.uid\s*==\s*userId/);
    expect(rules).toMatch(/request\.resource\.data\.keys\(\)\.size\(\)\s*<=\s*80/);
    expect(rules).not.toMatch(/request\.resource\.size/);
  });
  it('explicitly denies client access to the exchange', () => {
    expect(rules).toMatch(
      /match\s+\/authoringExchangeV2\/\{document=\*\*\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;/,
    );
  });
});
