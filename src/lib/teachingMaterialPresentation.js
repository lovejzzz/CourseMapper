import { renderedDeliverableCollection } from './renderedDeliverableRoot.js';
// Compiler/exporter-owned labels only. Never translate teacher or source prose.
const zhLabels = {
  'Strong response': '充分作答样例',
  'Partial response': '部分作答样例',
  'Typical misconception': '典型误解样例',
  'Acceptable alternative': '可接受的替代作答',
  'Why the score differs': '评分差异的依据',
  'Revision prompt': '修改提示',
  'Constructed rubric review examples, not student data. Scoring examples require teacher review.':
    '以下为编写的评分参考样例，并非学生数据；评分仍需教师审阅。',
  Assignment: '作业',
  'Applied artifact': '应用任务',
  'Formative practice — no course-grade weight specified': '形成性练习（未指定课程总评占比）',
  Assignments: '作业',
  Rubrics: '评分标准',
  Rubric: '评分标准',
  'Learning Objectives': '学习目标',
  'Assigned Evidence Packet': '指定材料',
  'Use these retained sources': '参考来源',
  'Operation-Qualified Worked Example': '推理示范',
  'Your task': '你的任务',
  Inputs: '已知条件',
  Result: '结果',
  Interpretation: '解释',
  Boundary: '适用边界',
  'Your variation': '变式任务',
  Instructions: '作答要求',
  'Format Requirements': '格式要求',
  Length: '篇幅',
  Format: '格式',
  'Citation Style': '引用格式',
  Submission: '提交方式',
  'Late Policy': '迟交规定',
  Requirement: '要求',
  'Course expectation': '课程规定',
  Deliverables: '提交内容',
  'Submission Format': '提交格式',
  'Grading Criteria': '评分要求',
  'Progress Tracking': '进度记录',
  'Accessibility & UDL': '可访问性与多种表达方式',
  'Student Self-Assessment': '学生自查',
  'Graded Student Work': '评价对象',
  'Task Directions': '任务要求',
  'Content Evidence Used for Scoring': '评分所依据的材料',
  'Evidence References for Scoring': '评分参考来源',
  'Submission Requirements (unweighted)': '提交要求（不计分）',
  'Instructor Facilitation': '教师指导',
  'Feedback for revision': '修改反馈',
  Excellent: '优秀',
  Proficient: '熟练',
  Developing: '发展中',
  Beginning: '起步',
  Criterion: '评分维度',
  Weight: '权重',
  Level: '等级',
  'Observable response': '可观察的作答表现',
  'Anchor Examples — Instructor Reference': '作答样例——教师参考',
  'Teacher Notes': '教师备注',
  'Answer-Key Handoff': '答案说明',
  'Exam Handoff': '考试说明',
  Overview: '任务概述',
  'Related Lessons': '相关课次',
  Description: '说明',
  'Activity Type': '活动形式',
  Status: '状态',
  'Review Checklist': '自查清单',
  'Feedback Loop': '反馈与修改',
  'Anchor Samples and Revision Check': '作答样例与修改检查',
  'Activity Briefing': '活动说明',
  Situation: '情境',
  Constraint: '限制条件',
  'Safety and evidence boundary': '安全与证据边界',
  'Inspect Before Acting': '开始前检查',
  'Participant or Working Roles': '参与角色',
  'Role-only information': '角色专属信息',
  'Phases and Updates': '阶段与新增信息',
  'Required decision or action': '需要作出的决定或行动',
  'Activity Clock': '活动时间',
  'Total time': '总时间',
  'Activity Log': '活动记录',
  'Student Artifact': '学生作品',
  Artifact: '作品',
  Debrief: '活动回顾',
  'Speaking Prompts': '口头任务',
  Remember: '记忆',
  Understand: '理解',
  Apply: '应用',
  Analyze: '分析',
  Evaluate: '评价',
  Create: '创造',
};
export function teachingMaterialIsChinese(row, data) {
  if (row?.language) return row.language === 'zh';
  const source = data?.teachingTaskSources?.find((source) => source.id === row?.taskId);
  return Boolean(source && /\p{Script=Han}/u.test(source.objective || ''));
}
export const teachingMaterialLabel = (label, chinese) => (chinese ? zhLabels[label] || label : label);
export const teachingMaterialLessonLabel = (label, chinese) =>
  chinese && typeof label === 'string' ? label.replace(/^Lesson (\d+):\s*/, '第 $1 课：') : label;
export const teachingMaterialWeekLabel = (label, chinese) =>
  chinese && typeof label === 'string' ? label.replace(/^Week (\d+)$/, '第 $1 周') : label;
export const comparisonTaskBloom = (task) =>
  task?.operationPlan?.operation === 'paired-condition-confound' ? 'Create' : undefined;

export function teachingMaterialExportLabel(feature, data, fallback) {
  if (!['assignments', 'rubrics'].includes(feature)) return fallback;
  const rows = renderedDeliverableCollection(feature, data);
  return rows.length && rows.every((row) => teachingMaterialIsChinese(row, data))
    ? feature === 'assignments'
      ? '作业'
      : '评分标准'
    : fallback;
}
