#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AGENT_CLOSED_LOOP_SCENARIOS,
  EXPORT_TORTURE_SCENARIOS,
  LIVE_PROVIDER_SCENARIOS,
  QUALITY_RED_TEAM_SCENARIOS,
  RECOVERY_SCENARIOS,
  validateV0858ScenarioInventory,
} from '../tests/lib/v0858RedTeamScenarios.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outputDir = path.join(repoRoot, 'verification-output', 'v0.8.58-red-team');
const jsonPath = path.join(outputDir, 'latest.json');
const markdownPath = path.join(outputDir, 'latest.md');

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || 'unknown';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function renderCountRows(counts) {
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, count]) => `| ${label} | ${count} |`)
    .join('\n');
}

function commandList() {
  return [
    'npm run test:v0858:agent',
    'npm run audit:v0858:red-team',
    'npm run audit:v0858:sweep',
    'npm run audit:agent:openai',
    'npm run test:e2e',
    'npm run audit:gold',
    'npm run build',
  ];
}

function renderMarkdown(report) {
  return `# CourseMapper v0.8.58 Red-Team Audit

Generated: ${report.generatedAt}

Status: **${report.status.toUpperCase()}**

This report verifies the v0.8.58 adversarial scenario inventory and release-gate coverage targets. It does not replace the heavier browser, live-provider, and export sweeps; it makes those obligations explicit and repeatable.

## Coverage

| Lane | Scenarios | Minimum |
| --- | ---: | ---: |
| Agent closed loop | ${report.counts.agentClosedLoop} | ${report.minimums.agentClosedLoop} |
| Export torture | ${report.counts.exportTorture} | ${report.minimums.exportTorture} |
| Recovery | ${report.counts.recovery} | ${report.minimums.recovery} |
| Generated quality | ${report.counts.quality} | ${report.minimums.quality} |
| Live provider | ${report.counts.liveProvider} | ${report.minimums.liveProvider} |

Total named scenarios: **${report.totalScenarios}**

## Agent Risk Categories

| Category | Scenarios |
| --- | ---: |
${renderCountRows(report.agentCategories)}

## Recovery Project States

| State | Scenarios |
| --- | ---: |
${renderCountRows(report.recoveryStates)}

## Export Scopes

| Lesson scope | Scenarios |
| --- | ---: |
${renderCountRows(report.exportScopes)}

## Required Release Commands

${report.commands.map((command) => `- \`${command}\``).join('\n')}

## Result

${
  report.errors.length === 0
    ? 'No v0.8.58 red-team inventory gaps found.'
    : report.errors.map((error) => `- ${error}`).join('\n')
}
`;
}

function buildReport() {
  const validation = validateV0858ScenarioInventory();
  const counts = {
    agentClosedLoop: AGENT_CLOSED_LOOP_SCENARIOS.length,
    exportTorture: EXPORT_TORTURE_SCENARIOS.length,
    recovery: RECOVERY_SCENARIOS.length,
    quality: QUALITY_RED_TEAM_SCENARIOS.length,
    liveProvider: LIVE_PROVIDER_SCENARIOS.length,
  };

  return {
    generatedAt: new Date().toISOString(),
    status: validation.ok ? 'pass' : 'fail',
    errors: validation.errors,
    totalScenarios: Object.values(counts).reduce((sum, count) => sum + count, 0),
    counts,
    minimums: validation.summary.minimums,
    agentCategories: validation.summary.byAgentCategory,
    recoveryStates: countBy(RECOVERY_SCENARIOS, 'projectState'),
    exportScopes: countBy(EXPORT_TORTURE_SCENARIOS, 'lessonScope'),
    commands: commandList(),
  };
}

function main() {
  const report = buildReport();

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(markdownPath, renderMarkdown(report));

  console.log(`v0.8.58 red-team audit: ${report.status}`);
  console.log(`Scenarios: ${report.totalScenarios}`);
  console.log(`Report: ${path.relative(repoRoot, markdownPath)}`);

  if (report.errors.length > 0) {
    for (const error of report.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  }
}

main();
