// Feature 2.3 — BYOM: Reconstruct course structure from uploaded materials
export const RECONSTRUCT_SYSTEM_PROMPT = `You are an expert instructional designer. Your course maps align with Quality Matters (QM) Higher Education Rubric standards for learning objectives, instructional alignment, and course technology. The instructor has uploaded their existing course materials (slides, notes, lecture outlines, prior syllabi, or other teaching artifacts). Your task is to REVERSE-ENGINEER the course structure from these materials and produce a structured Course Map.

DO NOT invent content that isn't implied by the materials. Extract, infer, and organize what is actually there.

CRITICAL WRITING RULE: All content will be read by humans. Never repeat boilerplate phrases across cells. For Learning Objectives, write "Students will be able to:" ONCE as a stem, then list objectives starting directly with Bloom's verbs (e.g., "1a. Analyze...", "2a. Evaluate...") — do NOT repeat "Students will be able to" on every line. Vary sentence structure across all fields to sound natural, not templated.

You must return ONLY valid JSON. No markdown, no explanation—just the JSON object.`;

export const SYSTEM_PROMPT = `You are an expert instructional designer and course mapping specialist. Your course maps align with Quality Matters (QM) Higher Education Rubric standards for learning objectives, instructional alignment, and course technology. Your task is to analyze course syllabi and related materials, then produce a structured Course Map.

A Course Map breaks down a course into weekly lessons, each with multiple topic sections, and maps out learning goals, objectives, assessments, activities, resources, and technology needs.

CRITICAL WRITING RULE: All content will be read by humans. Never repeat boilerplate phrases across cells. For Learning Objectives, write "Students will be able to:" ONCE as a stem, then list objectives starting directly with Bloom's verbs (e.g., "1a. Analyze...", "2a. Evaluate...") — do NOT repeat "Students will be able to" on every line. Vary sentence structure across all fields to sound natural, not templated.

You must return ONLY valid JSON. No markdown, no explanation—just the JSON object.`;

// Default column definitions used when no custom columns are provided
const DEFAULT_COLUMN_DEFS = {
  learningGoals: 'The big ideas and questions to be addressed. Derived from values, knowledge, skills, behaviors, and competencies outlined in the syllabus. When there are multiple goals, number them (1, 2, 3…) so objectives can reference them.',
  topicSection: 'A numbered subsection title (e.g., "1.1: Historical Overview of Immigration Policy").',
  learningObjectives: 'Write the stem "Students will be able to:" ONCE at the top, then list each objective on its own numbered line using ONLY a Bloom\'s action verb + content — do NOT repeat the stem. Use the goal number prefix (1a, 1b, 2a) when goals are numbered. Every objective must be measurable and consistent with course-level learning goals (QM 2.1, 2.2). Objectives must be suited to the level of the course (QM 2.5). Example:\\n"Students will be able to:\\n1a. Analyze the impact of immigration policy on communities\\n1b. Compare federal and state policy frameworks\\n2a. Evaluate the effectiveness of advocacy strategies"',
  weeklyAssessments: 'How students demonstrate learning. Each assessment must explicitly connect to stated learning objectives (QM 3.1). Include a variety of assessment types across lessons (QM 3.4). List each assessment on its own line with a numbered prefix (e.g., "1. Reflection Paper: Analyze the impact of...\\n2. Discussion Post: Compare two theories...").',
  asyncActivities: 'What students do on their own time. Activities must directly help learners achieve stated objectives (QM 5.1) and provide opportunities for interaction and active learning (QM 5.2). List each activity on its own line with a numbered prefix (e.g., "1. Read: Chapter 5 on policy frameworks\\n2. Watch: Immigration documentary (45 min)\\n3. Complete: Reflection worksheet").',
  syncActivities: 'What students do together in real-time. Activities must directly help learners achieve stated objectives (QM 5.1) and provide opportunities for interaction and active learning (QM 5.2). List each activity on its own line with a numbered prefix (e.g., "1. Discussion: Debate immigration policy impacts\\n2. Group Work: Case study analysis\\n3. Activity: Role-play exercise").',
  technologyNeeded: 'Specific platforms or tool types needed. Tools must support learning objectives (QM 6.1) and promote learner engagement (QM 6.2). Use a variety of technologies across lessons (QM 6.3). Where possible, note the vendor\'s accessibility statement or VPAT availability for each tool (QM 8.7). List each on its own line with a bullet or number if multiple (e.g., "1. NYU Brightspace (submission)\\n2. Zoom (synchronous session)\\n3. Google Docs (collaboration)").',
  presentationFormat: 'The primary media/delivery format for that section\'s instructional material (e.g., Text, Video, Podcast, Multimedia, Simulation, Discussion, Presentation).',
  supportingResources: 'Specific readings, articles, videos, textbook chapters, and other materials. Use a variety of instructional materials (QM 4.5). Materials must contribute to achievement of learning objectives (QM 4.1). The relationship between materials and learning activities should be clear (QM 4.2). Note copyright status or open-access availability where known (QM 4.3). Prefer current, up-to-date sources that represent contemporary theory and practice in the discipline (QM 4.4). Extract directly from the syllabus when available. List each resource on its own line with a numbered prefix (e.g., "1. Nazario, S. (2020). Chapter 3...\\n2. Gillen et al. (2024). Article title...").',
  evaluateDesign: 'Self-check: Are objectives measurable and suited to course level? Do assessments measure the stated objectives? Do activities help achieve those objectives? Is the relationship between objectives, activities, and assessments clear? Do instructional materials support the objectives? (QM 2.1–2.5, 3.1, 4.1, 5.1)',
};

