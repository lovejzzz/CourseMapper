import type { Course } from './domain';
import type { MaterialBlock } from './materials';
import { referenceFormatting, referenceText } from './references';
import type { RichNode } from './richText';
import { resolveCalculations } from './verify';

/** Apply presentation prefixes and calculated values to the rich field without
 * ever letting an old formatting snapshot replace newer canonical content. */
export function formattedBlock(course: Course, block: Pick<MaterialBlock, 'text' | 'reference'>): RichNode | undefined {
  const ref = block.reference;
  if (!ref) return;
  const format = referenceFormatting(course, ref);
  if (!format) return;
  const raw = referenceText(course, ref);
  const rich = structuredClone(format);
  if (block.text === raw) return rich;
  if (block.text.endsWith(raw) && raw) {
    const prefix = block.text.slice(0, -raw.length);
    const first = rich.content?.[0];
    if (first && ['paragraph', 'heading'].includes(first.type)) {
      first.content = [{ type: 'text', text: prefix }, ...(first.content ?? [])];
      return rich;
    }
  }
  if (ref.kind === 'task' || ref.kind === 'lesson') {
    const lesson = course.lessons[ref.lessonId];
    const part =
      ref.kind === 'task'
        ? lesson.activities.find((task) => task.id === ref.taskId)
        : ref.path[0] === 'workedExample'
          ? lesson.workedExample
          : ref.path[0] === 'exitTicket'
            ? lesson.exitTicket
            : undefined;
    if (part && resolveCalculations(raw, part) === block.text) {
      const visit = (node: RichNode) => {
        if (node.text) node.text = resolveCalculations(node.text, part);
        node.content?.forEach(visit);
      };
      visit(rich);
      return rich;
    }
  }
  return undefined;
}
