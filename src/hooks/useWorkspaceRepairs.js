/**
 * useWorkspaceRepairs — v0.15.3 C1 (diet phase 2): the deterministic
 * readiness-repair callback, extracted VERBATIM from AppFlow.
 *
 * One job: apply the safe course-map + deliverable readiness repairs and
 * report what changed. Consumed as ChatPanel's onAutoRepairReadiness and by
 * the finish-pass retry loop. Moved, not improved — zero behavior change.
 */
import { useCallback } from 'react';

import {
  evaluateWorkspaceReadiness,
  repairCourseMapReadiness,
  repairWorkspaceReadiness,
} from '../lib/deliverableReadiness';
import { evaluateClassroomReadiness } from '../lib/classroomReadiness';

export default function useWorkspaceRepairs({
  courseMap,
  setCourseMap,
  columns,
  deliverableConfig,
  selectedFeatures,
  deliv,
  delivUndo,
}) {
  return useCallback(
    ({ selectedFeatureIds = selectedFeatures, lessonFilter = null } = {}) => {
      let nextCourseMap = courseMap;
      let nextDeliverables = deliv.deliverables;
      const repairs = [];
      const currentReadiness = evaluateWorkspaceReadiness({
        courseMap,
        deliverables: deliv.deliverables,
        selectedFeatures: selectedFeatureIds,
        columns,
        lessonFilter,
      });
      const currentClassroomReadiness = evaluateClassroomReadiness({
        courseMap,
        deliverables: deliv.deliverables,
        selectedFeatures: selectedFeatureIds,
        lessonFilter,
      });
      const repairableFeatureIds = new Set(
        [...currentReadiness.issues, ...currentClassroomReadiness.issues].map((issue) => issue.featureId),
      );

      if (Array.isArray(nextCourseMap?.lessons) && nextCourseMap.lessons.length > 0) {
        const courseMapRepair = repairCourseMapReadiness({
          courseMap: nextCourseMap,
          columns,
          lessonFilter,
        });
        if (courseMapRepair.changed) {
          nextCourseMap = courseMapRepair.courseMap;
          setCourseMap(courseMapRepair.courseMap);
          repairs.push({
            featureId: 'courseMap',
            label: 'Course Map',
            changes: courseMapRepair.repairedFields,
            message: `Course Map repaired: ${courseMapRepair.repairedFields.join('; ')}`,
          });
        }
      }

      if (repairableFeatureIds.size === 0 && repairs.length === 0) {
        return {
          changed: false,
          applied: 0,
          repairs: [],
          courseMap: nextCourseMap,
          deliverables: nextDeliverables,
        };
      }

      const deliverableFeatureIds = selectedFeatureIds.filter(
        (featureId) => featureId !== 'courseMap' && repairableFeatureIds.has(featureId),
      );
      const deliverableRepair =
        deliverableFeatureIds.length > 0
          ? repairWorkspaceReadiness({
              courseMap: nextCourseMap,
              deliverables: deliv.deliverables,
              selectedFeatures: deliverableFeatureIds,
              deliverableConfig,
            })
          : { changed: false, repairs: [], deliverables: deliv.deliverables };

      if (deliverableRepair.changed) {
        nextDeliverables = deliverableRepair.deliverables;
        for (const repair of deliverableRepair.repairs) {
          const previousData = deliv.deliverables?.[repair.featureId]?.data;
          if (previousData) delivUndo.snapshot(repair.featureId, previousData);
        }
        deliv.setDeliverables(deliverableRepair.deliverables);
        repairs.push(...deliverableRepair.repairs);
      }

      return {
        changed: repairs.length > 0,
        applied: repairs.length,
        repairs,
        courseMap: nextCourseMap,
        deliverables: nextDeliverables,
      };
    },
    [
      columns,
      courseMap,
      deliv.deliverables,
      deliv.setDeliverables,
      deliverableConfig,
      delivUndo.snapshot,
      selectedFeatures,
      setCourseMap,
    ],
  );
}
