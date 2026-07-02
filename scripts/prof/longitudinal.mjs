/**
 * scripts/prof/longitudinal.mjs — the roll-up dashboard (design §11 P4).
 * Scans verification-output/prof/term-*​/term-result.json across releases and
 * trends the KPIs, so "did the last content release move teachability?" is a
 * chart, not a memory. Course-mode terms only (instrument-mode is quarantined,
 * §11 term modes).
 */

import fs from 'node:fs/promises';
import path from 'node:path';

export async function collectTerms(profDir) {
  const entries = await fs.readdir(profDir).catch(() => []);
  const terms = [];
  for (const name of entries) {
    if (!name.startsWith('term-')) continue;
    const resultPath = path.join(profDir, name, 'term-result.json');
    try {
      const result = JSON.parse(await fs.readFile(resultPath, 'utf8'));
      terms.push({ termId: name, ...result });
    } catch {
      /* not every term dir has a machine result (live A3 uses timeline-result) */
    }
  }
  return terms.sort((a, b) => String(a.term?.startedAt).localeCompare(String(b.term?.startedAt)));
}

/** Roll KPIs up by arena, course-mode only. */
export function rollUp(terms) {
  const courseTerms = terms.filter((t) => t.term?.mode === 'course');
  const adoption = courseTerms
    .filter((t) => t.kpis?.teachAsIs)
    .map((t) => ({
      termId: t.termId,
      scenario: t.scenario?.id,
      adoptionRate: t.kpis.adoptionRate,
      teachAsIs: t.kpis.teachAsIs.mean,
      ci: t.kpis.teachAsIs.ci95,
      findings: (t.findings || []).length,
    }));
  const classroom = courseTerms
    .filter((t) => t.itemSummary || t.misconceptions)
    .map((t) => ({
      termId: t.termId,
      scenario: t.scenario?.id,
      healthyItems: t.itemSummary?.healthyFraction ?? null,
      repairRate: t.misconceptions?.repairRate ?? null,
      complianceDegradation: t.complianceRobustness?.degradation ?? null,
      coverage: t.coverage ? `${t.coverage.covered}/${t.coverage.total}` : null,
    }));
  return {
    generatedFrom: terms.length,
    courseTerms: courseTerms.length,
    adoption,
    classroom,
    latestAdoption: adoption[adoption.length - 1] || null,
  };
}

export function renderRollUp(rollup) {
  const lines = [
    '# Prof Longitudinal Roll-Up',
    '',
    `_SIMULATED — course-mode terms only (${rollup.courseTerms} of ${rollup.generatedFrom})_`,
    '',
  ];
  lines.push('## Adoption (A1) trend');
  lines.push('');
  lines.push('| term | scenario | adoption | teach-as-is | CI | findings |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const row of rollup.adoption) {
    lines.push(
      `| ${row.termId.slice(5, 24)} | ${row.scenario} | ${row.adoptionRate ?? 'n/a'} | ${row.teachAsIs ?? 'n/a'} | ${row.ci ? `${row.ci[0]}–${row.ci[1]}` : 'n/a'} | ${row.findings} |`,
    );
  }
  lines.push('');
  lines.push('## Classroom (A2) trend');
  lines.push('');
  lines.push('| term | scenario | healthy items | repair rate | compliance loss | coverage |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const row of rollup.classroom) {
    lines.push(
      `| ${row.termId.slice(5, 24)} | ${row.scenario} | ${row.healthyItems ?? 'n/a'} | ${row.repairRate ?? 'n/a'} | ${row.complianceDegradation ?? 'n/a'} | ${row.coverage ?? 'n/a'} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}
