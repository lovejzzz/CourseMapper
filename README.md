# Course Mapper

AI-powered instructional design platform that transforms course materials into a complete, aligned set of teaching deliverables. Upload your syllabus and generate a structured Course Map, lesson plans, slide decks, rubrics, quizzes, assignments, discussion prompts, study guides, and a polished syllabus — all pedagogically aligned and fully editable.

**Live:** [https://edutool.dev](https://edutool.dev)

---

## Why Course Mapper vs. ChatGPT / Claude / Gemini?

Course Mapper is a **purpose-built instructional design tool**, not a general chatbot. The difference is like using Excel for a budget vs. asking ChatGPT to "make me a budget" — one gives you a functional, editable, exportable artifact; the other gives you text you have to manually restructure.

1. **Structured output, not chat.** Pasting a syllabus into ChatGPT gives you a blob of markdown. Course Mapper produces structured, editable tables and slide decks with defined schemas — ready to use immediately.
2. **9 aligned deliverables.** Generate a Course Map, Syllabus, Lesson Plans, Slide Decks, Rubrics, Quiz Bank, Assignments, Discussion Prompts, and Study Guides — all cross-referenced and pedagogically consistent.
3. **Cascade editing.** Edit one deliverable and the system automatically detects which other deliverables are affected and surgically regenerates just those lessons — no full regeneration.
4. **Full export pipeline.** Export each deliverable to DOCX, PDF, XLSX, CSV, PPTX, Google Docs, Google Sheets, Google Slides, and ZIP bundle. Save/load complete sessions as `.coursemapper` project files.
5. **Inline editing everywhere.** Click any text in any deliverable to edit directly — course map cells, slide content, rubric criteria, quiz questions, speaker notes. Everything is editable like Google Docs.
6. **Stop & Resume.** If generation fails midway in ChatGPT, you start over. Course Mapper saves partial progress and resumes from exactly where it stopped.
7. **Multi-model support.** Supports OpenAI, Anthropic, and Google. Auto-detects key format and auto-rotates through models on failure.
8. **Privacy-first.** Everything runs in the browser. No data stored on any server. API keys go directly to providers.

> **What Course Mapper does NOT claim:** It does not fact-check content or verify citations. It does not replace instructor expertise. It is a drafting and productivity tool — it generates the scaffold, the instructor refines it.

---

## How to Use

### Step 1: Open & Choose an AI Model

Go to [edutool.dev](https://edutool.dev). On the landing page:

- **Bring your own key** — Select your provider (OpenAI, Anthropic, or Google) and paste your API key. The app auto-detects key format and switches the provider dropdown.

### Step 2: Upload Your Materials

Upload your course files (syllabus, outlines, existing materials). Supported formats:

- **Documents:** `.docx`, `.doc`, `.pdf`, `.txt`, `.rtf`, `.odt`, `.md`
- **Spreadsheets:** `.xlsx`, `.xls`, `.csv`, `.ods`
- **Presentations:** `.pptx`, `.ppt`, `.odp`
- **Other:** `.html`, `.epub`, `.zip` (archives containing any of the above)

Course Mapper auto-detects lesson count and structure from your files using AI.

### Step 3: Choose Your Deliverables

Pick which deliverables to generate. Course Map is always included. Add any combination of: Syllabus, Lesson Plans, Slide Decks, Rubrics, Quiz Bank, Assignments, Discussion Prompts, and Study Guides.

### Step 4: Configure & Generate

Fine-tune each deliverable (session length, question count, speaker notes level, etc.), set a lesson scope if you only need certain lessons, and click **Generate**. Watch everything build in real time.

### Step 5: Edit, Revise, Export

Click any text to edit inline. Use Revision Chat for AI-assisted changes. Export individual deliverables from the right-side Export panel, or use Export All → Download ZIP for everything at once.

---

## Features

### Deliverables

- **Course Map** — Week-by-week structure with learning goals, objectives, assessments, activities, and resources in a customizable column layout. Click columns to enable/disable — disabled columns are excluded from AI generation and all exports. Identical values across sections auto-merge for cleaner display
- **Syllabus** — Complete professional syllabus with policies, grading, schedule, and learning outcomes
- **Lesson Plans** — Session-by-session plans with timing, warm-ups, activities, UDL notes, and instructor notes
- **Slide Decks** — University-quality presentation slides with 5 color themes, speaker notes, and inline editing
- **Rubrics** — Grading rubrics with criteria, performance levels, descriptors, and teacher calibration notes
- **Quiz & Exam Bank** — Multiple choice, short answer, and essay questions organized by lesson and difficulty
- **Assignment Briefs** — Clear assignment descriptions with objectives, deliverables, scaffolding milestones, and submission guidelines
- **Discussion Prompts** — Engaging prompts with response frameworks, facilitation guides, and equity considerations
- **Study Guides** — Student-facing review materials with key concepts, vocabulary, common misconceptions, and exam prep tips

### Editing & Collaboration

- **Inline editing** — Click any text in any deliverable to edit directly (course map cells, slide content, rubric criteria, quiz questions, speaker notes)
- **Cascade sync engine** — Edit one deliverable and affected deliverables auto-update surgically (only the changed lesson, not everything)
- **Surgical re-sync** — When you edit the course map, only affected lessons are regenerated across deliverables
- **Change log drawer** — See exactly what the cascade system changed, when, and why
- **Lesson locking** — Lock individual lessons to protect them from AI regeneration
- **Version history** — Full undo/redo with the ability to jump to any previous version

### Lesson Scope

- Choose to generate content for **all lessons** or **specific lessons** only
- The AI auto-detects lesson count from uploaded files or course descriptions
- Useful for adding a new lesson or regenerating a subset without touching the rest

### Teaching Modes

Five pedagogical frameworks that shape all generated content:

- **Lecture-Based** — Traditional instructor-led sessions
- **Flipped Classroom** — Pre-class content + in-class application activities
- **Problem-Based Learning** — Case-centered inquiry with guiding questions
- **Seminar** — Discussion-heavy Socratic method with reading assignments
- **Competency-Based** — Mastery-based progression with competency statements and thresholds

### Custom Deliverables

- **Create your own** — Build custom deliverable types beyond the built-in 9 with custom system prompts, user prompt templates, and default config
- **Workspace creation** — Click **+ Add → Create Custom...** in the tab bar to build a new custom deliverable without leaving the workspace
- **AI auto-config** — If you don't set tone, style, or output length, the AI automatically infers the best settings from your course content and sibling deliverables' configuration
- **Persistent** — Custom deliverables are saved in local storage and appear in the + Add dropdown for re-use

### Per-Deliverable Configuration

- **Column enable/disable** — Click column pills to toggle on/off; disabled columns are excluded from generation and all exports
- **Session length** — 30 min to 3 hours for lesson plans
- **Slide count** — 8–20 slides per lesson
- **Question types** — Toggle MC, short answer, essay for quiz bank
- **Difficulty distribution** — Even, mostly easy/medium, or mostly medium/hard
- **Citation style** — APA 7th, MLA 9th, Chicago 17th, IEEE
- **Tiered differentiation** — Generate 3 variants per item: Scaffolded, Standard, and Extension
- **Extra instructions** — Free-text field for specific constraints per deliverable

### Quality & Analytics

- **Course Health Check** — AI-powered pedagogical audit scoring 0–100 with issues grouped by severity (Bloom's gaps, overloaded weeks, vague objectives, sequencing problems) and one-click "Fix it" buttons
- **Quality scoring** — Heuristic scores (Bloom's alignment, specificity, actionability) per deliverable
- **Smart revision suggestions** — After each AI revision, contextual follow-up suggestions appear

### Export & Integration

**Right-side Export Panel (Current tab):**
- **Slide Decks:** `.pptx` (PowerPoint) or Google Slides
- **Course Map:** `.xlsx`, `.docx`, `.pdf`, `.csv`, Google Sheets, or Google Docs
- **Other deliverables:** `.pdf`, `.docx`, Google Docs (or Google Sheets where applicable)

**Right-side Export Panel (All tab):**
- **Download ZIP** — All deliverables in one download, organized by folder (Slide Decks as `.pptx`, others as `.docx`)
- **Save .coursemapper** — Portable project file containing the complete session state — course map, all deliverables, settings, version history. Drag onto the landing page to restore.

### Session Persistence

- **Auto-save** — Full session state (including all deliverables) saved to browser local storage automatically
- **Session restore** — On next visit, the app offers to restore exactly where you left off including all generated content
- **.coursemapper project file** — Portable save/load for archiving or sharing complete sessions

### Instructor Tools

- **Professor Profile** — Persistent profile with name, institution, department, policies, and AI teaching assistant persona
- **Reading List** — Paste DOI, arXiv ID, or ISBN to auto-fetch citations; assign readings to lessons
- **Standards Alignment** — Tag objectives to accreditation frameworks (AAC&U, AACSB, CSWE, CAEP, etc.) with exportable alignment report
- **Assessment Bank** — Save individual questions, prompts, or criteria to a personal bank for reuse across courses
- **Template Library** — Save course structures as reusable templates; includes built-in starters

### Productivity

- **Command Palette (Cmd+K)** — Quick-access to any action via fuzzy search
- **Pro-Level AI Tutor** — In-app AI assistant (Gemini/Claude/OpenAI powered) that recognizes your current course map, lesson count, and active tab to provide highly contextual pedagogical advice (e.g., "Suggest an icebreaker for Lesson 3").
- **Stop & Resume** — Pause generation at any time, resume from exactly where it stopped
- **Browser notifications** — Get notified when generation completes
- **Student view toggle** — Preview deliverables as students would see them (hides instructor notes)
- **Error recovery** — If a panel crashes, a "Try Again" button recovers without losing work
- **Diff view** — See exactly what changed after each AI revision (red strikethrough → green highlight)

### AI & Privacy

- **Multi-provider support** — OpenAI, Anthropic, and Google with your own API key (BYOK)
- **Streaming generation** — Watch deliverables build in real time with stable per-feature sequential streaming (no preview flashing)
- **Token-optimized prompts** — Minified JSON keys, adaptive chunk sizes, and compact continuation schemas reduce API costs by ~20% and cut total API calls by ~15–20%
- **AI self-examination** — The AI reviews and fixes its own structured output automatically
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

### Build for Production

```bash
npm run build
```

The `dist/` folder can be served by any static file host. The entire app is client-side — no backend server required.

### Deployment

Hosted on GitHub Pages via GitHub Actions. Every push to `main` triggers a build and deploy.

### Tech Stack

- **Frontend** — React 18, Vite, TailwindCSS
- **State** — useReducer + Context (two-context pattern: state + dispatch via `courseStore.jsx`)
- **AI providers** — OpenAI, Anthropic, Google (BYOK)
- **File parsing** — mammoth (docx), pdfjs-dist (pdf), SheetJS (xlsx), JSZip
- **Export** — ExcelJS (xlsx), docx (Word), jsPDF + jspdf-autotable (pdf), pptxgenjs (PowerPoint), file-saver, JSZip (ZIP bundle)
- **Google Workspace** — Drive API v3 via OAuth2 (Docs, Sheets, Slides)
- **Testing** — Vitest

### Project Structure

```
src/
  App.jsx                   # Main app shell: screen routing + all top-level state
  main.jsx                  # Entry point + hash router (#/faq, #/changelog, etc.)
  screens/
    Landing.jsx             # Landing page: AI model selection, file upload, session restore
    FeatureSelect.jsx       # Deliverable picker (step 2) + CustomDeliverableBuilder
  model/
    courseStore.jsx         # useReducer + Context store for deliverables state
  components/
    CourseMapPreview.jsx    # Main editable course map table
    DeliverableView.jsx     # Per-deliverable rendering (slides, rubrics, quiz, etc.)
    ExportSidePanel.jsx     # Right-side export panel (Current/All modes, ZIP, .coursemapper)
    ProgressPanel.jsx       # Generation progress, revision chat, deliverable status
    ColumnEditor.jsx        # Course map column configuration
    ModelConfig.jsx         # AI provider + model selection UI
    Header.jsx              # App header with navigation
    ErrorBoundary.jsx       # Crash recovery wrapper
  hooks/
    useGeneration.js        # Course map generation + stop/resume
    useDeliverables.js      # Deliverable generation (per-feature sequential, cross-feature parallel), surgical regen, restore
    useRevision.js          # AI revision chat + patching
    useExport.js            # Course map export orchestration
    useVersionHistory.js    # Undo/redo version stack
    useCourseMapEditor.js   # Inline cell editing logic
    useStreamReader.js      # Multi-provider streaming abstraction
  lib/
    deliverablePrompts.js   # AI prompt templates per deliverable type
    deliverableExporters.js # Export functions (PDF, DOCX, CSV, Google Docs/Sheets)
    pptxExporter.js         # PowerPoint generation (pptxgenjs)
    googleDrive.js          # Google OAuth + Drive upload (Docs, Sheets, Slides)
    xlsxGenerator.js        # Excel export (ExcelJS)
    docxGenerator.js        # Word export (docx library)
    fileParser.js           # Multi-format file parsing
    importCourseMap.js      # Import course map from .xlsx/.csv
    prompts.js              # Course map generation prompts
    streamProvider.js       # AI streaming across providers
    customDeliverableLibrary.js # localStorage CRUD for custom deliverable definitions
    parallelGenerator.js    # Chunking, merging, completeness-check, per-feature output budgets
    keyMaps.js              # Bidirectional key maps + expandKeys() for JSON key minification
    syncDependencies.js     # Deliverable dependency graph for cascade editing
  pages/
    FaqChatbot.jsx          # AI-powered help chatbot + HelpDrawer (Gemini-powered)
    PrivacyPolicy.jsx       # Privacy policy page
    TermsOfService.jsx      # Terms of service page
    Changelog.jsx           # Version changelog page
```
