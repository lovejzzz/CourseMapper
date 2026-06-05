# CourseMapper — Complete Product Specification

**Version:** 0.5
**Last Updated:** March 2026

---

## What Is CourseMapper?

CourseMapper is an AI-powered instructional design platform that runs entirely in the web browser. It helps university faculty and instructors transform a course syllabus or description into a comprehensive, pedagogically-aligned suite of teaching materials — all editable, exportable, and interconnected.

A professor uploads their syllabus PDF, picks an AI model, selects which materials they want (lesson plans, slide decks, quizzes, rubrics, etc.), and the system generates everything in structured, editable form. The instructor can then refine any piece through inline editing, AI-assisted revisions, or natural language chat commands, and export the final materials to Word, PowerPoint, PDF, Google Docs, or a portable project file.

The application is designed to be self-contained. All data lives in the user's browser by default. An optional Firebase integration provides cloud sync and Google sign-in, but the core experience requires no account and no backend — just an AI provider API key.

---

## The Four Screens

CourseMapper has four main screens, connected by a linear flow with the ability to jump back at any time. Navigation uses hash-based routing (the URL fragment after the # sign), so the app works as a single-page application without server-side routing.

### Screen 1: Landing Page

The landing page is where everything begins. It serves three purposes: configure the AI connection, provide course materials, and restore previous sessions.

**Visual Layout:**
The page uses a simplified workspace-style landing layout with the EduTool.dev logo in the top bar, the headline "Everything you need to teach/learn a course", and one centered start panel. The start panel combines sample courses, source file upload, free-text course instructions, AI configuration, and the Continue action.

**File Upload:**
The upload zone accepts drag-and-drop or click-to-browse file selection. It supports over 18 file formats including Word documents, PDFs, plain text, Markdown, rich text, spreadsheets (Excel, CSV), presentations (PowerPoint), HTML, ePub, and ZIP archives containing any of these. When files are dropped, they appear as a list showing file name and size, with a remove button on each.

There is a special case: if the user drops a `.coursemapper` project file (or a `.json` file), the system recognizes it as a saved session rather than course material. The drag-over state changes to show "Open project" instead of the normal upload message, and dropping the file restores the entire previous session — course map, deliverables, chat history, and all settings.

**Example Chips:**
Three shuffled sample-course buttons auto-fill the text area with realistic course descriptions. A small shuffle button refreshes the visible samples without requiring a page reload.

**Text Area:**
An optional free-text field where users can type a course description, add context or special instructions, or supplement uploaded files. The placeholder text changes depending on whether files are already uploaded.

**AI Model Configuration:**
A collapsible panel where users connect to their AI provider. It includes:

- A provider selector with OpenAI, Anthropic, Google, and DeepSeek
- An API key input field that auto-detects which provider the key belongs to based on its prefix (keys starting with "sk-proj-" are OpenAI, "sk-ant-" are Anthropic, keys starting with "AIza" are Google, and keys starting with "sk-" can be DeepSeek)
- Once a valid key is entered, the system fetches available models from that provider and displays them in a dropdown
- A green "Connected" badge appears when the key is validated
- Direct links to each provider's API key dashboard
- The configuration auto-collapses after successful connection to reduce visual clutter

**Session Restore:**
If the browser has a previously saved session in local storage, a banner appears offering to resume where the user left off. The banner has "Resume" and "Dismiss" buttons. Dismissing removes the saved session.

**Dark Mode Toggle:**
A sun/moon icon in the upper-right corner switches between light and dark themes. The preference is saved to local storage and also respects the operating system's dark mode setting on first visit. The logo swaps to the dark-theme EduTool.dev asset when dark mode is active.

**User Menu:**
A Google sign-in button appears in the header. Once signed in, a "My Projects" button opens the cloud project picker. The user's name and avatar are shown.

**Continue Button:**
A large, gradient-colored button at the bottom. It is disabled until two conditions are met: the AI connection is valid, and at least one file or some prompt text has been provided.

**Footer:**
Shows the version number, and links to the Privacy Policy and Terms of Service pages.

---

### Screen 2: Feature Selection

After clicking Continue, the user arrives at a page where they choose which teaching materials to generate. The course map (the week-by-week course structure) is always included and cannot be deselected — it is the foundation that all other deliverables depend on.

**Available Deliverables (9 built-in types plus custom):**

Each deliverable is presented as a card with a colored icon, title, one-sentence description, and a category badge. The categories are:

- **Foundation** (blue/indigo): Course Map, Syllabus
- **Instruction** (violet/amber): Lesson Plans, Slide Decks
- **Assessment** (emerald/sky/rose): Assignment Briefs, Rubrics, Quiz & Exam Bank
- **Engagement** (orange): Discussion Prompts
- **Student** (teal/cyan): Study Guides, Course FAQ

Each card has a toggle. Users can select any combination. The ordering is intelligent: if no syllabus file was uploaded, the Syllabus card appears right after Course Map (since the AI will generate one from scratch, it's important). If a syllabus file exists, it moves to the end since it's less critical.

**Custom Deliverable Builder:**
A button labeled "+ Create Custom..." opens a two-step modal:

Step 1 asks for the deliverable name (required), a description, a color (9 choices), and an icon (8 choices including document, chart, lightbulb, users, clipboard, star, puzzle, beaker).

Step 2 asks for an optional system prompt (custom AI instruction), a user prompt template (with placeholder variables like {course}, {lesson}, {objectives}), and tone/style/length preferences. An "Auto-fill from course" button calls the AI to recommend appropriate settings based on the uploaded course materials.

Custom deliverables are stored in the browser's local storage and, if the user is signed in, synced to their Firestore cloud account. They persist across sessions and can be edited or deleted.

---

### Screen 3: Configuration & Generation

The third screen lets users fine-tune each selected deliverable before generation begins. It is divided into per-deliverable configuration sections, each in its own card.

**Lesson Scope Selector:**
At the top, users choose whether to generate materials for all lessons or only specific ones. The "Specific lessons" option shows an interactive grid of numbered checkboxes (one per lesson detected from the syllabus), with batch select/clear buttons and a count display like "3 of 15 selected."

**Per-Deliverable Settings:**
Each deliverable section offers tone, style, and length dropdowns:

- Tone options: Auto, Academic, Professional, Conversational, Friendly, Formal, Encouraging
- Style options: Auto, Bullet Points, Paragraphs, Tables, Numbered Lists, Mixed
- Length options: Auto, Brief, Standard, Detailed, Comprehensive

Some deliverables have additional specific settings:

- Lesson Plans: session duration (30 minutes to 3 hours), speaker notes level
- Slide Decks: slides per lesson (8 to 20), color theme (5 university-inspired palettes)
- Quiz Bank: question type distribution (multiple choice, short answer, essay), difficulty level
- Course Map: column configuration (toggle individual columns like learning goals, assessments, resources)
- Rubrics: citation style (APA 7, MLA 9, Chicago 17, IEEE)

**Tiered Differentiation:**
A toggle to generate three variants of each item: Scaffolded (more support, simpler), Standard (normal), and Extension (advanced, challenging). This is useful for inclusive teaching.

**Reference File and Extra Instructions:**
Each deliverable section has a drop zone for an additional reference file (appended to the AI prompt) and a free-text field for specific constraints or instructions.

**Preview System:**
Small example cards show what generated content will look like for each deliverable type, labeled with an "Example" badge. These help users understand the impact of their tone/style/length choices before committing to generation.

**Generate Button:**
A large gradient button that triggers the full generation pipeline. It shows an estimated time ("~2 minutes") and transforms into a loading spinner with "Generating..." text during processing.

---

### Screen 4: Workspace

The workspace is where users spend most of their time. It is a three-column layout: the course map table on the left, deliverable content in the center, and an AI chat panel on the right.

**Header Bar:**
Contains the app logo, a "New Project" button (with confirmation dialog), user menu, dark mode toggle, and a help button that opens an FAQ drawer.

**Left Column — Course Map Table:**
A wide, scrollable table showing the week-by-week course structure. Each row is one lesson/week. Columns are configurable and can include: learning goals, topic/section, learning objectives, weekly assessments, async activities, sync activities, supporting resources, technology needed, presentation format, and design evaluation.

Column toggle pills at the top let users show or hide columns without deleting data. The table has a sticky header that stays visible while scrolling. Each cell is clickable for inline editing — clicking turns the cell into a text input. Changes are saved automatically.

Right-clicking any cell opens an AI context menu with four options: Improve ("make this more specific and actionable"), Expand ("add detail and examples"), Simplify ("condense while keeping key points"), and Rewrite ("fresh version with different wording"). There is also an "Ask AI about this..." option that opens the chat panel pre-scoped to that cell's context.

Lessons can be locked (via a lock icon) to prevent the AI from modifying them during regeneration. Lessons can be reordered by dragging, and grouped into modules that can be collapsed or expanded.

The table supports diff highlighting when comparing the current version to a previous one, showing what changed in each cell.

**Center Column — Tab Bar and Deliverable Views:**
A horizontal tab bar at the top shows one tab per selected deliverable plus the Course Map tab (always present). Tabs can be reordered by dragging. Each tab shows a status indicator (streaming, error, done) when relevant. An unseen-changes badge appears on tabs whose content was updated while the user was viewing a different tab. A "+" button allows adding deliverables that weren't selected in step 2.

Below the tab bar, the active deliverable's content fills the center area. Each deliverable type has its own specialized view (described in the Deliverables section below). All views support:

- Inline editing of text fields
- A fullscreen toggle for focused work
- A quality score badge (0-100, color-coded from red to green)
- A "Regenerate" button for individual lessons
- A streaming banner during generation
- A student view toggle that hides instructor-facing notes

**Right Column — Chat Panel:**
A resizable panel (default 360 pixels wide, draggable border to adjust, width persisted across sessions) containing the AI assistant.

The chat panel has several regions:

_Progress Header:_ A collapsible section at the top showing generation progress — percentage complete, current step name, per-deliverable progress bars, stop button, and estimated time remaining. This appears only during active generation.

_Message History:_ A scrollable list of chat messages rendered in markdown. Messages come from the user, the AI assistant, and the system. The list auto-scrolls to the latest message.

_Special Message Cards:_ The chat can display rich, interactive cards:

- **Proposal Cards** show 2-3 options as clickable cards (for example, tone variants for a rewrite). The user picks one, sees a before/after diff preview, and accepts or rejects.
- **Diff Review Cards** show a side-by-side comparison of what will change, with checkmark and X buttons to accept or reject.
- **Change Summary Cards** list what was added, changed, or removed after an AI action, with an undo button.
- **Validation Cards** show pedagogical issues found (Bloom's taxonomy misalignment, cognitive load problems, readability issues) with one-click "Fix" buttons.
- **Research Cards** display academic search results with source previews — paper titles with DOI links, book covers, video thumbnails.
- **Diagram Cards** show AI-generated visualizations: flowcharts, concept maps, Gantt charts, sequence diagrams, rendered using the Mermaid diagramming library.
- **Chart Cards** display data visualizations: bar, line, pie, and radar charts.
- **Image Search Cards** show AI-generated images with the prompt used.
- **Sync Suggestion Cards** appear when the user edits the course map and affected deliverables are detected — "Lesson 2 changed. Want to regenerate slides and quizzes?" with Approve/Skip buttons.
- **Agent Progress Cards** pin to the top during multi-tool operations, showing which tools are executing with checkmarks as each completes.

_Chat Input:_ A text input area with file attachment support (drag-drop or click), a send button, and a stop button during streaming. The empty state shows a hint: "Ask me to revise, validate, research, generate diagrams, or improve the course."

---

## AI Integration

### Supported Providers

CourseMapper supports three major AI providers, each with multiple models:

- **OpenAI**: GPT-4o, GPT-4 Turbo, o1, o3, and other available models
- **Anthropic**: Claude 3 Sonnet, Claude 3 Opus, Claude 3 Haiku
- **Google**: Gemini 2.0 Flash, Gemini 1.5 Flash, Gemini 1.5 Pro

The system auto-detects model capabilities. Some models (like o1 and o3) do not support custom temperature settings, so the system automatically omits temperature from those requests. If a model returns an error, the system can fall back to other models in the same provider.

### How Generation Works

When the user clicks Generate, the system follows this pipeline:

1. **Lesson Detection**: If not already done, the AI analyzes uploaded files and prompt text to determine how many lessons/weeks the course has and what each one covers. This produces the initial course map skeleton.

2. **Course Map Generation**: The AI fills in each column of the course map for every lesson, streaming results back as they arrive. The user sees cells populate in real-time.

3. **Quality Examination**: After the course map is complete, the AI reviews it against the original syllabus for completeness, accuracy, and alignment. It returns structured patches (corrections) which are applied automatically.

4. **Deliverable Generation**: Each selected deliverable is generated in parallel (up to 3 at a time). Each deliverable uses the completed course map as input, ensuring alignment. Results stream into the tab views as they arrive.

5. **Health Check**: After all deliverables are generated, an automatic pedagogical validation runs, checking Bloom's taxonomy alignment, cognitive load, readability, and difficulty progression. Results appear as a Validation Card in the chat.

All AI communication uses Server-Sent Events for streaming. The client reads response chunks as they arrive, accumulates them, and parses the JSON structure incrementally. This means the user sees content appearing progressively rather than waiting for the entire response.

### Chat Modes

The chat system routes messages differently based on the current application state:

**Generation Mode**: While the course map or deliverables are being generated, the chat shows progress updates. Users can ask the AI to stop, and it will confirm before halting.

**Help Mode**: When no deliverables have been generated yet, or when the user asks general questions, the AI acts as a pedagogical tutor. It provides markdown-formatted guidance about teaching, course design, Bloom's taxonomy, and best practices. It is context-aware — it knows the course structure and can suggest improvements.

**Agent Mode**: After deliverables are generated, the AI becomes an intelligent agent with access to eight specialized tools. The user can give natural language commands like "Add a discussion prompt about ethics to every lesson" or "Check if my quiz questions align with learning objectives." The agent reasons about the request, calls appropriate tools, and presents results for approval.

**Revision Mode**: When the user asks for specific changes to the course map, the system routes to a revision endpoint that returns structured patches. These are applied to the course map and trigger cascade sync checks.

### Agent Tools (8 capabilities)

When in agent mode, the AI can use these tools, often combining multiple in a single response:

1. **Validate Course**: Runs pedagogical health checks across all materials — Bloom's taxonomy alignment, assessment-objective matching, cognitive load analysis, readability scoring, and difficulty progression. Returns a structured report with severity levels and fix suggestions.

2. **Check Grammar**: Sends specific lesson content to a grammar checking service for spelling, grammar, and style corrections. Returns suggested fixes.

3. **Search Research**: Searches six free academic sources (OpenAlex for papers, Wikipedia for overviews, CrossRef for citations, YouTube for educational videos, Open Library and Google Books for textbooks) and returns formatted results with proper citations in APA 7 format.

4. **Read Deliverable**: Reads the full content of any generated deliverable (or a specific lesson within it) and returns a summary. This lets the agent understand current content before making changes.

5. **Read Lesson**: Reads a specific lesson from the course map with all its fields, returning summaries of each field. Used for context before editing.

6. **Edit Course Map**: Makes structured changes to the course map — editing cells, renaming lessons, adding or removing lessons. Changes are presented as patches for user approval.

7. **Edit Deliverables**: Adds, edits, or removes items within any deliverable. For example, adding a quiz question, modifying a rubric criterion, or removing a discussion prompt. Includes deduplication to avoid creating duplicate items.

8. **Save Preference**: Stores teaching preferences (pedagogy style, reading level, Bloom's focus, assessment philosophy) to the user's cloud profile for use in future sessions.

**Tool Execution Model:**
The agent uses each AI provider's native function-calling API (not text-based JSON parsing). Multiple tools can execute in parallel — for example, validating the course while simultaneously searching for research sources. The agent can reason for up to 10 iterations, calling tools, receiving results, and reasoning further before presenting a final response.

Every change proposed by the agent goes through a pre-validation step and is shown to the user as a before/after diff. The user must explicitly accept or reject each change. Nothing is applied without approval.

---

## The Nine Deliverable Types

### 1. Course Map (Always Generated)

The foundational week-by-week course structure. It is a table with one row per lesson and up to ten configurable columns:

- **Learning Goals**: High-level goals for the week
- **Topic/Section**: Content topics and subtopics
- **Learning Objectives**: Specific, measurable objectives using Bloom's taxonomy verbs
- **Weekly Assessments**: Quizzes, assignments, or other assessments for that week
- **Async Activities**: Activities students complete on their own time (readings, videos, online discussions)
- **Sync Activities**: In-class or live-session activities (lectures, labs, group work)
- **Supporting Resources**: Textbooks, articles, websites, videos
- **Technology Needed**: Tools, software, or platforms required
- **Presentation Format**: How the lesson is delivered (lecture, seminar, lab, flipped)
- **Design Evaluation**: Self-assessment of lesson design quality and alignment

Users can enable or disable any column without losing its data. Disabled columns are simply hidden from view and excluded from exports.

The course map also stores course-level metadata: course name, semester, overall goals, and learning outcomes.

### 2. Syllabus

A professional, institution-ready course syllabus containing:

- Course information (name, number, semester, credit hours, meeting times, location)
- Instructor information (name, email, office, office hours)
- Course description (paragraph overview)
- Learning outcomes (numbered list)
- Required materials (textbooks, software, other)
- Grading scale (A through F with percentage ranges)
- Grade breakdown (participation, assignments, midterm, final with weights)
- Policies (attendance, late work, academic integrity, accommodations)
- Weekly schedule (table with week number, topic, activities, readings, due dates)

Displayed as structured, collapsible sections with inline editing. The schedule section shows as a timeline. Exportable to PDF, Word, and Google Docs.

### 3. Lesson Plans

Detailed, session-by-session instructional plans with timing, activities, and pedagogical notes. Each lesson plan includes:

- Lesson title, week number, and duration
- Bloom's taxonomy levels targeted
- Learning objectives (specific to this session)
- Required materials
- Warm-up activity (type, duration, prompt, purpose, facilitation notes)
- Lesson outline (timed activity sequence with columns for time block, activity name, type, description, instructor notes, interaction required, student grouping, and Bloom's level)
- Formative check (quick assessment to verify learning during the session — type, prompt, and which objective it aligns with)
- Universal Design for Learning notes (accommodations and alternative formats)
- Homework assignment (title, description, estimated time, key concepts)
- Additional resources
- Reading difficulty score (Flesch-Kincaid grade level)

Displayed as collapsible cards per lesson with color-coded Bloom's tags. The outline appears as a table with timing. Supports tiered differentiation (Scaffolded/Standard/Extension variants). A student view toggle hides instructor notes and facilitation tips.

### 4. Slide Decks

University-quality presentation slides with themed visual design and speaker notes. Each lesson produces a deck of 8-20 slides. Each slide has:

- Title text
- Slide type (title slide, objectives, content, activity, question, summary, agenda)
- Bullet points or content text
- Speaker notes (instructor talking points, not shown to students)
- Optional artwork reference
- Optional timer (for timed activities)
- Bloom's taxonomy level

**Five Color Themes:**

1. Navy & Gold — Classic university palette
2. Forest & Amber — Natural, warm tones
3. Purple & Orange — Modern, energetic
4. Crimson & Gold — Traditional academic
5. Ocean & Cyan — Cool, professional

Each theme defines primary, secondary, accent, background, text, and decorative colors. Slide types get different visual treatments: title slides have large headings with decorative geometric shapes, content slides focus on readable bullet lists, activity slides have highlighted instruction boxes, and summary slides use recap lists.

The slide preview shows thumbnails with speaker notes in a drawer below. Slides are rendered as visual cards that approximate their final presentation appearance, including colored backgrounds, typography hierarchy, and decorative elements.

Exportable to PowerPoint (with full theme, speaker notes, and formatting preserved), Google Slides (opens in browser for collaborative editing), and PDF (one slide per page, text-based).

### 5. Rubrics

Detailed grading rubrics with criteria, performance levels, weights, and calibration notes. Each rubric includes:

- Title and assessment type (Essay, Project, Presentation, Lab Report, etc.)
- Associated lesson
- Total points
- Bloom's taxonomy level
- Criteria rows, each containing:
  - Criterion name (e.g., "Thesis & Argument")
  - Which learning objective it aligns with
  - Weight and point value
  - Four performance levels with descriptions: Exemplary, Proficient, Developing, Beginning
- Grade policy connection (how scores map to letter grades)
- Teacher notes (calibration guidance, common issues, grading tips)

Displayed as a colored table with performance levels in columns. Inline editable. Exportable to CSV, PDF, Word, Google Sheets, and Google Docs.

### 6. Quiz & Exam Bank

A question bank organized by lesson, difficulty, and Bloom's level. Each lesson's quiz section includes:

- Total question count and category distribution
- Individual questions, each with:
  - Question type: Multiple Choice, Short Answer, or Essay
  - Bloom's taxonomy level
  - Difficulty rating (1-5 stars)
  - Point value
  - Which learning objective it tests
  - The question text
  - For multiple choice: four options with the correct answer marked, rationale for each distractor, and an explanation of why the correct answer is right
  - For short answer: model answer, grading rubric, and a suggested answer
  - For essay: detailed rubric, model response outline
  - A hint for students who answer incorrectly

Displayed as collapsible cards per lesson. Each question expands to show full details. A student view hides answers, explanations, and hints. Questions can be individually regenerated. Exportable to CSV (for LMS import), PDF, Word, Google Sheets, and Google Docs.

### 7. Assignment Briefs

Clear, complete assignment descriptions with scaffolding and submission guidelines. Each assignment includes:

- Title and assessment type
- Related lessons
- Description (what students will do)
- Estimated completion time
- Point value and percentage of final grade
- Bloom's taxonomy level
- Learning objectives addressed
- Step-by-step instructions
- Formatting requirements (length, font, citation style, margins)
- Scaffolding milestones (intermediate due dates — outline, draft, peer review, final)
- Submission method and format
- Late work policy
- Link to associated rubric
- Academic integrity expectations
- Additional resources and support

Displayed with structured sections. Supports tiered variants (Scaffolded with more guidance, Standard, Extension with added challenge). Exportable to PDF, Word, CSV, Google Docs.

### 8. Discussion Prompts

Engaging discussion questions with facilitation guides and equity considerations. Each discussion includes:

- Lesson association and Bloom's level
- Format (Synchronous Whole Class, Asynchronous Forum, Small Group, Pairs)
- Estimated duration
- Context (what this discussion builds on)
- Main prompt (the central question)
- Expected responses (what good answers should include)
- Follow-up probes (deeper questions the instructor can ask)
- Facilitation guide (tone, procedures, timing breakdown)
- Equity considerations (accommodations for English language learners, introverts, students with disabilities)
- Participation guidelines (ground rules)
- Response framework (e.g., "Position → Evidence → Reasoning")
- Student-facing leading question (a gentler entry point)
- Grouping arrangement (seating layout, group sizes)
- Global learning connections (how this discussion builds broader skills)

Displayed with color-coded sections. Supports tiered variants. Exportable to PDF, Word, Google Docs.

### 9. Study Guides

Student-facing review materials with vocabulary, misconception correction, and exam preparation. Each guide includes:

- Essential message (the single most important takeaway, highlighted)
- Summary (paragraph overview of the lesson)
- Key terms (each with term, definition, and a concrete example)
- Common misconceptions (table: what students often believe vs. the correct understanding)
- Review questions (with Bloom's level tags and hints)
- Exam prep tips (specific, actionable study strategies)
- Study resource recommendations (textbooks, videos, flashcard apps, websites)
- Cross-references to related materials in other deliverables

Displayed with collapsible cards for key terms and review questions. Supports tiered variants. Exportable to PDF, Word, Google Sheets.

### Custom Deliverables

Users can create their own deliverable types through the Custom Deliverable Builder (described in Screen 2). Custom deliverables can have any name, icon, color, and custom AI prompts. They are generated alongside built-in types and support the same editing, exporting, and sync features.

---

## Export System

### Supported Formats

Each deliverable type supports a subset of these export formats:

- **Excel (.xlsx)**: Sortable spreadsheets with formatting (Course Map only)
- **Word (.docx)**: Formatted documents with proper headings, tables, and styles
- **PDF (.pdf)**: Print-ready documents with professional layout
- **CSV (.csv)**: Plain data for import into learning management systems
- **PowerPoint (.pptx)**: Full slide presentations with themes, speaker notes, and formatting (Slide Decks only)
- **Google Docs**: Opens directly in the user's Google Drive for collaborative editing
- **Google Sheets**: Opens as a spreadsheet in Google Drive
- **Google Slides**: Opens as a presentation in Google Drive (Slide Decks only)

### Export Panel

A slide-out panel on the right side of the workspace with two modes:

**Current Tab mode**: Exports only the active deliverable in its supported formats. Buttons for each format are shown with icons.

**All mode**: Exports everything at once. Two options:

- "Download ZIP" creates a ZIP archive with an organized folder structure containing all deliverables in their native formats
- "Save .coursemapper" creates a portable project file containing the complete session state

### Google Integration

Exporting to Google Docs, Sheets, or Slides triggers an OAuth2 consent flow. The user grants permission, and the app creates a new document in their Google Drive with the content pre-populated. The document opens in a new browser tab for further editing. No Google API key is needed from the user — the app handles the OAuth flow directly.

### The .coursemapper Project File

A JSON-based portable save file containing everything needed to restore a session:

- Format version number (for future compatibility)
- Course name and metadata
- Complete course map data
- Column configuration (which columns are enabled)
- Generation status
- AI provider and model information
- User edits history (all manual changes made after generation)
- Chat history (last 50 messages)
- Original file names
- Version history (last 30 snapshots)
- Selected features and their configuration
- Lesson scope settings
- Prompt text
- Active tab
- All deliverable data
- Slide theme selection
- Timestamp

Dropping this file onto the landing page restores everything exactly as it was. This makes sessions shareable between devices or colleagues.

---

## Cloud Sync and Authentication

### Firebase Integration

CourseMapper uses Firebase for optional cloud features:

**Authentication**: Google OAuth sign-in via Firebase Auth. A single button on the landing page. No email/password accounts — Google only.

**Cloud Storage Structure**: Each signed-in user gets their own isolated space in Firestore (Google's NoSQL database). The structure organizes by user, then by project:

- User profile (name, institution, department, teaching preferences)
- Custom deliverable definitions
- Projects, each containing:
  - Metadata (course name, semester, creation date, last modified)
  - Course map data
  - Deliverable data (one document per deliverable type)

**Security**: Firestore rules ensure each user can only read and write their own data. Documents are limited to 1 megabyte to prevent storage abuse.

### Auto-Save Behavior

The application automatically saves state in two ways:

**Local Storage**: Every 3 seconds (debounced — it waits for 3 seconds of inactivity before saving), the complete session state is written to the browser's local storage. This survives page refreshes and browser restarts.

**Cloud Sync**: If signed in, every 5 seconds the session syncs to Firestore in the background. A status badge in the header shows the sync state: idle, saving, saved, or error.

### Project Picker

A modal dialog listing all of the user's cloud projects, sorted by last modified date (newest first). Each entry shows the course name, semester, and last modified timestamp. Clicking a project loads it into the workspace. A delete button removes projects from the cloud.

### Version History

The system maintains up to 30 snapshots of the course map state. Each snapshot is created before major changes (AI edits, regeneration, bulk modifications). A version timeline panel allows browsing and restoring previous versions with diff highlighting showing what changed.

---

## Pedagogical Features

### Bloom's Taxonomy Validation

The system parses action verbs from learning objectives and maps them to Bloom's six cognitive levels: Remember, Understand, Apply, Analyze, Evaluate, Create. It then checks that assessments match the cognitive level of their corresponding objectives.

For example, if an objective says "Analyze the causes of World War I" (Analyze level), but the only quiz question asks "In what year did WWI begin?" (Remember level), the validator flags this as a misalignment. It also checks for regressions — if later lessons have easier assessments than earlier ones, this suggests the difficulty progression is off.

Results appear as a Validation Card in the chat with specific issue descriptions and one-click "Fix" buttons that trigger AI-powered corrections.

### Cognitive Load Assessment

An estimator counts the number of items per lesson (quiz questions, activities, readings, resources) and estimates total student time. It flags overloaded weeks (more than 120 minutes of content or more than 15 items) and suggests spreading content across more weeks.

### Reading Level Control

Five reading level tiers adjust the complexity of generated content:

1. **Community College** (8th-10th grade reading level): Simple, accessible language
2. **Undergraduate** (10th-12th grade): Standard academic prose
3. **Upper Division** (12th-14th grade): Advanced vocabulary, discipline-specific terminology
4. **Graduate** (14th-16th grade): Scholarly tone, assumes domain knowledge
5. **Professional** (16th+ grade): Expert-level, specialized terminology

Each deliverable displays its Flesch-Kincaid readability score as a badge. The selected reading level is injected into AI prompts to control generation complexity.

### Academic Research Integration

The agent's research tool searches six free academic sources without requiring any additional API keys:

1. **OpenAlex**: Over 250 million academic papers with abstracts, citation counts, and DOI links
2. **Wikipedia**: Topic overviews, historical context, and reference links
3. **CrossRef**: DOI lookup and citation metadata
4. **YouTube** (via Invidious): Educational video search with thumbnails and durations
5. **Open Library**: Books and textbooks with covers and ISBNs
6. **Google Books**: Books with categories and page counts

Search results are formatted with numbered citations and automatically converted to APA 7 format. The Research Card in chat displays interactive previews with clickable links.

### Cascade Sync

When the user edits the course map, the system detects which deliverables are affected:

- **High confidence**: A directly related field changed (e.g., modifying a learning objective affects rubrics, quizzes, and lesson plans that reference that objective)
- **Medium confidence**: An indirectly related field changed (e.g., adding a resource might affect lesson plans)
- **Low confidence**: A possible but unlikely impact

A Sync Suggestion Card appears in the chat: "Lesson 2 has changes. Want to regenerate Slides, Quiz Bank, and Discussion Prompts?" The user can approve (triggering concurrent regeneration of up to 3 deliverables at a time) or skip.

After regeneration, a Change Summary Card shows exactly what was added, changed, or removed, with an undo button.

### Teaching Frameworks

Five pedagogical modes shape how course materials are structured:

1. **Lecture-Based** (default): Traditional instructor-led sessions with direct instruction
2. **Flipped Classroom**: Pre-class content delivery with in-class application activities
3. **Problem-Based Learning**: Case-centered inquiry where problems drive the learning
4. **Seminar**: Discussion-heavy Socratic format
5. **Competency-Based**: Mastery-based progression where students advance by demonstrating skills

Each mode modifies the AI system prompts to produce structurally different lesson plans, activities, and assessments appropriate to that pedagogy.

---

## Dark Mode, Print, and Accessibility

### Dark Mode

A complete dark theme that inverts the color scheme. Implementation uses CSS custom properties for core colors (backgrounds, text, borders, inputs, tables) that swap values between light and dark modes. The toggle is a sun/moon icon that persists the preference to local storage. On first visit, the system respects the operating system's dark mode setting.

The dark mode covers the entire application including all deliverable views, the chat panel, modals, export panel, and static pages. Five slide deck themes are unaffected by dark mode since they represent their own self-contained color systems.

### Print Support

CSS media queries optimize the layout for printing. When printing, the system hides UI chrome (export buttons, chat panel, navigation), inserts page breaks before new lessons and deliverables, adds headers and footers with lesson numbers, and optimizes margins for binding. If dark mode is active, print styles force light-mode colors to ensure readability on paper.

### Accessibility

The application supports screen reader navigation with ARIA labels on all interactive elements (69 labels across 35 components). Semantic HTML is used throughout (nav, main, article, section elements). Focus indicators are visible on keyboard navigation. Form inputs have associated labels. Images and diagrams have alt text.

All modals trap keyboard focus so users cannot tab out of the modal into background content. The focus trap deactivates when clicking outside the modal (for modals that support backdrop dismissal).

Keyboard navigation works throughout: Tab moves between focusable elements, Enter/Space activates buttons, Escape closes modals.

---

## Static Pages

Four additional pages accessible via hash routing:

**Changelog**: Version history and feature release notes with dates and descriptions of what changed in each release.

**Privacy Policy**: Explains that data is stored locally in the browser by default, cloud sync only happens when explicitly signed in via Firebase, and no third-party tracking is used.

**Terms of Service**: Standard terms covering educational use, no warranty, and no liability.

**FAQ**: Frequently asked questions about using the application, including how to sign in, export to Google Docs, save projects, and undo changes. Includes an interactive chatbot that can answer questions about the app.

---

## The Backend Server

The backend is an Express.js (Node.js) server that is optional for local development but required for production deployment. It serves three purposes:

### API Proxy

The server holds API keys securely (not exposed to the browser) and proxies requests to AI providers. Three proxy endpoints handle OpenRouter streaming, OpenRouter non-streaming, and a status check. When users provide their own API key, requests go directly from the browser to the provider. The proxy is only used for the application's default key.

### Session Management

A session-based key storage system allows the browser to send its API key once, which is stored server-side in an HTTP-only cookie. Subsequent requests use the stored key without the browser needing to include it. This prevents key interception from browser extensions or XSS attacks.

### Model Listing

An endpoint accepts a provider name and API key, calls the provider's model listing API, filters to chat-capable models only, and returns the list to the browser.

### Streaming Endpoints

Four SSE (Server-Sent Events) streaming endpoints handle:

1. **Generate Stream**: Takes a system prompt and user prompt, streams the AI response back chunk by chunk
2. **Examine Stream**: Sends the course map and syllabus to the AI for quality review, streams back structured patches
3. **Revise Stream**: Takes a revision request plus the current course map and chat history, streams back patches with reasoning
4. **Non-streaming fallbacks**: For each streaming endpoint, a non-streaming version exists that returns the full response in one JSON payload

The server handles provider-specific response formats, automatic temperature omission for models that don't support it, and reasoning tag stripping for models that include internal thinking tokens.

### Static File Serving

In production, the server serves the built frontend files from the dist folder. All unknown routes fall back to the main HTML file for client-side routing.

---

## Error Handling and Recovery

### Stale Chunk Recovery

During multi-chunk generation (where a large deliverable is generated in several API calls), if one chunk fails, the system re-requests only that chunk rather than regenerating the entire deliverable. Successfully retrieved chunks are preserved, and the new chunk is merged in. The system validates completeness before returning results.

### Model Fallback

If a model returns an error (rate limit, timeout, capability mismatch), the system can try the next available model from the same provider. Temperature settings are automatically omitted for models that do not support them.

### Rate Limiting

The generation function has an in-flight guard that prevents duplicate generation calls if the user double-clicks or rapidly presses the generate button. The chat send function has a 1.5-second cooldown between messages to prevent rapid-fire API calls.

### API Key Security

API keys stored in the browser's local storage are obfuscated using XOR cipher with base64 encoding. This prevents casual exposure when someone opens browser developer tools, though it is not true encryption. The system maintains backwards compatibility — plaintext keys from before the obfuscation was added are read transparently and re-stored in obfuscated form on the next save cycle.

The application's own API key (for the default AI provider) is stored only on the server and never shipped in the frontend JavaScript bundle. The frontend routes through the server proxy when no user-provided key exists.

### Session Persistence

The application auto-saves to local storage every 3 seconds. If the browser crashes or the tab is closed, the session can be restored from the landing page's "Resume" banner. The save includes all state: course map, deliverables, chat history, settings, and UI state.

---

## Visual Design Language

### Glassmorphism

The application uses a glassmorphism design language: semi-transparent cards with blur effects, subtle borders, and soft shadows. This creates a layered, modern appearance where background elements are visible through content panels.

### Color System

Each deliverable type has a distinct color from the Tailwind CSS palette:

- Course Map: Indigo
- Syllabus: Cyan
- Lesson Plans: Violet
- Slide Decks: Amber
- Assignments: Sky
- Rubrics: Rose
- Discussions: Orange
- Quiz Bank: Emerald
- Study Guides: Teal
- Custom: Purple

These colors are used consistently across feature cards, tab icons, quality badges, and export buttons to create visual continuity.

### Animations

Smooth transitions throughout: expanding/collapsing sections, tab switches, modal appearances, progress bar fills, and streaming text arrival. All animations are subtle and fast (150-300ms) to feel responsive without being distracting.

### Typography

Clean, readable typography with a clear hierarchy: large titles, medium section headers, standard body text. Code and data use monospace fonts. Markdown rendering in the chat panel supports headers, bold, italic, lists, links, code blocks, and tables.

---

## Typical User Journey

1. **Arrive**: User opens CourseMapper, sees the landing page
2. **Upload**: Drops their syllabus PDF into the file upload zone
3. **Configure AI**: Selects their AI provider, pastes their API key, picks a model
4. **Choose Materials**: Selects Lesson Plans, Slide Decks, Quiz Bank, and Rubrics
5. **Fine-tune**: Sets session duration to 75 minutes, slides per lesson to 12, question types to mostly multiple choice
6. **Generate**: Clicks the generate button, watches progress in the chat panel as content streams in
7. **Review**: Browses tabs, reads through generated materials, checks quality scores
8. **Edit**: Clicks cells in the course map to tweak wording, right-clicks a weak quiz question and selects "Improve"
9. **Cascade Sync**: After editing learning objectives, approves the suggestion to regenerate affected quizzes and slides
10. **Chat**: Asks the AI "Add a peer review activity to Lesson 5" — reviews the proposal, accepts the diff
11. **Validate**: Clicks the Fix button on a Bloom's alignment warning, watches the AI automatically adjust quiz difficulty
12. **Export**: Downloads all materials as a ZIP, separately exports slides to PowerPoint for class
13. **Save**: Clicks "Save .coursemapper" to keep a portable backup, and the session auto-syncs to the cloud

---

## Key Design Principles

1. **Browser-First**: All data lives in the user's browser. No account required. No data leaves the machine except to the chosen AI provider and optional Firebase sync.

2. **Structured, Not Freeform**: Unlike a chatbot that produces plain text, CourseMapper generates structured, schema-validated JSON that powers editable, exportable, interconnected views.

3. **Cascade Intelligence**: Editing one piece of the course automatically detects and offers to update related pieces, maintaining alignment without manual tracking.

4. **Human in the Loop**: Every AI action shows a preview. Every change requires approval. Nothing is applied without the instructor's explicit consent.

5. **Pedagogical Integrity**: Built-in validation ensures materials meet educational standards — Bloom's alignment, cognitive load balance, readability appropriate to the audience, and assessment-objective matching.

6. **Provider Agnostic**: Works with any major AI provider. Users bring their own API key and choose their preferred model. The system adapts to each provider's capabilities.

7. **Portable and Shareable**: The .coursemapper file format makes entire sessions portable. A department chair can generate materials and share the file with adjunct faculty, who can open it, customize it, and export their own versions.

8. **Progressive Disclosure**: The interface reveals complexity gradually. The landing page is simple. Feature selection adds choices. Configuration adds fine-tuning. The workspace provides full power. Users never see more than they need at each stage.
