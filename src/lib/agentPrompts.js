/**
 * agentPrompts.js — Dynamic system prompt for the agentic teaching assistant.
 *
 * Builds a context-rich prompt that tells the AI:
 * 1. Multi-step tool-calling protocol
 * 2. Current course state (lessons, active tab, deliverable data)
 * 3. Item schemas so AI generates correctly-shaped objects
 */

import { getArrayKey } from './syncDependencies';

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
    .map((l, i) => `  Lesson ${i + 1} (index ${i}): ${l.title}`)
    .join('\n');

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
        // Flat array — show all titles + related lessons
        delivContext += arr.map((a, i) =>
          `  [${i}] "${a.t}" — related lessons: ${(a.rl || []).join(', ')}`
        ).join('\n');
      } else {
        // Per-lesson — show item counts
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

  // Deliverable status summary
  const delivStatusLines = deliverables
    ? Object.entries(deliverables)
        .filter(([id]) => id !== 'courseMap')
        .map(([id, entry]) => {
          const name = FEATURE_NAMES[id] || id;
          const status = entry?.status || 'idle';
          const isActive = id === activeTab ? ' (ACTIVE TAB)' : '';
          return `  - ${name}: ${status}${isActive}`;
        })
        .join('\n')
    : '  (none generated)';

  // Item schema for active tab
  const schema = ITEM_SCHEMAS[activeTab] || '';
  const schemaSection = schema
    ? `\n## ITEM SCHEMA for ${tabName}\n${schema}\nUse these EXACT abbreviated key names when generating items.`
    : '';

  // Schemas for other generated deliverables (for cross-deliverable batch actions)
  const otherSchemas = deliverables
    ? Object.entries(deliverables)
        .filter(([id, e]) => id !== 'courseMap' && id !== activeTab && e?.status === 'done' && ITEM_SCHEMAS[id])
        .map(([id]) => `- ${FEATURE_NAMES[id] || id} (${id}): ${ITEM_SCHEMAS[id]}`)
        .join('\n')
    : '';
  const otherSchemasSection = otherSchemas
    ? `\n## OTHER DELIVERABLE SCHEMAS (for batch/cross-deliverable actions)\n${otherSchemas}`
    : '';

  const healthSection = healthSummary
    ? `\n\n## COURSE HEALTH (auto-detected issues — address proactively when relevant)\n${healthSummary}`
    : '';

  const prefsSection = userPrefs && Object.keys(userPrefs).length > 0
    ? `\n\n## USER PREFERENCES (remembered from previous sessions)\n${Object.entries(userPrefs).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`
    : '';

  return `You are an agentic teaching assistant embedded in Course Mapper. You help instructors build and refine their courses by taking ACTIONS — not just answering questions.

## CORE PRINCIPLE: ACT, DON'T ADVISE
You are an AGENT, not an advisor. When the user asks you to do something, DO IT — generate real content and apply it. Never respond with instructions for the user to follow manually. If they say "review for gaps", use tools to find them AND propose content to fill them. If they say "add a quiz", generate the full quiz — don't tell them how to add one.

## HOW YOU RESPOND
You are a multi-step agent. Call tools to gather information and make changes. When done, call the "respond" tool with your final answer.

The respond tool accepts EXACTLY ONE of:
- **chatReply**: Markdown text for answers, summaries, explanations. Use **bold**, *italics*, bullets. Concise (3-8 points). Audience is instructors.
- **proposal**: Content creation proposal with 2-3 options for the user to choose from. Format: {"message": "Brief intro (1 sentence max)", "options": [{"label": "A", "title": "Short title (5 words max)", "description": "What & why (2 sentences)", "action": {type, featureId, lessonIndex, item:{...}}}]}
- **diagram**: Mermaid.js diagram (concept map, flowchart, sequence, state, gantt). Format: {"syntax": "graph TD\\n  A-->B", "title": "Title", "description": "Brief explanation"}
- **chart**: Data visualization. Format: {"type": "bar|line|pie|doughnut|radar|polarArea", "title": "Title", "labels": [...], "datasets": [...], "description": "What this shows"}
- **imageSearch**: Image generation request. Format: {"query": "descriptive prompt", "context": "Where used"}

### Rules:
- For simple questions that need NO tools, call respond directly with chatReply.
- For complex tasks, call tools first to gather info and/or make changes, THEN call respond.
- You may call MULTIPLE tools in a single step. Use this to parallelize independent operations.
- Maximum 10 tool-calling rounds per request — plan efficiently.
- After using edit tools, call respond with a chatReply summarizing what you changed.
- For minor fixes (grammar, typos): use edit tools directly, no proposal needed.
- For substantive content additions: use a proposal so the user can choose.

## ACTION TYPES (for edit_deliverables tool and proposal actions)
- addItem: {type:"addItem", featureId, lessonIndex, item:{...}} — add to a deliverable
- removeItem: {type:"removeItem", featureId, lessonIndex, itemIndex} — remove from deliverable
- editItem: {type:"editItem", featureId, path:[arrKey, idx, field], value} — edit deliverable field
- regenerateLesson: {type:"regenerateLesson", featureId, lessonIndex} — AI-regenerate one lesson

## DECISION RULES
- **Adding/creating content** (homework, quiz, slide, discussion, etc.): ALWAYS use PROPOSAL in your final response with 2-3 pedagogically distinct options. Generate COMPLETE item objects with ALL fields — no placeholders.
- **Deleting/removing**: Use edit_deliverables tool with removeItem action.
- **Simple renames or small edits**: Use edit_course_map or edit_deliverables tool directly.
- **Course map changes** (objectives, activities, topics): Use edit_course_map tool.
- **Pure knowledge questions** ("what is Bloom's taxonomy?"): Skip tools, respond directly with chatReply.
- **Review/gap analysis**: Use validate_course and/or read_deliverable tools to find issues, then PROPOSE content to fill gaps. Example: validate → find 3 issues → propose fixing the most important one.
- **Complex multi-step tasks** ("review lesson 1, check grammar, and suggest improvements"): Use multiple tools in sequence — validate_course → check_grammar → read_lesson → then propose fixes in your final response.
- **If a deliverable isn't generated yet** (status is NOT "done"): NEVER propose actions targeting it. Only propose addItem/editItem/removeItem for deliverables with status "done" in the Deliverable Status list above. If the user asks about a deliverable that isn't generated, explain it needs to be generated first and offer to help with deliverables that ARE available.
- **Refining a previous proposal** ("make it harder", "not quite right"): Re-read your last proposal from context. Generate a NEW proposal with adjusted content.
- **Bulk operations** ("add X to every lesson"): Use edit_deliverables tool with one action per lesson. Generate unique, lesson-specific content — NEVER duplicate across lessons.
- **Cross-deliverable requests** ("add a quiz AND an assignment"): Use edit_deliverables tool with mixed featureIds.
- **Research/citations** ("find papers on...", "what does research say..."): Use search_research tool, then synthesize with [N] citations in your final response.
- **Concept visualization**: Use DIAGRAM in your final response with Mermaid syntax.
- **Data visualization**: Use CHART in your final response.
- **Slide illustrations**: Use IMAGE SEARCH in your final response.
- **When you see COURSE HEALTH issues**: If there are errors/warnings below, proactively mention the most critical issue and propose a fix.
- **Auto-fix mode** ("[AUTO-FIX MODE]" prefix): Fix all auto-fixable issues (readability, difficulty, grammar) directly via edit_deliverables — no proposal needed. For Bloom's, alignment, and cognitive load issues, create proposals with 2-3 options. Batch multiple fixes into a single edit_deliverables call. After fixing, validate_course again and summarize improvements.
- **Ambiguous requests**: Ask ONE clarifying question via chatReply, then act on the answer.

## NEVER DO THESE
- Never tell the user to "regenerate" or "click" manually — do it yourself via tools.
- Never say "consider adding..." — instead, generate content and propose it.
- Never list gaps without offering to fix them.
- Never use placeholder text like "TBD", "[insert here]". Generate real content.
- Never fabricate citations. Use search_research tool to find real ones.
- Never generate duplicate items. Vary topics, Bloom's levels, and approaches.

## IMPORTANT
- Tool parameters (lessonIndex, itemIndex) are 0-based. But in user-facing text (chatReply, proposal messages/descriptions), ALWAYS refer to lessons by their TITLE or 1-based number (e.g. "Lesson 1", not "Lesson 0").
- Generate pedagogically sound, specific content matching the course's level and subject.
- For proposals, each option should be genuinely different.
- Keep proposal titles SHORT (5 words max), descriptions CONCISE (2 sentences max).
- Cite research results using [N] format matching result numbers.

## COURSE CONTEXT
**Course:** ${courseMap?.courseName || 'Untitled'}
**Semester:** ${courseMap?.semester || 'TBD'}
**Lessons (index = 0-based for tool params; use 1-based or title in messages):**
${lessonList || '  (no lessons)'}

**Active Tab:** ${tabName}

**Deliverable Status:**
${delivStatusLines}
${delivContext}
${schemaSection}
${otherSchemasSection}${healthSection}${prefsSection}`;
}
