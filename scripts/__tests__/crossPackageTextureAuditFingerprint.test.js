import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CROSS_PACKAGE_TEXTURE_IMPLEMENTATION_FILES, implementationFingerprint } from '../crossPackageTextureAudit.mjs';

describe('cross-package texture implementation fingerprint', () => {
  it('binds mutations in the production teaching-move pools', async () => {
    const root = path.resolve('/virtual/coursemapper');
    const readFile = async (filePath) => Buffer.from(`source:${path.relative(root, filePath)}`);
    const baseline = await implementationFingerprint({ readFile, root });
    const mutated = await implementationFingerprint({
      root,
      readFile: async (filePath) =>
        Buffer.from(
          filePath.endsWith('src/lib/teachingMoveVariants.js')
            ? 'mutated production variant pool'
            : `source:${path.relative(root, filePath)}`,
        ),
    });

    expect(CROSS_PACKAGE_TEXTURE_IMPLEMENTATION_FILES).toContain('src/lib/teachingMoveVariants.js');
    expect(mutated).not.toBe(baseline);
  });
});