export const EXAMINE_SYSTEM_PROMPT = `You are an expert instructional designer performing a quality assurance review of a Course Map.

Your task is to carefully examine the provided Course Map against the original syllabus/course materials and identify any issues. Return ONLY targeted patches for cells that need fixing.

CHECK FOR:
1. Missing content — lessons, topics, activities, or assessments mentioned in the syllabus but absent from the course map.
2. Inaccurate information — wrong dates, mismatched topics, incorrect descriptions, or misattributed readings.
3. Incomplete cells — fields that are empty or too vague when the syllabus provides specific details.
4. Consistency — ensure lesson numbering, formatting, and terminology are consistent throughout.
5. Alignment — verify learning objectives align with assessments and activities for each lesson.

RULES:
- Do NOT return the whole course map. Return ONLY a JSON patches object.
- Only patch fields that actually need changes. Leave correct content alone.
- Do NOT remove or shorten existing correct content.
- If nothing needs fixing, return: {"patches": []}

IMPORTANT: Every patch MUST include a "reason" field that explains:
- WHAT was wrong (e.g., "Missing reading assignment mentioned on syllabus p.3")
- WHY you changed it (e.g., "Syllabus specifies Chapter 5, not Chapter 3")
- Cite the specific syllabus reference if applicable (page, section, week, date).
Be precise — vague reasons like "improved content" are NOT acceptable.

Return a JSON object with a "patches" array. Each patch targets a specific cell:
{"patches": [
  {"lessonIndex": 0, "sectionIndex": 0, "field": "learningObjectives", "value": "Corrected content...", "reason": "Syllabus Week 1 lists 'Analyze social policy frameworks' as an objective, but it was missing from the course map."},
  {"lessonIndex": 2, "field": "title", "value": "Lesson 3: Corrected Title", "reason": "Syllabus names this module 'Health Policy Analysis', not 'Policy Review'."},
  {"action": "addSection", "lessonIndex": 2, "sectionIndex": 3, "section": {"learningGoals": "...", ...}, "reason": "Syllabus Week 3 includes a second topic section on 'Community Health' that was omitted."},
  {"field": "courseName", "value": "Corrected Course Name", "reason": "Syllabus header shows the official course name as 'SOCW-GP 5001'."}
]}

- lessonIndex and sectionIndex are 0-based.
- For lesson titles, use "field": "title" with no sectionIndex.
- For section fields, include both lessonIndex and sectionIndex.
- For course-level fields (courseName, semester), just use "field" and "value".
- Every patch MUST have a "reason" string. No exceptions.
- Return ONLY the JSON object, no explanation or commentary.

SEMESTER FIELD RULES (read carefully):
- "TBD" is a VALID placeholder for semester. It means the instructor has not yet decided the specific academic term (e.g., Fall 2026, Spring 2027). Do NOT patch the semester field just because it says "TBD".
- Only patch the semester field if the syllabus EXPLICITLY states a specific term (e.g., "Fall 2025", "Spring 2026", "Summer 2024") AND the course map has a clearly wrong value.
- The semester field refers to the ACADEMIC TERM, not course duration. Never suggest a lesson count or duration (like "15-week course" or "14-week undergraduate") as a semester value.
- Course length/duration information (e.g., "15-week course") belongs in the course description, NOT the semester field.`;

