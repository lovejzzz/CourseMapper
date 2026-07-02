/**
 * scripts/prof/workloadAccountant.mjs — the deterministic workload model
 * (design doc §2 A1). Zero LLM: reading time from word counts, writing time
 * from assignment targets, in-class time from lesson plans — compared against
 * the syllabus's stated expectation (or the credit-hour norm when unstated).
 * A discrepancy above DISCREPANCY_BAR auto-files a finding.
 *
 * Every constant is named and cited to its source assumption; when the
 * package doesn't state something, the account says "assumed", never fakes.
 */

// Adults read expository/textbook prose at roughly 200–260 wpm; STUDY reading
// (note-taking, re-reading) runs slower. 180 wpm is the deliberate middle.
export const STUDY_READING_WPM = 180;
// First-draft academic writing including thinking time: ~250 finished
// words/hour is the planning norm used by writing centers.
export const DRAFTING_WORDS_PER_HOUR = 250;
// "One page" of student writing ≈ 300 words (double-spaced convention).
export const WORDS_PER_PAGE = 300;
// Quiz sitting time when the quiz doesn't state minutes.
export const DEFAULT_QUIZ_MINUTES = 15;
// US credit-hour convention: ~2 hours outside class per weekly contact hour;
// a standard 3-credit course expects ≈ 6 h/week outside class.
export const DEFAULT_EXPECTED_OUT_OF_CLASS_HOURS = 6;
export const DISCREPANCY_BAR = 1.5;
// A "college course" whose computed out-of-class work is a small fraction of
// the credit-hour norm is not credible to an adopter either — thinness is a
// finding, not a virtue. First live run measured 0.06× on a 15-lesson course.
export const UNDERLOAD_BAR = 0.3;

function wordCount(text) {
  return String(text || '')
    .split(/\s+/)
    .filter(Boolean).length;
}

/** "two-page", "2 pages", "1,500 words", "500-word" → estimated words. */
export function parseWritingTargetWords(text) {
  const value = String(text || '').toLowerCase();
  const wordMatch = value.match(/([\d,]{2,6})[\s-]*words?\b/);
  if (wordMatch) return Number(wordMatch[1].replace(/,/g, ''));
  const numberPages = value.match(/(\d+(?:\.\d+)?)[\s-]*pages?\b/);
  if (numberPages) return Number(numberPages[1]) * WORDS_PER_PAGE;
  const wordyPages = value.match(/\b(one|two|three|four|five)[\s-]*pages?\b/);
  if (wordyPages) {
    const map = { one: 1, two: 2, three: 3, four: 4, five: 5 };
    return map[wordyPages[1]] * WORDS_PER_PAGE;
  }
  return null;
}

/** "15 minutes", "about 30 min", "1 hour" → minutes. */
export function parseStatedMinutes(text) {
  const value = String(text || '').toLowerCase();
  const hourMatch = value.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/);
  if (hourMatch) return Number(hourMatch[1]) * 60;
  const minuteMatch = value.match(/(\d+)\s*(?:minutes?|mins?)\b/);
  if (minuteMatch) return Number(minuteMatch[1]);
  return null;
}

/** Stated weekly out-of-class expectation from syllabus text, if any. */
export function parseStatedWeeklyHours(syllabusText) {
  const value = String(syllabusText || '').toLowerCase();
  const match = value.match(
    /(\d+(?:\.\d+)?)(?:\s*(?:-|to|–)\s*(\d+(?:\.\d+)?))?\s*hours?\s+(?:per\s+week|weekly|a\s+week|of\s+work\s+(?:outside|per week))/,
  );
  if (!match) return null;
  const low = Number(match[1]);
  const high = match[2] ? Number(match[2]) : low;
  return (low + high) / 2;
}

/**
 * Compute the weekly workload account from an extracted package
 * (deepQualityGrader extractPackage output: files with featureId,
 * lessonNumber, text).
 */
