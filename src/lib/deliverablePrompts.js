/**
 * Prompt templates for generating each deliverable type.
 * Each function returns { systemPrompt, userPrompt } given a course map.
 *
 * All prompts are designed to meet university instructional-design standards
 * based on Bloom's Revised Taxonomy (Anderson & Krathwohl), UDL 2.2 Guidelines
 * (CAST), Understanding by Design (Wiggins & McTighe), Quality Matters (QM)
 * Higher Education Rubric (7th Edition), and best practices from Carnegie
 * Mellon's Eberly Center and Vanderbilt's Center for Teaching.
 */

import { getCustomDeliverable } from './customDeliverableLibrary.js';
import { getProfile } from './professorProfile.js';
import { getModeLessonPlanNote } from './pedagogicalModes.js';
import { getSections, buildSectionsContext } from './courseSections.js';

import { condenseCourseMap } from './prompts/promptUtils.js';
import lessonPlans from './prompts/lessonPlans.js';
import rubrics from './prompts/rubrics.js';
import slideDecks from './prompts/slideDecks.js';
import quizBank from './prompts/quizBank.js';
import discussions from './prompts/discussions.js';
import assignments from './prompts/assignments.js';
import studyGuides from './prompts/studyGuides.js';
import syllabus from './prompts/syllabus.js';
import courseFaq from './prompts/courseFaq.js';

const PROMPTS = {
  lessonPlans,
  rubrics,
  slideDecks,
  quizBank,
  discussions,
  assignments,
  studyGuides,
  syllabus,
  courseFaq,
};

// ── Schema Abbreviation for Chunks 1+ ──────────────────────────────────────────
// For subsequent chunks (chunkIndex > 0), we send a compact JSON skeleton + brief
// requirements instead of the full verbose schema with inline descriptions.
// This saves ~400-700 input tokens per subsequent chunk call.

const COMPACT_SCHEMAS = {
  lessonPlans: `{"plans":[{"lt":"str","wk":"str","dur":"str","sfs":{"beforeClass":"str","duringClass":"str","afterClass":"str","submittedArtifact":"str"},"al":"str","pk":"str","cms":["str"],"wsc":"str","lcr":"str","acs":["str"],"cc":"str","bls":["str"],"ob":["str"],"mt":["str"],"wu":{"dur":"str","ty":"str","pr":"str","pu":"str","fa":"str"},"ol":[{"tm":"str","ac":"str","ty":"str","de":"str","in":"str","ir":"str","gr":"str","bl":"str"}],"fc":{"ty":"str","pr":"str","oa":"str","ia":"str"},"un":{"rp":"str","eg":"str","ex":"str"},"hw":{"t":"str","de":"str","et":"str","cn":"str"},"ca":"str","tg":["str"],"rts":{"workedExample":"str","methodSpecificMiniRubric":"str","studentHandout":"str","instructorPrep":"str","accessibilityAndUDL":"str"}}]}`,
  slideDecks: `{"decks":[{"lt":"str","ts":0,"lo":["str"],"sl":[{"t":"str","ty":"str","bu":["str"],"no":"str","vi":{"k":"none|diagram|chart|image|table|code|equation","d":"str","at":"str"},"at":"str|null","ti":"str|null","bl":"str|null","ol":"str|null"}],"tg":["str"]}]}`,
  quizBank: `{"quizzes":[{"lt":"str","tq":0,"bc":["str"],"fn":"str","bp":"str","qs":[{"ty":"str","bl":"str","df":"str","em":0,"pt":0,"oa":"str","q":"str","op":["str"],"an":"str","dr":"str","ex":"str","rh":"str","sa":"str","sg":"str"}],"tg":["str"]}]}`,
  rubrics: `{"rubrics":[{"t":"str","lt":"str","at":"str","tp":0,"bl":"str","gs":{"ex":"str","pr":"str","dv":"str","bg":"str"},"cr":[{"cn":"str","oa":"str","wt":0,"pt":0,"ex":"str","pr":"str","dv":"str","bg":"str"}],"gp":"str","tn":"str","tg":["str"]}]}`,
  assignments: `{"courseAssignmentMap":[{"week":0,"artifact":"str","expectedFile":"str","length":"str","nextPortfolioUse":"str"}],"assignments":[{"t":"str","at":"str","rl":["str"],"dw":"str","et":"str","tp":0,"pg":"str","bl":"str","pc":"str","esf":"str","hsc":["str"],"ifp":"str","pb":{"exc":"str","prof":"str","rev":"str"},"ov":"str","ob":["str"],"ins":["str"],"fr":{"ln":"str","fm":"str","cs":"str","sp":"str","lp":"str"},"dl":["str"],"sm":[{"ms":"str","dd":"str","de":"str","fb":"str","pt":0,"ul":["str"]}],"gc":"str","sr":["str"],"pt":"str","ai":"str","ud":"str","sar":["str"],"fl":"str","tg":["str"]}]}`,
  discussions: `{"discussions":[{"lt":"str","bl":"str","fm":"str","ed":"str","cx":"str","pr":"str","er":"str","fp":["str"],"ft":{"op":"str","is":"str","id":"str","cl":"str"},"rs":["str"],"ec":["str"],"eq":"str","gl":"str","tg":["str"]}]}`,
  studyGuides: `{"guides":[{"lt":"str","es":"str","su":"str","kt":[{"tm":"str","df":"str","ex":"str"}],"cc":["str"],"cm":[{"mc":"str","co":"str"}],"rq":[{"q":"str","bl":"str","ht":"str"}],"pa":["str"],"ep":{"kk":["str"],"tl":"str","ce":"str","rv":"str"},"sr":"str","tg":["str"]}]}`,
  courseFaq: `{"faqs":[{"lt":"str","qs":[{"q":"str","an":"str","ca":"str","rc":["str"],"df":"str"}],"tg":["str"]}]}`,
};

