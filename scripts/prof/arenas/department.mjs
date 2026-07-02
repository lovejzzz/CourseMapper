/**
 * scripts/prof/arenas/department.mjs — Arena A4 (P3): the external review
 * panel. One persona per review lens over the extracted package; findings in
 * the grader's P0/P1/P2 vocabulary through quote-or-discard. The
 * academic-integrity officer's check is MEASURED, not opined: a bare model
 * with no course materials sits a sample of quiz items — items it answers
 * correctly are chatbot-solvable.
 */

import { callModel, parseModelJson } from '../modelClient.mjs';
import { buildReadingPacket } from '../personaEngine.mjs';

const PANEL = [
  {
    id: 'dept-curriculum-committee',
    lens: 'curriculum committee',
    focus: ['syllabus', 'lessonPlans'],
    charge:
      'Objective↔assessment alignment chains, Bloom progression across weeks, and workload realism against the attached workload account. Quote the exact broken link.',
  },
  {
    id: 'dept-accreditation-auditor',
    lens: 'accreditation auditor',
    focus: ['syllabus', 'quizBank'],
    charge:
      'Measurable outcomes, grading-weight arithmetic (weights must sum and match policy text), policy completeness, and citation resolvability (a named source that cannot be identified is a finding).',
  },
  {
    id: 'dept-accessibility-reviewer',
    lens: 'accessibility reviewer',
    focus: ['slideDecks', 'syllabus'],
    charge:
      'Reading order, alt-text presence claims, contrast/format claims in decks, exam-time accommodation hooks in policies. Quote what is missing where a policy should be.',
  },
  {
    id: 'dept-registrar-clerk',
    lens: 'registrar clerk',
    focus: ['syllabus', 'courseMap'],
    charge:
      'Date and week-count arithmetic, cross-references (every "see Lesson N" must point at something real), schedule consistency between syllabus and course map.',
  },
];

function departmentInstruction() {
  return `Return ONLY JSON: {"findings":[{"severity":"P0"|"P1"|"P2","file":"document label","quote":"EXACT verbatim text from the documents","objection":"one sentence"}]}. Findings without an exact quote are discarded unread. An empty findings array is a legitimate answer.`;
}

export async function runDepartmentPanel({ extracted, workloadAccount, model, meter, ledger }) {
  const results = [];
  for (const reviewer of PANEL) {
    const packet = buildReadingPacket({
      extracted,
      readingOrder: 'syllabus-first',
      hotSpot: reviewer.focus,
      charBudget: 45_000,
    });
    const documents = packet.map((file) => `===== DOCUMENT: ${file.path} =====\n${file.text}`).join('\n\n');
    const workloadNote = workloadAccount
      ? `\nWORKLOAD ACCOUNT: expected ${workloadAccount.expectedWeeklyHours}h/week (${workloadAccount.expectedSource}); mean ratio ${workloadAccount.meanRatio}.`
      : '';
    try {
      const response = await callModel({
        model,
        system: `You are the ${reviewer.lens} in a university course-approval review. Your charge: ${reviewer.charge} You are thorough and unimpressed by polish.`,
        user: `${documents}${workloadNote}\n\n${departmentInstruction()}`,
        maxTokens: 1800,
        temperature: 0.2,
        meter,
        role: `department:${reviewer.id}`,
      });
      const verdict = parseModelJson(response.text);
      const screened = ledger.screenVerdict(
        { findings: verdict.findings || [] },
        { universeId: `department/${reviewer.id}`, personaId: reviewer.id },
      );
      ledger.append({ arena: 'department', personaId: reviewer.id, lens: reviewer.lens, verdict: screened });
      results.push({ reviewer: reviewer.id, lens: reviewer.lens, findings: screened.findings });
    } catch (error) {
      results.push({ reviewer: reviewer.id, lens: reviewer.lens, error: String(error.message) });
    }
  }
  return results;
}

/**
 * The integrity officer's measured half: bare-model solvability. Items a
 * chatbot answers correctly WITHOUT any course material are flagged — they
 * measure the internet, not the course.
 */
export async function runIntegrityProbe({ structured, sampleSize = 12, model, meter }) {
  const mcItems = structured.items.filter(
    (item) => item.kind === 'weekly' && item.stem && (item.options || []).length >= 3,
  );
  const stride = Math.max(1, Math.floor(mcItems.length / sampleSize));
  const sample = mcItems.filter((_, index) => index % stride === 0).slice(0, sampleSize);
  let solved = 0;
  const rows = [];
  for (const item of sample) {
    try {
      const response = await callModel({
        model,
        system: 'Answer with ONLY the letter of the best option. You have no course materials.',
        user: `${item.stem}\n${item.options.map((option, index) => `${'ABCDEF'.charAt(index)}. ${option}`).join('\n')}`,
        maxTokens: 5,
        temperature: 0,
        meter,
        role: `integrity:${item.itemId}`,
      });
      const pick = response.text.trim().charAt(0).toUpperCase();
      const isSolved = pick === item.answerLetter;
      if (isSolved) solved += 1;
      rows.push({ itemId: item.itemId, pick, answer: item.answerLetter, solved: isSolved });
    } catch {
      /* skip */
    }
  }
  return {
    sampled: rows.length,
    solvedWithoutMaterials: solved,
    rate: rows.length > 0 ? Math.round((solved / rows.length) * 100) / 100 : null,
    rows,
  };
}
