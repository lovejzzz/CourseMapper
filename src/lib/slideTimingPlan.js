function text(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function slideMinutes(slide = {}) {
  const numeric = Number(slide.minutes);
  if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  const match = text(slide.timer).match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function timingMinimum(slide = {}, currentMinutes = slideMinutes(slide)) {
  const type = text(slide.type).toLowerCase();
  if (type === 'activity') return currentMinutes;
  if (type === 'discussion') return Math.min(currentMinutes, 6);
  if (type === 'example') return Math.min(currentMinutes, 4);
  if (type === 'objectives') return Math.min(currentMinutes, 3);
  if (['bridge', 'keyterm', 'summary', 'closing'].includes(type)) return Math.min(currentMinutes, 3);
  if (type === 'agenda') return Math.min(currentMinutes, 2);
  if (type === 'title') return Math.min(currentMinutes, 1);
  return Math.min(currentMinutes, 3);
}

function compressionPriority(slide = {}) {
  const type = text(slide.type).toLowerCase();
  if (type === 'content' && slide.enrichmentSource) return 0;
  if (type === 'content') return 1;
  if (type === 'example') return 2;
  if (['keyterm', 'bridge'].includes(type)) return 3;
  if (['summary', 'objectives'].includes(type)) return 4;
  if (['agenda', 'closing', 'title'].includes(type)) return 5;
  if (type === 'discussion') return 6;
  if (type === 'activity') return 7;
  return 2;
}

// Enrichment can add worked examples, misconception checks, and evidence
// slides after the base lesson is planned. Fit the final sequence to the
// approved live-session budget while protecting the main activity and keeping
// every displayed timer honest.
export function rebalanceSlideTimingToSession(slides = [], sessionMinutes = 0) {
  const targetMinutes = Number(sessionMinutes);
  const originalMinutes = slides.reduce((sum, slide) => sum + slideMinutes(slide), 0);
  if (!Number.isFinite(targetMinutes) || targetMinutes <= 0 || originalMinutes <= targetMinutes) {
    return { originalMinutes, slideMinutes: originalMinutes, adjustedSlideCount: 0 };
  }

  const rows = slides.map((slide) => {
    const minutes = slideMinutes(slide);
    return {
      slide,
      original: minutes,
      minutes,
      minimum: timingMinimum(slide, minutes),
      priority: compressionPriority(slide),
    };
  });
  let overflow = originalMinutes - targetMinutes;
  for (let priority = 0; priority <= 7 && overflow > 0; priority += 1) {
    const group = rows.filter((row) => row.priority === priority);
    let changed = true;
    while (overflow > 0 && changed) {
      changed = false;
      for (const row of group) {
        if (overflow <= 0) break;
        if (row.minutes <= row.minimum) continue;
        row.minutes -= 1;
        overflow -= 1;
        changed = true;
      }
    }
  }

  // Very short sessions compress non-practice slides to one minute before a
  // depth slide becomes a reference handout; the core activity stays intact.
  for (const row of rows.filter((entry) => entry.priority < 6)) {
    if (overflow <= 0) break;
    if (row.minutes <= 1) continue;
    const reduction = Math.min(overflow, row.minutes - 1);
    row.minutes -= reduction;
    overflow -= reduction;
  }
  if (overflow > 0) {
    const depthRows = rows
      .filter((row) => row.priority <= 1)
      .slice(1)
      .reverse();
    for (const row of depthRows) {
      if (overflow <= 0) break;
      const reduction = Math.min(overflow, row.minutes);
      row.minutes -= reduction;
      overflow -= reduction;
      if (row.minutes === 0) row.slide.deliveryMode = 'reference-or-asynchronous';
    }
  }

  for (const row of rows) {
    if (row.minutes === row.original) continue;
    if (Object.prototype.hasOwnProperty.call(row.slide, 'minutes')) row.slide.minutes = row.minutes;
    if (Object.prototype.hasOwnProperty.call(row.slide, 'timer')) {
      row.slide.timer = row.minutes > 0 ? `${row.minutes} min` : 'Reference';
    }
    row.slide.timingAdjustedFromMinutes = row.original;
  }
  return {
    originalMinutes,
    slideMinutes: rows.reduce((sum, row) => sum + row.minutes, 0),
    adjustedSlideCount: rows.filter((row) => row.minutes !== row.original).length,
    unallocatedOverflowMinutes: Math.max(0, overflow),
  };
}
