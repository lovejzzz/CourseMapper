/**
 * agentPrompts.js — Dynamic system prompt for the agentic teaching assistant.
 *
 * Builds a context-rich prompt that tells the AI:
 * 1. Multi-step tool-calling protocol
 * 2. Current course state (lessons, active tab, deliverable data)
 * 3. Item schemas so AI generates correctly-shaped objects
 *
 * OPTIMIZED: Only includes active-tab schema + path examples. Other schemas
 * available on demand via read_deliverable tool. Reduces prompt from ~28K to ~10K tokens.
 */

import { getArrayKey } from './syncDependencies';
import { buildMemoryContext } from './agentMemory';

// ── Compact item schemas (one-line summaries of each deliverable's item shape) ──
const ITEM_SCHEMAS = {
  assignments: `{t,at,rl:[lessonTitles],dw,et,tp,pg,bl,ov,ob:[objectives],ins:[instructions],fr:{ln,fm,cs,sp,lp},dl:[deliverables],sm:[{ms,dd,de}],gc,sr:[resources],pt,ai,tg:[tags]}`,
  quizBank: `Question: {ty:"multiple_choice"|"short_answer"|"essay",bl,df,em,pt,oa,q,op:[options],an,dr,ex,rh,sa}`,
  discussions: `{lt,bl,fm,ed,cx,pr,er,fp:[followUps],ft:{op,is,id,cl},rs:[starters],ec:[criteria],eq,gl,tg}`,
  slideDecks: `Slide: {t:"assertion title",ty:"title"|"content"|"activity"|"discussion"|"summary"|"closing",bu:[max 4 bullets],no:"speaker notes 4+ sentences",at,ti,bl,ol}`,
  lessonPlans: `{lt,wk,dur,bls,ob,mt,wu:{dur,ty,pr,pu,fa},ol:[{tm,ac,ty,de,in,ir,gr,bl}],fc:{ty,pr,oa,ia},un:{rp,eg,ex},hw:{t,de,et,cn},ca,tg}`,
  rubrics: `Criterion: {cn,oa,wt,pt,ex:"exemplary",pr:"proficient",dv:"developing",bg:"beginning"}`,
  studyGuides: `KeyTerm:{tm,df,ex} | ReviewQuestion:{q,bl,ht} | Misconception:{mc,co}`,
  courseFaq: `FAQ: {q:"student-voice question",an:"2-4 sentence answer",ca,rc:[concepts],df}`,
};

// ── Path examples per deliverable (only shown for active tab) ────────────────
const PATH_EXAMPLES = {
  slideDecks: `["slideDecks", 0, "sl", 2, "no"] — slide 3 notes in lesson 1. Fields: t, bu, no, ty`,
  quizBank: `["quizzes", 0, "qs", 1, "q"] — question 2 text in lesson 1. Fields: q, op, an, ex`,
  courseFaq: `["faqs", 0, "qs", 0, "an"] — FAQ 1 answer in lesson 1. Fields: q, an`,
  rubrics: `["rubrics", 0, "cr", 1, "ex"] — criterion 2 exemplary in lesson 1. Fields: cn, ex, pr, dv, bg`,
  discussions: `["discussions", 0, "pr"] — lesson 1 prompt. Fields: pr, cx, er`,
  lessonPlans: `["lessonPlans", 0, "ob"] — lesson 1 objectives. Fields: ob, wu, ol, hw`,
  studyGuides: `["studyGuides", 0, "kt", 1, "df"] — key term 2 definition. Sub-arrays: kt, rq, cm`,
  assignments: `["assignments", 0, "ov"] — assignment 1 overview. Fields: t, ov, ob, ins`,
};

// ── Feature display names ────────────────────────────────────────────────────
const FEATURE_NAMES = {
  assignments: 'Assignments',
  quizBank: 'Quiz & Exam Bank',
  discussions: 'Discussion Prompts',
  slideDecks: 'Slide Decks',
  lessonPlans: 'Lesson Plans',
  rubrics: 'Rubrics',
  studyGuides: 'Study Guides',
  courseFaq: 'Course FAQ',
  syllabus: 'Syllabus',
  courseMap: 'Course Map',
};

// ── Sub-array keys for "addItem" ─────────────────────────────────────────────
const ADD_TARGETS = {
  quizBank: { subKey: 'qs', itemName: 'question' },
  slideDecks: { subKey: 'sl', itemName: 'slide' },
  courseFaq: { subKey: 'qs', itemName: 'FAQ entry' },
  rubrics: { subKey: 'cr', itemName: 'criterion' },
  studyGuides: { subKey: null, itemName: 'key term / review question' },
  lessonPlans: { subKey: null, itemName: 'outline segment' },
  discussions: { subKey: null, itemName: 'discussion prompt' },
  assignments: { subKey: null, itemName: 'assignment' },
};

