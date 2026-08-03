import { describe, it, expect } from 'vitest';
import {
  containsLatex,
  isSimpleLatex,
  latexToUnicode,
  latexToReadableInlineText,
  processSlideText,
  deckDataContainsLatex,
} from '../latexRenderer';

describe('containsLatex', () => {
  it('returns false for null/empty input', () => {
    expect(containsLatex(null)).toBe(false);
    expect(containsLatex('')).toBe(false);
    expect(containsLatex(undefined)).toBe(false);
  });

  it('detects inline math $...$', () => {
    expect(containsLatex('The equation $x^2 + y^2 = r^2$ is a circle.')).toBe(true);
  });

  it('detects display math $$...$$', () => {
    expect(containsLatex('The formula is $$E = mc^2$$')).toBe(true);
  });

  it('returns false for text without math', () => {
    expect(containsLatex('This is plain text without math.')).toBe(false);
  });

  it('returns false for dollar amounts', () => {
    // Single $ without closing should not match as LaTeX
    expect(containsLatex('The price is $5')).toBe(false);
  });
});

describe('isSimpleLatex', () => {
  it('returns true for simple expressions', () => {
    expect(isSimpleLatex('x^2 + y^2')).toBe(true);
    expect(isSimpleLatex('\\alpha + \\beta')).toBe(true);
    expect(isSimpleLatex('a_1 + a_2')).toBe(true);
  });

  it('returns false for fractions', () => {
    expect(isSimpleLatex('\\frac{a}{b}')).toBe(false);
  });

  it('returns false for matrices/environments', () => {
    expect(isSimpleLatex('\\begin{matrix} a & b \\end{matrix}')).toBe(false);
  });

  it('returns false for integrals with limits', () => {
    expect(isSimpleLatex('\\int_0^1 f(x) dx')).toBe(false);
  });

  it('returns false for sums with limits', () => {
    expect(isSimpleLatex('\\sum_{i=1}^n')).toBe(false);
  });

  it('returns false for special fonts', () => {
    expect(isSimpleLatex('\\mathbb{R}')).toBe(false);
  });
});

describe('latexToUnicode', () => {
  it('converts Greek letters', () => {
    expect(latexToUnicode('\\alpha')).toBe('\u03B1');
    expect(latexToUnicode('\\beta')).toBe('\u03B2');
    expect(latexToUnicode('\\Omega')).toBe('\u03A9');
  });

  it('converts operators', () => {
    expect(latexToUnicode('\\times')).toBe('\u00D7');
    expect(latexToUnicode('\\leq')).toBe('\u2264');
    expect(latexToUnicode('\\infty')).toBe('\u221E');
  });

  it('converts superscripts', () => {
    const result = latexToUnicode('x^2');
    expect(result).toContain('\u00B2');
  });

  it('converts subscripts', () => {
    const result = latexToUnicode('a_1');
    expect(result).toContain('\u2081');
  });

  it('converts braced superscripts', () => {
    const result = latexToUnicode('x^{12}');
    expect(result).toContain('\u00B9');
    expect(result).toContain('\u00B2');
  });

  it('handles combined expressions', () => {
    const result = latexToUnicode('\\alpha + \\beta = \\gamma');
    expect(result).toContain('\u03B1');
    expect(result).toContain('\u03B2');
    expect(result).toContain('\u03B3');
  });

  it('cleans up braces and whitespace', () => {
    const result = latexToUnicode('{x} + {y}');
    expect(result).not.toContain('{');
    expect(result).not.toContain('}');
  });
});

describe('complex inline LaTeX preservation', () => {
  it('linearizes common fractions without truncating or creating an unplaced image', async () => {
    expect(latexToReadableInlineText('\\frac{a}{b}')).toBe('(a)/(b)');
    const result = await processSlideText('Compare $\\frac{a}{b}$ with the threshold.');
    expect(result.text).toBe('Compare (a)/(b) with the threshold.');
    expect(result.text).not.toContain('...');
    expect(result.images).toEqual([]);
  });

  it('preserves unsupported complex source instead of deleting it', () => {
    const expression = '\\begin{matrix} a & b \\\\ c & d \\end{matrix}';
    expect(latexToReadableInlineText(expression)).toBe(expression);
  });
});

describe('deckDataContainsLatex', () => {
  it('returns false for deck without LaTeX', () => {
    const data = {
      decks: [{ slides: [{ title: 'Hello', bullets: ['No math here'] }] }],
    };
    expect(deckDataContainsLatex(data)).toBe(false);
  });

  it('detects LaTeX in slide titles', () => {
    const data = {
      decks: [{ slides: [{ title: 'The equation $E = mc^2$', bullets: [] }] }],
    };
    expect(deckDataContainsLatex(data)).toBe(true);
  });

  it('detects LaTeX in slide bullets', () => {
    const data = {
      decks: [{ slides: [{ title: 'Intro', bullets: ['Consider $\\alpha + \\beta$'] }] }],
    };
    expect(deckDataContainsLatex(data)).toBe(true);
  });

  it('handles "slideDecks" key variant', () => {
    const data = {
      slideDecks: [{ slides: [{ title: 'Math: $x^2$', bullets: [] }] }],
    };
    expect(deckDataContainsLatex(data)).toBe(true);
  });

  it('scans only the canonical deck collection when a stale alias coexists', () => {
    const data = {
      slideDecks: [{ slides: [{ title: 'Canonical title without math', bullets: [] }] }],
      decks: [{ slides: [{ title: 'Stale title with $x^2$', bullets: [] }] }],
    };
    expect(deckDataContainsLatex(data)).toBe(false);
  });

  it('handles empty deck data', () => {
    expect(deckDataContainsLatex({})).toBe(false);
    expect(deckDataContainsLatex({ decks: [] })).toBe(false);
  });
});
