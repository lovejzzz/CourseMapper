# Course Mapper

AI-powered instructional design platform that transforms course materials into a complete, aligned set of teaching deliverables. Upload your syllabus and generate a structured Course Map, lesson plans, slide decks, rubrics, quizzes, assignments, discussion prompts, study guides, and a polished syllabus — all pedagogically aligned and fully editable.

**Live:** [https://edutool.dev](https://edutool.dev)

---

## Why Course Mapper vs. ChatGPT / Claude / Gemini?

Course Mapper is a **purpose-built instructional design tool**, not a general chatbot. The difference is like using Excel for a budget vs. asking ChatGPT to "make me a budget" — one gives you a functional, editable, exportable artifact; the other gives you text you have to manually restructure.

1. **Structured output, not chat.** Pasting a syllabus into ChatGPT gives you a blob of markdown. Course Mapper produces structured, editable tables and slide decks with defined schemas — ready to use immediately.
2. **9 aligned deliverables.** Generate a Course Map, Syllabus, Lesson Plans, Slide Decks, Rubrics, Quiz Bank, Assignments, Discussion Prompts, and Study Guides — all cross-referenced and pedagogically consistent.
3. **Cascade editing.** Edit one deliverable and the system automatically detects which other deliverables are affected and surgically regenerates just those lessons — no full regeneration.
4. **Full export pipeline.** Export each deliverable to DOCX, PDF, XLSX, CSV, PPTX, Google Docs, Google Sheets, Google Slides, and LMS formats (Canvas, Moodle, Brightspace). Bulk ZIP export for everything at once.
5. **Inline editing everywhere.** Click any text in any deliverable to edit directly — course map cells, slide content, rubric criteria, quiz questions, speaker notes. Everything is editable like Google Docs.
6. **Stop & Resume.** If generation fails midway in ChatGPT, you start over. Course Mapper saves partial progress and resumes from exactly where it stopped.
7. **Multi-model support.** Supports OpenAI, Anthropic, Google, and free models (no API key needed). Auto-rotates through models on failure.
8. **Privacy-first.** Everything runs in the browser. No data stored on any server. API keys go directly to providers.

> **What Course Mapper does NOT claim:** It does not fact-check content or verify citations. It does not replace instructor expertise. It is a drafting and productivity tool — it generates the scaffold, the instructor refines it.

---

## How to Use

### Step 1: Open & Choose an AI Model

Go to [edutool.dev](https://edutool.dev). On the landing page:

- **Free (recommended to start)** — Select "Free" from the dropdown. Access several free AI models at no cost, no API key needed.
- **Bring your own key** — If you have an API key from OpenAI, Anthropic, or Google, select that provider and paste your key.

### Step 2: Upload Your Materials

Upload your course files (syllabus, outlines, existing materials). Supported formats:

- **Documents:** `.docx`, `.doc`, `.pdf`, `.txt`, `.rtf`, `.odt`, `.md`
- **Spreadsheets:** `.xlsx`, `.xls`, `.csv`, `.ods`
- **Presentations:** `.pptx`, `.ppt`, `.odp`
- **Other:** `.html`, `.epub`, `.zip` (archives containing any of the above)

Course Mapper auto-detects lesson count and structure from your files.

### Step 3: Choose Your Deliverables

Pick which deliverables to generate. Course Map is always included. Add any combination of: Syllabus, Lesson Plans, Slide Decks, Rubrics, Quiz Bank, Assignments, Discussion Prompts, and Study Guides.

### Step 4: Configure & Generate

Fine-tune each deliverable (session length, question count, speaker notes level, etc.), choose a teaching approach, and click **Generate**. Watch everything build in real time.

### Step 5: Edit, Revise, Export

Click any text to edit inline. Use Revision Chat for AI-assisted changes. Export to your preferred format when ready.

---

## Features

### Deliverables

- **Course Map** — Week-by-week structure with learning goals, objectives, assessments, activities, and resources in a customizable column layout
- **Syllabus** — Complete professional syllabus with policies, grading, schedule, and learning outcomes
- **Lesson Plans** — Session-by-session plans with timing, warm-ups, activities, UDL notes, and instructor notes
- **Slide Decks** — University-quality presentation slides with 5 color themes, speaker notes, and Google-Slides-style inline editing
- **Rubrics** — Grading rubrics with criteria, performance levels, descriptors, and teacher calibration notes
- **Quiz & Exam Bank** — Multiple choice, short answer, and essay questions organized by lesson and difficulty
- **Assignment Briefs** — Clear assignment descriptions with objectives, deliverables, scaffolding milestones, and submission guidelines
- **Discussion Prompts** — Engaging prompts with response frameworks, facilitation guides, and equity considerations
- **Study Guides** — Student-facing review materials with key concepts, vocabulary, common misconceptions, and exam prep tips
- **Custom Deliverables** — Create your own deliverable types via a wizard (configurable name, tone, format, AI prompts)

### Editing & Collaboration

- **Inline editing** — Click any text in any deliverable to edit directly (course map cells, slide content, rubric criteria, quiz questions, speaker notes)
- **Cascade sync engine** — Edit one deliverable and affected deliverables auto-update surgically (only the changed lesson, not everything)
- **Surgical re-sync** — When you edit the course map, only affected lessons are regenerated across deliverables
- **Course map writeback** — Edits to deliverables (e.g., changing a lesson plan objective) are mirrored back to the course map
- **Change log drawer** — See exactly what the cascade system changed, when, and why
- **Lesson locking** — Lock individual lessons to protect them from AI regeneration
- **Drag-and-drop reordering** — Reorder lessons via Flow View cards or table row controls
- **Resizable columns** — Drag column edges to resize in the course map table
- **Version history** — Full undo/redo with the ability to jump to any previous version
- **Named snapshots** — Pin versions with custom labels (e.g., "Draft v2") for easy reference

### Teaching Modes

Five pedagogical frameworks that shape all generated content:

- **Lecture-Based** — Traditional instructor-led sessions
- **Flipped Classroom** — Pre-class content + in-class application activities
- **Problem-Based Learning** — Case-centered inquiry with guiding questions
- **Seminar** — Discussion-heavy Socratic method with reading assignments
- **Competency-Based** — Mastery-based progression with competency statements and thresholds

### Per-Deliverable Configuration

- **Session length** — 30 min to 3 hours for lesson plans
- **Slide count** — 8–20 slides per lesson
- **Question types** — Toggle MC, short answer, essay for quiz bank
- **Difficulty distribution** — Even, mostly easy/medium, or mostly medium/hard
- **Citation style** — APA 7th, MLA 9th, Chicago 17th, IEEE
- **Tiered differentiation** — Generate 3 variants per item: Scaffolded, Standard, and Extension
- **Reference file upload** — Upload an example document and the AI matches its format and tone
- **Extra instructions** — Free-text field for specific constraints per deliverable

### Quality & Analytics

- **Course Health Check** — AI-powered pedagogical audit scoring 0–100 with issues grouped by severity (Bloom's gaps, overloaded weeks, vague objectives, sequencing problems, alignment issues) and one-click "Fix it" buttons
- **Bloom's Alignment Matrix** — Lessons × Bloom's Levels grid showing coverage with gap detection
- **Assessment Calendar** — Week-by-week heat map of assessment load (light → overloaded)
- **Learning Analytics Dashboard** — Radar chart of Bloom's level distribution with mastery likelihood estimates
- **Quality scoring** — 3-dimension heuristic scores (Bloom's alignment, specificity, actionability) per deliverable
- **Smart revision suggestions** — After each AI revision, 3 contextual follow-up suggestions appear

### Export & Integration

**Download to your computer:**
- **Excel (.xlsx)** — Course map in table format
- **Word (.docx)** — Formatted with TOC, color-coded headings, and 2-column tables
- **PDF (.pdf)** — Table format for printing or sharing
- **CSV (.csv)** — For importing into other tools
- **PowerPoint (.pptx)** — University-quality slides with 5 color themes and 16:9 layout
- **Print Package (.pdf)** — Single PDF combining cover page, TOC, course map, syllabus, rubrics, assignments, and grading summary
- **ZIP bundle** — All deliverables in one download with organized folder structure

**Google Workspace:**
- **Google Sheets** — Native spreadsheet with proper formatting
- **Google Docs** — Formatted document with auto-generated outline
- **Google Slides** — Uploaded as native Google Slides presentation

**LMS Export:**
- **Canvas** — Assignments CSV ready for Canvas import
- **Moodle** — Section/activity outline CSV
- **Brightspace (D2L)** — Grades CSV and content modules CSV
- **Universal LMS** — Generic CSV with objectives, assessments, and activities

**Other:**
- **Project file (.coursemapper)** — Save/load complete project state including all deliverables
- **Share link** — Compressed URL for read-only course sharing
- **Import** — Load an existing course map from `.xlsx` or `.csv`

### Instructor Tools

- **Professor Profile** — Persistent profile with name, institution, department, policies, and AI teaching assistant persona
- **Institution Templates** — Pre-loaded policy boilerplate for NYU, CUNY, UC System, CSU System, Big Ten, and Ivy League
- **Section Manager** — Manage multiple course sections with different meeting times, rooms, and TAs
- **Reading List** — Paste DOI, arXiv ID, or ISBN to auto-fetch citations; 4 citation styles (APA, MLA, Chicago, IEEE); assign readings to lessons
- **Standards Alignment** — Tag objectives to accreditation frameworks (AAC&U, AACSB, APA, CSWE, CAEP, CCNE, SACSCOC, NASAD) with exportable alignment report
- **Assessment Bank** — Save individual questions, prompts, or criteria to a personal bank for reuse across courses
- **Template Library** — Save course structures as reusable templates; includes built-in starters
- **Semester Adapter** — Clone a course to a new semester with adjusted lesson count
- **Batch Regeneration** — Select specific deliverables and lessons to regenerate with auto-detection of changed content

### Productivity

- **Command Palette (Cmd+K)** — Quick-access to any action via fuzzy search
- **Help chatbot** — In-app AI assistant covering all features
- **Onboarding tour** — 4-step guided walkthrough for new users
- **Stop & Resume** — Pause generation at any time, resume from exactly where it stopped
- **Auto-save** — Work is saved in the browser automatically
- **Browser notifications** — Get notified when generation completes
- **Student view toggle** — Preview deliverables as students would see them (hides instructor notes)
- **Error recovery** — If a panel crashes, a "Try Again" button recovers without losing work
- **Diff view** — See exactly what changed after each AI revision (red strikethrough → green highlight)

### AI & Privacy

- **Free AI models** — Gemini, Llama, DeepSeek, and more via OpenRouter — no API key needed
- **Multi-provider support** — OpenAI, Anthropic, Google with your own API key
- **Streaming generation** — Watch deliverables build in real time
- **AI self-examination** — The AI reviews and fixes its own work automatically
- **Coherence engine** — Previously generated deliverables are summarized and injected into subsequent prompts to prevent duplication
- **100% client-side** — No backend server. All data stays in your browser
- **Google OAuth verified** — Clean consent screen for Google Drive export

---

## For Developers

### Run Locally

```bash
npm install
npm run dev
```

Opens at [http://localhost:5173/CourseMapper/](http://localhost:5173/CourseMapper/).

### Run Tests

```bash
npm test
```

Runs unit tests with Vitest.

### Build for Production

```bash
npm run build
```

The `dist/` folder can be served by any static file host. The entire app is client-side — no backend server required.

### Deployment

Hosted on GitHub Pages via GitHub Actions. Every push to `main` triggers a build and deploy.

### Tech Stack

- **Frontend** — React 18, Vite, TailwindCSS
- **State** — useReducer + Context (two-context pattern: state + dispatch)
- **AI providers** — OpenAI, Anthropic, Google, OpenRouter (free models)
- **File parsing** — mammoth (docx), pdfjs-dist (pdf), SheetJS (xlsx), JSZip
- **Export** — ExcelJS (xlsx), docx (Word), jsPDF + jspdf-autotable (pdf), pptxgenjs (PowerPoint), file-saver
- **Google Workspace** — Sheets API, Docs API, Slides API via GAPI
- **Citations** — CrossRef API (DOI), OpenLibrary API (ISBN), arXiv API
- **Testing** — Vitest

### Project Structure

```
src/
  App.jsx                  # Thin shell: <CourseStoreProvider><Workspace /></CourseStoreProvider>
  screens/
    Landing.jsx            # Landing page with AI model selection + file upload
    FeatureSelect.jsx      # Deliverable picker (step 2)
    DeliverableConfig.jsx  # Per-deliverable configuration (step 3)
    Workspace.jsx          # Main workspace with all app logic (~3300 lines)
  model/
    courseStore.jsx         # useReducer + Context store (state + dispatch)
    courseModel.js          # Data shape + factory functions
    selectors.js           # Pure derived-state functions
  components/
    CourseMapPreview.jsx    # Main editable table
    CourseMapFlow.jsx       # Drag-and-drop flow view
    DeliverableView.jsx    # Per-deliverable rendering (slides, rubrics, etc.)
    ExportSidePanel.jsx    # Export panel with all format options
    RevisionChat.jsx       # Chat interface for AI revisions
    CourseHealthPanel.jsx   # AI-powered course health check
    ChangeLogDrawer.jsx    # Cascade sync activity log
    CommandPalette.jsx     # Cmd+K quick-action palette
    StandardsAlignmentPanel.jsx  # Accreditation standards tagging
    AssessmentCalendar.jsx # Assessment load heat map
    ReadingListPanel.jsx   # Citation management
    TemplateLibraryModal.jsx     # Template save/load
    SemesterAdapterWizard.jsx    # Course cloning wizard
    BatchRegenDialog.jsx   # Selective regeneration dialog
    ProfessorProfileDrawer.jsx   # Instructor profile + policies
    CustomDeliverableWizard.jsx  # Custom deliverable creator
    ErrorBoundary.jsx      # Crash recovery wrapper
  hooks/
    useGeneration.js       # Course map generation + stop/resume
    useDeliverables.js     # Deliverable generation + surgical regen
    useSmartSync.js        # Cascade editing engine
    useRevision.js         # Revision chat + AI patching
    useExport.js           # Export orchestration
    useStreamReader.js     # Multi-provider streaming
    useModelConfig.js      # Provider/API key/model selection
  lib/
    syncDependencies.js    # Deliverable dependency graph
    deliverablePrompts.js  # AI prompt templates per deliverable
    pedagogicalModes.js    # 5 teaching framework definitions
    pptxExporter.js        # PowerPoint generation
    lmsExporter.js         # LMS format exporters
    healthCheckPrompt.js   # Course health audit prompt
    citationFetcher.js     # DOI/ISBN/arXiv metadata fetching
    projectFile.js         # .coursemapper save/load
    shareUrl.js            # Compressed share link generation
    assessmentBank.js      # Personal question bank
    standardSets.js        # 8 accreditation frameworks
    institutionTemplates.js # University policy templates
    commandRegistry.js     # Command palette actions
    __tests__/             # Unit tests
  pages/
    FaqChatbot.jsx         # AI-powered help chatbot + HelpDrawer
    PrivacyPolicy.jsx      # Privacy policy
    TermsOfService.jsx     # Terms of service
    Changelog.jsx          # Version changelog
```
