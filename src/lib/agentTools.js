/**
 * agentTools.js — Tool registry for the multi-step agentic teaching assistant.
 *
 * Each tool has: name, description, params, execute(args, ctx, signal).
 * Tools are called during the agentic loop; results are fed back to the LLM.
 */

import { generateCourseHealthReport } from './pedagogicalValidator';
import { checkGrammar } from './grammarChecker';
import { executeResearch } from './academicSearch';
import { getArrayKey } from './syncDependencies';
import { addMemory, searchMemories, deleteMemory, getMemories, MEMORY_CATEGORIES } from './agentMemory';
import { saveAgentPrefs } from './cloudStorage';

// ── Helpers ──────────────────────────────────────────────────────────────────

const FEATURE_NAMES = {
  assignments: 'Assignments', quizBank: 'Quiz & Exam Bank',
  discussions: 'Discussion Prompts', slideDecks: 'Slide Decks',
  lessonPlans: 'Lesson Plans', rubrics: 'Rubrics',
  studyGuides: 'Study Guides', courseFaq: 'Course FAQ', syllabus: 'Syllabus',
};

/** Extract concatenated text from a lesson's sections for grammar checking. */
function extractLessonText(courseMap, lessonIndex) {
  const lesson = courseMap?.lessons?.[lessonIndex];
  if (!lesson) return '';
  const texts = [lesson.title || ''];
  for (const section of (lesson.sections || [])) {
    for (const val of Object.values(section)) {
      if (typeof val === 'string' && val.length > 10) texts.push(val);
    }
  }
  return texts.join('\n\n');
}

/** Compact summary of a single per-lesson deliverable item for comparison. */
function summarizeDeliverableItem(featureId, item) {
  if (!item) return null;
  switch (featureId) {
    case 'quizBank':
      return { questionCount: item.qs?.length || 0, topics: (item.qs || []).slice(0, 3).map(q => q.q?.slice(0, 60)) };
    case 'lessonPlans':
      return { objectives: item.ob || '', outlineSteps: item.ol?.length || 0 };
    case 'slideDecks':
      return { slideCount: item.sl?.length || 0, titles: (item.sl || []).slice(0, 3).map(s => s.t) };
    case 'rubrics':
      return { criteriaCount: item.cr?.length || 0, criteria: (item.cr || []).slice(0, 3).map(c => c.cn) };
    case 'discussions':
      return { prompt: (item.pr || '').slice(0, 80) };
    case 'studyGuides':
      return { termCount: item.kt?.length || 0, questionCount: item.rq?.length || 0 };
    case 'assignments':
      return { title: item.t || '', type: item.at || '' };
    default:
      return { keys: Object.keys(item).slice(0, 5) };
  }
}

/** Extract Bloom's taxonomy levels from a deliverable item. */
function extractBlooms(featureId, item) {
  if (!item) return [];
  const levels = new Set();
  if (item.bl) levels.add(item.bl);
  const subArrays = { quizBank: 'qs', slideDecks: 'sl', rubrics: 'cr' };
  const subKey = subArrays[featureId];
  if (subKey && Array.isArray(item[subKey])) {
    for (const sub of item[subKey]) {
      if (sub.bl) levels.add(sub.bl);
    }
  }
  return [...levels];
}

// ── Tool Registry ────────────────────────────────────────────────────────────

