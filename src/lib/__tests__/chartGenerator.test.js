import { describe, it, expect } from 'vitest';
import { buildChartUrl, generateColors, getChartTypes } from '../chartGenerator';

// ── buildChartUrl ────────────────────────────────────────────────────────────

describe('buildChartUrl', () => {
  const baseSpec = {
    type: 'bar',
    labels: ['A', 'B', 'C'],
    datasets: [{ label: 'Series 1', data: [10, 20, 30] }],
  };

  it('generates a valid QuickChart URL', () => {
    const url = buildChartUrl(baseSpec);
    expect(url).toContain('https://quickchart.io/chart?c=');
  });

  it('includes default width=600 and height=400', () => {
    const url = buildChartUrl(baseSpec);
    expect(url).toContain('w=600');
    expect(url).toContain('h=400');
  });

  it('includes title when provided', () => {
    const url = buildChartUrl({ ...baseSpec, title: 'My Chart' });
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain('"title"');
    expect(decoded).toContain('My Chart');
  });

  it('omits scales for pie charts', () => {
    const url = buildChartUrl({ ...baseSpec, type: 'pie' });
    const decoded = decodeURIComponent(url);
    const config = JSON.parse(decoded.split('c=')[1].split('&')[0]);
    expect(config.options.scales).toBeUndefined();
  });

  it('omits scales for doughnut charts', () => {
    const url = buildChartUrl({ ...baseSpec, type: 'doughnut' });
    const decoded = decodeURIComponent(url);
    const config = JSON.parse(decoded.split('c=')[1].split('&')[0]);
    expect(config.options.scales).toBeUndefined();
  });

  it('includes scales for bar charts', () => {
    const url = buildChartUrl(baseSpec);
    const decoded = decodeURIComponent(url);
    const config = JSON.parse(decoded.split('c=')[1].split('&')[0]);
    expect(config.options.scales).toBeDefined();
    expect(config.options.scales.y).toBeDefined();
    expect(config.options.scales.x).toBeDefined();
  });

  it('sets fill:false for line charts', () => {
    const url = buildChartUrl({ ...baseSpec, type: 'line' });
    const decoded = decodeURIComponent(url);
    const config = JSON.parse(decoded.split('c=')[1].split('&')[0]);
    expect(config.data.datasets[0].fill).toBe(false);
  });

  it('shows legend only for multi-dataset charts', () => {
    // Single dataset — legend hidden
    const singleUrl = buildChartUrl(baseSpec);
    const singleDecoded = decodeURIComponent(singleUrl);
    const singleConfig = JSON.parse(singleDecoded.split('c=')[1].split('&')[0]);
    expect(singleConfig.options.plugins.legend.display).toBe(false);

    // Multiple datasets — legend shown
    const multiSpec = {
      ...baseSpec,
      datasets: [
        { label: 'Series 1', data: [10, 20, 30] },
        { label: 'Series 2', data: [5, 15, 25] },
      ],
    };
    const multiUrl = buildChartUrl(multiSpec);
    const multiDecoded = decodeURIComponent(multiUrl);
    const multiConfig = JSON.parse(multiDecoded.split('c=')[1].split('&')[0]);
    expect(multiConfig.options.plugins.legend.display).toBe(true);
  });
});

// ── generateColors ───────────────────────────────────────────────────────────

describe('generateColors', () => {
  it('returns correct count of colors', () => {
    const colors = generateColors(3);
    expect(colors).toHaveLength(3);
  });

  it('returns empty array for count 0', () => {
    expect(generateColors(0)).toHaveLength(0);
  });

  it('cycles palette for count greater than 8', () => {
    const colors = generateColors(10, 1);
    expect(colors).toHaveLength(10);
    // 9th color (index 8) should equal 1st color (index 0)
    expect(colors[8]).toBe(colors[0]);
    // 10th color (index 9) should equal 2nd color (index 1)
    expect(colors[9]).toBe(colors[1]);
  });

  it('applies alpha value', () => {
    const colors = generateColors(1, 0.5);
    expect(colors[0]).toContain('0.5');
  });
});

// ── getChartTypes ────────────────────────────────────────────────────────────

describe('getChartTypes', () => {
  it('returns array containing expected chart types', () => {
    const types = getChartTypes();
    expect(Array.isArray(types)).toBe(true);
    expect(types).toContain('bar');
    expect(types).toContain('line');
    expect(types).toContain('pie');
    expect(types).toContain('doughnut');
    expect(types).toContain('radar');
    expect(types).toContain('polarArea');
  });
});