const CONTINUATION_REQUIREMENTS = {
  lessonPlans: `- One plan per lesson. ≥5 outline segments with times summing to session duration.
- Bloom's verbs for objectives. Materials include tech + handout.
- WarmUp connects to objective. FormativeCheck maps to objective. UDL specific to lesson.
- Include rts with workedExample, methodSpecificMiniRubric, studentHandout, instructorPrep, and accessibilityAndUDL.
- Include sfs, al, pk, cms, wsc, lcr, acs, and cc so each week has a student-facing summary, artifact length, prerequisite knowledge, misconception checks, submission criteria, local-case replacement note, assessment criteria, and grading calibration cue.
- Do not include publishing metadata fields such as rd, cg, suggestedReviewDate, or contentOwnerGroup.
- Header format: "Lesson {N}: {Title}". Return ONLY JSON.`,
  slideDecks: `- 12-16 slides per deck. Sequence: title→agenda→objectives→bridge→body→summary→closing.
- Content slide titles = declarative sentences (assertion-evidence). Max 4 bullets.
- Every content/example/keyTerm slide needs vi.k != "none" with concrete vi.d and accessible vi.at.
- Speaker notes: ≥4 sentences, include example + anticipated Q + TRANSITION cue. Never 3+ consecutive content slides.
- Header format: "Lesson {N}: {Title}". Return ONLY JSON.`,
  quizBank: `- 5-7 questions per lesson. ≥3 MC, 1-2 short answer, 1 essay. ≥3 Bloom's levels per lesson.
- MC: 4 options (A-D), complete sentence stems, similar length. Omit inapplicable fields (no nulls).
- Mandatory: explanation for every question; distractorRationale for every MC question.
- Short answer and essay items must have non-empty scoring guidance and model/exemplar response fields.
- Each quiz set includes bp assessment blueprint and fn accessibility/feedback guidance.
- Header format: "Lesson {N}: {Title}". Return ONLY JSON.`,
  rubrics: `- One rubric per unique assessment. 4-6 criteria, weights sum to 100.
- Observable behavioral language. No vague qualifiers. Exemplary = above minimum.
- Include gradePolicyConnection and teacherNotes. Return ONLY JSON.`,
  assignments: `- 4-7 assignments spanning different types. Imperative-voice numbered instructions.
- Each item must be an assignment brief, not a generic "Lesson X Assignment Brief" wrapper.
- Match the first chunk's structure exactly: unique assignment title, overview, objectives, concise numbered instructions, formatRequirements, checklist deliverables, scaffoldingMilestones, supportResources, progressTracking, academicIntegrityStatement, accessibilityAndUDL, selfAssessmentRubric, and feedbackLoop.
- Include courseAssignmentMap when generating the first chunk or whole set. Each assignment must include pc, esf, hsc, ifp, and pb so portfolio connection, expected file, high-value criteria, feedback priority, and performance bands are visible.
- ≥2 scaffolding milestones for major assignments. Each milestone includes ms, dd, de, fb, pt, and final milestone ul.
- Never swap fields: readings/resources belong in sr, submission rules belong in fr, grading summary belongs in gc.
- percentOfGrade values sum proportionally. Return ONLY JSON.`,
  discussions: `- One per lesson. Target Bloom's 4-6. Main prompt = open-ended, no single answer.
- ≥6 distinct formats across all lessons. Substantive follow-up probes.
- Do not swap discussion fields: ec = assessment criteria, eq = equity/access guidance, gl = student participation instructions, tg = searchable tags.
- ec must be 3-4 observable criteria (evidence use, reasoning, peer engagement, ethical/method fit). gl must be full student-facing guidance, never tags.
- Lessons in later chunks must preserve the same depth as early lessons; never compress Lessons 9-12 into thinner or more generic discussion entries.
- Include equityConsiderations and participation guidelines. Return ONLY JSON.`,
  studyGuides: `- One guide per lesson. Summary = 2-3 paragraphs in clear prose.
- 8-12 key terms with definition AND example. ≥1 cross-lesson connection.
- 2-4 misconceptions. 4-6 review questions spanning ≥3 Bloom's levels.
- Header format: "Lesson {N}: {Title}". Return ONLY JSON.`,
  courseFaq: `- Exactly 5 questions per lesson unless Additional Instructor Requirements specify a different exact count. ≥3 different categories.
- Questions in first-person student voice. Answers concise (2-4 sentences), actionable.
- Header format: "Lesson {N}: {Title}". Return ONLY JSON.`,
};

/**
 * Build a shortened continuation prompt for chunks 1+ of the same feature.
 * Uses compact schema skeleton + brief requirements instead of the full verbose template.
 */
