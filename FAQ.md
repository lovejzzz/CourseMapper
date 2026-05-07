# Frequently Asked Questions

---

## Getting Started

### What is Course Mapper?

Course Mapper is a free, browser-based tool that uses AI to transform your course syllabus into a structured Course Map spreadsheet. Upload your syllabus, and the AI organizes it into weekly lessons with learning goals, objectives, assessments, activities, resources, and more.

### Do I need to install anything?

No. Course Mapper runs entirely in your web browser. Just visit the website and start using it.

### What browsers are supported?

Any modern browser — Chrome, Firefox, Safari, or Edge. We recommend Chrome for the best experience.

---

## AI Models & API Keys

### Do I need to pay to use this?

No. You can use the **Free** tier, which gives you access to several AI models at no cost and requires no API key. If you want faster or more reliable results, you can optionally use your own API key from OpenAI, Anthropic, or Google.

### What is an API key?

An API key is like a password that lets our tool communicate with an AI provider (OpenAI, Anthropic, or Google) on your behalf. You get one from the provider's website. If you use the Free tier, you don't need one.

### Is my API key safe?

Your API key is sent directly from your browser to the AI provider — it never passes through our servers. It is also saved in your browser's local storage so you don't have to re-enter it each session. If you're on a shared computer, clear your browser data when done.

### Which free model should I use?

**GPT-OSS 120B** (the default) is the best all-around choice for course map generation. It produces reliable structured output and is fast. If you want deeper analysis, try **DeepSeek R1 0528**.

### The free model is slow or not responding. What should I do?

Free models are shared among all users and may be rate-limited during peak times. Try again in a minute, or switch to a different free model from the dropdown. For the most reliable experience, use your own API key.

---

## Uploading Files

### What file types can I upload?

- **Documents:** .docx, .doc, .pdf, .txt, .rtf, .odt, .md
- **Spreadsheets:** .xlsx, .xls, .csv, .ods
- **Presentations:** .pptx, .ppt, .odp
- **Other:** .html, .epub, .zip (archives containing any of the above)

### Can I upload multiple files?

Yes. You can upload as many files as you need — the AI will combine all the content.

### My PDF isn't being read correctly. What can I do?

Some scanned PDFs contain images instead of text. Course Mapper can only extract text-based content. If your PDF is a scan, try converting it to a .docx first using a tool like Adobe Acrobat or an online PDF-to-Word converter.

### Can I add more files after the course map is generated?

Yes. Click the blue **Add Materials** button at the top of the page. Upload new files, and the AI will automatically revise the course map to incorporate the new content.

---

## Generating & Editing

### How long does generation take?

Typically 1–3 minutes depending on the length of your syllabus and the AI model used.

### Can I stop generation in the middle?

Yes. Click the **Stop** button. You'll keep whatever has been generated so far.

### Can I edit the course map after it's generated?

Yes. Click any cell in the table to edit it directly. You can also add or delete rows, add or delete lessons, and reorder lessons using the controls that appear on hover.

### Can I undo my changes?

Yes. Use the **Undo** and **Redo** buttons. You can also jump to any previous version using the **History** panel on the right side.

### How do I ask the AI to make specific changes?

In the progress panel, there's a chat box labeled "Ask for revisions." Type your request in plain English, for example:

- _"Add more group activities to Lesson 3"_
- _"Change all technology references to Canvas"_
- _"Make the assessments more specific and measurable"_

The AI will update the course map based on your instructions.

---

## Exporting

### What export formats are available?

**Download to your computer:**

- **.xlsx** — Excel spreadsheet (the original table format)
- **.docx** — Word document (reorganized into a readable narrative format)
- **.pdf** — PDF document (table format, good for printing)
- **.csv** — Comma-separated values (for importing into other tools)

**Save to Google Drive:**

- **Google Sheets** — uploads directly to your Google Drive as a native Google Sheet
- **Google Docs** — uploads directly to your Google Drive as a native Google Doc (readable format)

### How does "Save to Google Sheets" / "Save to Google Docs" work?

When you click one of these buttons, a Google sign-in popup will appear. Sign in with your Google account, and the course map will be uploaded directly to your Google Drive. A new tab will open with the file. Your data goes straight from your browser to Google — we never see it.

### I get an error when trying to save to Google Drive. What's wrong?

This can happen if:

- **You blocked the popup** — allow popups for this site in your browser settings
- **You didn't grant permission** — the Google sign-in dialog asks for permission to create files in your Drive. You need to click "Allow."
- **The app is in testing mode** — if you see "This app isn't verified," click "Advanced" → "Go to Course Mapper (unsafe)" to proceed. This is normal for apps that haven't completed Google's verification process.

---

## Privacy & Data

### Is my data stored on your servers?

No. Everything runs in your browser. Your files are parsed locally, your API key is sent directly to the AI provider, and your course map is saved only in your browser's local storage.

### Will the AI provider see my syllabus?

Yes — your syllabus content is sent to the AI provider (OpenAI, Anthropic, Google, or OpenRouter for free models) to generate the course map. If you use the free tier, your prompts may be used by model providers to improve their AI. For sensitive materials, consider using your own API key with a paid provider.

### Does my work save automatically?

Yes. Your course map, version history, and settings are automatically saved in your browser's local storage. If you close the tab and come back later, everything will be restored. Click **New Project** to clear saved data and start fresh.

### Will my saved data persist across devices?

No. Local storage is specific to your browser on your current device. To transfer your work, export it as a file (.xlsx, .docx, etc.) and open it elsewhere.

---

## Troubleshooting

### The page is blank or not loading.

Try refreshing the page. If the issue persists, clear your browser cache or try a different browser.

### My course map looks wrong or incomplete.

- Try clicking the AI revision chat and ask it to fix specific issues
- Try a different AI model
- Make sure your uploaded syllabus contains clear, structured text

### I lost my work after clearing browser data.

Unfortunately, if you cleared your browser's local storage, the saved project is gone. We recommend exporting your course map as soon as you're satisfied with it.

### Something else isn't working.

Please open an issue on our [GitHub repository](https://github.com/lovejzzz/CourseMapper/issues) with a description of the problem, and we'll look into it.