export function buildExamineUserPrompt(courseMap, syllabusText) {
  return `Here is the Course Map to examine:\n\n${JSON.stringify(courseMap)}${
    syllabusText ? `\n\nHere is the original syllabus/course material for reference:\n\n${syllabusText.slice(0, 30000)}` : ''
  }\n\nExamine this course map thoroughly. Return ONLY a JSON patches object for cells that need fixing. If nothing needs fixing, return {"patches": []}:`;
}

export const REVISION_SYSTEM_PROMPT = `You are an expert instructional designer assistant. You have previously generated a Course Map (provided as JSON). You are now chatting with the user about it.

FIRST, determine if the user's message is:
(A) A REVISION REQUEST — they want to change, add, remove, or fix something in the course map.
(B) A CONVERSATIONAL MESSAGE — they are saying thanks, asking a question, confirming things look good, making a comment, etc.

If (B) CONVERSATIONAL: Respond with ONLY a JSON object like this:
{"chatReply": "Your friendly response here."}
Do NOT regenerate or return the course map. Just reply naturally and helpfully.

If (A) REVISION REQUEST: You MUST use the PATCH FORMAT to minimize token usage. Return ONLY a JSON object with a "patches" array. Each patch targets a specific cell:

{"patches": [
  {"lessonIndex": 0, "sectionIndex": 0, "field": "learningObjectives", "value": "New content..."},
  {"lessonIndex": 2, "field": "title", "value": "Lesson 3: New Title"},
  {"lessonIndex": 1, "sectionIndex": 1, "field": "syncActivities", "value": "Updated activity..."},
  {"action": "addLesson", "lessonIndex": 5, "lesson": {"title": "...", "sections": [...]}},
  {"action": "addSection", "lessonIndex": 2, "sectionIndex": 3, "section": {"learningGoals": "...", ...}},
  {"action": "removeLesson", "lessonIndex": 4},
  {"field": "courseName", "value": "Updated Course Name"},
  {"field": "semester", "value": "SP27"}
]}

PATCH RULES:
1. ONLY include patches for fields that actually need to change. Do NOT include unchanged content.
2. lessonIndex and sectionIndex are 0-based.
3. For lesson titles, use "field": "title" with no sectionIndex.
4. For section fields, include both lessonIndex and sectionIndex.
5. For course-level fields, just use "field" and "value".
6. Return ONLY the JSON patches object, no explanation or commentary.
7. If the user provides additional reference files, create patches for the specific sections that need new info.
8. Consider the full conversation history when making changes — do NOT undo previous revisions unless the user explicitly asks.`;

export function buildRevisionUserPrompt(courseMap, userMessage, userEdits, chatHistory, lockedIndices = []) {
  let editsContext = '';
  if (userEdits && userEdits.length > 0) {
    editsContext = '\n\nIMPORTANT — The user has manually edited some cells since the last AI generation. Respect and preserve these manual changes unless the user explicitly asks to change them:\n';
    for (const edit of userEdits) {
      if (edit.key === 'title') {
        editsContext += `- Lesson ${edit.lessonIdx + 1} title changed from "${edit.oldValue}" to "${edit.newValue}"\n`;
      } else {
        editsContext += `- Lesson ${edit.lessonIdx + 1}, Section ${edit.sectionIdx + 1}, ${edit.key}: changed from "${edit.oldValue.slice(0, 80)}..." to "${edit.newValue.slice(0, 80)}..."\n`;
      }
    }
  }

  let historyContext = '';
  if (chatHistory && chatHistory.length > 0) {
    historyContext = '\n\nPrevious conversation (for context — do NOT repeat these changes, they are already applied):\n';
    for (const msg of chatHistory) {
      const prefix = msg.role === 'user' ? 'User' : 'Assistant';
      historyContext += `${prefix}: ${msg.text}\n`;
    }
  }

  const lockNote = lockedIndices.length > 0
    ? `\n\nLOCKED LESSONS (DO NOT MODIFY — user has locked these): Lesson indices [${lockedIndices.join(', ')}] (0-based). These lessons must remain EXACTLY as-is in the output, even if the user's request would normally change them.`
    : '';

  return `Here is the current Course Map JSON:\n\n${JSON.stringify(courseMap)}${editsContext}${historyContext}${lockNote}\n\nUser's latest request:\n${userMessage}\n\nReturn ONLY the JSON patches object:`;
}

/**
 * Pre-segment syllabus text by week/lesson/module markers.
 * Adds `--- SEGMENT N ---` labels so the AI can align content to the correct lesson.
 * Returns original text unchanged if fewer than 2 segments are detected.
 */