// ── Build the agent system prompt ────────────────────────────────────────────

export function buildAgentSystemPrompt(courseMap, activeTab, deliverables, healthSummary = null, userPrefs = null) {
  const lessonList = (courseMap?.lessons || [])
    .map((l, i) => `  ${i}: ${l.title}`)
    .join('\n');

  // Course map field names (from actual section keys)
  const sampleSection = courseMap?.lessons?.[0]?.sections?.[0];
  const courseMapFields = sampleSection
    ? Object.keys(sampleSection).filter(k => typeof sampleSection[k] === 'string').join(', ')
    : 'learningGoals, topicSection, learningObjectives, weeklyAssessments, asyncActivities, syncActivities, supportingResources, technologyNeeded, presentationFormat, evaluateDesign';

  const tabName = FEATURE_NAMES[activeTab] || activeTab || 'Course Map';

  // Active deliverable context — what items already exist
  let delivContext = '';
  if (activeTab && activeTab !== 'courseMap' && deliverables?.[activeTab]?.data) {
    const data = deliverables[activeTab].data;
    const arrKey = getArrayKey(activeTab, data);
    if (arrKey && Array.isArray(data[arrKey])) {
      const arr = data[arrKey];
      delivContext = `\n## CURRENT ${tabName.toUpperCase()} DATA (${arr.length} items)\n`;
      if (activeTab === 'assignments') {
        delivContext += arr.map((a, i) =>
          `  [${i}] "${a.t}" — related: ${(a.rl || []).join(', ')}`
        ).join('\n');
      } else {
        delivContext += arr.map((item, i) => {
          const addTarget = ADD_TARGETS[activeTab];
          const subKey = addTarget?.subKey;
          const subCount = subKey && Array.isArray(item[subKey]) ? item[subKey].length : 0;
          const label = item.lt || item.t || `Item ${i}`;
          return subKey
            ? `  [${i}] ${label} — ${subCount} ${addTarget.itemName}s`
            : `  [${i}] ${label}`;
        }).join('\n');
      }
    }
  }

  // Deliverable status — compact one-liner
  const delivStatusLines = deliverables
    ? Object.entries(deliverables)
        .filter(([id]) => id !== 'courseMap')
        .map(([id, entry]) => {
          const status = entry?.status || 'idle';
          const mark = id === activeTab ? '*' : '';
          return `${mark}${id}:${status}`;
        })
        .join(', ')
    : 'none';

  // Item schema for active tab only
  const schema = ITEM_SCHEMAS[activeTab] || '';
  const schemaSection = schema
    ? `\n## ITEM SCHEMA for ${tabName}\n${schema}\nUse these EXACT abbreviated key names when generating items.`
    : '';

  // Path example for active tab only
  const pathExample = PATH_EXAMPLES[activeTab] || '';
  const pathSection = pathExample
    ? `\n**editItem path for ${tabName}:** ${pathExample}`
    : '';

  // List other done deliverables (names only — agent can read_deliverable for schemas)
  const otherDone = deliverables
    ? Object.entries(deliverables)
        .filter(([id, e]) => id !== 'courseMap' && id !== activeTab && e?.status === 'done')
        .map(([id]) => id)
    : [];
  const otherDoneNote = otherDone.length > 0
    ? `\nOther generated deliverables: ${otherDone.join(', ')}. Use read_deliverable to see their data/schemas before editing.`
    : '';

  // Health — 1-line summary only (detail via validate_course tool)
  const healthSection = healthSummary
    ? `\n\n**Course health:** ${healthSummary.split('\n')[0]}${healthSummary.includes('\n') ? ' (use validate_course for details)' : ''}`
    : '';

  // User preferences — compact
  const prefsSection = userPrefs && Object.keys(userPrefs).length > 0
    ? `\n**User prefs:** ${Object.entries(userPrefs).map(([k, v]) => `${k}=${v}`).join(', ')}`
    : '';

  // Memory — compact, skip boilerplate when empty
  const memoryContext = buildMemoryContext();
  const memorySection = memoryContext
    ? `\n**Memories:** ${memoryContext}`
    : '';

  return `You are an agentic teaching assistant in Course Mapper. You ACT — not advise. When users ask you to do something, DO IT with tools. Never tell users to do things manually.

## PROTOCOL
Call tools to gather info and make changes. When done, call "respond" with your final answer.

The respond tool accepts ONE of:
- **chatReply**: Markdown text. Concise (3-8 points).
- **proposal**: {"message":"...", "options":[{"label":"A", "title":"5 words max", "description":"2 sentences", "action":{type,...}}]} — 2-3 pedagogically distinct options.
- **diagram**: {"syntax":"mermaid code", "title":"...", "description":"..."}
- **chart**: {"type":"bar|line|pie|doughnut|radar|polarArea", "title":"...", "labels":[...], "datasets":[...]}
- **imageSearch**: {"query":"...", "context":"..."}

### Rules
- Simple questions needing no tools → respond directly with chatReply.
- Complex tasks → use tools first, then respond.
- Call MULTIPLE tools in parallel when independent.
- Max 10 rounds. Plan efficiently.
- **Planning**: For complex requests, FIRST chatReply with brief plan, then execute. Simple requests → act immediately.
- After edits, chatReply summarizing what changed.
- Minor fixes → edit directly. Substantive additions → proposal with options.
- **Surgical patching**: Prefer editItem over regenerateLesson. Only regenerate when ENTIRE lesson content must change.

## ACTIONS

### Course Map (edit_course_map tool + proposals)
- editCell: {type:"editCell", lessonIndex, sectionIndex, field, value}
- editTitle: {type:"editTitle", lessonIndex, newTitle}
- addLesson: {type:"addLesson", title, sections:[{...}]}
- deleteLesson: {type:"deleteLesson", lessonIndex}

### Deliverables (edit_deliverables tool + proposals)
- addItem: {type:"addItem", featureId, lessonIndex, item:{...}}
- removeItem: {type:"removeItem", featureId, lessonIndex, itemIndex}
- editItem: {type:"editItem", featureId, path:[rootKey, lessonIdx, subKey?, itemIdx?, field], value}
- regenerateLesson: {type:"regenerateLesson", featureId, lessonIndex}
${pathSection}

For other deliverables' path format, use read_deliverable first to see their structure.

## CROSS-DELIVERABLE SYNC
When you edit a deliverable, related deliverables may need updating too. The system will auto-suggest syncing downstream deliverables, but you can proactively edit them in the same call for a better experience.

**Dependency map (source → downstream):**
- lessonPlans → slideDecks, studyGuides
- slideDecks → lessonPlans
- assignments → rubrics
- quizBank → studyGuides
- rubrics → assignments
- studyGuides → lessonPlans, slideDecks

**Example:** If user says "add homework to lesson 3", edit lessonPlans AND assignments in the same edit_deliverables call. If they say "add a quiz question", update quizBank AND consider updating studyGuides.

Only edit downstream deliverables that have status "done". Use read_deliverable first if unsure about their structure.

## WHEN TO DO WHAT
- **Simple edits** (rename, fix typo, update cell): Use tools directly.
- **New content** (quiz, assignment, slide): Proposal with 2-3 options. Generate COMPLETE objects.
- **Bulk ops** ("fix all typos"): Batch multiple patches in single tool call. Unique content per item.
- **Review/gaps**: validate_course + read_deliverable → propose fixes.
- **Research**: search_research → synthesize with [N] citations.
- **Cross-deliverable**: edit_deliverables with mixed featureIds.
- **Deliverable not "done"**: Never target it. Tell user to generate it first.
- **Refining proposal**: Read previous proposal from context, generate NEW adjusted one.
- **Ambiguous**: Ask ONE clarifying question, then act.
- **Auto-fix mode** ("[AUTO-FIX MODE]"): Fix directly. For Bloom's/alignment issues, propose options.

## DON'T
- Tell user to do things manually — do it yourself.
- Say "consider adding..." — generate and propose instead.
- Say "I can only..." — you have FULL CONTROL via edit_course_map + edit_deliverables.
- Use placeholder text ("TBD", "[insert]"). Generate real content.
- Fabricate citations. Use search_research.
- Generate duplicate items. Vary topics and Bloom's levels.

## IMPORTANT
- lessonIndex/itemIndex are 0-based in tools. Use 1-based or titles in user-facing text.
- Generate pedagogically sound content matching course level and subject.
- Proposal titles SHORT (5 words max), descriptions CONCISE (2 sentences).

## COURSE
**${courseMap?.courseName || 'Untitled'}** | ${courseMap?.semester || 'TBD'} | ${(courseMap?.lessons || []).length} lessons
**Lessons (0-based index):**
${lessonList || '  (none)'}
**Fields:** ${courseMapFields}
**Active:** ${tabName} | **Status:** ${delivStatusLines}${delivContext}${schemaSection}${otherDoneNote}${healthSection}${prefsSection}${memorySection}`;
}
