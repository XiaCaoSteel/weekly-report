const express = require('express');
const { marked } = require('marked');
const config = require('./config');
const db = require('./db');
const { runReportGeneration } = require('./orchestrator');
const { resolveDefaultBranch } = require('./github-fetcher');

function createApp() {
  const app = express();
  app.use(express.urlencoded({ extended: true }));

  // --- Styles ---
  const style = `
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 960px; margin: 0 auto; padding: 20px; color: #222; }
      h1 { margin: 20px 0; }
      nav { margin-bottom: 24px; }
      nav a { margin-right: 16px; color: #0366d6; text-decoration: none; }
      nav a:hover { text-decoration: underline; }
      table { width: 100%; border-collapse: collapse; margin: 16px 0; }
      th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #ddd; }
      th { background: #f6f8fa; }
      .status { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; }
      .status-completed { background: #d4edda; color: #155724; }
      .status-running, .status-pending { background: #fff3cd; color: #856404; }
      .status-failed { background: #f8d7da; color: #721c24; }
      form { margin: 16px 0; }
      input, button { padding: 8px 12px; font-size: 14px; }
      button { background: #0366d6; color: #fff; border: none; border-radius: 4px; cursor: pointer; }
      button:hover { background: #0256b6; }
      button.danger { background: #d73a49; }
      button.danger:hover { background: #b92b38; }
      .trigger-btn { padding: 12px 24px; font-size: 16px; margin: 16px 0; }
      .markdown-body h1, .markdown-body h2, .markdown-body h3 { margin: 16px 0 8px; }
      .markdown-body p { margin: 8px 0; }
      .markdown-body ul, .markdown-body ol { margin: 8px 0 8px 24px; }
      .markdown-body li { margin: 4px 0; }
      .markdown-body table { width: 100%; border-collapse: collapse; }
      .markdown-body th, .markdown-body td { border: 1px solid #ddd; padding: 8px; }
      .markdown-body hr { margin: 24px 0; border: 0; border-top: 1px solid #ddd; }
      .back-link { margin: 20px 0; display: inline-block; }
    </style>
  `;

  function layout(title, body) {
    return `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>${style}</head><body><nav><a href="/">Reports</a><a href="/repos">Repos</a></nav><h1>${title}</h1>${body}</body></html>`;
  }

  // --- Routes ---

  // Home: report history
  app.get('/', async (req, res) => {
    try {
      const reports = await db.getReports();
      let rows = '';
      if (reports.length === 0) {
        rows = '<tr><td colspan="6">No reports yet.</td></tr>';
      } else {
        for (const r of reports) {
          rows += `<tr>
            <td><a href="/reports/${r.id}">${r.week_start} ~ ${r.week_end}</a></td>
            <td>${r.repo_count}</td>
            <td>${r.commit_count}</td>
            <td><span class="status status-${r.status}">${r.status}</span></td>
            <td>${r.created_at ? new Date(r.created_at).toLocaleString() : '-'}</td>
          </tr>`;
        }
      }

      const html = `
        <form method="post" action="/trigger"><button class="trigger-btn" type="submit">Generate Report Now</button></form>
        <table>
          <thead><tr><th>Period</th><th>Repos</th><th>Commits</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      `;
      res.send(layout('Weekly Reports', html));
    } catch (e) {
      res.status(500).send(layout('Error', `<p>${e.message}</p>`));
    }
  });

  // View report
  app.get('/reports/:id', async (req, res) => {
    try {
      const report = await db.getReportById(parseInt(req.params.id));
      if (!report) return res.status(404).send(layout('Not Found', '<p>Report not found</p>'));
      // Strip leading H1 to avoid duplicate title (layout already shows <h1>)
      let content = report.content || '_No content_';
      content = content.replace(/^#\s+.+?\n\n?/, '');
      const html = marked.parse(content);
      res.send(layout(report.title || 'Report', `<div class="markdown-body">${html}</div><a class="back-link" href="/">Back to list</a>`));
    } catch (e) {
      res.status(500).send(layout('Error', `<p>${e.message}</p>`));
    }
  });

  // Repo management
  app.get('/repos', async (req, res) => {
    try {
      const repos = await db.getRepos('manual');
      let rows = '';
      if (repos.length === 0) {
        rows = '<tr><td colspan="4">No repos configured.</td></tr>';
      } else {
        for (const r of repos) {
          rows += `<tr>
            <td><a href="https://github.com/${r.owner}/${r.repo}" target="_blank">${r.owner}/${r.repo}</a></td>
            <td>${r.default_branch}</td>
            <td>${r.description || '-'}</td>
            <td>${new Date(r.added_at).toLocaleDateString()}</td>
            <td><form method="post" action="/repos/${r.id}/delete" style="display:inline"><button class="danger" type="submit">Remove</button></form></td>
          </tr>`;
        }
      }

      const html = `
        <h2>Add Repo</h2>
        <form method="post" action="/repos">
          <input name="owner" placeholder="owner (e.g. facebook)" required>
          <input name="repo" placeholder="repo (e.g. react)" required>
          <button type="submit">Add</button>
        </form>
        <h2>Manual Repos</h2>
        <table>
          <thead><tr><th>Repo</th><th>Branch</th><th>Description</th><th>Added</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      `;
      res.send(layout('Repo Management', html));
    } catch (e) {
      res.status(500).send(layout('Error', `<p>${e.message}</p>`));
    }
  });

  // Add repo
  app.post('/repos', async (req, res) => {
    try {
      const { owner, repo } = req.body;
      if (!owner || !repo) return res.status(400).send('owner and repo required');
      let branch = 'main';
      try {
        branch = await resolveDefaultBranch(owner, repo);
      } catch (_) {}
      await db.addRepo(owner.trim(), repo.trim(), branch, 'manual', null, null, 0);
      res.redirect('/repos');
    } catch (e) {
      res.status(500).send(layout('Error', `<p>${e.message}</p>`));
    }
  });

  // Delete repo
  app.post('/repos/:id/delete', async (req, res) => {
    try {
      await db.deleteRepo(parseInt(req.params.id));
      res.redirect('/repos');
    } catch (e) {
      res.status(500).send(layout('Error', `<p>${e.message}</p>`));
    }
  });

  // Manual trigger
  app.post('/trigger', async (req, res) => {
    res.send(layout('Generating...', '<p>Report generation started. <a href="/">Back to list</a> to check progress.</p>'));
    // Run async after responding
    setTimeout(() => {
      runReportGeneration().catch(e => console.error('[trigger] Error:', e.message));
    }, 100);
  });

  return app;
}

module.exports = { createApp };
