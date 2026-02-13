export const SYSTEM_PROMPT = `You are an expert instructional designer and course mapping specialist. Your task is to analyze course syllabi and related materials, then produce a structured Course Map.

A Course Map breaks down a course into weekly lessons, each with multiple topic sections, and maps out learning goals, objectives, assessments, activities, resources, and technology needs.

You must return ONLY valid JSON. No markdown, no explanation—just the JSON object.`;

// Default column definitions used when no custom columns are provided
const DEFAULT_COLUMN_DEFS = {
  learningGoals: 'The big ideas and questions to be addressed. Derived from values, knowledge, skills, behaviors, and competencies outlined in the syllabus.',
  topicSection: 'A numbered subsection title (e.g., "1.1: Historical Overview of Immigration Policy").',
  learningObjectives: '"Students will be able to..." statements using active verbs from Bloom\'s taxonomy (analyze, evaluate, create, describe, compare, etc.).',
  weeklyAssessments: 'How students demonstrate learning — describe the task or activity (e.g., "Reflection Paper: Analyze the impact of...", "Discussion Post: Compare two theories...").',
  asyncActivities: 'What students do on their own time — readings, watching videos, completing assignments. Start with action verbs like "Read:", "Watch:", "Complete:", "Review:".',
  syncActivities: 'What students do together in real-time — discussions, group work, presentations, activities. Start with "Activity:", "Discussion:", "Group Work:", "Presentation:".',
  technologyNeeded: 'Specific platforms or tool types needed for the assessments and activities.',
  presentationFormat: 'The primary media/delivery format for that section\'s instructional material (e.g., Text, Video, Podcast, Multimedia, Simulation, Discussion, Presentation).',
  supportingResources: 'Specific readings, articles, videos, textbook chapters, and other materials. Extract these directly from the syllabus when available.',
  evaluateDesign: 'A brief self-check note on whether everything in this row is aligned and coherent.',
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
- Return ONLY the JSON object, no explanation or commentary.`;

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

export function buildRevisionUserPrompt(courseMap, userMessage, userEdits, chatHistory) {
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

  return `Here is the current Course Map JSON:\n\n${JSON.stringify(courseMap)}${editsContext}${historyContext}\n\nUser's latest request:\n${userMessage}\n\nReturn ONLY the JSON patches object:`;
}

export function buildUserPrompt(syllabusText, columns) {
  // Build column definitions dynamically from the columns array
  let columnDefs = '';
  let sampleSection = '';
  const colKeys = [];

  if (columns && columns.length > 0) {
    for (const col of columns) {
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

  return `Analyze the following course syllabus/materials and generate a complete Course Map.

INSTRUCTIONS:
1. Auto-detect the course name and semester/term from the content. If semester is not found, use "TBD".
2. Auto-detect the number of weeks or lessons from the syllabus structure.
3. For each week/lesson, create 2-5 topic subsections.
4. Prioritize extracting content directly from the syllabus (especially readings, resources, topics).
5. Where the syllabus lacks explicit detail, generate thoughtful, pedagogically sound content.
6. Do NOT leave any field empty — always provide meaningful content.
7. Each section MUST contain ALL of the following keys: ${colKeys.join(', ')}.

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

SYLLABUS CONTENT:
${syllabusText}

Generate the complete Course Map JSON now:`;
}