export function buildWorkloadAccount(extracted) {
  const files = extracted.files || [];
  const byLesson = new Map();
  const lessonOf = (file) => file.lessonNumber || null;
  const bucket = (lesson) => {
    if (!byLesson.has(lesson)) {
      byLesson.set(lesson, { readingMinutes: 0, writingMinutes: 0, quizMinutes: 0, sources: [] });
    }
    return byLesson.get(lesson);
  };

  for (const file of files) {
    const lesson = lessonOf(file);
    if (!lesson) continue;
    const text = file.text || '';
    if (file.featureId === 'studyGuides') {
      // words ÷ words-per-minute = minutes.
      bucket(lesson).readingMinutes += wordCount(text) / STUDY_READING_WPM;
      bucket(lesson).sources.push({ kind: 'study-guide-reading', file: file.path, words: wordCount(text) });
    }
    if (file.featureId === 'assignments') {
      const targetWords = parseWritingTargetWords(text);
      if (targetWords) {
        const writingMinutes = (targetWords / DRAFTING_WORDS_PER_HOUR) * 60;
        bucket(lesson).writingMinutes += writingMinutes;
        bucket(lesson).sources.push({ kind: 'assignment-writing', file: file.path, targetWords });
      } else {
        bucket(lesson).sources.push({ kind: 'assignment-unparsed', file: file.path, assumed: true });
      }
      // Reading the brief itself.
      bucket(lesson).readingMinutes += wordCount(text) / STUDY_READING_WPM;
    }
    if (file.featureId === 'quizBank') {
      const stated = parseStatedMinutes(text);
      bucket(lesson).quizMinutes += stated || DEFAULT_QUIZ_MINUTES;
      bucket(lesson).sources.push({
        kind: 'quiz',
        file: file.path,
        minutes: stated || DEFAULT_QUIZ_MINUTES,
        assumed: !stated,
      });
    }
  }

  const syllabus = files.find((file) => file.featureId === 'syllabus');
  const statedWeeklyHours = syllabus ? parseStatedWeeklyHours(syllabus.text) : null;
  const expectedWeeklyHours = statedWeeklyHours || DEFAULT_EXPECTED_OUT_OF_CLASS_HOURS;

  const weeks = [...byLesson.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([lesson, load]) => {
      const totalHours = (load.readingMinutes + load.writingMinutes + load.quizMinutes) / 60;
      return {
        lesson,
        readingHours: round2(load.readingMinutes / 60),
        writingHours: round2(load.writingMinutes / 60),
        quizHours: round2(load.quizMinutes / 60),
        totalHours: round2(totalHours),
        ratio: round2(totalHours / expectedWeeklyHours),
        sources: load.sources,
      };
    });

  const overloadedWeeks = weeks.filter((week) => week.ratio > DISCREPANCY_BAR);
  const meanRatio = weeks.length > 0 ? round2(weeks.reduce((sum, week) => sum + week.ratio, 0) / weeks.length) : null;

  return {
    expectedWeeklyHours,
    expectedSource: statedWeeklyHours ? 'syllabus-stated' : 'credit-hour-default',
    weeks,
    meanRatio,
    overloadedWeeks: overloadedWeeks.map((week) => week.lesson),
    finding:
      overloadedWeeks.length > 0
        ? {
            severity: 'P1',
            dimension: 'workload',
            detail: `computed workload exceeds ${DISCREPANCY_BAR}× the ${
              statedWeeklyHours ? 'stated' : 'assumed'
            } ${expectedWeeklyHours}h/week in lesson(s) ${overloadedWeeks.map((week) => week.lesson).join(', ')}`,
            evidence: overloadedWeeks
              .slice(0, 3)
              .map((week) => `L${week.lesson}: ${week.totalHours}h (${week.ratio}×)`)
              .join('; '),
          }
        : meanRatio !== null && meanRatio < UNDERLOAD_BAR
          ? {
              severity: 'P2',
              dimension: 'workload',
              detail: `computed out-of-class workload is only ${meanRatio}× the ${
                statedWeeklyHours ? 'stated' : 'assumed'
              } ${expectedWeeklyHours}h/week — the materials are too thin to carry a credit-bearing course as-is`,
              evidence: weeks
                .slice(0, 3)
                .map((week) => `L${week.lesson}: ${week.totalHours}h`)
                .join('; '),
            }
          : null,
  };
}

function round2(value) {
  return Math.round(value * 100) / 100;
}