function buildContinuationPrompt(featureId, courseMap, scopeIndices, examChanges, columns) {
  const schema = COMPACT_SCHEMAS[featureId];
  const reqs = CONTINUATION_REQUIREMENTS[featureId];
  if (!schema || !reqs) return null; // fall back to full prompt

  const condensed = condenseCourseMap(courseMap, scopeIndices, examChanges, columns);

  return `Continue generating the same deliverable for the next set of lessons:

${condensed}

Use the EXACT same JSON schema, key names, formatting, and quality standards as the previous chunk.
Schema skeleton (for reference — match this structure exactly):
${schema}

KEY REQUIREMENTS:
${reqs}`;
}

// ── Config → natural-language instructions for the AI ────────────────────────
function buildConfigInstructions(featureId, config, pedagogicalMode = 'lecture', styleExemplar = null) {
  const lines = [];

  // Feature 4.2 — Pedagogical mode structure note (lesson plans only)
  if (featureId === 'lessonPlans') {
    const modeNote = getModeLessonPlanNote(pedagogicalMode);
    if (modeNote) lines.push(`PEDAGOGICAL STRUCTURE REQUIREMENT: ${modeNote}`);
  }

  // ── Base layer: professor profile defaults (lowest priority) ──
  const profile = getProfile();
  if (profile.name || profile.institution || profile.department) {
    const parts = [profile.name, profile.department, profile.institution].filter(Boolean);
    if (parts.length > 0) lines.push(`Instructor context: ${parts.join(', ')}.`);
  }
  if (featureId === 'lessonPlans' && profile.defaultSessionLength && !config?.sessionLength) {
    lines.push(
      `Each class session is ${profile.defaultSessionLength} — adjust ALL time estimates in the outline to match this duration exactly.`,
    );
  }
  if (featureId === 'syllabus' && profile.citationStyle && !config?.citationStyle) {
    lines.push(`Use ${profile.citationStyle} citation format throughout the syllabus.`);
  }
  if ((featureId === 'syllabus' || featureId === 'assignments') && profile.lateWorkPolicy) {
    lines.push(`Late work policy (use exactly, do not rewrite): "${profile.lateWorkPolicy}"`);
  }
  if ((featureId === 'syllabus' || featureId === 'rubrics') && profile.academicIntegrityStatement) {
    lines.push(`Academic integrity statement (use exactly, do not rewrite): "${profile.academicIntegrityStatement}"`);
  }
  if (featureId === 'syllabus' && profile.accommodationStatement) {
    lines.push(`Accommodation statement (use exactly, do not rewrite): "${profile.accommodationStatement}"`);
  }
  if (featureId === 'syllabus' && profile.mentalHealthStatement) {
    lines.push(`Mental health resources statement (use exactly, do not rewrite): "${profile.mentalHealthStatement}"`);
  }
  // Feature 3.1 — Institution-level policies (injected as non-overridable blocks)
  if (featureId === 'syllabus' && profile.policyTitleIX) {
    lines.push(`Title IX / Non-Discrimination statement (use exactly, do not rewrite): "${profile.policyTitleIX}"`);
  }
  if (featureId === 'syllabus' && profile.policyGradeScale) {
    lines.push(`Grade scale (use exactly this scale in the grading section): ${profile.policyGradeScale}`);
  }
  // Feature 7.2 — Multi-Section Mode: inject section info into syllabus prompt
  if (featureId === 'syllabus') {
    const sects = getSections();
    const sectCtx = buildSectionsContext(sects);
    if (sectCtx) lines.push(sectCtx);
  }

  // ── Universal writing mechanics (Dornsife model — apply to ALL deliverables) ──
  lines.push(`WRITING MECHANICS (apply to all generated content):
- Use active voice exclusively — never passive constructions.
- Target ~15-word average sentence length; never exceed 25 words per sentence.
- Use empowering, supportive tone ("Consider…", "We recommend…" — not "You must…").
- Be concrete and specific — no jargon, no buzzwords, no filler.
- Position the instructor as the expert; content is their tool, not a mandate.
- Avoid walls of text: short paragraphs (≤5 sentences), clear section breaks, scannable formatting.
- Content must be screen-reader accessible: avoid color-only references, describe visual concepts textually.`);

  lines.push(`SOURCE AND PLACEHOLDER RULES (apply to all generated content):
- Do not invent instructor names, emails, phone numbers, office locations, office hours, department names, LMS folder names, campus office contacts, support phone numbers, bookstore/library availability, licenses, or institutional deadlines.
- Never emit bracketed placeholders, TODO, TBD, "[Verify ...]", "[Instructor ...]", "[Office ...]", or other unfinished authoring markers.
- If a local fact is unknown, avoid placeholder/status phrases such as "to be confirmed", "to be announced", "TBD", or "verify before adoption". Prefer course-relative, finished wording such as "Week 1", "the course site", "the official course communication channel", or omit optional fields when the schema allows it.
- Named third-party tools are allowed only when present in the course map/profile or framed as optional examples. Prefer generic labels like "course site", "survey platform", "spreadsheet", or "statistical software" when the source does not specify a tool.
- Do not imply that a resource exists in the instructor's institution unless the course map, profile, or instructor instructions explicitly provide it.`);

  lines.push(`COURSE COHERENCE AND PUBLISHABILITY (apply to all generated content):
- Treat the course as one coherent learning experience, not a collection of disconnected sample artifacts.
- Use one recurring course domain, research portfolio, client case, dataset family, or clearly linked family of cases unless the course map explicitly requires unrelated topics.
- If multiple cases are pedagogically necessary, explain the shared throughline in the artifact and connect each case to the same course outcomes and assessment arc.
- Do not rotate unrelated civic, health, education, policy, and community examples across weeks without an explicit bridge.
- Write finished student- or instructor-facing materials, not internal planning notes, schema explanations, or generated-content wrappers.
- Prefer fewer, stronger examples with clear reuse across deliverables over many unrelated examples that weaken course identity.`);

  lines.push(`A-QUALITY BENCHMARK (apply to all generated content):
- Every deliverable must make the course arc visible: where this item sits, what students produce, how feedback is used, and how it prepares the next assessed task.
- Each lesson-level item must include a concrete "what strong work looks like" signal: observable criteria, a mini-checklist, a model move, or an anchor example tied to that exact lesson.
- Do not rely on generic "course site" or "posted materials" references. When a resource is unknown, name the instructor-prep action or the course-relative artifact students should use.
- Add accessibility and UDL guidance as task-specific alternatives that preserve the same criteria, not as repeated policy boilerplate.
- Keep common policies concise and avoid repeating the same wording in every item. Use shared course-level guidance when the schema permits, then make each lesson item specific.`);

  if (featureId === 'courseFaq') {
    const rawCount = Number(config?.questionsPerLesson);
    const questionCount = Number.isFinite(rawCount) ? Math.max(3, Math.min(8, Math.round(rawCount))) : 5;
    lines.push(`Generate exactly ${questionCount} FAQ questions per lesson.`);
  }

  if (!config || Object.keys(config).length === 0) return lines.join('\n');

  if (featureId === 'lessonPlans') {
    lines.push(
      'LESSON PLAN A-QUALITY: Include a course-level assessment progression map or equivalent top-level overview when the JSON schema permits it. Each lesson must state the weekly artifact, grading/use criteria, instructor prep materials, and one case or dataset connection that fits the shared course throughline.',
    );
    if (config.sessionLength)
      lines.push(
        `Each class session is ${config.sessionLength} — adjust ALL time estimates in the outline to match this duration exactly.`,
      );
    if (config.detailLevel === 'Brief')
      lines.push(
        'Keep content concise — use short bullet points, minimal elaboration. Prioritize actionability over depth.',
      );
    if (config.detailLevel === 'Detailed')
      lines.push(
        'Be highly detailed and rich — elaborate each section with multiple examples, instructor guidance, and pedagogical rationale.',
      );
    if (config.includeWarmUp === false)
      lines.push('Do NOT include a warm-up activity — set the "wu" (warmUp) field to null.');
    if (config.includeUDL === false) lines.push('Do NOT include UDL notes — set the "un" (udlNotes) field to null.');
    if (config.includeHomework === false)
      lines.push('Do NOT include a homework section — set the "hw" (homework) field to null.');
  } else if (featureId === 'slideDecks') {
    if (config.slidesPerLesson)
      lines.push(
        `Target ${config.slidesPerLesson} slides per deck (including title, agenda, objectives, bridge, content slides, and closing).`,
      );
    if (config.includeActivities === false)
      lines.push(
        'Minimize activity and discussion slides — focus on content and example slides. Only include an activity slide if it is essential.',
      );
    if (config.speakerNotes === 'Minimal')
      lines.push('Speaker notes should be brief bullet reminders only — 1-2 sentences per slide, NOT full scripts.');
    if (config.speakerNotes === 'Full script')
      lines.push(
        'Speaker notes must be full instructor scripts — at least 3 substantive sentences per slide with examples and transition cues.',
      );
    if (config.generateAiImages === true) {
      lines.push(
        'AI IMAGE ENRICHMENT ENABLED: For a small number of high-value concept, example, bridge, or activity slides, set vi.k to "image", "diagram", or "chart" and write vi.d as a concrete, safe image-generation prompt. Prefer educational diagrams, classroom-neutral scenes, process illustrations, or conceptual metaphors. Avoid copyrighted characters, real people, brand logos, and text-heavy images. Keep vi.at accurate and descriptive for accessibility.',
      );
    }
  } else if (featureId === 'rubrics') {
    if (config.criteriaCount)
      lines.push(`Each rubric must have exactly ${config.criteriaCount} criteria (ensure weights sum to 100%).`);
    if (config.performanceLevels === '3 levels')
      lines.push(
        'Use exactly 3 performance levels: Developing, Proficient, and Mastery. Do NOT include a "Beginning" level. Adjust the gradingScale accordingly.',
      );
    if (config.includeTeacherNotes === false)
      lines.push('Do NOT include the "tn" (teacherNotes) field — omit it entirely from the JSON.');
  } else if (featureId === 'quizBank') {
    if (config.questionsPerLesson)
      lines.push(
        `Generate ${config.questionsPerLesson} questions per lesson. Distribute them across the allowed question types.`,
      );
    const excluded = [];
    if (config.includeMultipleChoice === false) excluded.push('multiple_choice');
    if (config.includeShortAnswer === false) excluded.push('short_answer');
    if (config.includeEssay === false) excluded.push('essay');
    if (excluded.length > 0)
      lines.push(`Do NOT generate questions of these types: ${excluded.join(', ')}. Only use the remaining types.`);
    if (config.difficultyDist === 'Mostly Easy/Medium')
      lines.push('Weight questions toward Easy and Medium difficulty — at most 1 Hard question per lesson.');
    if (config.difficultyDist === 'Mostly Medium/Hard')
      lines.push('Weight questions toward Medium and Hard difficulty — at most 1 Easy question per lesson.');
  } else if (featureId === 'discussions') {
    lines.push(
      'DISCUSSION A-QUALITY: Separate student-facing prompts from instructor-only facilitation. Each discussion must include required evidence, a visible time/post structure, 3-4 observable scoring criteria, and a rubric bridge that names method reasoning, evidence use, peer response, and revision or limitation awareness.',
    );
    lines.push(
      'DISCUSSION LANGUAGE QUALITY: Use polished English only. Do not emit corrupted mixed-language fragments, encoding artifacts, or stray non-English words unless the course map explicitly asks for multilingual content.',
    );
    if (config.formatPreference && config.formatPreference !== 'Any')
      lines.push(`Use "${config.formatPreference}" as the discussion format for ALL lessons.`);
    if (config.includeFacilitation === false)
      lines.push('Do NOT include the "ft" (facilitationTips) field — omit it entirely.');
    if (config.includeEquity === false)
      lines.push('Do NOT include the "eq" (equityConsiderations) field — omit it entirely.');
  } else if (featureId === 'assignments') {
    lines.push(
      'ASSIGNMENT SEQUENCE COHERENCE: Build assignments as a connected course portfolio. Reuse a consistent domain, dataset family, scenario thread, or client/project context across assignments unless the course map explicitly provides a different case sequence. Do not create a tour of unrelated social-science contexts.',
    );
    lines.push(
      'ASSIGNMENT OUTCOME WORDING: When referencing course outcomes, include the full outcome text or a concise paraphrase, not only labels such as LO1 or Objective 2.',
    );
    lines.push(
      'ASSIGNMENT SCHEMA STABILITY: Every assignment must keep the same field meanings and include accessibilityAndUDL, selfAssessmentRubric, and feedbackLoop when those fields are in the schema. Do not introduce alternate names for timing, submission rules, or instructor notes in later chunks.',
    );
    if (config.assignmentTypes?.length > 0 && config.assignmentTypes.length < 6) {
      lines.push(
        `Only create assignments of these types: ${config.assignmentTypes.join(', ')}. Do not create other assignment types.`,
      );
    }
    if (config.includeScaffolding === false)
      lines.push('Do NOT include "sm" (scaffoldingMilestones) — omit the field entirely.');
    if (config.includeIntegrity === false)
      lines.push('Do NOT include the "ai" (academicIntegrityStatement) field — omit it entirely.');
  } else if (featureId === 'studyGuides') {
    lines.push(
      'STUDY GUIDE A-QUALITY: Add a course-level workflow or equivalent overview when the JSON schema permits it. Each practice activity must name expected output, estimated time, success criteria, and the graded artifact or portfolio skill it supports.',
    );
    lines.push(
      'STUDY GUIDE QUESTION QUALITY: Never duplicate review questions within the same guide. Vary Bloom levels and make every hint point to a reasoning strategy, not the answer.',
    );
    if (config.keyTermsCount)
      lines.push(`Include exactly ${config.keyTermsCount} key terms per guide — each with definition AND example.`);
    if (config.includeMisconceptions === false)
      lines.push('Do NOT include the "cm" (commonMisconceptions) field — omit it entirely.');
    if (config.includeExamPrep === false) lines.push('Do NOT include the "ep" (examPrep) field — omit it entirely.');
    if (config.includePractice === false)
      lines.push('Do NOT include the "pa" (practiceActivities) field — omit it entirely.');
  } else if (featureId === 'courseFaq') {
    lines.push(
      'COURSE FAQ A-QUALITY: Include a concise top-level FAQ guide or equivalent navigation overview when the JSON schema permits it. Each weekly FAQ must include at least one concrete success checklist or "what strong work looks like" cue tied to the assessment or discussion for that lesson.',
    );
    if (config.categories?.length > 0 && config.categories.length < 5) {
      lines.push(`Use only these Course FAQ categories in the "ca" field: ${config.categories.join(', ')}.`);
    }
    if (config.answerDepth === 'Quick answers')
      lines.push('Keep each FAQ answer very brief: 1-2 concise sentences with a clear next action.');
    if (config.answerDepth === 'Detailed')
      lines.push(
        'Make each FAQ answer more detailed: 3-4 sentences with context, examples, and a concrete next action.',
      );
    if (config.includeResourcePointers === false) {
      lines.push(
        'Do not invent campus resource names, offices, or technology tools. Reference only resources explicitly present in the course map; otherwise give general course-based guidance.',
      );
    }
    if (config.useFirstPersonQuestions === false) {
      lines.push('Questions may use neutral student-facing wording rather than first-person phrasing.');
    }
  } else if (featureId === 'syllabus') {
    lines.push(
      'SYLLABUS A-QUALITY: Add a concise course-at-a-glance table and an assessment calendar when the JSON schema permits it. Weekly schedule entries must include in-class activity timing, expected student output, feedback use, success criteria, and the specific outcome or requirement they support.',
    );
    lines.push(
      'SYLLABUS PLACEHOLDER POLICY: If local instructor, room, support link, or institutional details are unknown, use finished course-relative wording or omit optional local fields. Do not make unknown local facts look like unresolved publication placeholders.',
    );
    if (config.citationStyle)
      lines.push(
        `Use ${config.citationStyle} citation format throughout the syllabus (reference list, in-text citations, and all examples).`,
      );
    if (config.includeWeeklySchedule === false)
      lines.push('Do NOT include the weeklySchedule array — omit it entirely.');
    if (config.latePolicyTone === 'Strict')
      lines.push(
        'Late work policy must be strict: no late work accepted without documented emergency or prior instructor approval.',
      );
    if (config.latePolicyTone === 'Flexible')
      lines.push(
        'Late work policy should be flexible and student-supportive, reflecting a growth mindset and understanding of student challenges.',
      );
  }

  // Feature 4.1 — Tiered Differentiation
  if (config.enableTiers) {
    lines.push(
      `TIERED DIFFERENTIATION REQUIRED: For EVERY item in this deliverable, generate three differentiated versions stored in a "tiers" object:\n` +
        `  - tiers.scaffolded: Designed for struggling students — add sentence starters, worked examples, simplified vocabulary, step-by-step breakdowns, and additional scaffolds.\n` +
        `  - tiers.standard: The regular version (same content quality as without tiering enabled).\n` +
        `  - tiers.extension: Designed for advanced/fast-finishing students — add challenge questions, independent research prompts, higher-order thinking tasks, and real-world application extensions.\n` +
        `The "tiers" object must be included alongside (not replacing) the standard fields for each item. Do not omit any standard fields.`,
    );
  }

  // ── Universal advanced settings (apply to all deliverables) ──
  if (config.tone) {
    lines.push(
      `TONE: Write all content in a ${config.tone.toLowerCase()} tone. Adjust vocabulary, sentence structure, and formality level to match a ${config.tone.toLowerCase()} register.`,
    );
  }
  if (config.style) {
    const styleMap = {
      'Bullet points':
        'Use bullet points as the primary formatting structure. Prefer concise, scannable lists over long paragraphs.',
      Paragraphs: 'Use full paragraphs as the primary formatting structure. Write in flowing, connected prose.',
      Tables: 'Where possible, organize information into tables with clear headers and rows.',
      'Numbered lists': 'Use numbered lists as the primary formatting structure for sequential or prioritized content.',
      Mixed: 'Use a mix of bullet points, paragraphs, and tables as appropriate for each section.',
    };
    lines.push(`STYLE & FORMAT: ${styleMap[config.style] || `Format content as ${config.style.toLowerCase()}.`}`);
  }
  if (config.outputLength) {
    const lengthMap = {
      Brief:
        'Keep output concise and minimal — prioritize brevity. Use the shortest effective phrasing. Reduce sections to essentials only.',
      Standard: 'Use standard detail level — balanced between brevity and depth.',
      Detailed: 'Be highly detailed — elaborate each section with examples, rationale, and thorough coverage.',
      Comprehensive:
        'Be maximally comprehensive — leave nothing out. Include extensive examples, edge cases, alternative approaches, and deep explanations for every section.',
    };
    lines.push(
      `OUTPUT LENGTH: ${lengthMap[config.outputLength] || `Adjust output length to be ${config.outputLength.toLowerCase()}.`}`,
    );
  }

  if (config.extraInstructions?.trim()) {
    lines.push(
      `SPECIAL INSTRUCTOR REQUIREMENTS (highest priority — must be followed): ${config.extraInstructions.trim()}`,
    );
  }

  // Cross-chunk style consistency: inject exemplar from chunk 0 into later chunks
  if (styleExemplar) {
    lines.push(
      `\nCROSS-CHUNK CONSISTENCY (mandatory — match exactly):\n` +
        `This is part of a multi-chunk generation. You MUST replicate the exact formatting, ` +
        `structure, numbering style, citation format, header conventions, and voice of the first chunk. ` +
        `Do NOT introduce new formatting patterns, abbreviation styles, or structural changes.\n` +
        `Here is the first item from chunk 1 as your style reference — replicate its format for every item:\n` +
        `--- STYLE EXEMPLAR ---\n${styleExemplar}\n--- END EXEMPLAR ---`,
    );
  }

  // Reference file style injection (always last, high priority)
  if (config.referenceFileText?.trim()) {
    lines.push(
      `\nSTYLE & FORMAT REFERENCE (very important — match this as closely as possible):\n` +
        `The instructor has provided the following example document to define the desired tone, structure, and formatting. ` +
        `Study it carefully and replicate its style, voice, section organization, and level of detail as closely as possible:\n` +
        `--- REFERENCE EXAMPLE START ---\n${config.referenceFileText.slice(0, 3000)}\n--- REFERENCE EXAMPLE END ---`,
    );
  }

  return lines.join('\n');
}

