import { useEffect } from 'react';

/**
 * useDeliverableFocusRouter — v0.14.1 (3.5): the symmetric flow of the
 * existing focus-coursemap-cell pattern (AppFlow.focusCourseMapTarget →
 * CourseMapPreview listener).
 *
 * Forward: a course-map assessment chip dispatches
 * 'coursemapper:focus-deliverable' { featureId, lessonNumber, assessmentId,
 * title }. This hook (mounted where the active-tab state lives) switches the
 * workspace tab, then — after the tab has had time to mount — re-dispatches
 * 'coursemapper:focus-deliverable-item' for DeliverableView's scroll +
 * highlight listener.
 *
 * Reverse: a deliverable's "Show in course map" affordance dispatches the
 * EXISTING 'coursemapper:focus-coursemap-cell' event, but CourseMapPreview is
 * unmounted while another tab is active — so when the map tab is not active,
 * reroute through focusCourseMapTarget (which switches the tab and
 * re-dispatches once the preview is mounted). When the map tab IS active the
 * preview's own listener handles the event and this hook stays out of the way.
 */

// Matches the settle delay focusCourseMapTarget already uses for the
// switch-then-redispatch handoff.
export const FOCUS_SETTLE_MS = 160;

export default function useDeliverableFocusRouter({
  activeTab,
  setActiveTab,
  setMobileWorkspaceView,
  focusCourseMapTarget,
}) {
  useEffect(() => {
    const handleFocusDeliverable = (event) => {
      const detail = event.detail || {};
      if (!detail.featureId || detail.featureId === 'courseMap') return;
      setActiveTab(detail.featureId);
      setMobileWorkspaceView?.('content');
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('coursemapper:focus-deliverable-item', { detail }));
      }, FOCUS_SETTLE_MS);
    };

    const handleFocusCourseMapCell = (event) => {
      const target = event.detail || {};
      if (target.type !== 'courseMapCell') return;
      // The preview is mounted and handles its own event on the map tab; the
      // re-dispatch from focusCourseMapTarget lands after the tab switch, so
      // this guard also terminates the reroute cycle.
      if (activeTab === 'courseMap') return;
      focusCourseMapTarget?.(target);
    };

    window.addEventListener('coursemapper:focus-deliverable', handleFocusDeliverable);
    window.addEventListener('coursemapper:focus-coursemap-cell', handleFocusCourseMapCell);
    return () => {
      window.removeEventListener('coursemapper:focus-deliverable', handleFocusDeliverable);
      window.removeEventListener('coursemapper:focus-coursemap-cell', handleFocusCourseMapCell);
    };
  }, [activeTab, setActiveTab, setMobileWorkspaceView, focusCourseMapTarget]);
}
