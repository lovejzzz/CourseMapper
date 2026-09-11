// Original, bounded teaching examples. Reference links explain APIs; they do
// not certify a generated course or establish that students can transfer skills.
const mdn = 'https://developer.mozilla.org/en-US/docs/';
export const CODING_PRACTICE = [
  {
    id: 'dom-list',
    match: /\bdocument object model\b/i,
    title: 'Create DOM nodes from form input',
    runtime: 'browser',
    file: 'index.html',
    reference: mdn + 'Web/API/Node/textContent',
    principle: 'Setting textContent inserts text rather than parsing that text as HTML.',
    goal: 'Handle form submission, reject blank input and append a project name as a text node.',
    starter:
      '<!doctype html><title>Project list</title><form id="projects"><label for="name">Project name</label><input id="name"><button>Add project</button></form><ul id="list"></ul><script>\n// TODO: prevent navigation, trim input, ignore blanks, append an li with textContent\n</script>',
    solution:
      '<!doctype html><title>Project list</title><form id="projects"><label for="name">Project name</label><input id="name"><button>Add project</button></form><ul id="list"></ul><script>document.querySelector("#projects").addEventListener("submit", event => { event.preventDefault(); const input = document.querySelector("#name"); const name = input.value.trim(); if (!name) return; const item = document.createElement("li"); item.textContent = name; document.querySelector("#list").append(item); input.value = ""; input.focus(); });</script>',
    checks: [
      'Submitting only spaces leaves the list empty.',
      'Submitting Portfolio appends one li containing Portfolio and clears the input without navigating.',
      'Submitting <b>Tracker</b> displays those literal characters; it does not create a b element. Enter submits the same form.',
    ],
    reasoning: [
      'Listen for submit on the form and prevent its default navigation.',
      'Trim the value and return early for an empty name.',
      'Create an li and set textContent, then append it and clear the input.',
    ],
    error: 'Assigning the project name to innerHTML is equivalent to textContent.',
    correction: 'innerHTML parses markup. Use textContent so the supplied <b>Tracker</b> test remains literal text.',
    transfer: 'Ignore a second submission with the same project name.',
    transferAnswer:
      'Keep a Set of accepted names. After trimming, return if the Set already contains the name; otherwise add it to the Set before appending the li. Define whether matching is case-sensitive; for exact matching Portfolio and portfolio differ.',
  },
  {
    id: 'validated-api',
    match: /\bworking with apis\b/i,
    title: 'Validate an API payload before rendering',
    runtime: 'node',
    file: 'exercise.mjs',
    reference: mdn + 'Web/API/Fetch_API/Using_Fetch',
    principle: 'Reading a JSON response is asynchronous; application-specific validation follows parsing.',
    goal: 'Validate a JSON item array and return only published project titles.',
    starter:
      'export async function publishedTitles(fetcher, url) {\n  // Require an OK response and an array of {title:string,published:boolean}; reject invalid items.\n}',
    solution:
      'export async function publishedTitles(fetcher, url) {\n  const response = await fetcher(url);\n  if (!response.ok) throw new Error("HTTP " + response.status);\n  const rows = await response.json();\n  if (!Array.isArray(rows) || rows.some(row => !row || typeof row.title !== "string" || typeof row.published !== "boolean")) throw new Error("Invalid items");\n  return rows.filter(row => row.published).map(row => row.title);\n}',
    checks: [
      '[{title:"Portfolio",published:true},{title:"Draft",published:false}] returns ["Portfolio"].',
      'An object instead of an array, a null row, or a row lacking a boolean published field rejects with Invalid items.',
      'An empty array returns []; an HTTP 403 rejects with HTTP 403 before parsing.',
    ],
    reasoning: [
      'Check the HTTP status before consuming the response body.',
      'Validate the array and each required field before reading project properties.',
      'Filter published items and then project their titles; do not mistake a truthy string for a boolean.',
    ],
    error: 'The string "false" is a valid value for the boolean published field.',
    correction:
      'The contract requires typeof row.published === "boolean". A string "false" is truthy in a filter and could expose a draft; reject it as Invalid items.',
    transfer: 'Return published project titles in alphabetical order.',
    transferAnswer:
      'Append .sort((a, b) => a.localeCompare(b)) to the returned title array. Test ["Zoo", "Alpha"] produces ["Alpha", "Zoo"] and ensure the source row array is not reordered.',
  },
  {
    id: 'full-stack-health',
    match: /\b(?:final application|capstone|final project)\b/i,
    title: 'Connect a browser page to a Node API',
    runtime: 'node-server',
    file: 'server.mjs',
    reference: 'https://nodejs.org/api/http.html#httpcreateserveroptions-requestlistener',
    principle: 'A request listener can return different responses for different request paths.',
    goal: 'Build a small integrated application: a browser button reads a same-origin JSON health route and displays its status.',
    starter:
      'import { createServer } from "node:http";\n// TODO: GET / serves a button and output; GET /health returns {ok:true}; other paths return 404.\n// The button fetches /health, checks HTTP status and updates the output.\n',
    solution: `import { createServer } from "node:http";
const page = '<!doctype html><title>Health app</title><main><h1>Service health</h1><button id="check">Check</button><output id="status" aria-live="polite">Not checked</output></main><script>document.querySelector("#check").addEventListener("click", async () => { const output = document.querySelector("#status"); try { const response = await fetch("/health"); if (!response.ok) throw new Error("HTTP " + response.status); const data = await response.json(); output.textContent = data.ok ? "Healthy" : "Unhealthy"; } catch { output.textContent = "Unavailable"; } });</script>';
export function handler(req, res) {
  if (req.method === "GET" && req.url === "/") { res.writeHead(200, {"Content-Type":"text/html; charset=utf-8"}); res.end(page); }
  else if (req.method === "GET" && req.url === "/health") { res.writeHead(200, {"Content-Type":"application/json"}); res.end(JSON.stringify({ok:true})); }
  else { res.writeHead(404); res.end("Not found"); }
}
createServer(handler).listen(3000, "127.0.0.1");`,
    checks: [
      'Run node server.mjs and open http://127.0.0.1:3000; the output initially says Not checked.',
      'Click Check: GET /health returns 200 with {"ok":true} and the page displays Healthy.',
      'Stop the server and click again: the page displays Unavailable; an unknown route returns 404 while the server is running.',
    ],
    reasoning: [
      'Serve the HTML and JSON from the same origin.',
      'Check the HTTP response before parsing and update textContent with the result.',
      'Handle request failure visibly. This small integration slice is a starting point, not the completed portfolio, persistence or authentication requirement.',
    ],
    error: 'The server must be working if the HTML loaded once.',
    correction:
      'The page can remain open after the server stops. Test a fresh API request and display Unavailable when it fails.',
    transfer: 'Add a GET /version JSON endpoint and display its version on a second button click.',
    transferAnswer:
      'Add a method-and-path branch returning JSON {version:1}, then fetch /version from a second button handler. Check response.ok, parse JSON and set a separate output to 1. A failure must show Unavailable.',
  },
  {
    id: 'semantic-page',
    match: /\bhtml\b/i,
    title: 'Build an accessible project card',
    runtime: 'browser',
    file: 'index.html',
    reference: mdn + 'Web/HTML/Reference/Elements/label',
    principle: 'An explicit label uses a for attribute matching the input id.',
    goal: 'Build a semantic HTML page with a heading, labeled input and responsive project cards.',
    starter:
      '<!doctype html>\n<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Projects</title></head>\n<body><!-- TODO: main heading, labeled search input, two project articles --></body></html>',
    solution:
      '<!doctype html>\n<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Projects</title>\n<style>.cards{display:grid;gap:1rem;grid-template-columns:1fr}@media(min-width:700px){.cards{grid-template-columns:1fr 1fr}}input{max-width:100%}</style></head>\n<body><main><h1>Projects</h1><label for="search">Find a project</label><input id="search" type="search"><section class="cards" aria-label="Project list"><article><h2>Portfolio</h2><p>A personal site.</p></article><article><h2>Tracker</h2><p>A task tracker.</p></article></section></main></body></html>',
    checks: [
      'One main landmark, one h1 and two articles with h2 headings.',
      'The search input has the accessible name Find a project and is keyboard reachable.',
      'Cards use one column at 390px and two at 900px, without horizontal overflow.',
    ],
    reasoning: [
      'Use main for the page content and a heading hierarchy for the two projects.',
      'Connect label for="search" to id="search"; placeholder text alone is not the label.',
      'Start with one column and add a wider-screen media query.',
    ],
    error: 'A placeholder on the search input replaces its label.',
    correction: 'Keep the explicit label; the placeholder is not a replacement for the requested accessible name.',
    transfer: 'Add a third project article without adding another h1. Check the grid at both widths.',
    transferAnswer:
      'Add an article containing an h2 and description inside .cards. At 390px it occupies its own row; at 900px the third card starts the second row.',
  },
  {
    id: 'responsive-grid',
    match: /\b(?:responsive|css)\b/i,
    title: 'Repair a responsive card grid',
    runtime: 'browser',
    file: 'index.html',
    reference: mdn + 'Web/CSS/Reference/At-rules/@media',
    principle: 'A media query applies its enclosed styles when its condition matches.',
    goal: 'Implement a mobile-first grid and verify its breakpoint behavior.',
    starter:
      '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>Cards</title><style>.cards{display:grid;grid-template-columns:600px 600px;gap:16px}</style><main class="cards"><article>One</article><article>Two</article><article>Three</article></main>',
    solution:
      '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>Cards</title><style>*{box-sizing:border-box}.cards{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}article{overflow-wrap:anywhere}@media(min-width:700px){.cards{grid-template-columns:repeat(2,minmax(0,1fr))}}</style><main class="cards"><article>One</article><article>Two</article><article>Three</article></main>',
    checks: [
      'At 390px all three cards occupy separate rows and there is no horizontal overflow.',
      'At 900px two cards share the first row and the third begins the next row.',
      'At 699px there is one column; at 700px there are two.',
    ],
    reasoning: [
      'Replace fixed 600px tracks with a flexible single column.',
      'Use min-width:700px to add two tracks at the requested breakpoint.',
      'Inspect computed layout at both sides of the breakpoint, not only a wide screenshot.',
    ],
    error: 'Hiding overflow fixes the fixed-width grid.',
    correction:
      'Hidden overflow clips content. Replace fixed tracks with flexible tracks and verify that the cards remain visible.',
    transfer: 'Change the wide layout to three columns at 1000px while retaining two columns from 700px.',
    transferAnswer:
      'Add @media(min-width:1000px){.cards{grid-template-columns:repeat(3,minmax(0,1fr))}} after the existing media rule. Test 699, 700, 999 and 1000px.',
  },
  {
    id: 'dom-counter',
    match: /\b(?:javascript|dom|document object model|interaction)\b/i,
    title: 'Implement a DOM counter',
    runtime: 'browser',
    file: 'index.html',
    reference: mdn + 'Web/API/Document/querySelector',
    principle: 'querySelector returns the first matching element or null when no element matches.',
    goal: 'Handle a button event and update a DOM element from JavaScript state.',
    starter:
      '<!doctype html><title>Counter</title><button id="add">Add</button><output id="count" aria-live="polite">0</output><script>let count = 0;\n// TODO: handle clicks and update the output\n</script>',
    solution:
      '<!doctype html><title>Counter</title><button id="add">Add</button><output id="count" aria-live="polite">0</output><script>let count = 0;\nconst output = document.querySelector("#count");\ndocument.querySelector("#add").addEventListener("click", () => { count += 1; output.textContent = String(count); });\n</script>',
    checks: [
      'The output is 0 before interaction.',
      'Three clicks produce 3; a fourth produces 4.',
      'Keyboard activation of the button increments the same counter.',
    ],
    reasoning: [
      'Select the button and output after their markup exists.',
      'Register a callback instead of running the update while registering it.',
      'Increment numeric state and write its string representation to textContent.',
    ],
    error: 'Incrementing a local variable automatically redraws the HTML output.',
    correction: 'Update output.textContent inside the click handler after incrementing count.',
    transfer: 'Add a Reset button that returns both state and output to zero.',
    transferAnswer:
      'Register a reset handler that sets count = 0 and output.textContent = "0". After reset, the next Add must display 1, not the old count plus one.',
  },
  {
    id: 'fetch-status',
    match: /\b(?:apis?|fetch)\b/i,
    title: 'Handle JSON success and HTTP failure',
    runtime: 'node',
    file: 'exercise.mjs',
    reference: mdn + 'Web/API/Fetch_API/Using_Fetch',
    principle: 'fetch does not reject solely because the server returned an HTTP error; check the response status.',
    goal: 'Implement an asynchronous API adapter with explicit success and failure behavior.',
    starter:
      'export async function loadTitles(fetcher, url) {\n  // TODO: reject non-OK HTTP responses; return each title from the JSON array\n}',
    solution:
      'export async function loadTitles(fetcher, url) {\n  const response = await fetcher(url);\n  if (!response.ok) throw new Error("HTTP " + response.status);\n  const rows = await response.json();\n  return rows.map(row => row.title);\n}',
    checks: [
      'A mocked OK response containing [{"title":"Portfolio"},{"title":"Tracker"}] returns ["Portfolio","Tracker"].',
      'A mocked status 404 with ok:false rejects with HTTP 404 without reading the body.',
      'A rejected fetcher propagates its network error; an empty JSON array returns [].',
    ],
    reasoning: [
      'Await the response before inspecting ok.',
      'Reject a non-OK status before attempting JSON parsing.',
      'Await json() and map the resulting array; keep network rejection observable.',
    ],
    error: 'fetch always rejects for a 404, so checking response.ok is unnecessary.',
    correction:
      'An HTTP failure response can resolve normally. Check response.ok and throw HTTP 404 for the supplied failure fixture.',
    transfer: 'Return objects containing title and titleLength rather than strings.',
    transferAnswer:
      'Replace the final map with rows.map(row => ({ title: row.title, titleLength: row.title.length })). Keep the status and network failure behavior unchanged.',
  },
  {
    id: 'http-router',
    match: /\b(?:server[- ]side|node|backend)\b/i,
    title: 'Build and test a Node HTTP route',
    runtime: 'node',
    file: 'exercise.mjs',
    reference: 'https://nodejs.org/api/http.html#httpcreateserveroptions-requestlistener',
    principle: 'An HTTP request listener receives the incoming request and server response objects.',
    goal: 'Implement a JSON route with explicit method, path and status handling.',
    starter:
      'export function handler(req, res) {\n  // GET /health => 200 {"ok":true}; everything else => 404 {"error":"Not found"}\n}',
    solution:
      'export function handler(req, res) {\n  const found = req.method === "GET" && req.url === "/health";\n  res.writeHead(found ? 200 : 404, {"Content-Type":"application/json"});\n  res.end(JSON.stringify(found ? {ok:true} : {error:"Not found"}));\n}',
    checks: [
      'GET /health returns status 200 and JSON {"ok":true}.',
      'GET /missing and POST /health return 404 and JSON {"error":"Not found"}.',
      'Every response declares application/json and ends once.',
    ],
    reasoning: [
      'Match both method and exact path.',
      'Write the status and JSON content type before ending the response.',
      'Serialize the payload; do not pass an object directly to res.end.',
    ],
    error: 'Every request can return 200 because the server ran successfully.',
    correction:
      'The HTTP status describes the requested resource result. Only GET /health succeeds in this contract; the other fixtures require 404.',
    transfer: 'Add GET /version returning {"version":1} without changing the other routes.',
    transferAnswer:
      'Add a second method-and-path branch before the 404 branch. Return 200 with JSON {"version":1} and the same content type; POST /version still returns 404.',
  },
  {
    id: 'sql-filter',
    match: /\b(?:database|databases|sql)\b/i,
    title: 'Query an in-memory task table',
    runtime: 'sqlite',
    file: 'exercise.sql',
    reference: 'https://www.sqlite.org/lang_select.html',
    principle: 'WHERE filters rows and ORDER BY controls the result order.',
    goal: 'Write a filtered, ordered SQL query against a supplied data fixture.',
    starter:
      "CREATE TABLE tasks(id INTEGER PRIMARY KEY, title TEXT, done INTEGER);\nINSERT INTO tasks VALUES (1,'Portfolio',0),(2,'Tests',1),(3,'Deploy',0);\n-- TODO: select id and title for unfinished tasks, newest id first",
    solution: 'SELECT id, title FROM tasks WHERE done = 0 ORDER BY id DESC;',
    checks: [
      'The exact output is (3, Deploy), then (1, Portfolio).',
      'The completed Tests row is absent.',
      'Changing every row to done=1 produces no result rows.',
    ],
    reasoning: [
      'Filter on done = 0 rather than matching title text.',
      'Select only the requested id and title columns.',
      'Specify descending id order rather than assuming insertion order.',
    ],
    error: 'Rows always come back in insertion order, so ORDER BY is optional.',
    correction: 'Specify ORDER BY id DESC to satisfy the requested ordering; the expected first row is id 3.',
    transfer: 'Return only the newest unfinished task.',
    transferAnswer:
      'Append LIMIT 1 after ORDER BY id DESC. The supplied fixture returns (3, Deploy); an all-completed fixture still returns no rows.',
  },
  {
    id: 'session-guard',
    match: /\b(?:authentication|authorization|auth)\b/i,
    title: 'Test a server-side session guard',
    runtime: 'node',
    file: 'exercise.mjs',
    reference: 'https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html',
    principle:
      'Session state and access decisions belong on the server; this fixture models a lookup, not a complete login system.',
    goal: 'Implement and test missing, expired and valid session decisions using a supplied server-owned store.',
    starter:
      'export function currentUser(sessions, token, now) {\n  // A Map holds {userId, expiresAt}; return userId only for an unexpired session\n}',
    solution:
      'export function currentUser(sessions, token, now) {\n  const session = sessions.get(token);\n  return session && session.expiresAt > now ? session.userId : null;\n}',
    checks: [
      'With Map([["sample",{userId:"u1",expiresAt:100}]]), token sample at now=99 returns u1.',
      'The same token at now=100 returns null.',
      'An unknown token returns null. A client-supplied user id is not accepted as a session.',
    ],
    reasoning: [
      'Look up the opaque token in the supplied server-owned map.',
      'Use a strict future expiration check so the boundary time is expired.',
      'Return null for missing/expired sessions. This teaching fixture does not implement token issuance, transport security, password handling or production session storage.',
    ],
    error: 'A user id submitted by the browser proves the user is signed in.',
    correction:
      'Use the server-owned session lookup. A browser-supplied user id is not proof of an authenticated session.',
    transfer: 'Implement logout for a token and verify a subsequent lookup returns null.',
    transferAnswer:
      'Call sessions.delete(token). A later currentUser(sessions, token, now) returns null even if the previous expiration was in the future.',
  },
  {
    id: 'react-counter',
    match: /\b(?:framework|frameworks|react|component|components)\b/i,
    title: 'Build a React stateful component',
    runtime: 'react',
    file: 'Counter.jsx',
    reference: 'https://react.dev/reference/react/useState',
    principle:
      'The state setter requests another render; an updater function can calculate the next state from the pending state.',
    goal: 'Implement a reusable component whose rendered output follows state updates.',
    starter:
      'import { useState } from "react";\nexport default function Counter() {\n  // TODO: render an Add button and an output starting at zero\n}',
    solution:
      'import { useState } from "react";\nexport default function Counter() {\n  const [count, setCount] = useState(0);\n  return <><button onClick={() => setCount(value => value + 1)}>Add</button><output aria-live="polite">{count}</output></>;\n}',
    checks: [
      'The output starts at 0; three clicks display 3.',
      'Rendering two counters gives independent state for each instance.',
      'The click handler passes an updater to setCount; it does not mutate count directly.',
    ],
    reasoning: [
      'Declare useState at component top level.',
      'Pass a callback to onClick.',
      'Render count and update it through its setter.',
    ],
    error: 'Changing a plain local variable in the click handler makes React render the new number.',
    correction: 'Store the number with useState and call setCount to request another render.',
    transfer: 'Add a Reset button and render two instances.',
    transferAnswer:
      'Add <button onClick={() => setCount(0)}>Reset</button>. Resetting one instance changes only that instance; the other retains its count.',
  },
  {
    id: 'release-check',
    match: /\b(?:deploy|deployment|pipeline)\b/i,
    title: 'Implement a release smoke check',
    runtime: 'node',
    file: 'exercise.mjs',
    reference: mdn + 'Web/API/Fetch_API/Using_Fetch',
    principle: 'A successful HTTP response and its parsed body can be checked separately.',
    goal: 'Verify the deployed revision and fail a smoke check for stale or unsuccessful responses.',
    starter:
      'export async function verifyRelease(fetcher, url, expectedCommit) {\n  // Require an OK response and JSON commit matching expectedCommit\n}',
    solution:
      'export async function verifyRelease(fetcher, url, expectedCommit) {\n  const response = await fetcher(url, {cache:"no-store"});\n  if (!response.ok) throw new Error("HTTP " + response.status);\n  const release = await response.json();\n  if (release.commit !== expectedCommit) throw new Error("Stale release");\n  return true;\n}',
    checks: [
      'An OK response with the expected commit returns true.',
      'An OK response with a different commit rejects with Stale release.',
      'A 503 rejects with HTTP 503; a network rejection remains visible.',
    ],
    reasoning: [
      'Read the deployed release descriptor without requesting a cached copy.',
      'Check HTTP status before parsing.',
      'Compare the exact expected revision; a 200 response alone does not prove the intended code is deployed. This exercise verifies a release; it does not deploy an application.',
    ],
    error: 'A 200 response proves the newest commit is deployed.',
    correction: 'An old release can return 200. Compare the descriptor commit to the expected revision.',
    transfer: 'Also require the descriptor version to match expectedVersion.',
    transferAnswer:
      'Accept expectedVersion as another parameter. After the commit check, reject when release.version !== expectedVersion. Test matching commit with a mismatched version.',
  },
];