function segmentSyllabus(text) {
  if (!text || text.length < 200) return text;
  // Split on lines that start with common weekly/lesson markers followed by a number
  const parts = text.split(/(?=(?:^|\n)\s*(?:Week|Lesson|Module|Session|Unit|Class)\s+\d+)/gi).filter(Boolean);
  if (parts.length < 2) return text; // Couldn't segment — return as-is
  return parts.map((part, i) => `\n--- SEGMENT ${i + 1} ---\n${part.trim()}`).join('\n');
}

export function buildUserPrompt(syllabusText, columns, scopeIndices, isReconstruct = false, expectedLessons = null) {
  // Filter to only enabled columns (enabled defaults to true when field is missing)
  const enabledColumns = columns && columns.length > 0
    ? columns.filter(c => c.enabled !== false)
    : columns;

  // Build column definitions dynamically from the columns array
  let columnDefs = '';
  let sampleSection = '';
  const colKeys = [];

  if (enabledColumns && enabledColumns.length > 0) {
    for (const col of enabledColumns) {
      const desc = DEFAULT_COLUMN_DEFS[col.key] || `Content for "${col.label}". Generate thoughtful, pedagogically sound content for this field.`;
      columnDefs += `- ${col.key}: ${desc}\n`;
      const sampleVal = DEFAULT_COLUMN_DEFS[col.key]
        ? `"Example content for ${col.label}..."`
        : `"Thoughtful content for ${col.label}..."`;
      sampleSection += `          "${col.key}": ${sampleVal},\n`;
      colKeys.push(col.key);
    }
  } else {
    // Fallback to defaults
    for (const [key, desc] of Object.entries(DEFAULT_COLUMN_DEFS)) {
      columnDefs += `- ${key}: ${desc}\n`;
      sampleSection += `          "${key}": "Example content...",\n`;
      colKeys.push(key);
    }
  }

  // Build lesson scope instruction
  let lessonScopeInstruction;
  if (Array.isArray(scopeIndices) && scopeIndices.length > 0) {
    const lessonNumbers = scopeIndices.map(i => i + 1).join(', ');
    lessonScopeInstruction = `2. Generate ONLY the following lesson numbers from the syllabus: ${lessonNumbers} (1-indexed). Do NOT generate any other lessons. The "lessons" array in your JSON must contain EXACTLY ${scopeIndices.length} lesson(s) corresponding to these positions in the syllabus.`;
  } else if (expectedLessons) {
    lessonScopeInstruction = `2. The syllabus contains approximately ${expectedLessons} lessons/weeks. Generate exactly that many lessons. If you detect a slightly different structure, match the syllabus but aim for ${expectedLessons} total.`;
  } else {
    lessonScopeInstruction = `2. Auto-detect the number of weeks or lessons from the syllabus structure.`;
  }

  const preamble = isReconstruct
    ? `Reconstruct a Course Map from the following instructor materials. These are existing slides, notes, or outlines — extract the actual structure present in the materials.`
    : `Analyze the following course syllabus/materials and generate a complete Course Map.`;

  const guideline4 = isReconstruct
    ? `4. Extract content DIRECTLY from the materials — topics, activities, assessments, resources. Do not invent.`
    : `4. Prioritize extracting content directly from the syllabus (especially readings, resources, topics).`;

  const guideline5 = isReconstruct
    ? `5. Where the materials are sparse on detail for a specific field, infer from surrounding context or mark as "To be determined".`
    : `5. Where the syllabus lacks explicit detail, generate thoughtful, pedagogically sound content.`;

  return `${preamble}

INSTRUCTIONS:
1. Auto-detect the course name and semester/term from the content. If semester is not found, use "TBD".
${lessonScopeInstruction}
3. For each week/lesson, create 2-5 topic subsections.
${guideline4}
${guideline5}
6. Do NOT leave any field empty — always provide meaningful content.
7. Each section MUST contain ALL of the following keys: ${colKeys.join(', ')}.
8. When a section has multiple learning goals, number them sequentially (1, 2, 3… — never skip a number). Then prefix each learning objective with the goal number it maps to (e.g., 1a, 1b, 2a, 2b). If there is only one goal, no numbering is needed.
9. CRITICAL — For learningObjectives: Write "Students will be able to:" ONCE as the opening stem, then list each objective starting directly with a Bloom's verb. Do NOT repeat "Students will be able to" on every line. Example: "Students will be able to:\\n1a. Analyze the impact of policy...\\n1b. Compare federal and state frameworks...\\n2a. Evaluate advocacy strategies..."
10. If the syllabus below contains "--- SEGMENT N ---" markers, use these segments to accurately map content to the correct lesson/week. Each segment corresponds to one lesson.
11. QM ALIGNMENT: Ensure learning objectives at the module level are measurable, consistent with course-level goals, and suited to the course level. Make the relationship between objectives, activities, and assessments explicit in the evaluateDesign column. Assessments should measure stated objectives; activities should help learners achieve them; instructional materials should support them.

COLUMN DEFINITIONS:
${columnDefs}
REQUIRED JSON FORMAT:
{
  "courseName": "Full Course Name",
  "semester": "FA26",
  "lessons": [
    {
      "title": "Lesson 1: Title of the First Lesson",
      "sections": [
        {
${sampleSection}        }
      ]
    }
  ]
}

${isReconstruct ? 'UPLOADED MATERIALS:' : 'SYLLABUS CONTENT:'}
${segmentSyllabus(syllabusText)}

Generate the complete Course Map JSON now:`;
}

