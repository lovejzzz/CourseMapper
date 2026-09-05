import { condenseCourseMap } from './promptUtils.js';

export default {
  system: `You are a senior curriculum designer at a top-tier research university. You produce publication-ready course syllabi that meet the standards of institutions like NYU, Columbia, MIT, and Stanford.

Your syllabi are:
- Learner-centered: use direct, student-facing language ("You will…", "In this course, we…")
- Transparent: explain WHY assignments, policies, and activities exist — not just what they are
- Professionally welcoming: warm but authoritative tone that signals the instructor cares about student success
- Backward-designed: learning outcomes → assessments that measure those outcomes → activities that prepare students
- Inclusive and accessible: diverse perspectives, flexible policies where appropriate, belonging-focused language

Return ONLY valid JSON, no markdown, no commentary.`,
  user: (cm, scope, verifiedChanges, columns) => `Generate a comprehensive, university-quality course syllabus for:

${condenseCourseMap(cm, scope, verifiedChanges, columns)}

Return JSON in this exact structure:
{"syllabus":{
  "courseTitle":"Full course name with department code and number",
  "semester":"${cm.semester || 'Term and dates: confirm in the course site'}",
  "credits":"Preserve an explicit credit value from the course map. If none is supplied, use exactly 'Credit value: confirm in the course site'; never infer credits from lesson count or scope.",
  "meetingPattern":"Use the course map/profile meeting pattern if supplied; otherwise state a course-relative pattern such as 'Weekly mixed lecture/lab session'",
  "location":"Use the course map/profile room or modality if supplied; otherwise use finished language such as 'Official course site and assigned class meeting space'",
  "deliveryMode":"Derive from the course format, e.g. In-Person, Online, Hybrid, Mixed lecture/lab",
  "prerequisites":"Derive from course level and content, or state 'No formal prerequisites listed; students should review program requirements.'",

  "instructor":"Use professor profile name if supplied; otherwise 'Course instructor'",
  "instructorEmail":"Use professor profile email if supplied; otherwise 'Use the contact method listed in the course site'",
  "officeHours":"Use professor profile office hours if supplied; otherwise 'Office hours are available through the course communication channel'",
  "officeLocation":"Use professor profile office location if supplied; otherwise 'Office hours location or meeting link is available in the course site'",

  "instructorBio":"Welcoming 3-4 sentence instructor introduction: academic background, teaching philosophy, what excites them about this course, and an approachable invitation for students to connect during office hours or by email (QM 1.8)",

  "courseDescription":"3-4 sentence paragraph explaining the purpose and structure of the course: intellectual goals, real-world relevance, what students will explore, and how the course is organized so learners understand what to expect (QM 1.2). Written in engaging, student-facing language.",

  "gettingStarted":"Step-by-step guide for students on how to get started: how to access the course site, navigate the LMS, find the syllabus/schedule/materials, and what to do in Week 1. Include where to find various course components (QM 1.1)",

  "learnerIntroActivity":"Description of how learners will introduce themselves in the first week — e.g., discussion board post, icebreaker activity, or introductory survey (QM 1.9)",

  "learningOutcomes":["5-7 specific, measurable outcomes using observable action verbs from Bloom's taxonomy (analyze, design, evaluate, synthesize, critique) — avoid vague terms like 'understand' or 'appreciate'. Each should be 1 sentence."],

  "courseAtAGlance":[{"week":"Week 1","topic":"lesson topic","inClassFocus":"approximate session flow with timing, e.g. '15 min concept model; 35 min applied lab; 15 min debrief'","studentOutput":"specific artifact, draft, discussion contribution, quiz, or checkpoint students produce","pointsOrWeight":"points/weight when known, otherwise course-relative grading category","successCriteria":"one observable criterion for strong work","feedbackUse":"how students use feedback from this week in a later task"}],

  "outcomeAlignmentMatrix":[{"outcome":"paste each learningOutcome verbatim","bloomsLevel":"Apply|Analyze|Evaluate|Create","assessedBy":["names of the specific courseRequirements entries that measure this outcome — e.g. 'Midterm Project', 'Weekly Quizzes #2-4', 'Final Presentation'"],"practicedIn":["lesson titles from the course map where learners practice this outcome before being assessed"]}],

  "requiredTexts":[{"title":"...","author":"...","edition":"...","isbn":"Use a real ISBN only if known from the course map; otherwise use an empty string","note":"State whether this is a required instructor-provided reading packet, required text, optional reference, or suggested alternative. Do not claim bookstore, library, or LMS availability unless provided."}],

  "courseRequirements":[{"name":"Assignment category name","weight":"20%","description":"2-3 sentence description with deliverable format, point/weight logic, success criteria, feedback timing, and how it connects to learning outcomes."}],

  "assessmentCalendar":[{"week":"Week 1","assessmentOrMilestone":"specific due item or checkpoint","pointsOrWeight":"points/weight when derivable","rubricCriteria":["3-4 observable criteria or criterion names"],"feedbackAndRevisionUse":"how feedback is returned and what later task it improves"}],

  "gradingScale":[{"grade":"A","range":"93–100"},{"grade":"A-","range":"90–92"},{"grade":"B+","range":"87–89"},{"grade":"B","range":"83–86"},{"grade":"B-","range":"80–82"},{"grade":"C+","range":"77–79"},{"grade":"C","range":"73–76"},{"grade":"C-","range":"70–72"},{"grade":"D+","range":"67–69"},{"grade":"D","range":"63–66"},{"grade":"F","range":"Below 63"}],

  "latePolicy":"Professional but fair late work policy (2-3 sentences). Include grace period or penalty structure, process for extensions, and documentation requirements.",

  "attendancePolicy":"2-3 sentence attendance and participation policy. Explain how attendance is tracked, how absences affect grades, and the process for excused absences.",

  "communicationPolicy":"2-3 sentences covering all communication guidelines: expected channels, response time commitments, netiquette expectations, how to ask questions, and preferred contact methods (QM 1.3).",

  "technologyPolicy":"2-3 sentences stating minimum technology requirements (hardware, software, browser, internet) and how to obtain/access each technology (QM 1.5). Include laptop/device use policy, recording policy, and the course LMS.",

  "technicalSkills":"Digital literacy and technical skills expected of learners: LMS navigation, file upload/submission, video conferencing, library database searches, and any discipline-specific software skills (QM 1.6)",

  "aiPolicy":"2-3 sentence policy on generative AI tools (ChatGPT, Claude, etc.). Specify whether AI is permitted, restricted, or prohibited, and any disclosure/citation requirements.",

  "weeklySchedule":[{"week":"Week 1","dates":"Use course-map calendar dates if supplied; otherwise use the course-relative week label, e.g. 'Week 1'","topic":"...","readings":"Specific required reading, instructor-provided reading packet item, article type, or course material for the week","assignments":"Due week, expected output, format/length, and success criteria for that week's deliverable"}],

  "academicIntegrity":"Professional 2-3 sentence academic integrity statement referencing university policy. Include what constitutes a violation in this course and consequences.",

  "technicalSupport":"2-3 sentences describing how to get technical help: IT helpdesk contact info, LMS support resources, hours of availability, and troubleshooting steps for common issues (QM 7.1)",

  "accommodations":"2-3 sentence statement linking to the institution's accessibility policies and accommodation services, directing students to the disability services office, encouraging early outreach, and affirming instructor commitment to access (QM 7.2).",

  "mentalHealth":"2-3 sentence statement normalizing mental health support, providing campus counseling center info, and crisis resources.",

  "titleIX":"1-2 sentence Title IX / non-discrimination statement with reference to university reporting resources.",

  "supportServices":"2-3 sentences listing academic support services (tutoring, writing center, library research help) and student services (counseling, career services, financial aid) that help learners succeed (QM 7.3, 7.4).",

  "dataPrivacy":"1-2 sentences on how student data is protected in course technologies, FERPA compliance, and privacy considerations for any third-party tools used in the course (QM 6.4)",

  "importantDates":[{"date":"Use course-map/profile dates when supplied; otherwise use course-relative labels such as 'Week 6' or 'Final week'","event":"..."}],
  "tags":["string — 8-12 keywords for LMS discoverability: include course title, department, discipline, key topics, pedagogy style, and relevant acronyms"]
}}

CRITICAL RULES:
- Derive ALL academic content (topics, readings, assignments, schedule) from the course map data above
- courseRequirements weights MUST total exactly 100%
- weeklySchedule MUST have one entry per lesson/week in the course map — match topics precisely
- learningOutcomes must use specific Bloom's taxonomy verbs: analyze, evaluate, create, apply, compare, critique, design, formulate, integrate, synthesize
- outcomeAlignmentMatrix MUST have one entry per learningOutcome (accreditation artifact). Every outcome must be assessedBy ≥1 courseRequirement AND practicedIn ≥1 lesson — if an outcome has no assessment, that's a gap the instructor needs to see.
- courseAtAGlance must contain one row per week and should be the fast navigation layer students can read before the detailed schedule.
- requiredTexts: when the course map provides no adopted textbook, create a required instructor-provided course reading packet plus optional discipline references. Do not invent exact ISBNs, bookstore availability, library access, or LMS availability.
- assessmentCalendar must show each graded or formative milestone, point/weight logic when derivable, rubric criteria, and feedback/revision use. Do not leave the assessment plan as a vague portfolio description.
- gradingScale: use the standard US university scale shown above unless professor profile provides a custom one
- All policy sections must read like real university policies — professional, specific, and actionable
- Every courseRequirements item must include concrete success criteria and feedback expectations, not just a broad category description.
- Every weeklySchedule item must include a reading/material cue, expected time-on-task or activity type, assessment due timing, and one success criterion when derivable from the course map.
- Every weeklySchedule item must also include concrete class-session activity structure, not just topic labels. Include approximate timing, student outputs, and facilitation cues when derivable.
- importantDates: include midterm exam, final exam, and major project deadlines when they are derivable from the course map. Do not include registration, add/drop, withdrawal, institutional holiday, or academic-calendar dates unless supplied.
- Never invent instructor identity, instructor contact details, campus office emails, support phone numbers, office locations, institutional URLs, registration dates, add/drop dates, withdrawal dates, room numbers, tool licenses, ISBNs, bookstore availability, or library availability.
- Never emit bracketed placeholders, TODO, TBD, "[Verify ...]", "[Instructor ...]", "[Office ...]", "to be confirmed", "to be announced", or any other unfinished authoring marker. If a local fact is unknown, use finished course-relative language such as "Week 1", "the course site", "the official course communication channel", or omit the optional field when possible.
- Do not invent named LMS folders, campus services, or institution-specific resource names. Use generic wording such as "the course site", "your institution's accessibility office", "library research support", or "technical support" unless the course map/profile names the resource.
- Do not add internal review dates, content-owner metadata, authoring workflow fields, or publishing-management fields. This syllabus is student-facing.
- The syllabus must serve as a complete course orientation: students should be able to find everything they need to get started, understand expectations, access support, and navigate the course (QM Standards 1 & 7)
- Write everything as if this will be distributed to students on the first day of class at a top university
- Return ONLY the JSON object`,
};
