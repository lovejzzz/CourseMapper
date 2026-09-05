const GROUNDING_TOOL_NAMES = new Set([
  'inspect_workspace',
  'validate_course',
  'review_package_readiness',
  'compare_deliverables',
  'read_lesson',
  'read_rendered',
  'read_deliverable',
  'search_course',
  'explain_design',
]);

const LESSON_WORD_INDEX = {
  one: 0,
  two: 1,
  three: 2,
  four: 3,
  five: 4,
  six: 5,
  seven: 6,
  eight: 7,
  nine: 8,
  ten: 9,
  eleven: 10,
  twelve: 11,
  thirteen: 12,
  fourteen: 13,
  fifteen: 14,
};

function lessonIndexFromMessage(message = '') {
  const text = String(message || '');
  const chineseMatch = text.match(/第\s*(\d+)\s*(?:课|节|周)/);
  if (chineseMatch) return Math.max(0, Number(chineseMatch[1]) - 1);
  const match = text.match(
    /\blesson\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen)\b/i,
  );
  if (!match) return null;
  const raw = match[1].toLowerCase();
  return /^\d+$/.test(raw) ? Math.max(0, Number(raw) - 1) : LESSON_WORD_INDEX[raw];
}

function fieldText(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(fieldText).filter(Boolean).join(' ').trim();
  if (typeof value === 'object') return Object.values(value).map(fieldText).filter(Boolean).join(' ').trim();
  return String(value).trim();
}

export function requiresAgentGrounding(message = '') {
  const text = String(message || '').trim();
  if (!text) return false;
  const judgment =
    /\b(audit|review|inspect|critique|evaluate|assess|check|verify|alignment|aligned|gap|quality|readiness|evidence|weakness|strength|compare)\b/i.test(
      text,
    ) || /(?:审计|审查|检查|评价|评估|验证|对齐|差距|质量|证据|弱点|优点|比较)/.test(text);
  if (!judgment) return false;
  const metadataOnly =
    (/\b(how many|count|number of|list|title|titles|status|generated|ready)\b/i.test(text) ||
      /(?:多少|数量|列表|标题|状态|已生成|完成)/.test(text)) &&
    !(
      /\b(objective|assessment|activity|content|wording|question|rubric|lesson plan|slide|assignment|deliverable|field|fields)\b/i.test(
        text,
      ) || /(?:目标|评估|活动|内容|措辞|问题|量规|教案|幻灯片|作业|交付物|字段)/.test(text)
    );
  return !metadataOnly;
}

export function hasAgentGroundingEvidence(toolResults = []) {
  return toolResults.some((item) => {
    if (!GROUNDING_TOOL_NAMES.has(item?.toolName) || item?.result?.error) return false;
    return !(item?.result?.details || []).some((detail) => detail?.success === false);
  });
}

export function groundLessonAlignment(message = '', courseMap = null) {
  const text = String(message || '');
  const mutationText = text
    .replace(
      /\b(?:do\s+not|don't|without)\s+(?:change|changing|edit|editing|update|updating|rewrite|rewriting|fix|fixing|remove|removing|delete|deleting)\b/gi,
      '',
    )
    .replace(/(?:不要|不得|不需要|无需)(?:修改|编辑|更改|更新|重写|修复|删除)/g, '');
  const lessonIndex = lessonIndexFromMessage(text);
  const asksForAlignment =
    Number.isInteger(lessonIndex) &&
    (/\b(alignment|aligned|gap|evidence|match(?:es|ing)?)\b/i.test(text) || /(?:对齐|差距|证据|匹配)/.test(text)) &&
    (/\b(objectives?|assessments?|fields?)\b/i.test(text) || /(?:目标|评估|考核|字段)/.test(text)) &&
    !/\b(add|create|make|generate|remove|delete|change|edit|update|rewrite|fix|improve)\b/i.test(mutationText);
  const lesson = asksForAlignment ? courseMap?.lessons?.[lessonIndex] : null;
  if (!lesson) return '';

  const evidence = (Array.isArray(lesson.sections) ? lesson.sections : []).map((section, sectionIndex) => ({
    sectionIndex,
    objective: fieldText(section?.learningObjectives),
    assessment: fieldText(section?.weeklyAssessments),
  }));
  const gap =
    evidence.find((item) => item.objective && !item.assessment) ||
    evidence.find((item) => !item.objective && item.assessment) ||
    evidence[0];
  if (!gap) return '';

  const zh = /[\u3400-\u9fff]/.test(text);
  const location = zh
    ? `第 ${lessonIndex + 1} 课，第 ${gap.sectionIndex + 1} 节`
    : `Lesson ${lessonIndex + 1}, section ${gap.sectionIndex + 1}`;
  const quote = (value) => (value.length > 180 ? `${value.slice(0, 177)}…` : value);
  if (gap.objective && !gap.assessment) {
    return zh
      ? `**${location}存在一个明确的对齐差距。**我检查了 **Learning objectives（学习目标）**：“${quote(gap.objective)}”，以及 **Weekly assessments（每周评估）**：该字段为空。因此，这个目标在本节中没有可见的评估证据。`
      : `**${location} has one concrete alignment gap.** I checked **Learning objectives** — “${quote(gap.objective)}” — against **Weekly assessments**, which is empty. The stated objective therefore has no visible assessment evidence in that section.`;
  }
  if (!gap.objective && gap.assessment) {
    return zh
      ? `**${location}存在一个明确的对齐差距。**我检查了 **Learning objectives（学习目标）**：该字段为空，以及 **Weekly assessments（每周评估）**：“${quote(gap.assessment)}”。因此，这项评估在本节中没有对应的明确目标。`
      : `**${location} has one concrete alignment gap.** I checked **Learning objectives**, which is empty, against **Weekly assessments** — “${quote(gap.assessment)}”. The assessment therefore has no stated objective in that section.`;
  }
  return zh
    ? `**${location}：未发现空字段差距。**我检查了 **Learning objectives（学习目标）**：“${quote(gap.objective || '空')}”，以及 **Weekly assessments（每周评估）**：“${quote(gap.assessment || '空')}”。如需判断语义是否真正对齐，还需要进一步比较相关教学材料。`
    : `**${location}: no empty-field gap found.** I checked **Learning objectives** — “${quote(gap.objective || 'empty')}” — against **Weekly assessments** — “${quote(gap.assessment || 'empty')}”. A semantic alignment judgment would require a deeper artifact comparison.`;
}