// Build a scope preamble that forces the AI to generate ONLY for the selected lessons.
function buildScopePreamble(courseMap, scopeIndices) {
  if (!Array.isArray(scopeIndices) || scopeIndices.length === 0) return '';
  const allLessons = courseMap.lessons || [];

  // Same pattern as condenseCourseMap: detect when course map is already scoped.
  // When the user scopes to e.g. lesson 5 (index 4), the course map generation may
  // produce only 1 lesson at index 0.  scopeIndices=[4] but allLessons.length=1,
  // so filtering by index gives an empty list.  In that case, pair each lesson in the
  // already-scoped course map with its original scope index for correct labeling.
  const inRange = scopeIndices.filter((i) => i < allLessons.length);
  let titleLines;
  if (inRange.length > 0) {
    // Normal case: course map has all lessons, filter by scope
    titleLines = inRange.map((i) => `- Lesson ${i + 1} (Week ${i + 1}): ${allLessons[i]?.title || ''}`);
  } else {
    // Already-scoped case: course map only has the scoped lessons
    titleLines = allLessons.map((l, i) => {
      const origIdx = scopeIndices[i] !== undefined ? scopeIndices[i] : i;
      return `- Lesson ${origIdx + 1} (Week ${origIdx + 1}): ${l?.title || ''}`;
    });
  }
  const titles = titleLines.join('\n');
  const firstIdx = inRange.length > 0 ? scopeIndices[0] : (scopeIndices[0] ?? 0);
  return `⚠️ SCOPE CONSTRAINT — CRITICAL: Generate content for ONLY the following ${scopeIndices.length} lesson${scopeIndices.length !== 1 ? 's' : ''}. Do NOT generate anything for any other lesson. Your output array MUST contain EXACTLY ${scopeIndices.length} item${scopeIndices.length !== 1 ? 's' : ''}:\n${titles}\n\nIMPORTANT: Use the ORIGINAL lesson/week numbers from the course map (e.g., "Week ${firstIdx + 1}", "Lesson ${firstIdx + 1}"). Do NOT renumber them as Lesson 1.\n\n`;
}

