import { describe, it, expect } from 'vitest';
import { freeRegionAllowed } from '../regions';
describe('free hosted region eligibility', () => {
  it('accepts listed free-client regions without treating the whole world as eligible', () => {
    for (const code of ['US', 'CA', 'JP', 'TW', 'AU', 'IN', 'BR', 'ZA']) expect(freeRegionAllowed(code)).toBe(true);
    for (const code of ['GB', 'CH', 'DE', 'FR', 'NO', 'IS', 'LI', 'AX', 'RE'])
      expect(freeRegionAllowed(code)).toBe(false);
    for (const code of ['CN', 'HK', 'RU', 'IR', 'KP', 'XX', undefined]) expect(freeRegionAllowed(code)).toBe(false);
  });
});
