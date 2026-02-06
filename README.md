# Course Mapper

AI-powered tool that transforms course syllabi into structured Course Map spreadsheets. Runs entirely in the browser — no backend required.

**Live:** [https://lovejzzz.github.io/CourseMapper/](https://lovejzzz.github.io/CourseMapper/)

## Quick Start

Visit the live link above, or run locally:

```bash
npm install
npm run dev
```

Opens at [http://localhost:5173](http://localhost:5173).

## Usage

1. Select your AI provider (OpenAI, Anthropic, or Google) and enter your API key
2. Upload course syllabus files (`.docx`, `.pdf`, `.txt`, `.xlsx`, or `.zip`)
3. Customize columns if needed — drag to reorder, click to rename, add or remove
4. Click **Generate Course Map**
5. Review the live-streamed preview, then export or revise

## Features

- **Multi-provider AI** — OpenAI, Anthropic, and Google (Gemini). Auto-detects provider from API key
- **Streaming generation** — live preview as the AI builds the course map
- **AI examination** — automatically reviews and fixes the generated map, with retry on failure
- **Revision chat** — ask the AI to make changes conversationally, with full chat history context
- **Inline editing** — click any cell to edit directly in the table
- **Row & lesson management** — add, delete, and reorder sections and lessons
- **Drag-and-drop columns** — reorder columns in the editor
- **Import** — load an existing course map from `.xlsx` or `.csv`
- **Export** — download as `.xlsx`, `.pdf`, or `.csv`
- **Version history** — undo/redo and jump to any previous version
- **Browser notifications** — get notified when generation completes

## Deployment

Hosted on GitHub Pages via GitHub Actions. Every push to `main` triggers a build and deploy.

To build manually:

```bash
npm run build
```

The `dist/` folder can be served by any static file host.

## Tech Stack

- **Frontend** — React, Vite, TailwindCSS
- **AI calls** — direct browser-to-provider API (OpenAI, Anthropic, Google) — no server proxy
- **File parsing** — mammoth (docx), pdfjs-dist (pdf), SheetJS (xlsx), JSZip
- **Export** — ExcelJS (xlsx), jsPDF (pdf), file-saver
