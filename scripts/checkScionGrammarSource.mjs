#!/usr/bin/env node
// Source-level routing regression; this does not execute WASM or a language model.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const checkout = process.argv[2];
if (!checkout) throw new Error('Usage: node scripts/checkScionGrammarSource.mjs <patched-upstream-checkout>');
const source = await fs.readFile(path.join(checkout, 'src/wllama.ts'), 'utf8');
const ast = ts.createSourceFile('wllama.ts', source, ts.ScriptTarget.Latest, true);
const cls = ast.statements.find((node) => ts.isClassDeclaration(node) && node.name?.text === 'Wllama');
assert.ok(cls, 'actual upstream Wllama class exists');
const methods = ['createCompletionImpl', 'samplingAccept'].map((name) => {
  const method = cls.members.find((node) => node.name?.getText(ast) === name);
  assert.ok(method, `actual upstream ${name} exists`);
  return method.getText(ast);
});
const js = ts.transpileModule(`class Subject { ${methods.join('\n')} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const Subject = new Function('joinBuffers', 'bufToText', 'WllamaError', `${js}; return Subject;`)(
  (buffers) => Uint8Array.from(buffers.flatMap((buffer) => [...buffer])),
  (buffer) => new TextDecoder().decode(buffer),
  Error,
);
const checks = [];
for (const useCache of [false, true]) {
  for (const terminate of ['eog', 'stop', 'abort']) {
    const calls = [];
    const subject = new Subject();
    let sampled = 0;
    Object.assign(subject, {
      checkModelLoaded() {},
      async samplingInit() {},
      async tokenize() {
        return [91, 92];
      },
      async computeNonCachedTokens() {
        return [92];
      },
      async kvClear() {},
      isEncoderDecoderArchitecture() {
        return false;
      },
      async decode(tokens) {
        calls.push({ decode: tokens });
      },
      async samplingSample() {
        return { token: sampled++ === 0 ? 10 : 99, piece: new TextEncoder().encode('OK') };
      },
      isTokenEOG(token) {
        return terminate === 'eog' && token === 99;
      },
      proxy: {
        async wllamaAction(action, request) {
          assert.equal(action, 'sampling_accept');
          calls.push(request);
          return { success: true };
        },
      },
    });
    const result = await subject.createCompletionImpl('prompt', {
      nPredict: 4,
      useCache,
      stopTokens: terminate === 'stop' ? [99] : [],
      onNewToken: terminate === 'abort' ? (_token, _piece, _text, control) => control.abortSignal() : undefined,
    });
    assert.equal(result, 'OK');
    const accepted = calls.filter((call) => call._name === 'sacc_req');
    assert.deepEqual(accepted[0], {
      _name: 'sacc_req',
      tokens: useCache ? [92] : [91, 92],
      accept_grammar: false,
    });
    assert.equal(accepted.length, terminate === 'abort' ? 1 : 2);
    if (terminate !== 'abort') {
      assert.deepEqual(accepted[1], { _name: 'sacc_req', tokens: [10], accept_grammar: true });
      assert.deepEqual(calls.at(-1), { decode: [10] });
    }
    checks.push(`${useCache ? 'cached' : 'uncached'} prompt / ${terminate}`);
  }
}

const native = await fs.readFile(path.join(checkout, 'cpp/actions.hpp'), 'utf8');
const start = native.indexOf('glue_msg_sampling_accept_res action_sampling_accept');
const end = native.indexOf('\n}', start) + 2;
assert.ok(start >= 0 && end > start);
const action = native.slice(start, end);
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edutool-grammar-routing-'));
try {
  const harness = `
#include <vector>
#include <utility>
#include <cassert>
using llama_tokens = std::vector<int>;
struct field_bool { bool value = false; };
struct field_tokens { llama_tokens arr; };
struct glue_msg_sampling_accept_req { field_tokens tokens; field_bool accept_grammar; };
struct glue_msg_sampling_accept_res { field_bool success; };
struct app_t { void *ctx_sampling = nullptr; };
std::vector<std::pair<int,bool>> accepted;
void wcommon_sampler_accept(void *, int id, bool grammar) { accepted.emplace_back(id, grammar); }
#define PARSE_REQ(type) const auto &req = *reinterpret_cast<const type *>(req_raw)
${action}
int main() {
  app_t app;
  glue_msg_sampling_accept_req prompt{{{91,92}}, {false}};
  glue_msg_sampling_accept_req output{{{10}}, {true}};
  assert(action_sampling_accept(app, reinterpret_cast<const char *>(&prompt)).success.value);
  assert(action_sampling_accept(app, reinterpret_cast<const char *>(&output)).success.value);
  assert((accepted == std::vector<std::pair<int,bool>>{{91,false},{92,false},{10,true}}));
}
`;
  const cpp = path.join(dir, 'routing.cpp');
  const exe = path.join(dir, 'routing');
  await fs.writeFile(cpp, harness);
  execFileSync('clang++', ['-std=c++17', cpp, '-o', exe]);
  execFileSync(exe);
  checks.push('actual native action forwards prompt/output flag');
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}
console.log(JSON.stringify({ scope: 'upstream source routing only; no WASM/model inference', checks }, null, 2));
