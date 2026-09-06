import { resolveFeatureLabel } from './exporterUtils.js';
import { deliverableToCsvRows } from './csvExporter.js';
import { assertTableRowsHaveNoInternalExportLanguage } from '../exportTextInspector.js';
import { deliverablePdfDefinition, downloadClassroomPdf } from './classroomPdf.js';

export async function exportDeliverablePdf(featureId, data, courseName) {
  const label = resolveFeatureLabel(featureId);
  const table = deliverableToCsvRows(featureId, data);
  if (!table.rows.length) throw new Error('No data to export');
  assertTableRowsHaveNoInternalExportLanguage(table, label, 'PDF');
  return downloadClassroomPdf(
    deliverablePdfDefinition(featureId, data, courseName),
    `${courseName || 'Course'} - ${label}.pdf`,
  );
}
