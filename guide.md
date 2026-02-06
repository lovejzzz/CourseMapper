We are building a HTML app called "Course Mapper". It will understand input files, usually a course syllabus or other course related materials, and output like this example Course map files.

Users need to select a model, open AI or Anthropic, and input API key for doing that.



Please read the example folders carefully to understand the output we need.

In the end, we need to able download the output as a xlsx file that having the structure and relevant content as the example folders.

I created a repo for this project, it's empty now, but you push your code to this repo when you done.
https://github.com/lovejzzz/CourseMapper.git

---

## Cascade's Questions After Reviewing Everything

### 1. Column Structure Varies Across Examples — Which Is the Target?

The three examples have **different columns**:

- **Example 1** (Immigration Elective, 11 cols): Week/Module, Learning Goals, Topic/Section, Learning Objectives, Weekly Assessments, ASYNC Activities, SYNC Activities, Technology Needed, Presentation Format, Supporting Resources, Evaluate Design
- **Example 2** (PRAC I, 12 cols): Same as Example 1 **plus** a "Faculty Drafter" column
- **Example 3** (SWWP, 11 cols): Replaces "ASYNC/SYNC Activities" with a single "Plan Activities & Instructional Material" column, adds "Topics" and "Relationship of Goal to Learning Objective" columns

**Question:** Should the app always produce a fixed set of columns, or should the column structure vary based on the course? If it varies, what determines which columns to use?

---

### 2. Sheet Structure: Single Sheet vs. Per-Week Sheets

- **Examples 1 & 2** produce a **single sheet** with all weeks on one tab.
- **Example 3** produces **16 sheets**: "All Weeks" (summary), individual "Week 1" through "Week 14" (detailed), and a "Course" (high-level summary with formulas referencing per-week sheets).

**Question:** Should the app always produce per-week sheets + summary sheets like Example 3? Or a single sheet like Examples 1 & 2? What determines the structure?

---

### 3. Input File Types

All example inputs are `.docx` files.

**Question:** Should the app only accept `.docx` files, or should it also support `.pdf`, `.txt`, or other formats?

---

### 4. Multiple Input Files

Example 2 contains two syllabus files (`PRAC 1_Syllabus_2017(1).docx` and `PRAC 1_Syllabus_2017.docx`).

**Question:** Should the app support uploading multiple input files at once, combining them into a single course map? Or is one file at a time expected?

---

### 5. AI-Generated vs. Extracted Content

Some columns seem directly **extracted** from the syllabus (e.g., "Supporting Resources" lists specific readings from the syllabus). Other columns seem **AI-generated** (e.g., "Learning Objectives" are rewritten as "Students will be able to..." statements, activities are suggested).

**Question:** Can you clarify which columns should be:
- (a) Directly extracted/quoted from the syllabus
- (b) AI-generated/rewritten based on the syllabus
- (c) Left blank or with placeholder values for the instructor to fill in later

---

### 6. Cell Formatting and Merged Cells

The xlsx files use **merged cells** (e.g., a lesson spanning 3 sub-topic rows merges column A across those rows). They also have column widths, header formatting, etc.

**Question:** Should the output replicate the formatting (merged cells, colors, fonts, column widths), or is a plain data-only xlsx acceptable?

---

### 7. The "Evaluate Design" Column

This column contains checkboxes (`True`/`False` values). It appears to be for post-processing by the instructor.

**Question:** Should the app include this column in the output? Should all values default to `False`/unchecked?

---

### 8. Course Metadata

The output filenames include course name and semester (e.g., "Immigration Elective Course Map (SU26).xlsx").

**Question:** Should the user provide the course name and semester as separate inputs, or should the app extract them from the syllabus?

---

### 9. Number of Weeks/Lessons

Example 1 has 7 lessons, Example 2 has ~15 lessons, Example 3 has 14 weeks.

**Question:** Should the app auto-detect the number of weeks/lessons from the syllabus content, or should the user specify this?

---

### 10. ASYNC vs. SYNC Activity Split

Examples 1 & 2 separate activities into "ASYNCHRONOUS" and "SYNCHRONOUS" columns. Example 3 combines them into one "Plan Activities & Instructional Material" column.

**Question:** Is this distinction based on whether the course is online, in-person, or hybrid? Should the user select the course modality, which then determines the column layout?

---

### 11. Technology Needed Column

This column references specific platforms (Brightspace, Annoto, NYU Stream, Discussion Board).

**Question:** Should the AI infer technology platforms from context, or should the user provide a list of available platforms? Or should this be left blank?

---

### 12. Scope of "Course Map" Template

Looking at the examples, it seems like this is an NYU Silver School of Social Work-specific template.

**Question:** Is this app intended only for NYU Silver courses, or should it be general-purpose for any course syllabus? This affects how much domain-specific knowledge we should embed in the prompts.
