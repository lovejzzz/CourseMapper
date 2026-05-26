import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_AUDIT_PROJECTS,
  MESSY_IMPORT_STRESS_PROJECT,
  PIPELINE_FEATURES,
  auditHybridPipelineCase,
  buildHybridPipelineAudit,
  closeHybridPipelineAuditRuntime,
  loadHybridPipelineAuditRuntime,
  renderHybridPipelineAuditMarkdown,
  writeHybridPipelineAudit,
} from '../hybridPipelineAudit.mjs';

describe('hybrid pipeline audit', () => {
  it('audits compiled v0.8 deliverables and ranks remaining model work', async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coursemapper-hybrid-audit-'));
    try {
      const payload = await buildHybridPipelineAudit({
        projects: DEFAULT_AUDIT_PROJECTS.slice(0, 1),
        scopes: [5],
        includeStress: false,
      });

      expect(payload.summary.status).toBe('pass');
      expect(payload.summary.savedCalls).toBeGreaterThan(0);
      expect(payload.summary.hybridCalls).toBeLessThan(payload.summary.baselineCalls);
      expect(payload.summary.compiledFeatureCount).toBe(9);
      expect(payload.summary.modelFeatureCount).toBe(0);
      expect(payload.summary.minQuality).toBeGreaterThanOrEqual(6);
      expect(payload.results.every((result) => result.summary.warningCount === 0)).toBe(true);
      expect(payload.results[0].compiledFeatures).toEqual([
        'syllabus',
        'lessonPlans',
        'slideDecks',
        'assignments',
        'rubrics',
        'discussions',
        'quizBank',
        'studyGuides',
        'courseFaq',
      ]);
      expect(payload.results[0].modelFeatures).toEqual([]);
      expect(payload.summary.savedPercent).toBeGreaterThan(70);
      expect(payload.nextActions.some((action) => /audit:pipeline/.test(action.title))).toBe(true);
      expect(payload.nextActions.some((action) => /Lesson Plans/.test(action.title))).toBe(false);
      expect(payload.nextActions.some((action) => /subject-specific phrasing/i.test(action.title))).toBe(false);

      const paths = await writeHybridPipelineAudit(payload, outputDir);
      const markdown = await fs.readFile(paths.markdownPath, 'utf8');

      expect(renderHybridPipelineAuditMarkdown(payload)).toContain('CourseMapper Hybrid Pipeline Audit');
      expect(renderHybridPipelineAuditMarkdown(payload)).toContain('## Feature Source Matrix');
      expect(renderHybridPipelineAuditMarkdown(payload)).toContain('## Trust Evidence Matrix');
      expect(renderHybridPipelineAuditMarkdown(payload)).toContain('## Quality Gate Matrix');
      expect(markdown).toContain('Compiled Features | Model-Generated Features');
      expect(markdown).toContain(
        'Repaired Course-Map Fields | Repair Evidence | Delivery Path | Human Review Recommendation',
      );
      expect(markdown).toContain(
        'Validators | Quality Floor | Workspace Readiness | Classroom Readiness | Human Review Recommendation',
      );
      expect(markdown).toContain(
        'syllabus, lessonPlans, slideDecks, assignments, rubrics, discussions, quizBank, studyGuides, courseFaq',
      );
      expect(markdown).toContain(
        '| research-methods | 5 | syllabus, lessonPlans, slideDecks, assignments, rubrics, discussions, quizBank, studyGuides, courseFaq |  |',
      );
      expect(markdown).toContain('| research-methods | 5 | 0 | none | 9 compiled / 0 model-generated |');
      expect(markdown).toContain(
        'Spot-check institution-specific facts, official dates, and copyrighted readings before handoff.',
      );
      expect(markdown).toContain('Cost comparison');
      await expect(fs.stat(paths.jsonPath)).resolves.toMatchObject({ isFile: expect.any(Function) });
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('records repaired course-map inputs as trust evidence before compile', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const project = {
        id: 'repair-evidence-fixture',
        courseMap: {
          ...DEFAULT_AUDIT_PROJECTS[0].courseMap,
          lessons: DEFAULT_AUDIT_PROJECTS[0].courseMap.lessons.slice(0, 5).map((lesson, index) =>
            index !== 0
              ? lesson
              : {
                  ...lesson,
                  title: 'TBD',
                  sections: lesson.sections.map((section) => ({
                    ...section,
                    learningGoals: '',
                    weeklyAssessments: 'To be determined',
                  })),
                },
          ),
        },
        vocabulary: DEFAULT_AUDIT_PROJECTS[0].vocabulary,
      };

      const result = auditHybridPipelineCase({
        project,
        scope: 5,
        runtime,
        features: PIPELINE_FEATURES,
      });

      expect(result.courseMapRepair.changed).toBe(true);
      expect(result.courseMapRepair.repairedFieldCount).toBe(3);
      expect(result.trustEvidence.repairSummary).toContain('Lesson 1 title');
      expect(result.trustEvidence.repairSummary).toContain('+1 more');
      expect(result.trustEvidence.deliveryPath).toBe('9 compiled / 0 model-generated');
      expect(result.reviewRecommendation).toBe(
        'Spot-check repaired course-map fields plus institution-specific facts before handoff.',
      );

      const markdown = renderHybridPipelineAuditMarkdown({
        meta: { generatedAt: '2026-05-26T00:00:00.000Z' },
        summary: {
          status: 'pass',
          releaseCaseCount: 1,
          stressCaseCount: 0,
          baselineCalls: result.cost.baselineDeliverableCalls,
          hybridCalls: result.cost.hybridDeliverableCalls,
          savedCalls: result.cost.savedCalls,
          savedPercent: result.cost.savedPercent,
          compiledFeatureCount: result.compiledFeatures.length,
          modelFeatureCount: result.modelFeatures.length,
          minQuality: result.summary.minQuality,
          sparseRepairFields: result.courseMapRepair.repairedFieldCount,
          blockers: 0,
          warnings: 0,
        },
        nextActions: [],
        results: [result],
      });

      expect(markdown).toContain('| repair-evidence-fixture | 5 | 3 | Lesson 1 title;');
      expect(markdown).toContain('+1 more | 9 compiled / 0 model-generated |');
      expect(markdown).toContain(
        'Spot-check repaired course-map fields plus institution-specific facts before handoff.',
      );
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });

  it('covers a messy imported clinical studio map in stress reporting', async () => {
    const runtime = await loadHybridPipelineAuditRuntime();
    try {
      const result = auditHybridPipelineCase({
        project: MESSY_IMPORT_STRESS_PROJECT,
        scope: 5,
        runtime,
        features: PIPELINE_FEATURES,
      });

      expect(result.stress).toBe(true);
      expect(result.stressFocus).toBe('Messy imported clinical studio map');
      expect(result.summary.status).toBe('pass');
      expect(result.courseMapRepair.changed).toBe(true);
      expect(result.courseMapRepair.repairedFieldCount).toBeGreaterThanOrEqual(6);
      expect(result.reviewRecommendation).toBe(
        'Spot-check repaired course-map fields plus institution-specific facts before handoff.',
      );
      expect(result.findings.some((finding) => /repeats the same boilerplate/.test(finding.message))).toBe(false);

      const payload = await buildHybridPipelineAudit({
        runtime,
        projects: DEFAULT_AUDIT_PROJECTS.slice(0, 1),
        scopes: [5, 8, 14],
      });
      const markdown = renderHybridPipelineAuditMarkdown(payload);

      expect(payload.summary.stressCaseCount).toBe(6);
      expect(markdown).toContain('## Stress Case Matrix');
      expect(markdown).toContain('| messy-import-stress | 5 | pass |');
      expect(markdown).toContain('| messy-import-stress | 8 | pass |');
      expect(markdown).toContain('| messy-import-stress | 14 | pass |');
      expect(markdown).toContain('Messy imported clinical studio map');
      expect(
        payload.results.filter((entry) => entry.projectId === 'messy-import-stress').map((entry) => entry.scope),
      ).toEqual([5, 8, 14]);
      expect(payload.nextActions.some((action) => /messy-import stress cases/i.test(action.title))).toBe(false);
    } finally {
      await closeHybridPipelineAuditRuntime();
    }
  });
});
