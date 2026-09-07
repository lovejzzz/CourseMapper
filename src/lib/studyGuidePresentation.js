import { renderedDeliverableCollection, renderedDeliverableCollectionKey } from './renderedDeliverableRoot.js';

const chinese = {
  'Study Guides': '学习指南',
  'Study Guide': '学习指南',
  'Learning Objectives': '学习目标',
  'Practice the Objectives': '练习目标',
  'Learning Practice': '练习目标',
  'Assigned Readings': '指定阅读',
  'Concept Summary': '概念概要',
  'Evidence Ledger': '来源记录',
  'Study from': '参考来源',
  'Key Terms': '关键概念',
  'Key Terms & Definitions': '关键概念与定义',
  Term: '概念',
  Definition: '定义',
  Example: '例子',
  Source: '来源',
  'Dialogue Practice': '对话练习',
  'Worked Example': '推理示范',
  'Practice task': '示范任务',
  Result: '结果',
  Interpretation: '解释',
  Boundary: '适用范围',
  'Try the variation': '尝试变式',
  'How to Reason About This': '推理方法',
  'Concept Connections': '概念关系',
  'Common Misconceptions': '常见误解',
  Misconception: '待诊断的说法',
  Correction: '纠正',
  'Try this check': '尝试这样核查',
  'Review Questions': '自测问题',
  'Guided practice': '指导练习',
  'Independent practice': '独立练习',
  Hint: '提示',
  Response: '作答',
  'Practice Answer Key': '自查答案',
  'Check your answer': '查看自查答案',
  'Practice Activities': '修改与重做',
  'Exam Preparation': '后续复习',
  'Exam Prep': '后续复习',
  'High-Probability Topics': '复习要点',
  'Common Errors to Avoid': '需要避免的错误',
  'Recommended Study Strategy': '复习方法',
  'Key Topics': '复习要点',
  'Common Errors': '常见错误',
  'Review Strategy': '复习方法',
  'Time Management': '时间安排',
  'Exam Tips': '复习建议',
  'Connection to Next Lesson': '与下一课的联系',
  Understand: '理解',
  Apply: '应用',
  Analyze: '分析',
};

export const isReviewedStudyGuide = (guide) => guide?.teachingGuideVersion === 1;
export const studyGuideText = (guide, label) =>
  isReviewedStudyGuide(guide) && guide.language === 'zh' ? chinese[label] || label : label;

// A guide explanation is a material-specific projection of the reviewed task.
// Editing its wording must not replace the course topic or ask a model to do so.
// Task sources, questions, goals and other structural fields keep their own path.
export function isStudyGuideExplanationEdit(feature, data, path) {
  if (feature !== 'studyGuides' || !Array.isArray(path)) return false;
  const key = renderedDeliverableCollectionKey(feature, data);
  if (!key || path[0] !== key || !Number.isInteger(path[1])) return false;
  const guide = data[key]?.[path[1]];
  if (!isReviewedStudyGuide(guide) || !guide.taskId) return false;
  return (
    (path.length === 3 && path[2] === 'summary') ||
    (path.length === 4 && path[2] === 'conceptConnections' && Number.isInteger(path[3]))
  );
}

export function studyGuideExportLabel(feature, data, fallback) {
  if (feature !== 'studyGuides') return fallback;
  const guides = renderedDeliverableCollection(feature, data);
  return guides.length && guides.every((guide) => isReviewedStudyGuide(guide) && guide.language === 'zh')
    ? chinese['Study Guides']
    : fallback;
}
