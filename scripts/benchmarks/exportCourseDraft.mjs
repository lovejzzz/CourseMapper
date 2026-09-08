// Export an immutable compiler capture using the actual application exporters.
// DOCX/PDF inspection does not certify PPTX, application restore, or pedagogy.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { buildDeliverableDocxBlob } from '../../src/lib/exporters/bulkDocxExporter.js';
import { buildClassroomPdfBlob, deliverablePdfDefinition } from '../../src/lib/exporters/classroomPdf.js';

const [input, output, selection = 'rubrics,studyGuides', audience = 'teacher'] = process.argv.slice(2);
assert(input && output, 'Provide a project.coursemapper and a new export directory.');
const bytes = await fs.readFile(input);
const project = JSON.parse(bytes);
assert(['teacher', 'student'].includes(audience), 'Choose teacher or student audience.');
const features = selection.split(',');
const allowed = new Set([
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
assert(features.length && new Set(features).size === features.length, 'Choose distinct material IDs.');
for (const feature of features) {
  assert(allowed.has(feature) && project.deliverables?.[feature]?.data, `Missing/unsupported material: ${feature}`);
}
await fs.mkdir(output, { recursive: false });
const actualFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (typeof url === 'string' && /^\/studio-public\/fonts\/[A-Za-z0-9-]+\.otf(?:\?|$)/.test(url)) {
    return new Response(await fs.readFile(path.resolve(url.split('?')[0].slice(1))));
  }
  return actualFetch(url, options);
};
const files = [];
try {
  for (const feature of features) {
    const data = project.deliverables[feature].data;
    for (const format of ['docx', 'pdf']) {
      const blob =
        format === 'docx'
          ? await buildDeliverableDocxBlob(feature, data, project.courseMap.courseName, { audience })
          : await buildClassroomPdfBlob(
              deliverablePdfDefinition(feature, data, project.courseMap.courseName, { audience }),
            );
      const content = Buffer.from(await blob.arrayBuffer());
      const name = `${feature}.${format}`;
      await fs.writeFile(path.join(output, name), content, { flag: 'wx' });
      files.push({ name, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') });
    }
  }
} finally {
  globalThis.fetch = actualFetch;
}
await fs.writeFile(
  path.join(output, 'exports.json'),
  JSON.stringify(
    {
      projectSha256: createHash('sha256').update(bytes).digest('hex'),
      createdAt: new Date().toISOString(),
      status: 'exported; visual and educational review pending',
      modelCalls: 0,
      audience,
      files,
    },
    null,
    2,
  ),
  { flag: 'wx' },
);
console.log(JSON.stringify({ output, files: files.map(({ name }) => name), modelCalls: 0 }));
