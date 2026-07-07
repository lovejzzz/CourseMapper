// E2B OpenAI shim — an OpenAI-compatible HTTP facade over the local Gemma 4
// E2B server, so the CLASSIC APP COMPILER can run against the on-device model
// with zero src/ changes (crucible reroutes api.openai.com here via
// playwright). Non-streaming first (the compiler paths send stream:false);
// minimal SSE for any stray streaming call. CORS-open: calls come from the
// app's browser origin. This is a TEST HARNESS, not a product surface.
//   node --experimental-vm-modules? no — run via vite-node (imports sModel):
//   SHIM=run npx vite-node trellis/tendril/distill/e2b_openai_shim.mjs [port]
import http from 'node:http';
import { sGenerate } from '../sModel.mjs';

const PORT = Number(process.argv[2]) || 8399;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, openai-beta');
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content))
    return content.map((c) => c?.text ?? c?.input_text ?? (typeof c === 'string' ? c : '')).join('\n');
  return '';
}

// Pull {system, user} out of either API shape.
function extractPrompts(body, path) {
  let system = '';
  let user = '';
  if (path.includes('/responses')) {
    if (typ