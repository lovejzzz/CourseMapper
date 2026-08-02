import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { captureModuleImplementationReceipt } from '../lib/moduleImplementationReceipt.mjs';

describe('moduleImplementationReceipt', () => {
  let root = null;

  afterEach(async () => {
    if (root) await fs.rm(root, { recursive: true, force: true });
    root = null;
  });

  it('binds static and dynamic relative dependencies transitively', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'module-receipt-'));
    await fs.mkdir(path.join(root, 'nested'));
    await Promise.all([
      fs.writeFile(path.join(root, 'entry.js'), "export { value } from './nested/value.js';\nimport('./lazy.js');\n"),
      fs.writeFile(
        path.join(root, 'nested', 'value.js'),
        "import helper from '../helper';\nexport const value = helper;\n",
      ),
      fs.writeFile(path.join(root, 'helper.js'), 'export default 1;\n'),
      fs.writeFile(path.join(root, 'lazy.js'), 'export const lazy = true;\n'),
    ]);

    const first = await captureModuleImplementationReceipt({ root, entryPath: 'entry.js' });
    expect(first.files.map((entry) => entry.path)).toEqual(['entry.js', 'helper.js', 'lazy.js', 'nested/value.js']);
    expect(first).toMatchObject({ fileCount: 4, implementationSha256: expect.stringMatching(/^[a-f0-9]{64}$/) });

    await fs.writeFile(path.join(root, 'helper.js'), 'export default 2;\n');
    const second = await captureModuleImplementationReceipt({ root, entryPath: 'entry.js' });
    expect(second.implementationSha256).not.toBe(first.implementationSha256);
  });

  it('binds multiline static imports instead of silently omitting their modules', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'module-receipt-multiline-'));
    await Promise.all([
      fs.writeFile(path.join(root, 'dependency.js'), 'export const value = 1;\n'),
      fs.writeFile(
        path.join(root, 'entry.js'),
        "import {\n  value,\n} from './dependency.js';\nexport default value;\n",
      ),
    ]);
    const receipt = await captureModuleImplementationReceipt({ root, entryPath: 'entry.js' });
    expect(receipt.files.map((entry) => entry.path)).toEqual(['dependency.js', 'entry.js']);
  });
});