/**
 * @param {string}      featureId
 * @param {object}      courseMap
 * @param {number[]|null} scopeIndices
 * @param {object}      config
 * @param {string}      pedagogicalMode
 * @param {object|null} examChanges
 * @param {string|null} editContext  — Optional: human-readable summary of what the
 *   instructor changed (e.g. 'homework: "3" → "4"'). When provided, injected as the
 *   highest-priority constraint so the AI incorporates the edit precisely.
 * @param {Array|null}  columns — Active column definitions from ColumnEditor.
 */
export function getDeliverablePrompt(
  featureId,
  courseMap,
  scopeIndices = null,
  config = {},
  pedagogicalMode = 'lecture',
  examChanges = null,
  editContext = null,
  columns = null,
  allConfigs = null,
  styleExemplar = null,
  chunkIndex = 0,
) {
  const template = PROMPTS[featureId];
  const scopePreamble = buildScopePreamble(courseMap, scopeIndices);

  // Build the edit-context block when provided (injected before config instructions)
  const editContextBlock = editContext
    ? `\n\nINSTRUCTOR EDIT TO INCORPORATE (mandatory — highest priority):\nThe instructor has made this specific change to this lesson:\n  ${editContext}\nRevise the content to reflect this change precisely. Preserve everything else unchanged. Do NOT invent unrelated changes.`
    : '';

  // ── Custom deliverable fallback ───────────────────────────────────────────
  if (!template && featureId.startsWith('custom_')) {
    const custom = getCustomDeliverable(featureId);
    if (custom) {
      // ── Auto-fill missing config from custom deliverable defaults + sibling configs ──
      const enrichedConfig = { ...config };
      const dc = custom.defaultConfig || {};
      // 1) Fall back to the custom deliverable's own defaultConfig
      if (!enrichedConfig.tone && dc.tone) enrichedConfig.tone = dc.tone;
      if (!enrichedConfig.style && dc.style) enrichedConfig.style = dc.style;
      if (!enrichedConfig.outputLength && (dc.length || dc.outputLength))
        enrichedConfig.outputLength = dc.length || dc.outputLength;

      // 2) If still missing, infer from other deliverables' configs
      if (allConfigs && (!enrichedConfig.tone || !enrichedConfig.style || !enrichedConfig.outputLength)) {
        for (const [otherId, otherCfg] of Object.entries(allConfigs)) {
          if (otherId === featureId || !otherCfg) continue;
          if (!enrichedConfig.tone && otherCfg.tone) enrichedConfig.tone = otherCfg.tone;
          if (!enrichedConfig.style && otherCfg.style) enrichedConfig.style = otherCfg.style;
          if (!enrichedConfig.outputLength && otherCfg.outputLength)
            enrichedConfig.outputLength = otherCfg.outputLength;
          if (enrichedConfig.tone && enrichedConfig.style && enrichedConfig.outputLength) break;
        }
      }

      // 3) If STILL missing after all fallbacks, inject AI auto-decide instruction
      const autoDecideHints = [];
      if (!enrichedConfig.tone)
        autoDecideHints.push(
          'tone (e.g. Academic, Professional, Conversational, or Friendly — pick what best fits the course and deliverable type)',
        );
      if (!enrichedConfig.style)
        autoDecideHints.push(
          'formatting style (e.g. bullet points, paragraphs, tables, numbered lists, or a mix — pick what best fits this deliverable type)',
        );
      if (!enrichedConfig.outputLength)
        autoDecideHints.push(
          'output length/detail level (e.g. Brief, Standard, Detailed, or Comprehensive — pick what best fits this deliverable type)',
        );

      const condensed = condenseCourseMap(courseMap, scopeIndices, examChanges, columns);
      const baseUserPrompt = (config.customUserPrompt?.trim() || custom.userPromptTemplate).replace(
        '{{courseMap}}',
        condensed,
      );
      const configInstructions = buildConfigInstructions(featureId, enrichedConfig, pedagogicalMode, styleExemplar);

      const autoDecideBlock =
        autoDecideHints.length > 0
          ? `\n\nAUTO-DECIDE INSTRUCTIONS (the instructor has not specified these settings — use your best judgment):\nBased on the course content, deliverable type ("${custom.name}"), and pedagogical context, automatically decide the most appropriate:\n${autoDecideHints.map((h) => `- ${h}`).join('\n')}\nApply your chosen settings consistently throughout the output.`
          : '';

      const withEdit = editContextBlock
        ? baseUserPrompt.replace(/(\nReturn ONLY)/, `${editContextBlock}$1`)
        : baseUserPrompt;
      const withAutoDecide = autoDecideBlock ? withEdit.replace(/(\nReturn ONLY)/, `${autoDecideBlock}$1`) : withEdit;
      const withConfig = configInstructions
        ? withAutoDecide.replace(
            /(\nReturn ONLY)/,
            `\n\nADDITIONAL INSTRUCTOR REQUIREMENTS (must be followed, take priority over defaults):\n${configInstructions}$1`,
          )
        : withAutoDecide;
      const withExtra = config.extraInstructions?.trim()
        ? withConfig + `\n\nINSTRUCTOR EXTRA INSTRUCTIONS:\n${config.extraInstructions.trim()}`
        : withConfig;
      const userPrompt = scopePreamble + withExtra;

      // Build system prompt — enrich with deliverable name/description context
      let systemPrompt = config.customSystemPrompt?.trim() || custom.systemPrompt;
      // If the system prompt doesn't already mention the deliverable name, prepend context
      if (custom.name && !systemPrompt.includes(custom.name)) {
        const descLine = custom.description ? ` Description: ${custom.description}.` : '';
        systemPrompt = `You are generating a "${custom.name}" deliverable for a university course.${descLine}\n\n${systemPrompt}`;
      }

      return { systemPrompt, userPrompt };
    }
    return null;
  }

  if (!template) return null;

  // ── Schema Abbreviation: use compact continuation prompt for chunks 1+ ──
  // This saves ~400-700 input tokens per subsequent chunk by replacing the full
  // verbose schema + inline descriptions with a compact skeleton + brief requirements.
  const useContinuation = chunkIndex > 0 && !config.customUserPrompt?.trim() && !editContext;
  const continuationPrompt = useContinuation
    ? buildContinuationPrompt(featureId, courseMap, scopeIndices, examChanges, columns)
    : null;

  const baseUserPrompt =
    continuationPrompt ||
    (config.customUserPrompt?.trim()
      ? config.customUserPrompt.replace(
          '{{courseMap}}',
          condenseCourseMap(courseMap, scopeIndices, examChanges, columns),
        )
      : template.user(courseMap, scopeIndices, examChanges, columns));
  const configInstructions = buildConfigInstructions(featureId, config, pedagogicalMode, styleExemplar);

  if (continuationPrompt) {
    // For continuation prompts, append config + scope preamble directly
    // (no "Return ONLY the JSON" marker to match — the compact prompt already ends with "Return ONLY JSON")
    let userPrompt = baseUserPrompt;
    if (configInstructions) {
      userPrompt += `\n\nADDITIONAL INSTRUCTOR REQUIREMENTS:\n${configInstructions}`;
    }
    if (config.extraInstructions?.trim()) {
      userPrompt += `\n\nINSTRUCTOR EXTRA INSTRUCTIONS:\n${config.extraInstructions.trim()}`;
    }
    userPrompt = scopePreamble + userPrompt;
    return {
      systemPrompt: config.customSystemPrompt?.trim() || template.system,
      userPrompt,
    };
  }

  // ── Full prompt path (chunk 0, custom prompts, or edit context) ──
  // Inject edit context first (highest priority), then config instructions
  // Both are inserted right before the final "Return ONLY the JSON" instruction
  const withEdit = editContextBlock
    ? baseUserPrompt.replace(/(\n- Return ONLY)/, `${editContextBlock}$1`)
    : baseUserPrompt;
  const withConfig = configInstructions
    ? withEdit.replace(
        /(\n- Return ONLY)/,
        `\n\nADDITIONAL INSTRUCTOR REQUIREMENTS (must be followed, take priority over defaults):\n${configInstructions}$1`,
      )
    : withEdit;
  // Append extra free-text instructions from the instructor if provided
  const withExtra = config.extraInstructions?.trim()
    ? withConfig + `\n\nINSTRUCTOR EXTRA INSTRUCTIONS:\n${config.extraInstructions.trim()}`
    : withConfig;
  // Prepend scope preamble so the AI sees the constraint before everything else
  const userPrompt = scopePreamble + withExtra;
  return {
    systemPrompt: config.customSystemPrompt?.trim() || template.system,
    userPrompt,
  };
}

export const DELIVERABLE_KEYS = Object.keys(PROMPTS);