export const AGENT_TOOLS = {
  validate_course: {
    description: "Run pedagogical validation (Bloom's alignment, readability, cognitive load, difficulty progression). Returns errors, warnings, and info.",
    params: {},
    execute: async (args, ctx) => {
      const report = generateCourseHealthReport(ctx.courseMap, ctx.deliverables);
      return {
        errorCount: report.errorCount,
        warningCount: report.warningCount,
        infoCount: report.infoCount,
        findings: report.findings.map(f => ({
          severity: f.severity,
          category: f.category,
          message: f.message,
          lessonIndex: f.lessonIndex,
        })),
      };
    },
  },

  check_grammar: {
    description: "Check grammar and spelling in a specific lesson's text content via LanguageTool.",
    params: { lessonIndex: 'number — 0-based lesson index' },
    execute: async (args, ctx, signal) => {
      const text = extractLessonText(ctx.courseMap, args.lessonIndex);
      if (!text || text.length < 20) return { matches: [], note: 'Not enough text to check.' };
      const result = await checkGrammar(text, 'en-US', signal);
      return {
        matchCount: result.matches.length,
        matches: result.matches.slice(0, 10).map(m => ({
          message: m.message,
          context: m.context,
          replacements: m.replacements,
          rule: m.rule,
        })),
      };
    },
  },

  search_research: {
    description: 'Search academic sources. Returns numbered results you can cite with [N] format.',
    params: {
      query: 'string — search terms',
      sources: 'string[] — from: "papers", "wiki", "crossref", "videos", "books", "gbooks"',
      count: 'number — results per source (default 5)',
    },
    execute: async (args, ctx, signal) => {
      const { results, formatted } = await executeResearch(
        { query: args.query, sources: args.sources || ['papers'], limit: args.count },
        signal,
      );
      return {
        formatted: formatted.slice(0, 4000), // cap to stay within context
        totalResults: results.reduce((s, r) => s + (r.items?.length || 0), 0),
      };
    },
  },

  read_deliverable: {
    description: 'Read current data for a deliverable. Use to see what exists before making changes.',
    params: {
      featureId: 'string — one of: assignments, quizBank, discussions, slideDecks, lessonPlans, rubrics, studyGuides, courseFaq, syllabus',
      lessonIndex: 'number (optional) — return only that lesson\'s data',
    },
    execute: (args, ctx) => {
      const entry = ctx.deliverables?.[args.featureId];
      if (!entry?.data) return { error: `${FEATURE_NAMES[args.featureId] || args.featureId} not generated yet.` };

      const data = entry.data;
      const arrKey = getArrayKey(args.featureId, data);

      // Specific lesson requested
      if (args.lessonIndex !== undefined && arrKey && Array.isArray(data[arrKey])) {
        const item = data[arrKey][args.lessonIndex];
        if (!item) return { error: `Lesson index ${args.lessonIndex} out of range (valid: 0-${data[arrKey].length - 1}). Omit lessonIndex to see all items.` };
        // Build editItem path hints so agent knows how to edit fields
        const pathPrefix = `["${arrKey}", ${args.lessonIndex}`;
        const pathHints = [];
        for (const [key, val] of Object.entries(item)) {
          if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
            // Sub-array with objects — show path to first item's fields
            const subFields = Object.keys(val[0]).slice(0, 5).join(', ');
            pathHints.push(`${pathPrefix}, "${key}", <idx>, "<field>"] — ${val.length} items, fields: ${subFields}`);
          } else if (typeof val === 'string' || typeof val === 'number') {
            pathHints.push(`${pathPrefix}, "${key}"] — ${typeof val}`);
          }
        }
        const str = JSON.stringify(item);
        const result = { data: item };
        if (pathHints.length > 0) result.editPaths = pathHints;
        if (str.length > 3000) {
          result.note = 'Data truncated to fit context.';
          result.truncated = true;
        }
        return result;
      }

      // Summary of all items
      if (arrKey && Array.isArray(data[arrKey])) {
        return {
          featureId: args.featureId,
          name: FEATURE_NAMES[args.featureId],
          totalItems: data[arrKey].length,
          items: data[arrKey].map((item, i) => {
            const summary = { index: i };
            if (item.lt) summary.title = item.lt;
            if (item.t) summary.title = item.t;
            if (item.qs) summary.questionCount = item.qs.length;
            if (item.sl) summary.slideCount = item.sl.length;
            if (item.cr) summary.criteriaCount = item.cr.length;
            if (item.rq) summary.reviewQuestionCount = item.rq.length;
            if (item.kt) summary.keyTermCount = item.kt.length;
            return summary;
          }),
        };
      }

      // Fallback: return stringified data (e.g., syllabus)
      const str = JSON.stringify(data);
      return { data: str.length > 2000 ? str.slice(0, 2000) + '…' : str };
    },
  },

  read_lesson: {
    description: 'Read full course map data for a specific lesson including all sections and fields.',
    params: { lessonIndex: 'number — 0-based lesson index' },
    execute: (args, ctx) => {
      const lessons = ctx.courseMap?.lessons;
      if (!lessons) return { error: 'No course map loaded.' };
      const lesson = lessons[args.lessonIndex];
      if (!lesson) return { error: `Lesson ${args.lessonIndex} not found (0-${lessons.length - 1}).` };
      const result = {
        title: lesson.title,
        sections: (lesson.sections || []).map((sec, i) => ({ sectionIndex: i, ...sec })),
      };
      const str = JSON.stringify(result);
      if (str.length > 8000) {
        result.sections = result.sections.map(sec => {
          const trimmed = {};
          for (const [k, v] of Object.entries(sec)) {
            trimmed[k] = typeof v === 'string' && v.length > 300 ? v.slice(0, 300) + '…' : v;
          }
          return trimmed;
        });
        result.note = 'Some fields were truncated due to size. Use read_deliverable for full details.';
        result.truncated = true;
      }
      return result;
    },
  },

  edit_course_map: {
    description: 'Edit course map: rename lesson titles, edit cells (objectives, activities, topics, etc.), add or remove lessons. Changes are applied immediately. For title renames, set field to "title".',
    params: {
      patches: 'array — each: {lessonIndex, sectionIndex?, field, value} for cells, {lessonIndex, field:"title", value} for rename, {action:"addLesson", title, sections?} to add, {action:"removeLesson", lessonIndex} to remove',
    },
    // Explicit JSON Schema for better LLM tool-calling accuracy
    jsonSchema: {
      type: 'object',
      properties: {
        patches: {
          type: 'array',
          description: 'Array of patch operations to apply to the course map.',
          items: {
            type: 'object',
            properties: {
              lessonIndex: { type: 'number', description: '0-based lesson index' },
              sectionIndex: { type: 'number', description: '0-based section index (default 0)' },
              field: { type: 'string', description: 'Field to edit: "title" for lesson title, or cell field name: "learningGoals", "learningObjectives", "topicSection", "weeklyAssessments", "asyncActivities", "syncActivities", "supportingResources", "technologyNeeded", "presentationFormat", "evaluateDesign". Abbreviations also accepted: "lo", "lg", "tp", "as", "ac", "rs"' },
              value: { type: 'string', description: 'New value for the field' },
              action: { type: 'string', description: 'Special action: "addLesson" or "removeLesson"' },
              title: { type: 'string', description: 'Title for new lesson (when action is "addLesson")' },
            },
            required: ['lessonIndex'],
          },
        },
      },
      required: ['patches'],
    },
    execute: (args, ctx) => {
      const patches = args.patches || [];
      if (patches.length === 0) return { error: 'No patches provided.' };

      const results = [];
      for (const patch of patches) {
        let action;
        if (patch.action === 'addLesson') {
          action = { type: 'addLesson', title: patch.title || patch.lesson?.title, sections: patch.sections || patch.lesson?.sections };
        } else if (patch.action === 'removeLesson') {
          action = { type: 'deleteLesson', lessonIndex: patch.lessonIndex };
        } else if (patch.field === 'title') {
          action = { type: 'editTitle', lessonIndex: patch.lessonIndex, newTitle: patch.value };
        } else {
          action = {
            type: 'editCell',
            lessonIndex: patch.lessonIndex,
            sectionIndex: patch.sectionIndex ?? 0,
            field: patch.field,
            value: patch.value,
          };
        }
        const result = ctx.executeAction(action);
        results.push({ patch: patch.field || patch.action, success: result.success, message: result.message });
      }

      return {
        applied: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        details: results,
      };
    },
  },

  edit_deliverables: {
    description: 'Add, edit, or remove deliverable items. Changes are applied immediately with undo support.',
    params: {
      actions: 'array — each: {type:"addItem"|"removeItem"|"editItem"|"regenerateLesson", featureId, lessonIndex, item?, itemIndex?, path?, value?}',
    },
    // Explicit JSON Schema for better LLM tool-calling accuracy
    jsonSchema: {
      type: 'object',
      properties: {
        actions: {
          type: 'array',
          description: 'Array of actions to apply to deliverables.',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', description: 'Action type: "addItem", "removeItem", "editItem", or "regenerateLesson"' },
              featureId: { type: 'string', description: 'Deliverable ID: assignments, quizBank, discussions, slideDecks, lessonPlans, rubrics, studyGuides, courseFaq, syllabus' },
              lessonIndex: { type: 'number', description: '0-based lesson index' },
              item: { type: 'object', description: 'Item object to add (for addItem)' },
              itemIndex: { type: 'number', description: 'Index of item to remove (for removeItem)' },
              subKey: { type: 'string', description: 'Sub-array key if needed (e.g., "qs", "sl", "cr")' },
              path: { type: 'array', description: 'Path from data root to field. Examples: ["slideDecks",0,"sl",2,"no"] for slide notes, ["quizzes",0,"qs",1,"q"] for quiz question, ["discussions",0,"pr"] for discussion prompt. Format: [rootKey, lessonIdx, subArrayKey?, itemIdx?, field]', items: {} },
              value: { description: 'New value to set (for editItem)' },
            },
            required: ['type', 'featureId'],
          },
        },
      },
      required: ['actions'],
    },
    execute: (args, ctx) => {
      const actions = args.actions || [];
      if (actions.length === 0) return { error: 'No actions provided.' };

      // Snapshot each affected featureId once for undo
      const snapped = new Set();
      if (ctx.snapshot) {
        for (const a of actions) {
          const fid = a.featureId;
          if (fid && !snapped.has(fid)) {
            const entry = ctx.deliverables?.[fid];
            if (entry?.data) { ctx.snapshot(fid, entry.data); snapped.add(fid); }
          }
        }
      }

      const results = [];
      for (const action of actions) {
        const result = ctx.executeAction(action, { skipSnapshot: true });
        results.push({
          action: action.type,
          featureId: action.featureId,
          lessonIndex: action.lessonIndex,
          success: result.success,
          message: result.message,
        });
      }

      return {
        applied: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        details: results,
      };
    },
  },

  save_preference: {
    description: 'Save a user teaching preference for future sessions (e.g., preferred Bloom\'s level, strictness, teaching style). Syncs to cloud if signed in.',
    params: {
      key: 'string — preference name (blooms_focus, difficulty_level, teaching_style, formality, etc.)',
      value: 'string — preference value',
    },
    execute: (args, ctx) => {
      try {
        const stored = JSON.parse(localStorage.getItem('coursemapper-agent-prefs') || '{}');
        stored[args.key] = args.value;
        localStorage.setItem('coursemapper-agent-prefs', JSON.stringify(stored));
        // Fire-and-forget cloud sync
        if (ctx?.uid) saveAgentPrefs(ctx.uid, stored).catch(() => {});
        return { saved: true, key: args.key, value: args.value };
      } catch (err) {
        return { error: `Failed to save preference: ${err.message}` };
      }
    },
  },

  remember: {
    description: 'Save a persistent memory about this user for future sessions. Use this to remember teaching philosophy, preferred pedagogy, course patterns, institutional context, or any user preference the agent should recall later.',
    params: {
      content: 'string — what to remember (1-2 sentences, specific and actionable)',
      category: 'string — one of: teaching_style, assessment, course_design, feedback, institutional, general',
      importance: 'number (optional) — 1 (low) to 5 (critical). Default 3.',
    },
    jsonSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'What to remember about this user' },
        category: { type: 'string', enum: ['teaching_style', 'assessment', 'course_design', 'feedback', 'institutional', 'general'] },
        importance: { type: 'number', minimum: 1, maximum: 5, description: 'Importance 1-5 (default 3)' },
      },
      required: ['content', 'category'],
    },
    execute: (args, ctx) => {
      try {
        const mem = addMemory({
          category: args.category || 'general',
          content: args.content,
          importance: args.importance || 3,
          uid: ctx?.uid || null,
        });
        return { saved: true, id: mem.id, category: mem.category, content: mem.content };
      } catch (err) {
        return { error: `Failed to save memory: ${err.message}` };
      }
    },
  },

  recall: {
    description: 'Search saved memories about this user. Use to recall teaching preferences, past decisions, institutional context, or feedback patterns before making recommendations.',
    params: {
      query: 'string (optional) — search term. If omitted, returns top memories by importance.',
      category: 'string (optional) — filter by category: teaching_style, assessment, course_design, feedback, institutional, general',
    },
    jsonSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term to find relevant memories' },
        category: { type: 'string', enum: ['teaching_style', 'assessment', 'course_design', 'feedback', 'institutional', 'general'] },
      },
    },
    execute: (args) => {
      try {
        let results;
        if (args.query) {
          results = searchMemories(args.query);
        } else if (args.category) {
          results = getMemories().filter(m => m.category === args.category);
        } else {
          results = getMemories();
        }
        // Return top 10 most relevant
        const top = results.slice(0, 10).map(m => ({
          id: m.id,
          category: MEMORY_CATEGORIES[m.category] || m.category,
          content: m.content,
          importance: m.importance,
        }));
        const response = { count: top.length, total: results.length, memories: top };
        if (results.length > 10) response.truncated = `[truncated] Showing 10 of ${results.length} results`;
        return response;
      } catch (err) {
        return { error: `Failed to recall memories: ${err.message}` };
      }
    },
  },

  compare_deliverables: {
    description: 'Compare two deliverables for alignment across lessons. Returns per-lesson summaries highlighting gaps (e.g., quiz questions not covering lesson plan objectives).',
    params: {
      featureA: 'string — first deliverable ID',
      featureB: 'string — second deliverable ID',
      lessonIndex: 'number (optional) — compare only this lesson',
    },
    jsonSchema: {
      type: 'object',
      properties: {
        featureA: { type: 'string', description: 'First deliverable: assignments, quizBank, discussions, slideDecks, lessonPlans, rubrics, studyGuides, courseFaq' },
        featureB: { type: 'string', description: 'Second deliverable' },
        lessonIndex: { type: 'number', description: '0-based lesson index (optional — omit to compare all)' },
      },
      required: ['featureA', 'featureB'],
    },
    execute: (args, ctx) => {
      const { featureA, featureB } = args;
      const entryA = ctx.deliverables?.[featureA];
      const entryB = ctx.deliverables?.[featureB];
      if (!entryA?.data) return { error: `${FEATURE_NAMES[featureA] || featureA} not generated yet.` };
      if (!entryB?.data) return { error: `${FEATURE_NAMES[featureB] || featureB} not generated yet.` };

      const arrKeyA = getArrayKey(featureA, entryA.data);
      const arrKeyB = getArrayKey(featureB, entryB.data);
      const arrA = arrKeyA ? entryA.data[arrKeyA] : null;
      const arrB = arrKeyB ? entryB.data[arrKeyB] : null;
      if (!Array.isArray(arrA) || !Array.isArray(arrB)) {
        return { error: 'Cannot compare — one or both deliverables have no per-lesson array.' };
      }

      const maxLen = Math.max(arrA.length, arrB.length);
      const startIdx = args.lessonIndex != null ? args.lessonIndex : 0;
      const endIdx = args.lessonIndex != null ? args.lessonIndex + 1 : maxLen;

      if (startIdx < 0 || startIdx >= maxLen) {
        return { error: `lessonIndex ${startIdx} out of range (0-${maxLen - 1}).` };
      }

      const comparisons = [];
      for (let i = startIdx; i < endIdx; i++) {
        const itemA = arrA[i];
        const itemB = arrB[i];
        const lesson = {
          lessonIndex: i,
          title: itemA?.lt || itemB?.lt || ctx.courseMap?.lessons?.[i]?.title || `Lesson ${i + 1}`,
        };

        // Extract key content from each deliverable for this lesson
        lesson[featureA] = summarizeDeliverableItem(featureA, itemA);
        lesson[featureB] = summarizeDeliverableItem(featureB, itemB);

        // Detect gaps
        const gaps = [];
        if (!itemA) gaps.push(`Missing in ${FEATURE_NAMES[featureA] || featureA}`);
        if (!itemB) gaps.push(`Missing in ${FEATURE_NAMES[featureB] || featureB}`);

        // Bloom's level comparison if both have it
        const bloomsA = extractBlooms(featureA, itemA);
        const bloomsB = extractBlooms(featureB, itemB);
        if (bloomsA.length > 0 && bloomsB.length > 0) {
          const missingInB = bloomsA.filter(b => !bloomsB.includes(b));
          if (missingInB.length > 0) {
            gaps.push(`${FEATURE_NAMES[featureB] || featureB} missing Bloom's levels: ${missingInB.join(', ')}`);
          }
        }

        lesson.gaps = gaps;
        comparisons.push(lesson);
      }

      const totalGaps = comparisons.reduce((s, c) => s + c.gaps.length, 0);
      return {
        featureA: FEATURE_NAMES[featureA] || featureA,
        featureB: FEATURE_NAMES[featureB] || featureB,
        lessonsCompared: comparisons.length,
        totalGaps,
        comparisons: comparisons.length > 8 ? comparisons.slice(0, 8) : comparisons,
        ...(comparisons.length > 8 ? { truncated: `Showing 8 of ${comparisons.length} lessons` } : {}),
      };
    },
  },

  undo_last: {
    description: 'Undo the most recent deliverable edit. Restores the previous version. Use when your last edit was wrong or the user asks to undo.',
    params: {},
    execute: (args, ctx) => {
      if (!ctx.undoFn) return { error: 'Undo not available in this context.' };
      try {
        ctx.undoFn();
        return { success: true, message: 'Last deliverable edit undone.' };
      } catch (err) {
        return { error: `Undo failed: ${err.message}` };
      }
    },
  },

  forget: {
    description: 'Delete a specific memory that is no longer accurate or relevant.',
    params: {
      id: 'string — memory ID to delete (from recall results)',
    },
    jsonSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Memory ID to delete' },
      },
      required: ['id'],
    },
    execute: (args, ctx) => {
      try {
        deleteMemory(args.id, ctx?.uid || null);
        return { deleted: true, id: args.id };
      } catch (err) {
        return { error: `Failed to delete memory: ${err.message}` };
      }
    },
  },
};

