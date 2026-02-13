/**
 * Detect the expected number of lessons/weeks from syllabus text.
 * Scans for common patterns like "Week 1-15", "Module 12", schedule tables, etc.
 * Returns { expected: number|null, confidence: 'high'|'medium'|'low', source: string }
 */
export function detectExpectedLessons(text) {
  if (!text) return { expected: null, confidence: 'low', source: '' };

  const t = text.toLowerCase();
  let maxWeek = 0;
  let source = '';

  // Pattern 1: "X-week course" or "X week course" or "X weeks"
  const weekCoursePat = /(\d{1,2})\s*[-–]?\s*week\s*(course|semester|program|class)/i;
  const m1 = text.match(weekCoursePat);
  if (m1) {
    const n = parseInt(m1[1], 10);
    if (n >= 4 && n <= 52) return { expected: n, confidence: 'high', source: `"${m1[0]}"` };
  }

  // Pattern 2: Explicit "Weeks 1-15" or "Weeks 1 through 15"
  const rangePatterns = [
    /weeks?\s+(\d{1,2})\s*[-–—to]+\s*(\d{1,2})/gi,
    /weeks?\s+(\d{1,2})\s+through\s+(\d{1,2})/gi,
    /modules?\s+(\d{1,2})\s*[-–—to]+\s*(\d{1,2})/gi,
    /lessons?\s+(\d{1,2})\s*[-–—to]+\s*(\d{1,2})/gi,
    /sessions?\s+(\d{1,2})\s*[-–—to]+\s*(\d{1,2})/gi,
  ];

  for (const pat of rangePatterns) {
    let match;
    while ((match = pat.exec(text)) !== null) {
      const end = parseInt(match[2], 10);
      if (end > maxWeek && end <= 52) {
        maxWeek = end;
        source = `"${match[0]}"`;
      }
    }
  }

  if (maxWeek >= 4) return { expected: maxWeek, confidence: 'high', source };

  // Pattern 3: Count distinct "Week N" / "Module N" / "Lesson N" / "Session N" headers
  const headerPatterns = [
    /(?:^|\n)\s*(?:week|wk\.?)\s*(\d{1,2})\b/gi,
    /(?:^|\n)\s*module\s*(\d{1,2})\b/gi,
    /(?:^|\n)\s*lesson\s*(\d{1,2})\b/gi,
    /(?:^|\n)\s*session\s*(\d{1,2})\b/gi,
    /(?:^|\n)\s*unit\s*(\d{1,2})\b/gi,
    /(?:^|\n)\s*class\s*(\d{1,2})\b/gi,
  ];

  const weekNumbers = new Set();
  for (const pat of headerPatterns) {
    let match;
    while ((match = pat.exec(text)) !== null) {
      const n = parseInt(match[1], 10);
      if (n >= 1 && n <= 52) weekNumbers.add(n);
    }
  }

  if (weekNumbers.size >= 3) {
    const highest = Math.max(...weekNumbers);
    // If we found headers 1,2,3...N and N is reasonable, use it
    if (highest >= 4 && highest <= 52) {
      return {
        expected: highest,
        confidence: weekNumbers.size >= highest * 0.6 ? 'high' : 'medium',
        source: `Found ${weekNumbers.size} distinct week/module headers (up to ${highest})`,
      };
    }
  }

  // Pattern 4: Date-based schedule — count distinct dates that look like weekly entries
  const dateLines = text.match(/(?:^|\n).*?\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\.?\s+\d{1,2}/gi);
  if (dateLines && dateLines.length >= 4) {
    return {
      expected: dateLines.length,
      confidence: 'medium',
      source: `Found ${dateLines.length} dated schedule entries`,
    };
  }

  // Pattern 5: Look for total count mentions like "15 lessons" or "12 modules"
  const totalPat = /(\d{1,2})\s+(weeks?|lessons?|modules?|sessions?|classes?|units?)\b/gi;
  let match;
  while ((match = totalPat.exec(text)) !== null) {
    const n = parseInt(match[1], 10);
    if (n >= 4 && n <= 52 && n > maxWeek) {
      maxWeek = n;
      source = `"${match[0]}"`;
    }
  }

  if (maxWeek >= 4) return { expected: maxWeek, confidence: 'medium', source };

  return { expected: null, confidence: 'low', source: 'Could not detect lesson count' };
}
