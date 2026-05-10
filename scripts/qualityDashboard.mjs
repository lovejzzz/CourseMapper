import fs from 'node:fs/promises';
import path from 'node:path';

const ACTIVITY_LOG_FILE = 'activity-log.json';
const DASHBOARD_FILE = 'dashboard.html';
const ACTIVITY_LOG_LIMIT = 200;

export async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

export async function readLatestPayload(outputDir) {
  return readJsonFile(path.join(outputDir, 'latest.json'), { meta: {}, results: [] });
}

export async function readActivityLog(outputDir) {
  const raw = await readJsonFile(path.join(outputDir, ACTIVITY_LOG_FILE), []);
  return Array.isArray(raw) ? raw : [];
}

export function letterForScore(score) {
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  return 'below C';
}

export function summarizeQualityResults(results = [], target = 90) {
  const scores = results.map((result) => Number(result.score)).filter(Number.isFinite);
  const passing = results.filter((result) => Number(result.score) >= target).length;
  const average = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
  const worst = results.reduce((lowest, result) => {
    if (!lowest) return result;
    return Number(result.score) < Number(lowest.score) ? result : lowest;
  }, null);
  const failing = results
    .filter((result) => Number(result.score) < target)
    .sort((a, b) => Number(a.score) - Number(b.score));

  return {
    total: results.length,
    passing,
    failing: failing.length,
    average,
    target,
    worst,
    failingFocus: failing.slice(0, 5),
  };
}

export function buildRunSummary(results = [], target = 90) {
  const stats = summarizeQualityResults(results, target);
  if (!stats.total) return 'No live quality results yet. Dashboard shell is ready for the next internal run.';
  if (stats.failing === 0) {
    return `All ${stats.total} deliverables reached ${letterForScore(target)} or better; average score ${stats.average}.`;
  }

  const worstLabel = stats.worst
    ? `${stats.worst.projectId} ${stats.worst.scope}w ${stats.worst.featureId} (${stats.worst.score})`
    : 'unknown';
  const focus = stats.failingFocus
    .map((result) => `${result.projectId}/${result.scope}w/${result.featureId}`)
    .join(', ');
  return `${stats.passing}/${stats.total} deliverables reached ${letterForScore(
    target,
  )} or better; average score ${stats.average}. Lowest item: ${worstLabel}. Next focus: ${focus}.`;
}

export async function appendActivityEntry(outputDir, entry) {
  await fs.mkdir(outputDir, { recursive: true });
  const currentLog = await readActivityLog(outputDir);
  const nextLog = [
    ...currentLog,
    {
      timestamp: new Date().toISOString(),
      type: 'note',
      summary: '',
      ...entry,
    },
  ].slice(-ACTIVITY_LOG_LIMIT);
  await fs.writeFile(path.join(outputDir, ACTIVITY_LOG_FILE), JSON.stringify(nextLog, null, 2));
  return nextLog;
}

