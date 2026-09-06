import fs from 'node:fs/promises';
import { buildDeliverableDocxBlob } from '../../src/lib/exporters/bulkDocxExporter.js';
import { buildClassroomPdfBlob, deliverablePdfDefinition } from '../../src/lib/exporters/classroomPdf.js';
import { slideDeckPdfDefinition } from '../../src/lib/exporters/slideDeckPdfExporter.js';
import { buildSlideDeckPptxBlob } from '../../src/lib/exporters/pptxExporter.js';
import { deliverableToCsvRows } from '../../src/lib/exporters/csvExporter.js';
import { buildCourseMaterialsZip } from '../../src/lib/packageZipExporter.js';
import { evaluateWorkspaceReadiness } from '../../src/lib/deliverableReadiness.js';
import {
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  BLUEPRINT_COMPILE_CONTEXT,
  reconcileCourseMapWithBlueprintSemanticAdmission,
} from '../../src/lib/courseBlueprintCompiler.js';
import { ACCEPTANCE_FEATURES } from '../../scripts/benchmarks/classroomAcceptance.mjs';
import JSZip from 'jszip';
import { auditCourseMaterialsZip } from '../../tests/lib/exportQualityAudit.js';
const root = process.argv[3] || '.audit-work/v019-classroom-samples';
const caseId = process.argv[2];
if (!['d-c04-recurring', 'd-s02-same-event-conflict', 'd-e03-order-effects'].includes(caseId))
  throw new Error('Choose one of the three documented workshop sample cases.');
const fixture = JSON.parse(await fs.readFile(`benchmarks/classroom/v2/cases/${caseId}.json`, 'utf8'));
const title = {
  'd-c04-recurring': 'Proportions and Rounding',
  'd-s02-same-event-conflict': 'Conflicting Historical Records',
  'd-e03-order-effects': 'Fair Comparisons and Order Effects',
}[caseId];
const map = {
  courseName: title,
  lessons: [
    {
      title,
      sections: [
        {
          learningGoals: fixture.request,
          topicSection: title,
          learningObjectives: fixture.request,
          weeklyAssessments: 'A reasoned response using the supplied record.',
          asyncActivities: 'After class, revise one reasoning step using the feedback.',
          syncActivities:
            'Read the supplied record, solve the guided task, compare reasoning, and attempt the independent case.',
          technologyNeeded: 'Paper or an accessible text editor; optional calculator for arithmetic.',
          presentationFormat: 'One classroom workshop with individual work and discussion.',
          supportingResources: fixture.sources.map((s, i) => `Source record ${i + 1}: ${s}`).join(' '),
          evaluateDesign:
            'Compare the independent response with its teacher reference and note which reasoning step needs further practice.',
        },
      ],
    },
  ],
};
const sourceBrief = `${fixture.request}\n${fixture.sessionMinutes} minutes.\nSource facts:\n${fixture.sources.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
const blueprint = buildCourseBlueprint(map, {
  sourceBrief,
  sessionMinutes: fixture.sessionMinutes,
  instructorProvidedFacts: fixture.sources,
});
const compiled = compileBlueprintDeliverables(
  blueprint,
  ACCEPTANCE_FEATURES.filter((f) => f !== 'courseMap'),
);
const outputs = {
  courseMap: reconcileCourseMapWithBlueprintSemanticAdmission(map, compiled[BLUEPRINT_COMPILE_CONTEXT]),
  ...compiled,
};
const out = `${root}/${caseId}/exports`;
await fs.mkdir(out, { recursive: true });
await fs.writeFile(`${out}/../outputs.json`, JSON.stringify(outputs, null, 2));
await fs.writeFile(`${out}/../input.json`, JSON.stringify({ map, sourceBrief, modelCalls: 0 }, null, 2));
const features = Object.keys(outputs).filter((x) => x !== 'courseMap');
for (const id of features) {
  if (id === 'slideDecks') {
    const blob = await buildSlideDeckPptxBlob(outputs[id], outputs.courseMap.courseName, 0);
    await fs.writeFile(`${out}/${id}.pptx`, Buffer.from(await blob.arrayBuffer()));
  } else {
    const blob = await buildDeliverableDocxBlob(id, outputs[id], outputs.courseMap.courseName);
    await fs.writeFile(`${out}/${id}.docx`, Buffer.from(await blob.arrayBuffer()));
  }
  const pdfDefinition =
    id === 'slideDecks'
      ? slideDeckPdfDefinition(outputs[id], outputs.courseMap.courseName)
      : deliverablePdfDefinition(id, outputs[id], outputs.courseMap.courseName);
  const pdf = await buildClassroomPdfBlob(pdfDefinition);
  await fs.writeFile(`${out}/${id}.pdf`, Buffer.from(await pdf.arrayBuffer()));
  const table = deliverableToCsvRows(id, outputs[id]);
  const rows = [table.headers, ...table.rows];
  await fs.writeFile(
    `${out}/${id}.csv`,
    rows.map((row) => row.map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n'),
  );
}
const columns = [
  'learningGoals',
  'topicSection',
  'learningObjectives',
  'weeklyAssessments',
  'asyncActivities',
  'syncActivities',
  'technologyNeeded',
  'presentationFormat',
  'supportingResources',
  'evaluateDesign',
].map((key) => ({ key, label: key, enabled: true }));
const deliverables = Object.fromEntries(features.map((id) => [id, { status: 'done', data: outputs[id] }]));
const readiness = evaluateWorkspaceReadiness({
  courseMap: outputs.courseMap,
  deliverables,
  columns,
  selectedFeatures: ['courseMap', ...features],
});
const packageResult = await buildCourseMaterialsZip({
  courseMap: outputs.courseMap,
  courseName: outputs.courseMap.courseName,
  deliverables,
  columns,
  readiness,
  featureIds: ['courseMap', ...features],
  assembleOnly: true,
});
for (const [name, bytes] of Object.entries(packageResult.fileContents)) {
  const dest = `${out}/package/${name}`;
  await fs.mkdir(dest.slice(0, dest.lastIndexOf('/')), { recursive: true });
  await fs.writeFile(dest, typeof bytes === 'string' ? bytes : Buffer.from(bytes));
}
await fs.writeFile(
  `${out}/package-result.json`,
  JSON.stringify(
    {
      files: packageResult.files,
      manifest: packageResult.manifest,
      quality: packageResult.quality,
      qualityReportMarkdown: packageResult.qualityReportMarkdown,
      readiness,
    },
    null,
    2,
  ),
);
console.log(caseId, 'exported', features.length + 1, 'materials', packageResult.files.length, 'package files');

const zip = new JSZip();
for (const [name, bytes] of Object.entries(packageResult.fileContents)) zip.file(name, bytes);
const zipPath = `${out}/course-materials.zip`;
await fs.writeFile(zipPath, await zip.generateAsync({ type: 'nodebuffer' }));
await fs.writeFile(`${out}/zip-audit.json`, JSON.stringify(await auditCourseMaterialsZip(zipPath), null, 2));
