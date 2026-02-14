# Course Mapper

AI-powered tool that transforms your course syllabus into a structured Course Map spreadsheet. Upload your syllabus, and the AI will organize it into weekly lessons with learning goals, objectives, assessments, activities, resources, and more.

**Live:** [https://edutool.dev](https://edutool.dev)

---

## Why Course Mapper vs. ChatGPT / Claude / Gemini?

Course Mapper is a **purpose-built instructional design tool**, not a general chatbot. The difference is like using Excel for a budget vs. asking ChatGPT to "make me a budget" — one gives you a functional, editable, exportable artifact; the other gives you text you have to manually restructure.

1. **Structured output, not chat.** Pasting a syllabus into ChatGPT gives you a blob of markdown. Course Mapper produces a structured, editable table with defined columns — ready to use immediately.
2. **Schema enforcement.** ChatGPT guesses a different format each time. Course Mapper enforces a consistent pedagogical schema (customizable) across every lesson, every time.
3. **Full export pipeline.** Direct export to DOCX (with TOC, tables, color headings), XLSX, PDF, CSV, Google Docs, and Google Sheets. No manual reformatting.
4. **Inline editing + surgical AI revision.** Click any cell to edit directly, then use Revision Chat to adjust specific parts. The AI applies targeted patches — not full regeneration.
5. **Stop & Resume.** If generation fails midway in ChatGPT, you start over. Course Mapper saves partial progress and resumes from exactly where it stopped.
6. **Multi-model support with auto-fallback.** Supports OpenAI, Anthropic, Google, and free models. Auto-rotates through models on failure.
7. **Syllabus-aware input.** Upload actual syllabus files (PDF, DOCX, etc.). Course Mapper detects lesson count and structure automatically.
8. **Version history & undo.** Full version history with the ability to jump back to any previous state.
9. **File attachments for revision.** Attach new materials to revision requests — the AI incorporates them into the existing course map.
10. **Privacy.** Everything runs in the browser. No data stored on any server. API keys go directly to providers.

> **What Course Mapper does NOT claim:** It does not fact-check content or verify citations. It does not replace instructor expertise. It is a drafting and productivity tool — it generates the scaffold, the instructor refines it.

---

## How to Use (Step-by-Step Guide)

### Step 1: Open the Website

Go to the live link above. The website works in any modern web browser (Chrome, Firefox, Safari, Edge). No software installation is needed.

### Step 2: Choose an AI Model

On the left panel, you will see **AI Provider**. You have two options:

- **Free (recommended to start)** — Select "Free" from the dropdown. This gives you access to several free AI models at no cost. No API key is needed. Just pick a model from the list and you're ready to go.
- **Bring your own key** — If you have an API key from OpenAI, Anthropic, or Google, select that provider and paste your key. The tool will auto-detect which provider your key belongs to.

> **Note about the Free tier:** Free models are rate-limited and shared among all users. Your prompts may be used by model providers to improve their AI. For the best experience with sensitive course materials, consider using your own API key.

### Step 3: Upload Your Syllabus

On the right panel, click the upload area or drag-and-drop your course files. Supported formats include:

- **Documents:** `.docx`, `.doc`, `.pdf`, `.txt`, `.rtf`, `.odt`, `.md`
- **Spreadsheets:** `.xlsx`, `.xls`, `.csv`, `.ods`
- **Presentations:** `.pptx`, `.ppt`, `.odp`
- **Other:** `.html`, `.epub`, `.zip` (archives containing any of the above)

You can upload multiple files at once — the AI will combine them all.

### Step 4: Customize Columns (Optional)

If your files are uploaded, a column editor will appear below. This lets you:

- **Reorder columns** — drag them to change the order
- **Rename columns** — click on a column name to edit it
- **Add or remove columns** — use the buttons to customize what appears in your Course Map

The default columns work well for most courses, so you can skip this step if you're not sure.

### Step 5: Generate Your Course Map

Click the purple **Generate Course Map** button. You will see:

1. **Parsing** — the tool reads your uploaded files
2. **Generating** — the AI builds your course map in real time (you can watch it appear!)
3. **Examining** — the AI reviews its own work and fixes any issues
4. **Done** — your course map is ready

This typically takes 1–3 minutes depending on the length of your syllabus.

You can click **Stop** at any time to pause generation. Your partial progress is preserved — click **Resume** to continue from exactly where it stopped.

### Step 6: Review and Edit

Once generated, your Course Map appears as a table. You can:

- **Click any cell** to edit the text directly
- **Add or delete rows** — hover over a row to see the + and × buttons
- **Add or delete lessons** — use the controls on each lesson header
- **Move lessons up/down** — use the arrow buttons
- **Undo/Redo** — use the undo and redo buttons at the top

### Step 7: Ask the AI to Revise

In the progress panel, you'll find a chat box. Type a request like:

- *"Add more group activities to Lesson 3"*
- *"Change the technology platform to Canvas for all lessons"*
- *"Make the assessments more specific"*

You can also **attach files** to your revision request — drag-and-drop or click the paperclip icon. The AI will incorporate the new content into the course map.

The AI will update your course map based on your instructions.

### Step 8: Add More Materials Later

If you receive additional course materials after generating, click the blue **Add Materials** button at the top. Upload the new files, and the AI will automatically revise the course map to incorporate the new content.

### Step 9: Export Your Course Map

When you're satisfied, use the export options:

**Download to your computer:**
- **Excel (.xlsx)** — original table format, for editing in Excel or Google Sheets
- **Word (.docx)** — modern formatting with Calibri font, color-coded headings, 2-column tables per section, numbered lists, and a Table of Contents
- **PDF (.pdf)** — table format, for printing or sharing
- **CSV (.csv)** — for importing into other tools or LMS systems

**Save to Google Drive** (requires Google sign-in):
- **Google Sheets** — uploads as a native Google Sheet
- **Google Docs** — uploads as a native Google Doc with the same modern formatting as DOCX, plus auto-generated outline for navigation

When saving to Google Drive, you'll sign in with your own Google account. The file goes to your Drive — Course Mapper never stores your data.

### Step 10: Come Back Later

Your work is **automatically saved** in your browser. If you close the tab and come back later, your course map will be restored exactly where you left off. Click **New Project** to start fresh.

---

## Reviewing Changes (Diff View)

After the AI examines or revises your course map, you'll see a **"Show Changes"** button in the Course Map Preview header. Click it to see:

- **Red strikethrough text** — what the old content was
- **Green highlighted text** — what the AI changed it to

Click **"Hide Changes"** to go back to the normal view, or the **×** button to dismiss the diff entirely.

---

## Features

- **Free AI models** — use Gemini 2.5 Flash Lite, Gemini 2.0 Flash, GPT-OSS 120B, Llama 3.3 70B, or DeepSeek R1T at no cost
- **Multi-provider AI** — also supports OpenAI, Anthropic, and Google with your own API key
- **Streaming generation** — watch the course map build in real time
- **Stop & Resume** — pause generation at any time, resume from exactly where it stopped
- **AI examination** — the AI reviews and fixes its own work automatically
- **Revision chat** — ask the AI to make changes conversationally, with file attachments
- **Add materials** — upload new files after generation to update the course map
- **Inline editing** — click any cell to edit directly in the table (also keyboard-accessible)
- **Diff view** — see exactly what changed after each AI revision
- **Row & lesson management** — add, delete, and reorder sections and lessons
- **Drag-and-drop columns** — reorder and customize columns
- **Import** — load an existing course map from `.xlsx` or `.csv`
- **Export** — download as `.xlsx`, `.docx` (with TOC, tables, color headings), `.pdf`, or `.csv`
- **Google Drive** — save directly to Google Sheets or Google Docs
- **Version history** — undo/redo and jump to any previous version
- **Auto-save** — your work is saved in the browser automatically
- **Browser notifications** — get notified when generation completes
- **Error recovery** — if a panel crashes, a "Try Again" button lets you recover without losing your work
- **FAQ chatbot** — visit [#/faq](https://edutool.dev/#/faq) for an AI-powered help assistant

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

Runs unit tests with Vitest (covers `applyPatches`, `tokenEstimator`, and more).

### Build for Production

```bash
npm run build
```

The `dist/` folder can be served by any static file host. The entire app is client-side — no backend server required.

### Deployment

Hosted on GitHub Pages via GitHub Actions. Every push to `main` triggers a build and deploy.

### Tech Stack

- **Frontend** — React, Vite, TailwindCSS
- **AI providers** — OpenAI, Anthropic, Google, OpenRouter (free models)
- **File parsing** — mammoth (docx), pdfjs-dist (pdf), SheetJS (xlsx), JSZip
- **Export** — ExcelJS (xlsx), docx (Word), jsPDF (pdf), file-saver
- **Google Drive** — Google Sheets API, Google Docs API via GAPI
- **Testing** — Vitest

### Project Structure

```
src/
  components/       # React UI components
    CourseMapPreview.jsx   # Main table with editable cells
    ProgressPanel.jsx      # Generation progress + step indicators
    GenerationLogPanel.jsx # Collapsible generation event log
    ExportBar.jsx          # Download + Google Drive export buttons
    RevisionChat.jsx       # Chat interface for AI revisions
    ExamSummary.jsx        # Examination results display
    ErrorBoundary.jsx      # Crash recovery wrapper
    ModelConfig.jsx        # AI provider/model selector
    VersionTimeline.jsx    # Version history sidebar
  hooks/             # Custom React hooks
  lib/               # Pure utility functions
    applyPatches.js        # Immutable course map patching
    tokenEstimator.js      # Token counting + model limits
    fileParser.js          # Multi-format file parsing
    exporters.js           # CSV + PDF generation
    xlsxGenerator.js       # Excel export
    docxGenerator.js       # Word export
    googleDrive.js         # Google Drive integration
    importCourseMap.js     # Import from xlsx/csv
    __tests__/             # Unit tests
  pages/
    FaqChatbot.jsx         # AI-powered FAQ help page
```
