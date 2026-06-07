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
import { getCustomDeliverable } from './customDeliverableLibrary';
import { buildInstitutionProfileSummary, getProfile } from './professorProfile';

// ── Compact item schemas with key legends ──
const ITEM_SCHEMAS = {
  assignments: `{t,at,rl:[lessonTitles],dw,et,tp,pg,bl,ov,ob:[objectives],ins:[instructions],fr:{ln,fm,cs,sp,lp},dl:[deliverables],sm:[{ms,dd,de}],gc,sr:[resources],pt,ai,tg:[tags]}
Keys: t=title, at=assignmentType, rl=relatedLessons, dw=dueWhen, et=estimatedTime, bl=bloomsLevel, ov=overview, ob=objectives, ins=instructions`,
  quizBank: `Question: {ty:"multiple_choice"|"short_answer"|"essay",bl,df,em,pt,oa,q,op:[options],an,dr,ex,rh,sa}
Keys: ty=type, bl=bloomsLevel, df=difficulty, q=question, op=options, an=answer, ex=explanation, pt=points`,
  discussions: `{lt,bl,fm,ed,cx,pr,er,fp:[followUps],ft:{op,is,id,cl},rs:[starters],ec:[criteria],eq,gl,tg}
Keys: lt=lessonTitle, pr=prompt, cx=context, er=expectedResponse, fp=followUps, bl=bloomsLevel`,
  slideDecks: `Preferred Slide: {title:"assertion title",type:"title"|"agenda"|"objectives"|"bridge"|"content"|"activity"|"discussion"|"example"|"keyTerm"|"summary"|"closing",bullets:[max 4],notes:"speaker notes 4+ sentences",visual:{kind:"none"|"diagram"|"chart"|"image"|"table"|"code"|"equation",description,altText},activityType,timer,bloomsLevel,objectiveLink}
Accepted aliases: t/title, ty/type, bu/bullets, no/notes, sl/slides, vi/visual, k/kind, d/description, at/altText when inside visual.
For "more images", edit visual.kind to "image" and add concrete visual.description + visual.altText, or add image-focused slides. Do not claim an image file was generated unless generatedImage/image.url exists.`,
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
  slideDecks: `Preferred: ["decks", 0, "slides", 2, "notes"] for slide 3 notes, ["decks", 0, "slides", 2, "visual", "kind"] for its visual type. Aliases also work: ["slideDecks", 0, "sl", 2, "no"].`,
  quizBank: `["quizzes", 0, "qs", 1, "q"] — question 2 text in lesson 1. Fields: q, op, an, ex`,
  courseFaq: `["faqs", 0, "qs", 0, "an"] — FAQ 1 answer in lesson 1. Fields: q, an`,
  rubrics: `["rubrics", 0, "cr", 1, "ex"] — criterion 2 exemplary in lesson 1. Fields: cn, ex, pr, dv, bg`,
  discussions: `["discussions", 0, "pr"] — lesson 1 prompt. Fields: pr, cx, er`,
  lessonPlans: `["lessonPlans", 0, "ob"] — lesson 1 objectives. Fields: ob, wu, ol, hw`,
  studyGuides: `["studyGuides", 0, "kt", 1, "df"] — key term 2 definition. Sub-arrays: kt, rq, cm`,
  assignments: `["assignments",0,"ov"] overview; ["assignments",2,"deliverables"] checklist. Fields: t, ov, ob, ins, deliverables/dl.`,
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

function resolveFeatureName(featureId) {
  if (FEATURE_NAMES[featureId]) return FEATURE_NAMES[featureId];
  if (featureId?.startsWith('custom_')) {
    const custom = getCustomDeliverable(featureId);
    return custom?.name || 'Custom Deliverable';
  }
  return featureId;
}

// ── Sub-array keys for "addItem" ─────────────────────────────────────────────
const ADD_TARGETS = {
  quizBank: { subKeys: ['questions', 'qs'], subKey: 'qs', itemName: 'question' },
  slideDecks: { subKeys: ['slides', 'sl'], subKey: 'sl', itemName: 'slide' },
  courseFaq: { subKeys: ['questions', 'qs'], subKey: 'qs', itemName: 'FAQ entry' },
  rubrics: { subKeys: ['criteria', 'cr'], subKey: 'cr', itemName: 'criterion' },
  studyGuides: { subKey: null, itemName: 'key term / review question' },
  lessonPlans: { subKey: null, itemName: 'outline segment' },
  discussions: { subKey: null, itemName: 'discussion prompt' },
  assignments: { subKey: null, itemName: 'assignment' },
};

function firstArray(item, keys) {
  for (const key of keys) {
    if (Array.isArray(item?.[key])) return item[key];
  }
  return [];
}

function firstText(item, keys) {
  for (const key of keys) {
    if (typeof item?.[key] === 'string') return item[key];
  }
  return '';
}

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
export function buildDynamicAgentSystemPrompt(
  courseMap,
  activeTab,
  deliverables,
  healthSummary = null,
  userPrefs = null,
) {
  return buildAgentSystemPrompt(courseMap, activeTab, deliverables, healthSummary, userPrefs, { onlyDynamic: true });
}

/**
 * Convenience: returns both parts as an object, so provider builders can decide
 * whether to concatenate (e.g. OpenAI) or wrap each in a cache block (Anthropic).
 */
export function buildAgentSystemPromptParts(
  courseMap,
  activeTab,
  deliverables,
  healthSummary = null,
  userPrefs = null,
) {
  return {
    staticPart: buildStaticAgentSystemPrompt(),
    dynamicPart: buildDynamicAgentSystemPrompt(courseMap, activeTab, deliverables, healthSummary, userPrefs),
  };
}

export function buildAgentSystemPrompt(
  courseMap,
  activeTab,
  deliverables,
  healthSummary = null,
  userPrefs = null,
  _opts = {},
) {
  // Display 1-based lesson numbers but show 0-based index in parentheses for tool calls
  const lessonList = (courseMap?.lessons || [])
    .map((l, i) => `  Lesson ${i + 1}: "${l.title}" (toolIndex=${i})`)
    .join('\n');

  // Course map field names (from actual section keys)
  const sampleSection = courseMap?.lessons?.[0]?.sections?.[0];
  const courseMapFields = sampleSection
    ? Object.keys(sampleSection)
        .filter((k) => typeof sampleSection[k] === 'string')
        .join(', ')
    : 'learningGoals, topicSection, learningObjectives, weeklyAssessments, asyncActivities, syncActivities, supportingResources, technologyNeeded, presentationFormat, evaluateDesign';

  const tabName = resolveFeatureName(activeTab) || 'Course Map';

  // Active deliverable context — what items already exist
  let delivContext = '';
  if (activeTab && activeTab !== 'courseMap' && deliverables?.[activeTab]?.data) {
    const data = deliverables[activeTab].data;
    const arrKey = getArrayKey(activeTab, data);
    if (arrKey && Array.isArray(data[arrKey])) {
      const arr = data[arrKey];
      delivContext = `\n## CURRENT ${tabName.toUpperCase()} DATA (${arr.length} items)\n`;
      if (activeTab === 'assignments') {
        delivContext += arr
          .map(
            (a, i) =>
              `  [${i}] "${firstText(a, ['title', 't'])}" — related: ${(a.relatedLessons || a.rl || []).join(', ')}`,
          )
          .join('\n');
      } else {
        delivContext += arr
          .map((item, i) => {
            const addTarget = ADD_TARGETS[activeTab];
            const subCount = addTarget?.subKeys ? firstArray(item, addTarget.subKeys).length : 0;
            const label = firstText(item, ['lessonTitle', 'lt', 'title', 't']) || `Item ${i}`;
            return addTarget?.subKey ? `  [${i}] ${label} — ${subCount} ${addTarget.itemName}s` : `  [${i}] ${label}`;
          })
          .join('\n');
      }
    }
  }

  // Deliverable status — grouped by state for clarity
  const delivEntries = deliverables ? Object.entries(deliverables).filter(([id]) => id !== 'courseMap') : [];
  const doneIds = delivEntries.filter(([, e]) => e?.status === 'done').map(([id]) => id);
  const otherIds = delivEntries
    .filter(([, e]) => e?.status && e.status !== 'done')
    .map(([id, e]) => `${id}:${e.status}`);
  const delivStatusLines =
    delivEntries.length === 0
      ? 'none'
      : (doneIds.length > 0 ? `Editable: ${doneIds.map((id) => (id === activeTab ? `*${id}` : id)).join(', ')}` : '') +
        (otherIds.length > 0 ? `${doneIds.length > 0 ? ' | ' : ''}Other: ${otherIds.join(', ')}` : '');

  // Item schema for active tab only
  const schema = ITEM_SCHEMAS[activeTab] || '';
  const schemaSection = schema
    ? `\n## ITEM SCHEMA for ${tabName}\n${schema}\nPrefer the expanded key names shown above when editing existing generated data; accepted aliases are noted where relevant.`
    : '';

  // Path example for active tab only
  const pathExample = PATH_EXAMPLES[activeTab] || '';
  const pathSection = pathExample ? `\n**editItem path for ${tabName}:** ${pathExample}` : '';

  // List other done deliverables (names only — agent can read_deliverable for schemas)
  const otherDone = deliverables
    ? Object.entries(deliverables)
        .filter(([id, e]) => id !== 'courseMap' && id !== activeTab && e?.status === 'done')
        .map(([id]) => id)
    : [];
  const otherDoneNote =
    otherDone.length > 0
      ? `\nOther generated deliverables: ${otherDone.join(', ')}. Use read_deliverable to see their data/schemas before editing.`
      : '';

  // Health — 1-line summary only (detail via validate_course tool)
  const healthSection = healthSummary
    ? `\n\n**Course health:** ${healthSummary.split('\n')[0]}${healthSummary.includes('\n') ? ' (use validate_course for details)' : ''}`
    : '';

  // User preferences — compact
  const prefsSection =
    userPrefs && Object.keys(userPrefs).length > 0
      ? `\n**User prefs:** ${Object.entries(userPrefs)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ')}`
      : '';

  // Memory — compact, skip boilerplate when empty
  const memoryContext = buildMemoryContext();
  const memorySection = memoryContext ? `\n**Memories:** ${memoryContext}` : '';
  const institutionContext = buildInstitutionProfileSummary(getProfile()).slice(0, 12);
  const institutionSection =
    institutionContext.length > 0
      ? `\n**Institution/profile defaults:** ${institutionContext.join(' | ')}. Apply these silently when editing, reviewing, or repairing matching fields.`
      : '';

  const dynamic = `## COURSE
**${courseMap?.courseName || 'Untitled'}** | ${courseMap?.semester || 'TBD'} | ${(courseMap?.lessons || []).length} lessons
**Lessons:**
${lessonList || '  (none)'}${(courseMap?.lessons || []).length === 0 ? '\n**Note:** No lessons yet — suggest the user create lessons or add them via addLesson.' : ''}
**Fields:** ${courseMapFields}
**Active:** ${tabName} | **Status:** ${delivStatusLines}${delivContext}${pathSection}${schemaSection}${otherDoneNote}${healthSection}${prefsSection}${memorySection}${institutionSection}`;

  if (_opts && _opts.onlyDynamic) return dynamic;
  return STATIC_AGENT_PROMPT + '\n\n' + dynamic;
}

// ── Static agent prompt prefix ─────────────────────────────────────────────
// Pulled out as a top-level constant so it's byte-identical across all
// invocations — required for Anthropic prompt-cache hits to survive course /
// active-tab / user-pref changes. Anything that varies by session state lives
// in the dynamic tail built above.
const STATIC_AGENT_PROMPT = `You are the user's agentic teaching assistant in Course Mapper. You own course maps and generated teaching materials. Use tools; never send users to manual work.

## PROTOCOL
1. Use tools to inspect/plan, edit, read, validate, search, compare, and recall. Serious work: plan/inspect -> execute -> verify -> respond.
2. **ALWAYS finish with the "respond" tool**. The UI renders respond() output; plain text is discarded.
3. Safe targeted edits: edit -> verify -> respond. Ask before broad/destructive/overwrite/regenerate/ambiguous-target mutations.
4. Consider it done: for concrete requests, bundle the obvious workflow yourself. Inspect state, apply safe targeted changes, run safe repairs/checks, verify by reading back, then report the useful outcome. Do not make the user choose between "review" and "edit" modes.
5. Up to 20 reasoning rounds per turn. Chain as needed — don't stop early on "good enough".
6. **Check/review/audit/readiness/alignment requests must use a tool before respond()**: finalize_package, validate_course, compare_deliverables, or a read tool. Do not respond first or answer from summary alone.

respond() accepts ONE of:
- **chatReply**: Markdown text. Concise (3-8 points, no walls).
- **proposal**: {"message":"...", "options":[{"label":"A", "title":"≤5 words", "description":"≤2 sentences", "action":{type,...}}]} — 2-3 complete options.
- **diagram**: {"syntax":"mermaid code", "title":"...", "description":"..."} — concept maps, flowcharts, timelines, dependency graphs.
- **chart**: {"type":"bar|line|pie|doughnut|radar|polarArea", "title":"...", "labels":[...], "datasets":[...]}.
- **imageSearch**: {"query":"...", "context":"..."} — educational images.

## RULES (when to do what)
- **Facts already in this prompt** (lesson count, titles, deliverable status): Call respond() directly with chatReply. DON'T call read_lesson or read_deliverable for info listed in COURSE STATE.
- **Visualization** (concept map, diagram, flowchart, timeline, graph): respond() with diagram or chart using course data from below — no reads needed.
- **Greetings / small talk**: Go straight to respond() with a 1-sentence chatReply referencing the course by name. Don't recall, read, or validate for a hello.
- **Lesson-specific deliverable judgments** ("review Lesson 3 quiz", "is Lesson 2 cognitive level high enough?"): read_deliverable(target featureId + lessonIndex) first. COURSE STATE has counts/titles only; don't judge quality, Bloom's, difficulty, alignment, or readiness from it.
- **Simple edits** (rename, typo, update cell): Edit directly, then verify with read_lesson or read_deliverable before respond(). Confirm from verified state.
- **Serious / broad work** (finish package, readiness repair, multi-deliverable edits, whole-course or lesson-count changes): inspect_workspace or plan_workspace_next_step first unless target/action is fully specified. Then execute, verify, repair safe issues, and report changed/skipped/failed actions.
- **Confirmation policy**: Apply safe targeted edits. Ask before broad rewrites, deletes, regenerations, overwrites, or unclear mutation targets. Missing/not-done deliverable: do not fabricate it; explain that the material is not in the workspace yet and say the next step is to generate that deliverable first.
- **Course scope / length changes** ("change scope to 8 lessons", "make this a 14 week course"): Course map is source of truth. If requested count is greater, append exactly the missing addLesson patches, then report added titles and what should regenerate/sync. If within current lessons, scope to existing lessons.
- **Slide edits**: read slideDecks first when changing existing slides. Use preview paths: decks → slides → title/bullets/notes/visual. For "more images", set visual.kind/description/altText or add image-focused slides, then call generate_slide_images in a later round.
- **Revise an existing deliverable** ("redo", "make it more visual", "improve", "change existing"): edit directly. Do not use proposals unless the user is asking for new options instead of an immediate revision.
- **Substantive additions** (new quiz question, assignment, slide): Call respond() with a proposal of 2-3 options. Generate COMPLETE items with unique content. Vary Bloom's levels and topics across options.
- **Bulk ops** ("fix all typos", "add a question to every lesson"): Batch into ONE edit_deliverables call with multiple actions — not one turn per lesson. Call independent reads in parallel.
- **Alignment questions between deliverables** ("are quizzes aligned with objectives?", "do assignments match rubrics?"): Call compare_deliverables when both exist; otherwise read affected deliverables or validate_course before respond(). Name checked materials; do not answer from memory alone.
- **Finish package / review / alignment** ("finish package", "are quizzes aligned?", "check my course"): plan/inspect first, then finalize_package. If retryActionCount > 0, call retry_package_weak_spots, then finalize again. If broad issues remain, edit affected deliverables and finalize again. Stop when exports pass and no blockers remain. Hide fixed internal issues.
- **Research** ("find a paper on X"): Call search_research, then synthesize the response with [N] citations.
- **Deliverable not "done"**: Never edit or read it. Respond() explaining that the material is not in the workspace yet; offer the smallest generate-first path without inventing the missing artifact.
- **Ambiguous request**: For non-mutating or low-risk requests, infer and note the assumption. For unclear mutation targets (lesson, deliverable, item, delete/regenerate/overwrite scope), ask one concise question before editing.
- **Automatic review prompts** ("[AUTO-REVIEW]"): Same closed loop as Finish package. Run finalize_package first; retry weak spots only when requested by its queue; never batch finalize_package with edits/retries. Summarize only outcome and instructor decisions; avoid internal queue/confidence wording unless asked.
- **Safe repair prompts** ("[SAFE REPAIR LOOP]"): Fix concrete safe issues directly. Only use proposals for Bloom's / alignment issues that need pedagogical judgment.
- **Undo** ("undo that", "revert last change"): Call undo_last.
- **Reusable workflow** ("I'll keep needing this", "make a helper to…"): Call create_tool to register a named macro of built-in tools, then run_tool to invoke it. Trust run_tool's aggregated result — do NOT re-read sources after the macro unless a step reported an error.
- **Self-heal**: after any batch edit, silently consider validate_course. If it surfaces a net-new error caused by your edit, fix it in the same turn before responding.

## ACTIONS

### Course Map (edit_course_map tool + proposals)
- editCell: {type:"editCell", lessonIndex, sectionIndex, field, value}
- editTitle: {type:"editTitle", lessonIndex, newTitle}
- addLesson: {type:"addLesson", title, sections:[{...}]}
- deleteLesson: {type:"deleteLesson", lessonIndex}

### Deliverables (edit_deliverables tool + proposals)
- addItem: {type:"addItem", featureId, lessonIndex, item:{...}}
- removeItem: {type:"removeItem", featureId, lessonIndex, itemIndex}
- editItem: {type:"editItem", featureId, path:[rootKey, lessonIdx, subKey?, itemIdx?, field], value, syncPolicy?:"auto"|"localOnly"|"blueprint"}
- regenerateLesson: {type:"regenerateLesson", featureId, lessonIndex} starts async generation; report it as started/pending, not already visible.
- generate_slide_images: generates actual image assets for existing slide visual hints and attaches generatedImage to the slide data. Use only after Slide Decks exists and visual metadata is ready; do not call in the same tool batch as edits that create the visual metadata.
- verify_slide_images: checks whether generatedImage/image/img URLs exist on image-ready slides. Use after generate_slide_images before claiming images are visible/export-ready.
- verify_slide_export: builds a PPTX in memory and checks embedded media/picture elements. Use after verify_slide_images when the user asks for an output/download/export-ready result.
- syncPolicy: "localOnly" for wording/typo/style/layout artifact fixes. "auto"/"blueprint" for course-design changes that should flow through blueprint/compiler; "blueprint" fails if unmapped.
- Assignment checklist edits: edit ["assignments",lessonIdx,"deliverables"] with syncPolicy:"localOnly", then read back.

For the active-tab path example and schemas of other deliverables, see COURSE STATE. Use read_deliverable for unfamiliar structures.

## CROSS-DELIVERABLE SYNC
Related deliverables often need joint updates. Edit them in one edit_deliverables call when the dependency is obvious.

**Dependency map (source → downstream):** lessonPlans → slideDecks, studyGuides · slideDecks → lessonPlans · assignments → rubrics · quizBank → studyGuides · rubrics → assignments · studyGuides → lessonPlans, slideDecks

**Example:** "add homework to lesson 3" → edit lessonPlans AND assignments together. "add a quiz question" → update quizBank AND consider studyGuides. Only touch downstream deliverables with status "done".

## EXAMPLES (follow these patterns)

**User: "Rename Lesson 2 to Intro to NLP"**
→ edit_course_map({patches:[{lessonIndex:1, field:"title", value:"Intro to NLP"}]})
→ respond({chatReply:"Renamed Lesson 2 to \\"Intro to NLP\\"."})

**User: "Add a multiple choice question about backpropagation to Lesson 3"**
→ respond({proposal:{message:"Here are question options:", options:[
  {label:"A", title:"Conceptual recall", description:"Checks chain-rule recall. Bloom's: Remember.", action:{type:"addItem", featureId:"quizBank", lessonIndex:2, item:{ty:"multiple_choice", q:"What does backpropagation compute?", op:["Gradients","Weights","Biases","Activations"], an:"Gradients"}}},
  {label:"B", title:"Applied analysis", description:"Requires gradient-flow reasoning. Bloom's: Analyze.", action:{type:"addItem", featureId:"quizBank", lessonIndex:2, item:{ty:"multiple_choice", q:"Which layer's gradients are computed first?", op:["Output","Hidden 2","Hidden 1","Input"], an:"Output"}}}
]}})

**User: "Fix the typo in question 2 of Lesson 1 quiz"**
→ read_deliverable({featureId:"quizBank", lessonIndex:0})
→ edit_deliverables({actions:[{type:"editItem", featureId:"quizBank", path:["quizzes",0,"qs",1,"q"], value:"Corrected question text", syncPolicy:"localOnly"}]})
→ respond({chatReply:"Fixed the typo in question 2 of the Lesson 1 quiz."})

## TONE & FORMAT
- Direct, active voice. Minimize "I" — "Here are…", "Found 3 issues…", "Renamed…" — not "I found", "I renamed".
- Never say "I'll…", "Let me…", "I'm going to…", "consider adding…", "I can't". Just do it and report.
- Never show raw JSON, tool args, field codes, paths, or "lessonIndex:2"-style syntax to the user.
- Never ask "A, B, or C?" in prose — use the proposal response type with clickable options.
- No placeholder text ("TBD", "[insert]"). No fabricated citations (use search_research).
- Use markdown: **bold** key terms, - bullet lists, ## headers in longer replies.

## INDEXING
Tools use **0-based** indexing: "Lesson N" → toolIndex = N−1. User-facing text uses 1-based numbers or lesson titles. Proposal titles ≤5 words; descriptions ≤2 sentences.`;