// ── Feature 6.4: AI Gap Filler ──

export const GAP_FILL_SYSTEM_PROMPT = `You are an expert instructional designer. You are given a Course Map that has some empty or placeholder fields. Your task is to fill ONLY the empty or clearly incomplete fields with high-quality, specific content appropriate for the course.

Rules:
1. Return ONLY valid JSON patches as an array: [{ "lessonIndex": N, "sectionIndex": M, "key": "fieldName", "value": "filled content" }]
2. ONLY fill fields that are empty, null, or contain placeholder text like "TBD", "TODO", or very short generic values (< 5 words).
3. Do NOT modify fields that already have meaningful content.
4. Make content specific to the lesson title and course context — no generic filler.
5. Return an empty array [] if there are no gaps to fill.`;

/**
 * Build the user prompt for gap filling.
 * Identifies empty fields and asks AI to fill only those.
 *
 * @param {object} courseMap
 * @param {string[]} colKeys — column keys to check
 * @returns {string}
 */
export function buildGapFillPrompt(courseMap, colKeys = []) {
  const lessons = courseMap?.lessons || [];
  const keysToCheck = colKeys.length > 0 ? colKeys : [
    'learningGoals', 'topicSection', 'learningObjectives',
    'weeklyAssessments', 'asyncActivities', 'syncActivities',
    'technologyNeeded', 'supportingResources',
  ];

  const gaps = [];
  lessons.forEach((lesson, li) => {
    const sections = lesson.sections && lesson.sections.length > 0 ? lesson.sections : [{}];
    sections.forEach((section, si) => {
      keysToCheck.forEach(key => {
        const val = section[key];
        const isEmpty = val == null || val === '' || (typeof val === 'string' && (val.trim().length < 5 || /^(tbd|todo|n\/a|\?)$/i.test(val.trim())));
        if (isEmpty) {
          gaps.push({ lessonIndex: li, sectionIndex: si, key, lessonTitle: lesson.title || `Lesson ${li + 1}` });
        }
      });
    });
  });

  if (gaps.length === 0) {
    return 'All fields are already filled. Return [].';
  }

  const gapList = gaps.slice(0, 30).map(g =>
    `L${g.lessonIndex + 1}S${g.sectionIndex + 1} "${g.lessonTitle}" — field: "${g.key}"`
  ).join('\n');

  return `Course: ${courseMap.courseName || 'Unknown'}
Semester: ${courseMap.semester || ''}

The following fields are empty and need to be filled:
${gapList}

Return JSON patches to fill these gaps (array of {lessonIndex, sectionIndex, key, value}).`;
}

/**
 * Count empty fields in a course map.
 * @param {object} courseMap
 * @param {string[]} colKeys
 * @returns {number}
 */
export function countGaps(courseMap, colKeys = []) {
  const lessons = courseMap?.lessons || [];
  const keysToCheck = colKeys.length > 0 ? colKeys : [
    'learningGoals', 'topicSection', 'learningObjectives',
    'weeklyAssessments', 'asyncActivities', 'syncActivities',
    'technologyNeeded', 'supportingResources',
  ];
  let count = 0;
  lessons.forEach(lesson => {
    const sections = lesson.sections && lesson.sections.length > 0 ? lesson.sections : [{}];
    sections.forEach(section => {
      keysToCheck.forEach(key => {
        const val = section[key];
        if (val == null || val === '' || (typeof val === 'string' && (val.trim().length < 5 || /^(tbd|todo|n\/a|\?)$/i.test(val.trim())))) {
          count++;
        }
      });
    });
  });
  return count;
}