// ── UI labels for progress card ──────────────────────────────────────────────

export const TOOL_LABELS = {
  validate_course: 'Validating course health',
  check_grammar: 'Checking grammar',
  search_research: 'Searching academic sources',
  read_deliverable: 'Reading deliverable data',
  read_lesson: 'Reading lesson data',
  edit_course_map: 'Editing course map',
  edit_deliverables: 'Editing deliverables',
  save_preference: 'Saving preference',
  remember: 'Remembering for next time',
  recall: 'Recalling past context',
  compare_deliverables: 'Comparing deliverables',
  undo_last: 'Undoing last edit',
  forget: 'Forgetting outdated info',
  respond: 'Preparing response',
};

// ── Build tool descriptions for system prompt ────────────────────────────────

export function buildToolDescriptions() {
  const lines = [];
  for (const [name, tool] of Object.entries(AGENT_TOOLS)) {
    const paramEntries = Object.entries(tool.params);
    const paramStr = paramEntries.length > 0
      ? '\n    Args: ' + paramEntries.map(([k, v]) => `${k} (${v})`).join(', ')
      : '\n    Args: none';
    lines.push(`  - **${name}**: ${tool.description}${paramStr}`);
  }
  return lines.join('\n');
}

// ── Summarize tool result for progress UI and chat history ───────────────────

