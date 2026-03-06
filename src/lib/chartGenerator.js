/**
 * chartGenerator.js — Builds QuickChart URLs from chart specifications.
 * QuickChart renders Chart.js configs server-side, no API key needed.
 * Free: 100K images/month.
 */

export function buildChartUrl(spec, options = {}) {
  const { width = 600, height = 400, backgroundColor = 'white', format = 'png' } = options;

  const config = {
    type: spec.type || 'bar',
    data: {
      labels: spec.labels || [],
      datasets: (spec.datasets || []).map(ds => ({
        label: ds.label || '',
        data: ds.data || [],
        backgroundColor: ds.backgroundColor || generateColors(ds.data?.length || 0, 0.6),
        borderColor: ds.borderColor || generateColors(ds.data?.length || 0, 1),
        borderWidth: ds.borderWidth || 1,
        ...(spec.type === 'line' ? { fill: ds.fill ?? false, tension: ds.tension ?? 0.3 } : {}),
      })),
    },
    options: {
      responsive: true,
      plugins: {
        title: spec.title ? { display: true, text: spec.title, font: { size: 16 } } : undefined,
        legend: { display: (spec.datasets || []).length > 1 },
      },
      scales: spec.type !== 'pie' && spec.type !== 'doughnut' ? {
        y: { beginAtZero: true, title: spec.yLabel ? { display: true, text: spec.yLabel } : undefined },
        x: { title: spec.xLabel ? { display: true, text: spec.xLabel } : undefined },
      } : undefined,
    },
  };

  const encoded = encodeURIComponent(JSON.stringify(config));
  return `https://quickchart.io/chart?c=${encoded}&w=${width}&h=${height}&bkg=${encodeURIComponent(backgroundColor)}&f=${format}`;
}

// Generate distinct colors for chart elements
export function generateColors(count, alpha = 1) {
  const palette = [
    `rgba(54, 162, 235, ${alpha})`,   // blue
    `rgba(255, 99, 132, ${alpha})`,   // red
    `rgba(75, 192, 192, ${alpha})`,   // teal
    `rgba(255, 206, 86, ${alpha})`,   // yellow
    `rgba(153, 102, 255, ${alpha})`,  // purple
    `rgba(255, 159, 64, ${alpha})`,   // orange
    `rgba(46, 204, 113, ${alpha})`,   // green
    `rgba(231, 76, 60, ${alpha})`,    // dark red
  ];
  return Array.from({ length: count }, (_, i) => palette[i % palette.length]);
}

export function getChartTypes() {
  return ['bar', 'line', 'pie', 'doughnut', 'radar', 'polarArea', 'horizontalBar'];
}
