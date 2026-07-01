/**
 * v0.14.4 WS-E (extension) — tokens and parity for the surfaces the original
 * sweep deliberately excluded: the Landing (marketing), the public pages
 * (Changelog / FAQ / Privacy / Terms / Contact), the shared Header, and the
 * agent chat's message rendering chrome (MessageList / MessageBubble).
 *
 * Same three rules as tests/v0144-tokens.test.jsx, same codification style:
 * E1 accent rule: slate carries structure, indigo means interactive,
 *    amber/green/red mean status. Marketing judgment applies on the Landing —
 *    the kept brand moments are documented below, the retired violations
 *    (indigo ALL-CAPS popover eyebrow, indigo list bullets on structural
 *    text) are pinned here.
 * E2 scale floors: 12px reading-text floor (the ONLY sub-12px left is the
 *    documented 10px identity-badge scale — counted, not banned), one radius
 *    scale (no rounded-2xl/3xl; chat bubbles are rounded-lg with a -sm tail),
 *    ALL-CAPS section labels retired (no className-level `uppercase` left on
 *    any of these surfaces).
 * E3 dark parity: the dark strategy is the global `.dark` override layer in
 *    src/index.css; these tests pin the dark: companions added ONLY for the
 *    classes that layer does not cover (hover:border-indigo-300 variants,
 *    the from-slate-100/to-slate-200 avatar gradient, the Changelog
 *    from-indigo-50/80 highlight gradient). The Landing itself is LIGHT by
 *    default (`.landing-shell` base is a light grid in index.css) and is
 *    fully dark-aware via inline dark: variants + the `.dark .landing-shell`
 *    override — that finding is codified at the bottom.
 *
 * Kept exceptions (inventoried, by design — do not "fix" without a decision):
 * - Landing hero shell radii rounded-[28px] / rounded-[22px]: marketing
 *   surface language, off the chrome radius scale on purpose.
 * - Landing's interactive accent is blue-600/blue-300 (chips, footer links,
 *   Edit, focus rings) — consistent, deliberate brand on the marketing
 *   surface; the workspace's indigo rule is not imposed there.
 * - Landing emerald `.coursemapper` hint + "Open project" drag overlay:
 *   paired green "drop to open" status affordance.
 * - Landing FileIcon per-extension colors: file-type identity iconography.
 * - Changelog colorMap (indigo/amber/slate/violet/emerald dots + count
 *   badges): data-driven section-category encoding across all releases.
 * - Changelog Highlights panel indigo→violet wash + indigo-600 label: the
 *   page's one brand-accent moment.
 * - Chat user-bubble indigo→violet gradient and the FAQ send button
 *   gradient: established chat identity, content-adjacent, untouched.
 * - rounded-pill / rounded-squircle design-system utilities stay (Header,
 *   Contact, FAQ): genuine pills and the established squircle exception.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

// The surfaces this extension sweep owns. Chat content rendering semantics
// (markdown, code blocks, citation badges) keep their functional colors;
// only the chrome around them is scanned. DigestCard (already
// NoticeBanner-converted) and ProgressHeader (ribbon lane) are covered by
// the original tests/v0144-tokens.test.jsx and are NOT re-scanned here.
const SWEPT_SURFACES = [
  'src/screens/Landing.jsx',
  'src/components/Header.jsx',
  'src/pages/Changelog.jsx',
  'src/pages/Contact.jsx',
  'src/pages/FaqChatbot.jsx',
  'src/pages/PrivacyPolicy.jsx',
  'src/pages/TermsOfService.jsx',
  'src/components/chat/MessageList.jsx',
  'src/components/chat/MessageBubble.jsx',
];

// Pull every className value (string literal or template literal) so scans
// never trip on prose — the Changelog's release notes legitimately contain
// words like "uppercase" inside data strings.
function classNameBlob(source) {
  const matches = source.match(/className=(?:"[^"]*"|\{`[^`]*`\}|\{'[^']*'\})/g) || [];
  return matches.join('\n');
}

describe('E2a — 12px reading-text floor on landing, pages, and chat chrome', () => {
  it.each(SWEPT_SURFACES)('%s has no 8/9/11px text (10px only as the documented badge scale)', (file) => {
    const source = read(file);
    expect(source).not.toMatch(/text-\[8px\]/);
    expect(source).not.toMatch(/text-\[9px\]/);
    expect(source).not.toMatch(/text-\[11px\]/);
    expect(source).not.toMatch(/text-\[11\.5px\]/);
  });

  it('keeps the deliberate 10px badge scale only on identity badges (counted, not banned)', () => {
    // New 10px text forces the author to decide: genuine identity badge →
    // update the count with a reason; anything else → text-xs.
    const counts = Object.fromEntries(
      SWEPT_SURFACES.map((file) => [file, (read(file).match(/text-\[10px\]/g) || []).length]),
    );
    expect(counts).toEqual({
      'src/screens/Landing.jsx': 0,
      'src/components/Header.jsx': 0,
      'src/pages/Changelog.jsx': 1, // section item-count pill badge
      'src/pages/Contact.jsx': 0,
      'src/pages/FaqChatbot.jsx': 0,
      'src/pages/PrivacyPolicy.jsx': 0,
      'src/pages/TermsOfService.jsx': 0,
      'src/components/chat/MessageList.jsx': 0,
      'src/components/chat/MessageBubble.jsx': 1, // [N] citation badge (content rendering)
    });
  });
});

describe('E2b/E2d — one radius scale, ALL-CAPS retired', () => {
  it.each(SWEPT_SURFACES)('%s has no rounded-2xl/3xl outliers', (file) => {
    const source = read(file);
    expect(source).not.toMatch(/rounded-2xl/);
    expect(source).not.toMatch(/rounded-3xl/);
  });

  it.each(SWEPT_SURFACES)('%s carries no className-level uppercase styling', (file) => {
    expect(classNameBlob(read(file))).not.toMatch(/\buppercase\b/);
  });

  it('chat bubbles sit on the radius scale: rounded-lg card with a -sm tail', () => {
    const bubble = read('src/components/chat/MessageBubble.jsx');
    expect(bubble).toContain('rounded-lg rounded-br-sm'); // user bubble + edit textarea
    expect(bubble).toContain('rounded-lg rounded-bl-sm'); // assistant + error bubbles
    const faq = read('src/pages/FaqChatbot.jsx');
    expect(faq).toContain('rounded-lg rounded-br-sm');
    expect(faq).toContain('rounded-lg rounded-bl-sm');
  });

  it('former ALL-CAPS labels are sentence case + weight', () => {
    const changelog = read('src/pages/Changelog.jsx');
    expect(changelog).toContain('className="text-xs font-semibold text-indigo-600 mb-3">Highlights</p>');
    expect(read('src/pages/Contact.jsx')).toContain(
      'className="text-xs font-semibold text-slate-500">Acknowledgements</p>',
    );
    // Landing footer popover eyebrow: caps + 10px + non-interactive indigo
    // all retired in one move.
    const landing = read('src/screens/Landing.jsx');
    expect(landing).toContain('className="text-xs font-semibold text-slate-500 dark:text-slate-400">');
    expect(landing).not.toMatch(/uppercase tracking/);
  });
});

describe('E1 — accent rule on the swept chrome', () => {
  it('the landing popover bullets and pages section dots are slate (structure), not indigo', () => {
    expect(read('src/screens/Landing.jsx')).toContain('rounded-full bg-slate-400 dark:bg-slate-500');
    expect(read('src/pages/PrivacyPolicy.jsx')).toContain('rounded-full bg-slate-400 dark:bg-slate-500');
    expect(read('src/pages/TermsOfService.jsx')).toContain('rounded-full bg-slate-400 dark:bg-slate-500');
  });

  it('legal-page links stay indigo — indigo means interactive', () => {
    expect(read('src/pages/PrivacyPolicy.jsx')).toContain('text-indigo-500 hover:text-indigo-700 underline');
    expect(read('src/pages/TermsOfService.jsx')).toContain('text-indigo-500 hover:text-indigo-700 underline');
  });
});

describe('E3 — dark parity for classes the global .dark layer does not cover', () => {
  it('the header IDE button gets dark parity from the token-driven Button primitive', () => {
    // v0.15.186: the hand-rolled indigo hover (which needed an explicit
    // dark: companion) became <Button variant="accent"> — accent tokens are
    // CSS variables that remap in .dark, so parity is structural now.
    const header = read('src/components/Header.jsx');
    expect(header).toContain("import { Button } from './ui'");
    expect(header).toContain('variant="accent"');
    expect(read('src/pages/Contact.jsx')).toContain('hover:border-indigo-300 dark:hover:border-indigo-500/40');
    expect(read('src/components/chat/MessageList.jsx')).toContain(
      'hover:border-indigo-300/40 dark:hover:border-indigo-500/40',
    );
  });

  it('the slate-100→200 avatar gradient (from-slate-100 is layer-uncovered) inverts in dark', () => {
    for (const file of [
      'src/components/chat/MessageBubble.jsx',
      'src/components/chat/MessageList.jsx',
      'src/pages/FaqChatbot.jsx',
    ]) {
      expect(read(file)).toContain('from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700');
    }
  });

  it('the Changelog highlights gradient (from-indigo-50/80 is layer-uncovered) has a dark start', () => {
    expect(read('src/pages/Changelog.jsx')).toContain('dark:from-indigo-500/10');
  });
});

describe('E3 — the Landing dark/light finding, codified', () => {
  it('the Landing is light by default and toggle-aware, NOT dark-native', () => {
    const css = read('src/index.css');
    // Base shell is a light grid; dark comes only from the .dark override.
    expect(css).toMatch(/\.landing-shell \{\n {2}background-color: #f8fafc;/);
    expect(css).toContain('.dark .landing-shell');
    // And the component itself carries inline dark: companions throughout.
    const landing = read('src/screens/Landing.jsx');
    expect(landing).toContain('landing-shell noise-overlay');
    expect(landing).toContain('text-slate-900 dark:text-slate-100');
    expect((landing.match(/dark:/g) || []).length).toBeGreaterThan(30);
  });
});
