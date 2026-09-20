import { readFile, writeFile } from 'node:fs/promises';
const value = process.argv[2];
if (!value || new URL(value).protocol !== 'https:') throw new Error('Pass the verified HTTPS MCP endpoint.');
const root = new URL('../', import.meta.url);
await writeFile(
  new URL('.mcp.json', root),
  JSON.stringify({ mcpServers: { coursemapper: { type: 'http', url: value } } }, null, 2) + '\n',
);
const path = new URL('.codex-plugin/plugin.json', root);
const manifest = JSON.parse(await readFile(path, 'utf8'));
manifest.mcpServers = './.mcp.json';
await writeFile(path, JSON.stringify(manifest, null, 2) + '\n');