export function summarizeToolResult(toolName, result) {
  if (!result) return 'No result';
  if (result.error) return result.error;

  switch (toolName) {
    case 'validate_course':
      return `${result.errorCount || 0} errors, ${result.warningCount || 0} warnings, ${result.infoCount || 0} info`;
    case 'check_grammar':
      return `${result.matchCount || 0} grammar issue${(result.matchCount || 0) !== 1 ? 's' : ''} found`;
    case 'search_research':
      return `${result.totalResults || 0} results found`;
    case 'read_deliverable':
      if (result.totalItems !== undefined) return `${result.totalItems} items loaded`;
      return result.data ? 'Data loaded' : 'No data';
    case 'read_lesson':
      return `${result.sections?.length || 0} sections loaded`;
    case 'edit_course_map':
      return `${result.applied || 0} applied, ${result.failed || 0} failed`;
    case 'edit_deliverables':
      return `${result.applied || 0} applied, ${result.failed || 0} failed`;
    case 'save_preference':
      return result.saved ? `Saved ${result.key}` : 'Failed';
    case 'remember':
      return result.saved ? `Remembered: ${result.content?.slice(0, 40)}…` : 'Failed';
    case 'recall':
      return `${result.count || 0} memories found`;
    case 'compare_deliverables':
      return `${result.lessonsCompared || 0} lessons compared, ${result.totalGaps || 0} gaps`;
    case 'undo_last':
      return result.success ? 'Edit undone' : 'Failed';
    case 'forget':
      return result.deleted ? 'Memory deleted' : 'Failed';
    case 'respond':
      return 'Response ready';
    default:
      return 'Done';
  }
}