function safeJsonScript(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export async function writeQualityDashboard(outputDir, latestPayload, activityLog) {
  await fs.mkdir(outputDir, { recursive: true });
  const html = buildDashboardHtml(latestPayload, activityLog);
  await fs.writeFile(path.join(outputDir, DASHBOARD_FILE), html);
  return path.join(outputDir, DASHBOARD_FILE);
}

function buildDashboardHtml(latestPayload, activityLog) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CourseMapper Internal Quality Dashboard</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5f7fb;
        --panel: #ffffff;
        --ink: #172033;
        --muted: #657187;
        --line: #dfe5ef;
        --soft: #eef3fa;
        --good: #0f8f5f;
        --warn: #b7791f;
        --bad: #c2410c;
        --accent: #315cfd;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1.45;
      }

      a {
        color: var(--accent);
        text-decoration: none;
      }

      a:hover {
        text-decoration: underline;
      }

      .page {
        width: min(1440px, calc(100% - 32px));
        margin: 0 auto;
        padding: 32px 0 48px;
      }

      .topbar {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 24px;
        margin-bottom: 24px;
      }

      .eyebrow {
        margin: 0 0 8px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1 {
        margin: 0;
        font-size: clamp(28px, 4vw, 44px);
        line-height: 1.05;
        letter-spacing: 0;
      }

      .summary {
        max-width: 760px;
        margin: 12px 0 0;
        color: var(--muted);
        font-size: 16px;
      }

      .meta {
        min-width: 280px;
        padding: 14px 16px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
        color: var(--muted);
        font-size: 13px;
      }

      .meta div {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        padding: 3px 0;
      }

      .meta strong {
        color: var(--ink);
        font-weight: 650;
      }

      .cards {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 20px;
      }

      .card,
      .panel {
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
      }

      .card {
        padding: 16px;
      }

      .card-label {
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .card-value {
        margin-top: 6px;
        font-size: 30px;
        font-weight: 760;
      }

      .card-note {
        margin-top: 4px;
        color: var(--muted);
        font-size: 13px;
      }

      .layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 360px;
        gap: 16px;
        align-items: start;
      }

      .panel {
        overflow: hidden;
      }

      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 16px;
        border-bottom: 1px solid var(--line);
      }

      .panel-header h2 {
        margin: 0;
        font-size: 17px;
      }

      .filters {
        display: grid;
        grid-template-columns: 1.4fr repeat(4, minmax(120px, 1fr));
        gap: 10px;
        padding: 14px 16px;
        border-bottom: 1px solid var(--line);
        background: #fbfcff;
      }

      input,
      select {
        width: 100%;
        min-height: 38px;
        border: 1px solid var(--line);
        border-radius: 6px;
        background: #fff;
        color: var(--ink);
        font: inherit;
        font-size: 14px;
        padding: 8px 10px;
      }

      .table-wrap {
        overflow: auto;
        max-height: 680px;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
      }

      th,
      td {
        padding: 12px 14px;
        border-bottom: 1px solid var(--line);
        text-align: left;
        vertical-align: top;
      }

      th {
        position: sticky;
        top: 0;
        z-index: 1;
        background: var(--soft);
        color: #334058;
        font-size: 12px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      tr:hover td {
        background: #fbfcff;
      }

      .score {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 56px;
        height: 30px;
        border-radius: 999px;
        font-weight: 760;
      }

      .score.good {
        background: #dcfce7;
        color: var(--good);
      }

      .score.warn {
        background: #fef3c7;
        color: var(--warn);
      }

      .score.bad {
        background: #ffedd5;
        color: var(--bad);
      }

      .findings {
        max-width: 440px;
        color: var(--muted);
      }

      .finding-list {
        margin: 0;
        padding-left: 18px;
      }

      .activity {
        padding: 0;
      }

      .activity-list {
        max-height: 820px;
        overflow: auto;
      }

      .activity-item {
        padding: 14px 16px;
        border-bottom: 1px solid var(--line);
      }

      .activity-item:last-child {
        border-bottom: 0;
      }

      .activity-top {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 6px;
        color: var(--muted);
        font-size: 12px;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        background: var(--soft);
        color: #334058;
        font-size: 12px;
        font-weight: 700;
        padding: 3px 8px;
        text-transform: capitalize;
      }

      .activity-summary {
        margin: 0;
        font-size: 14px;
      }

      .empty {
        padding: 28px 16px;
        color: var(--muted);
        text-align: center;
      }

      @media (max-width: 1080px) {
        .topbar,
        .layout {
          grid-template-columns: 1fr;
          display: grid;
        }

        .cards {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .filters {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 680px) {
        .page {
          width: min(100% - 20px, 1440px);
          padding-top: 20px;
        }

        .cards,
        .filters {
          grid-template-columns: 1fr;
        }

        th,
        td {
          padding: 10px;
        }
      }
    </style>
  </head>
  <body>
    <script id="latest-data" type="application/json">${safeJsonScript(latestPayload || { meta: {}, results: [] })}</script>
    <script id="activity-data" type="application/json">${safeJsonScript(activityLog || [])}</script>
    <main class="page">
      <section class="topbar">
        <div>
          <p class="eyebrow">Internal Artifact Dashboard</p>
          <h1>CourseMapper Deliverable Quality</h1>
          <p class="summary" id="runSummary"></p>
        </div>
        <aside class="meta" id="metaPanel"></aside>
      </section>

      <section class="cards" id="cards"></section>

      <section class="layout">
        <div class="panel">
          <div class="panel-header">
            <h2>Latest Results</h2>
            <a href="./latest.md">Open markdown report</a>
          </div>
          <div class="filters">
            <input id="search" type="search" placeholder="Search project, feature, finding" />
            <select id="projectFilter"><option value="">All projects</option></select>
            <select id="scopeFilter"><option value="">All scopes</option></select>
            <select id="featureFilter"><option value="">All features</option></select>
            <select id="statusFilter">
              <option value="">All statuses</option>
              <option value="pass">At target</option>
              <option value="fail">Below target</option>
            </select>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Scope</th>
                  <th>Feature</th>
                  <th>Score</th>
                  <th>Iterations</th>
                  <th>Latest diff</th>
                  <th>Findings</th>
                  <th>Output</th>
                </tr>
              </thead>
              <tbody id="resultsBody"></tbody>
            </table>
          </div>
        </div>

        <aside class="panel activity">
          <div class="panel-header">
            <h2>Fix And Run Log</h2>
            <span class="pill" id="logCount"></span>
          </div>
          <div class="activity-list" id="activityList"></div>
        </aside>
      </section>
    </main>

    <script>
      const latest = JSON.parse(document.getElementById('latest-data').textContent || '{"meta":{},"results":[]}');
      const activity = JSON.parse(document.getElementById('activity-data').textContent || '[]');
      const results = Array.isArray(latest.results) ? latest.results : [];
      const meta = latest.meta || {};
      const target = Number(meta.target || 90);

      const elements = {
        runSummary: document.getElementById('runSummary'),
        metaPanel: document.getElementById('metaPanel'),
        cards: document.getElementById('cards'),
        search: document.getElementById('search'),
        projectFilter: document.getElementById('projectFilter'),
        scopeFilter: document.getElementById('scopeFilter'),
        featureFilter: document.getElementById('featureFilter'),
        statusFilter: document.getElementById('statusFilter'),
        resultsBody: document.getElementById('resultsBody'),
        activityList: document.getElementById('activityList'),
        logCount: document.getElementById('logCount'),
      };

      function letter(score) {
        if (score >= 93) return 'A';
        if (score >= 90) return 'A-';
        if (score >= 87) return 'B+';
        if (score >= 83) return 'B';
        if (score >= 80) return 'B-';
        if (score >= 77) return 'C+';
        if (score >= 73) return 'C';
        return 'below C';
      }

      function scoreClass(score) {
        if (score >= target) return 'good';
        if (score >= target - 7) return 'warn';
        return 'bad';
      }

      function formatDate(value) {
        if (!value) return 'Not generated yet';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
      }

      function unique(values) {
        return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ''))].sort();
      }

      function latestDiff(result) {
        return result.iterations?.at?.(-1)?.diff || result.iterations?.[result.iterations.length - 1]?.diff || '';
      }

      function stats() {
        const scores = results.map((result) => Number(result.score)).filter(Number.isFinite);
        const passing = results.filter((result) => Number(result.score) >= target).length;
        const average = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
        const worst = results.reduce((lowest, result) => {
          if (!lowest) return result;
          return Number(result.score) < Number(lowest.score) ? result : lowest;
        }, null);
        return { scores, passing, average, worst };
      }

      function renderMeta() {
        const rows = [
          ['Generated', formatDate(meta.generatedAt)],
          ['Provider', meta.provider || 'Not set'],
          ['Model', meta.model || 'Not set'],
          ['Target', target + ' (' + letter(target) + ')'],
          ['Parallel', meta.parallel || 'n/a'],
        ];
        elements.metaPanel.replaceChildren(...rows.map(([label, value]) => {
          const row = document.createElement('div');
          const labelNode = document.createElement('span');
          const valueNode = document.createElement('strong');
          labelNode.textContent = label;
          valueNode.textContent = value;
          row.append(labelNode, valueNode);
          return row;
        }));
      }

      function renderCards() {
        const current = stats();
        const cards = [
          ['At Target', current.passing + '/' + results.length, 'Deliverables scoring ' + letter(target) + ' or better'],
          ['Average Score', current.average || '-', 'Across latest generated artifacts'],
          ['Lowest Score', current.worst ? current.worst.score : '-', current.worst ? current.worst.projectId + ' / ' + current.worst.featureId : 'No results yet'],
          ['Run Log', activity.length, 'Recorded fixes and audit runs'],
        ];
        elements.cards.replaceChildren(...cards.map(([label, value, note]) => {
          const card = document.createElement('article');
          card.className = 'card';
          const labelNode = document.createElement('div');
          const valueNode = document.createElement('div');
          const noteNode = document.createElement('div');
          labelNode.className = 'card-label';
          valueNode.className = 'card-value';
          noteNode.className = 'card-note';
          labelNode.textContent = label;
          valueNode.textContent = value;
          noteNode.textContent = note;
          card.append(labelNode, valueNode, noteNode);
          return card;
        }));

        if (!results.length) {
          elements.runSummary.textContent = 'No generated results yet. Run the internal quality loop to populate this dashboard.';
        } else if (current.passing === results.length) {
          elements.runSummary.textContent = 'All latest deliverables are at target. Keep watching the run log for repeated stability across scopes and project types.';
        } else {
          elements.runSummary.textContent =
            current.passing + '/' + results.length + ' latest deliverables are at target. Lowest current item is ' +
            current.worst.projectId + ' ' + current.worst.scope + 'w ' + current.worst.featureId + ' at ' + current.worst.score + '.';
        }
      }

      function addOptions(select, values, labeler = (value) => value) {
        for (const value of values) {
          const option = document.createElement('option');
          option.value = String(value);
          option.textContent = labeler(value);
          select.append(option);
        }
      }

      function renderFilters() {
        addOptions(elements.projectFilter, unique(results.map((result) => result.projectId)));
        addOptions(elements.scopeFilter, unique(results.map((result) => result.scope)), (value) => value + ' weeks');
        addOptions(elements.featureFilter, unique(results.map((result) => result.featureId)));
      }

      function matchesFilters(result) {
        const query = elements.search.value.trim().toLowerCase();
        const haystack = [
          result.projectId,
          result.scope,
          result.featureId,
          result.score,
          latestDiff(result),
          ...(result.findings || []),
        ].join(' ').toLowerCase();
        if (query && !haystack.includes(query)) return false;
        if (elements.projectFilter.value && result.projectId !== elements.projectFilter.value) return false;
        if (elements.scopeFilter.value && String(result.scope) !== elements.scopeFilter.value) return false;
        if (elements.featureFilter.value && result.featureId !== elements.featureFilter.value) return false;
        if (elements.statusFilter.value === 'pass' && Number(result.score) < target) return false;
        if (elements.statusFilter.value === 'fail' && Number(result.score) >= target) return false;
        return true;
      }

      function renderResults() {
        const visible = results.filter(matchesFilters);
        if (!visible.length) {
          const row = document.createElement('tr');
          const cell = document.createElement('td');
          cell.colSpan = 8;
          cell.className = 'empty';
          cell.textContent = results.length ? 'No results match the current filters.' : 'No generated results yet.';
          row.append(cell);
          elements.resultsBody.replaceChildren(row);
          return;
        }

        elements.resultsBody.replaceChildren(...visible.map((result) => {
          const row = document.createElement('tr');
          const cells = [
            result.projectId,
            result.scope + ' weeks',
            result.featureId,
            '',
            result.iterations?.length || 0,
            latestDiff(result),
            '',
            '',
          ];

          cells.forEach((value, index) => {
            const cell = document.createElement('td');
            if (index === 3) {
              const badge = document.createElement('span');
              badge.className = 'score ' + scoreClass(Number(result.score));
              badge.textContent = result.score + ' ' + letter(Number(result.score));
              cell.append(badge);
            } else if (index === 6) {
              cell.className = 'findings';
              if (result.findings?.length) {
                const list = document.createElement('ul');
                list.className = 'finding-list';
                result.findings.forEach((finding) => {
                  const item = document.createElement('li');
                  item.textContent = finding;
                  list.append(item);
                });
                cell.append(list);
              } else {
                cell.textContent = 'None';
              }
            } else if (index === 7) {
              const link = document.createElement('a');
              link.href = './' + result.projectId + '/scope-' + result.scope + '/' + result.featureId + '.json';
              link.textContent = 'JSON';
              cell.append(link);
            } else {
              cell.textContent = value;
            }
            row.append(cell);
          });
          return row;
        }));
      }

      function renderActivity() {
        elements.logCount.textContent = activity.length + ' entries';
        if (!activity.length) {
          const empty = document.createElement('div');
          empty.className = 'empty';
          empty.textContent = 'No fix summaries have been recorded yet.';
          elements.activityList.replaceChildren(empty);
          return;
        }

        elements.activityList.replaceChildren(...[...activity].reverse().map((entry) => {
          const item = document.createElement('article');
          item.className = 'activity-item';
          const top = document.createElement('div');
          top.className = 'activity-top';
          const type = document.createElement('span');
          type.className = 'pill';
          type.textContent = entry.type || 'note';
          const time = document.createElement('span');
          time.textContent = formatDate(entry.timestamp);
          top.append(type, time);
          const summary = document.createElement('p');
          summary.className = 'activity-summary';
          summary.textContent = entry.summary || 'No summary provided.';
          item.append(top, summary);
          return item;
        }));
      }

      function bindFilters() {
        [elements.search, elements.projectFilter, elements.scopeFilter, elements.featureFilter, elements.statusFilter].forEach((input) => {
          input.addEventListener('input', renderResults);
          input.addEventListener('change', renderResults);
        });
      }

      renderMeta();
      renderCards();
      renderFilters();
      bindFilters();
      renderResults();
      renderActivity();
    </script>
  </body>
</html>
`;
}
