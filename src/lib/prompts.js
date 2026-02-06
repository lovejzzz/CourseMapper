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
