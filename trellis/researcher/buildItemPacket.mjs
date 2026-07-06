// L10 staging: the blind ITEM-AUTHOR packet (human anchor scoped to Gemma's
// actual seat). Reads author-showdown.json (accepted, solver-verified items
// from e2b and ds on the same kernels) and renders two blind quiz files per
// kernel: author X or Y, assignment hash-shuffled per kernel, key sealed in
// base64. Humans judge which quiz they would rather give their class —
// without knowing which cost $0.
//   PACKET=run npx vite-node trellis/researcher/buildItemPacket.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const OUT = 'verification-output/trellis/item-author-packet-v3';

function renderQuiz(items) {
  return items
    .map((entry, n) => {
      const { item } = entry;
      const letters = ['A', 'B', 'C', 'D'];
      const opts = item.options.map((o, i) => `   ${letters[i]}. ${o}`).join('\n');
      return `Q${n + 1}. ${item.stem}\n${opts}\n\n   Answer: ${letters[item.correctIndex] ?? '?'}\n   Explanation: ${item.explanation}`;
    })
    .join('\n\n');
}

if (process.env.PACKET === 'run' && !process.env.VITEST) {
  const showdown = JSON.parse(await readFile('trellis/researcher/author-showdown.json', 'utf8'));
  const byKernel = new Map();
  for (const entry of showdown.acceptedItems ?? []) {
    if (entry.author !== 'e2b' && entry.author !== 'ds') continue;
    if (!byKernel.has(entry.kernel)) byKernel.set(entry.kernel, { e2b: [], ds: [] });
    byKernel.get(entry.kernel)[entry.author].push(entry);
  }
  await mkdir(`${OUT}/quizzes`, { recursive: true });
  const key = [];
  let rendered = 0;
  for (const [kernel, sets] of byKernel) {
    if (sets.e2b.length < 2 || sets.ds.length < 2) continue; // need a real pair
    // deterministic per-kernel shuffle: hash of the kernel id decides sides.
    let h = 0;
    for (const c of kernel) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const flip = h % 2 === 1;
    const [x, y] = flip ? [sets.ds, sets.e2b] : [sets.e2b, sets.ds];
    const slug = kernel.replace(/[^a-z0-9]+/gi, '-');
    await writeFile(`${OUT}/quizzes/${slug}-X.txt`, `Quiz X — ${kernel}\n\n${renderQuiz(x)}\n`);
    await writeFile(`${OUT}/quizzes/${slug}-Y.txt`, `Quiz Y — ${kernel}\n\n${renderQuiz(y)}\n`);
    key.push(`${kernel}: X=${flip ? 'ds' : 'e2b'} Y=${flip ? 'e2b' : 'ds'}`);
    rendered += 1;
  }
  await writeFile(`${OUT}/sealed-key.b64`, Buffer.from(key.join('\n')).toString('base64'));
  await writeFile(
    `${OUT}/README.md`,
    `# Blind item-author review — ~15 minutes

Each kernel has two short quizzes, X and Y, written by two different
authors for the same concept and misconceptions. Every item already passed
the same automatic gates and an independent solver. You do not know which
author is which; please do not guess.

For EACH kernel, answer:
1. Which quiz would you rather give your class? (X / Y / tie)
2. Any item you would refuse to use as-is? (quote its first words)

Return answers in RESPONSE.md. The author key is sealed in sealed-key.b64 —
decode only after both reviewers submit.

## RESPONSE.md template
\`\`\`
Reviewer: <initials>  Familiarity with poetry/lit teaching: <none/some/expert>
<kernel>: prefer X|Y|tie · refuse: <none or quotes>
...
\`\`\`
`,
  );
  console.log(JSON.stringify({ rendered, out: OUT }, null, 2));
}
