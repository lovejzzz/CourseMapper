// Run with the deployment runtime as cwd using its target Node version.
// Uses only fixture settings; never loads user credentials or writes Firestore.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import assert from 'node:assert/strict';
const listener = createServer();
listener.listen(0, '127.0.0.1');
await once(listener, 'listening');
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const child = spawn(process.execPath, ['server/authoring/start.mjs'], {
  cwd: process.cwd(),
  env: {
    NODE_ENV: 'production',
    GOOGLE_CLOUD_PROJECT: 'coursemapper-rules-test',
    PORT: String(port),
    AUTHORING_LISTEN_HOST: '127.0.0.1',
    AUTHORING_RESOURCE: 'https://exchange.test',
    AUTHORING_OAUTH_ISSUER: 'https://issuer.test/',
    AUTHORING_OAUTH_JWKS: 'https://issuer.test/jwks',
    AUTHORING_WEBSITE_ORIGIN: 'https://website.test',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', (chunk) => {
  output += chunk;
});
child.stderr.on('data', (chunk) => {
  output += chunk;
});
const exited = once(child, 'exit');
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`Runtime exited: ${output}`);
    if (output.includes('Authoring exchange listening')) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(ready, 'Runtime did not start within 10 seconds');
  const base = `http://127.0.0.1:${port}`;
  const metadata = await fetch(`${base}/.well-known/oauth-protected-resource`);
  assert.equal(metadata.status, 200);
  const body = await metadata.json();
  assert.equal(body.resource, 'https://exchange.test');
  assert.deepEqual(body.authorization_servers, ['https://issuer.test/']);
  const denied = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'cm_v2_list_requests', arguments: {} },
    }),
  });
  assert.equal(denied.status, 200);
  const denial = await denied.json();
  assert.equal(denial.result.structuredContent.error.code, 'UNAUTHENTICATED');
  assert(denial.result._meta['mcp/www_authenticate'][0].includes('resource_metadata'));
  console.log(
    JSON.stringify({
      passed: true,
      node: process.version,
      isolatedRuntimeStartup: true,
      metadataVerified: true,
      unauthenticatedMcpRejected: true,
      cloudWritesPerformed: false,
    }),
  );
} finally {
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  await exited;
  clearTimeout(timer);
}
