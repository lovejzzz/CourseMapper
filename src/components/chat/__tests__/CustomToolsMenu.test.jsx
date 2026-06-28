import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CustomToolsMenu from '../CustomToolsMenu';

describe('CustomToolsMenu', () => {
  it('hides the header pill when there are no custom tools and no sync error', () => {
    const html = renderToStaticMarkup(<CustomToolsMenu tools={[]} />);

    expect(html).toBe('');
  });

  it('keeps the pill visible when cloud sync needs attention', () => {
    const html = renderToStaticMarkup(
      <CustomToolsMenu tools={[]} syncError={{ name: 'Example tool', op: 'save', message: 'Permission denied' }} />,
    );

    expect(html).toContain('Custom agent tools');
    expect(html).toContain('cloud sync failed');
  });
});