// ── Request complexity classifier for smart model routing ──────────────────

/**
 * Classify a user request's complexity to help with model selection.
 * Returns 'simple' | 'moderate' | 'complex'
 */
export function classifyRequestComplexity(text, deliverables) {
  const lower = (text || '').toLowerCase();

  // Simple: single-target, small edits
  const simplePatterns = [
    /fix\s+(the\s+)?typo/i, /rename/i, /change\s+the\s+title/i,
    /shorten/i, /what\s+is/i, /explain/i, /delete\s+(this|the)/i,
    /remove\s+(this|the)/i, /undo/i,
  ];
  if (simplePatterns.some(p => p.test(lower)) && lower.length < 100) return 'simple';

  // Complex: multi-target, creative, bulk
  const complexPatterns = [
    /all\s+(lessons?|quizzes|slides|assignments|rubrics)/i,
    /redesign/i, /rewrite\s+all/i, /review\s+(my\s+)?course/i,
    /create\s+a\s+(full|complete)/i, /generate/i,
    /align.*bloom/i, /entire\s+course/i,
  ];
  const doneCount = deliverables
    ? Object.values(deliverables).filter(d => d?.status === 'done').length
    : 0;
  if (complexPatterns.some(p => p.test(lower)) || (lower.length > 300 && doneCount > 3)) return 'complex';

  return 'moderate';
}
