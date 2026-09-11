/** @vitest-environment happy-dom */
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { transformWithOxc } from 'vite';
import { it, expect } from 'vitest';
import { CODING_PRACTICE } from '../codingPracticeCatalog.js';

it('runs the exported React answer with independent state in two mounted instances', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const source = CODING_PRACTICE.find((row) => row.id === 'react-counter')
    .solution.replace('import { useState } from "react";', '')
    .replace('export default function', 'function');
  const { code } = await transformWithOxc(source, 'Counter.jsx', { jsx: { runtime: 'classic' } });
  // Only the repository-owned reference answer is compiled here. The product
  // never evaluates teacher or model code when generating teaching materials.
  const Counter = new Function('React', 'useState', `${code};return Counter;`)(React, useState);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <>
          <Counter />
          <Counter />
        </>,
      ),
    );
    expect([...container.querySelectorAll('output')].map((node) => node.textContent)).toEqual(['0', '0']);
    for (let i = 0; i < 3; i++) await act(async () => container.querySelector('button').click());
    expect([...container.querySelectorAll('output')].map((node) => node.textContent)).toEqual(['3', '0']);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
