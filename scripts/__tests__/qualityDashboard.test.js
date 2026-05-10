import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  appendActivityEntry,
  buildRunSummary,
  readActivityLog,
  summarizeQualityResults,
  writeQualityDashboard,
} from '../qualityDashboard.mjs';

describe('quality dashboard utilities', () => {
  it('summarizes results and writes a self-contained dashboard', async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coursemapper-dashboard-'));
    const latestPayload = {
      meta: {
        generatedAt: '2026-05-10T12:00:00.000Z',
        provider: 'openai',
        model: 'gpt-5.4-mini',
        target: 90,
        parallel: 3,
      },
      results: [
        {
          projectId: 'research-methods',
          scope: 5,
          featureId: 'syllabus',
          score: 92,
          findings: [],
          iterations: [{ diff: 'Initial generation baseline.' }],
        },
        {
          projectId: 'ai-course-design',
          scope: 5,
          featureId: 'courseFaq',
          score: 84,
          findings: ['Increase lesson coverage.'],
          iterations: [{ diff: 'score 80->84 (+4)' }],
        },
      ],
    };

    const stats = summarizeQualityResults(latestPayload.results, 90);
    expect(stats.passing).toBe(1);
    expect(stats.failing).toBe(1);
    expect(buildRunSummary(latestPayload.results, 90)).toContain('1/2 deliverables reached A-');

    const activity = await appendActivityEntry(outputDir, {
      type: 'fix',
      summary: 'Raised FAQ specificity and coverage.',
      stats,
    });
    const dashboardPath = await writeQualityDashboard(outputDir, latestPayload, activity);
    const html = await fs.readFile(dashboardPath, 'utf8');

    expect(activity).toHaveLength(1);
    await expect(readActivityLog(outputDir)).resolves.toHaveLength(1);
    expect(html).toContain('CourseMapper Deliverable Quality');
    expect(html).toContain('research-methods');
    expect(html).toContain('Raised FAQ specificity and coverage.');
    expect(html).toContain("link.href = './' + result.projectId + '/scope-'");
  });
});
