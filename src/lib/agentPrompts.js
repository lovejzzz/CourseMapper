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

// ── Compact item schemas with key legends ──
const ITEM_SCHEMAS = {
  assignments: `{t,at,rl:[lessonTitles],dw,et,tp,pg,bl,ov,ob:[objectives],ins:[instructions],fr:{ln,fm,cs,sp,lp},dl:[deliverables],sm:[{ms,dd,de}],gc,sr:[resources],pt,ai,tg:[tags]}
Keys: t=title, at=assignmentType, rl=relatedLessons, dw=dueWhen, et=estimatedTime, bl=bloomsLevel, ov=overview, ob=objectives, ins=instructions`,
  quizBank: `Question: {ty:"multiple_choice"|"short_answer"|"essay",bl,df,em,pt,oa,q,op:[options],an,dr,ex,rh,sa}
Keys: ty=type, bl=bloomsLevel, df=difficulty, q=question, op=options, an=answer, ex=explanation, pt=points`,
  discussions: `{lt,bl,fm,ed,cx,pr,er,fp:[followUps],ft:{op,is,id,cl},rs:[starters],ec:[criteria],eq,gl,tg}
Keys: lt=lessonTitle, pr=prompt, cx=context, er=expectedResponse, fp=followUps, bl=bloomsLevel`,
  slideDecks: `Slide: {t:"assertion title",ty:"title"|"content"|"activity"|"discussion"|"summary"|"closing",bu:[max 4 bullets],no:"speaker notes 4+ sentences",at,ti,bl,ol}
Keys: t=title, ty=type, bu=bullets, no=notes, bl=bloomsLevel`,
  lessonPlans: `{lt,wk,dur,bls,ob,mt,wu:{dur,ty,pr,pu,fa},ol:[{tm,ac,ty,de,in,ir,gr,bl}],fc:{ty,pr,oa,ia},un:{rp,eg,ex},hw:{t,de,et,cn},ca,tg}
Keys: lt=lessonTitle, ob=objectives, wu=warmup, ol=outline, hw=homework, fc=formativeCheck`,
  rubrics: `Criterion: {cn,oa,wt,pt,ex:"exemplary",pr:"proficient",dv:"developing",bg:"beginning"}
Keys: cn=criterionName, oa=objectiveAlignment, wt=weight, pt=points`,
  studyGuides: `KeyTerm:{tm,df,ex} | ReviewQuestion:{q,bl,ht} | Misconception:{mc,co}
Sub-arrays: kt=keyTerms, rq=reviewQuestions, cm=misconceptions. Keys: tm=term, df=definition, q=question, mc=misconception, co=correction`,
  courseFaq: `FAQ: {q:"student-voice question",an:"2-4 sentence answer",ca,rc:[concepts],df}
Keys: q=question, an=answer, ca=category, df=difficulty`,
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

/**
 * Returns the static prefix of the system prompt — protocol, rules, examples,
 * response style, indexing reminders. Identical across all courses and active
 * tabs, so it can sit behind its own Anthropic cache breakpoint and survive
 * course/tab switches.
 *
 * Kept in a function (not a top-level constant) because the template body
 * depends on a handful of module-level tables (ITEM_SCHEMAS, PATH_EXAMPLES,
 * FEATURE_NAMES) that may be extended without updating every caller.
 */
export function buildStaticAgentSystemPrompt() {
  return STATIC_AGENT_PROMPT;
}

/**
 * Build the dynamic tail of the system prompt — course state, active-tab
 * schema + path hints, memories, user prefs, health summary. Anything that
 * changes when the user switches courses or tabs goes here so the static
 * prefix's cache survives those transitions.
 */
export function buildDynamicAgentSystemPrompt(courseMap, activeTab, deliverables, healthSummary = null, userPrefs = null) {
  return buildAgentSystemPrompt(courseMap, activeTab, deliverables, healthSummary, userPrefs, { onlyDynamic: true });
}

/**
 * Convenience: returns both parts as an object, so provider builders can decide
 * whether to concatenate (e.g. OpenAI) or wrap each in a cache block (Anthropic).
 */
export function buildAgentSystemPromptParts(courseMap, activeTab, deliverables, healthSummary = null, userPrefs = null) {
  return {
    staticPart: buildStaticAgentSystemPrompt(),
    dynamicPart: buildDynamicAgentSystemPrompt(courseMap, activeTab, deliverables, healthSummary, userPrefs),
  };
}

export function buildAgentSystemPrompt(courseMap, activeTab, deliverables, healthSummary = null, userPrefs = null, _opts = {}) {
  // Display 1-based lesson numbers but show 0-based index in parentheses for tool calls
  const lessonList = (courseMap?.lessons || [])
    .map((l, i) => `  Lesson ${i + 1}: "${l.title}" (toolIndex=${i})`)
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

  // Deliverable status — grouped by state for clarity
  const delivEntries = deliverables
    ? Object.entries(deliverables).filter(([id]) => id !== 'courseMap')
    : [];
  const doneIds = delivEntries.filter(([, e]) => e?.status === 'done').map(([id]) => id);
  const otherIds = delivEntries.filter(([, e]) => e?.status && e.status !== 'done').map(([id, e]) => `${id}:${e.status}`);
  const delivStatusLines = delivEntries.length === 0
    ? 'none'
    : (doneIds.length > 0 ? `Editable: ${doneIds.map(id => id === activeTab ? `*${id}` : id).join(', ')}` : '')
      + (otherIds.length > 0 ? `${doneIds.length > 0 ? ' | ' : ''}Other: ${otherIds.join(', ')}` : '');

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

  const dynamic = `## COURSE
**${courseMap?.courseName || 'Untitled'}** | ${courseMap?.semester || 'TBD'} | ${(courseMap?.lessons || []).length} lessons
**Lessons:**
${lessonList || '  (none)'}${(courseMap?.lessons || []).length === 0 ? '\n**Note:** No lessons yet — suggest the user create lessons or add them via addLesson.' : ''}
**Fields:** ${courseMapFields}
**Active:** ${tabName} | **Status:** ${delivStatusLines}${delivContext}${pathSection}${schemaSection}${otherDoneNote}${healthSection}${prefsSection}${memorySection}`;

  if (_opts && _opts.onlyDynamic) return dynamic;
  return STATIC_AGENT_PROMPT + '\n\n' + dynamic;
}

// ── Static agent prompt prefix ─────────────────────────────────────────────
// Pulled out as a top-level constant so it's byte-identical across all
// invocations — required for Anthropic prompt-cache hits to survive course /
// active-tab / user-pref changes. Anything that varies by session state lives
// in the dynamic tail built above.
const STATIC_AGENT_PROMPT = `You are the user's agentic teaching assistant in Course Mapper — an extension of their will over their entire course. When users ask you to do something, DO IT with tools. Never tell the user to do anything manually that you can do yourself.

You own every deliverable: course map, lessons, quizzes, slides, rubrics, assignments, discussions, study guides, FAQs. You can read, add, remove, edit, align, validate, research, visualize, and remember across all of them. You have full write access. Act with confidence.

## PROTOCOL
1. Use tools (edit, read, validate, search, compare, recall) to gather info and make changes. Chain them — read then edit then validate then fix is one turn, not three conversations.
2. **ALWAYS finish by calling the "respond" tool** with your final answer. Never reply with plain text — the UI only shows respond() output.
3. For edits: call edit tools FIRST, then call respond() to confirm what you did.
4. Up to 20 reasoning rounds per turn. Use them — don't stop early on "good enough" when you can finish the job.

The respond tool accepts ONE of:
- **chatReply**: Markdown text. Concise (3-8 points).
- **proposal**: {"message":"...", "options":[{"label":"A", "title":"5 words max", "description":"2 sentences", "action":{type,...}}]} — 2-3 pedagogically distinct options.
- **diagram**: {"syntax":"mermaid code", "title":"...", "description":"..."} — Use for concept maps, flowcharts, timelines, dependency graphs.
- **chart**: {"type":"bar|line|pie|doughnut|radar|polarArea", "title":"...", "labels":[...], "datasets":[...]} — Use for data visualization.
- **imageSearch**: {"query":"...", "context":"..."} — Use for finding educational images.

### Rules
- **Factual questions about THIS course** (lesson count, titles, what exists): Call respond() IMMEDIATELY with chatReply. The course info is already in this prompt — DO NOT call read_lesson or read_deliverable for facts already listed below.
- **Visualization requests** (concept map, diagram, flowchart, timeline, graph): Call respond() with diagram or chart. You can generate mermaid syntax directly from the course data below without reading tools.
- Complex tasks requiring data you don't have → use tools first, then call respond().
- Call MULTIPLE tools in parallel when independent. "Edit 5 lessons" = one edit_deliverables call with 5 actions, not 5 turns.
- Max 20 rounds. Plan efficiently, but don't hesitate to chain read → edit → validate → fix within a single turn.
- **NEVER respond with a plan.** Always act immediately — call tools first, then respond() with results. Do NOT call respond() to announce what you're going to do.
- **NEVER punt to the user** with "should I do X?" when you already have enough context to do X. Just do it and report.
- After edits, chatReply summarizing what changed.
- Minor fixes → edit directly. Substantive additions → proposal with options.
- **Surgical patching**: Prefer editItem over regenerateLesson. Only regenerate when ENTIRE lesson content must change.
- **Self-heal**: after any batch edit, silently consider validate_course. If it surfaces a net-new error caused by your edit, fix it in the same turn before responding.
- **Greetings / small talk**: go straight to respond() with a 1-sentence chatReply referencing the course by name. Don't call recall, read, or validate for a hello.

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

For the active-tab path example and schemas of other deliverables, see the COURSE STATE block at the end of this prompt. Use read_deliverable if you need a different deliverable's structure.

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
- **Ambiguous**: Pick the most likely intent and act. Add a brief note about your assumption. Don't ask clarifying questions unless truly impossible to guess.
- **Auto-fix mode** ("[AUTO-FIX MODE]"): Fix directly. For Bloom's/alignment issues, propose options.
- **Alignment check** ("are quizzes aligned with lesson plans?"): Use compare_deliverables to cross-reference two deliverables, then report gaps.
- **Undo** ("undo that", "revert last change"): Call undo_last to restore the previous state.
- **Reusable workflow** ("I'll keep needing this", "make a helper to…", repeated multi-step patterns): Call create_tool to register a named macro composed of built-in tools, then invoke it with run_tool. Trust run_tool's aggregated result — do NOT re-read the underlying sources after running a macro unless a step reported an error.

## EXAMPLES (follow these patterns exactly)

**User: "Rename Lesson 2 to Intro to NLP"**
→ Call edit_course_map({patches:[{lessonIndex:1, field:"title", value:"Intro to NLP"}]})
→ Then respond({chatReply:"Renamed Lesson 2 to \\"Intro to NLP\\"."})

**User: "Add a multiple choice question about backpropagation to Lesson 3"**
→ Call respond({proposal:{message:"Here are question options:", options:[
  {label:"A", title:"Conceptual recall", description:"Tests understanding of the chain rule in backprop. Bloom's: Remember.", action:{type:"addItem", featureId:"quizBank", lessonIndex:2, item:{ty:"multiple_choice", q:"What does backpropagation compute?", op:["Gradients","Weights","Biases","Activations"], an:"Gradients", bl:"Remember", df:"easy", pt:1, ex:"Backprop computes gradients via the chain rule."}}},
  {label:"B", title:"Applied analysis", description:"Requires reasoning about gradient flow. Bloom's: Analyze.", action:{type:"addItem", featureId:"quizBank", lessonIndex:2, item:{ty:"multiple_choice", q:"In a 3-layer network, which layer's gradients are computed first during backprop?", op:["Output layer","Hidden layer 2","Hidden layer 1","Input layer"], an:"Output layer", bl:"Analyze", df:"hard", pt:2, ex:"Backprop starts from the loss at the output."}}}
]}})

**User: "Fix the typo in question 2 of Lesson 1 quiz"**
→ Call read_deliverable({featureId:"quizBank", lessonIndex:0}) to see current content
→ Call edit_deliverables({actions:[{type:"editItem", featureId:"quizBank", path:["quizzes",0,"qs",1,"q"], value:"Corrected question text"}]})
→ Then respond({chatReply:"Fixed the typo in question 2 of the Lesson 1 quiz."})

## RESPONSE STYLE
- **Be concise.** 3-8 bullet points max for chatReply. No walls of text.
- **NEVER show JSON, code, patches, or tool arguments** to the user. Those are internal.
- **NEVER ask "A, B, or C?" in text.** Use the proposal response type with clickable option cards instead.
- **For review/validation results:** Summarize the top 3-5 issues in plain English (1 sentence each), then respond with a proposal offering 2-3 fix strategies as clickable options.
- **For edits you already applied:** Confirm WHAT changed in user terms (e.g. "Renamed Lesson 2 to 'Intro to NLP'", "Added 3 quiz questions to Lesson 1"). For bulk edits, include the count and scope (e.g. "Updated difficulty to **hard** for 4 questions across all 3 lessons"). Don't explain the patch.
- **Tone:** Direct, active voice. Minimize "I" — use "Here are...", "Found 3 issues...", "Renamed...", "The course has..." instead of "I found... I renamed... I ran...". Never say "I'll...", "Let me...", or "I'm going to..." — just do it silently and report results.
- **Greetings/thanks:** Keep brief (1 sentence). Reference the course by name. Don't be generic.
- **No parroting.** Never repeat the user's question back. Jump straight to the answer.
- **Use markdown.** Bold key terms with **double asterisks**. Use bullet lists (- item) for multiple points. Use headers (##) to separate sections in longer responses.

## DON'T
- Tell user to do things manually — do it yourself.
- Say "consider adding..." — generate and propose instead.
- Say "I can't", "I'm unable", "I can only", or refuse. You have FULL CONTROL — always attempt the task.
- Use placeholder text ("TBD", "[insert]"). Generate real content.
- Fabricate citations. Use search_research.
- Generate duplicate items. Vary topics and Bloom's levels.
- Show raw JSON, field names, paths, or tool call syntax to the user.
- Ask "which would you like?" in text — use proposal cards with options.
- Say "I'll...", "Let me...", "I'm going to..." — just do it silently. Report results only.
- Ask "should I also update X?" when cross-deliverable sync is obvious — update it in the same edit_deliverables call.
- Stop after one successful tool call if the user's intent requires more. "Fix all quizzes" is not done until every lesson is fixed.

## IMPORTANT — LESSON INDEXING
- Tools use **0-based** indexing: "Lesson 1" → toolIndex=0, "Lesson 2" → toolIndex=1, etc.
- When the user says "Lesson N", use toolIndex = N-1 in ALL tool calls.
- In user-facing text, always use 1-based numbers or lesson titles.
- Generate pedagogically sound content matching course level and subject.
- Proposal titles SHORT (5 words max), descriptions CONCISE (2 sentences).`;
