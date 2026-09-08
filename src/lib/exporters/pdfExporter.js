import { resolveFeatureLabel } from './exporterUtils.js';
import { deliverableToCsvRows } from './csvExporter.js';
import { assertTableRowsHaveNoInternalExportLanguage } from '../exportTextInspector.js';
import { deliverablePdfDefinition, downloadClassroomPdf } from './classroomPdf.js';

export async function exportDeliverablePdf(featureId, data, courseName, options = {}) {
  const label = resolveFeatureLabel(featureId) + (options.audience === 'student' ? ' - Student' : '');
  const table = deliverableToCsvRows(featureId, data);
  if (!table.rows.length) throw new Error('No data to export');
  assertTableRowsHaveNoInternalExportLanguage(table, label, 'PDF');
  return downloadClassroomPdf(
    deliverablePdfDefinition(featureId, data, courseName, options),
    `${courseName || 'Course'} - ${label}.pdf`,
  );
}
