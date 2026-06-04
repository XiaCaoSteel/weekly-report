const fs = require('fs');
const config = require('./config');

function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(isoStr) {
  if (!isoStr) return '-';
  return isoStr.slice(0, 10);
}

// ── shared data prep ──

function buildReportData({ weekStart, weekEnd, aiSummary, parsedSummary, repos, commitsByRepo, discoveredRepos, repoMetadata, repoActivity }) {
  // Use parsed overview. Never use raw AI output — if it were valid the parser would have extracted it.
  const overviewText = parsedSummary?.overview || '';

  // Fallback summary
  let fallbackOverview = '';
  if (!overviewText) {
    const active = repos.filter(r => { const c = commitsByRepo.get(r.id); return c && c.length > 0; });
    const totalC = active.reduce((sum, r) => sum + (commitsByRepo.get(r.id) || []).length, 0);
    const top = [...active].sort((a, b) =>
      (commitsByRepo.get(b.id) || []).length - (commitsByRepo.get(a.id) || []).length
    ).slice(0, 5);
    fallbackOverview = `本周共追踪 ${repos.length} 个仓库`;
    if (active.length > 0) {
      fallbackOverview += `，其中 ${active.length} 个仓库有新的提交，累计 ${totalC} 次提交。`;
      fallbackOverview += `最活跃的仓库：${top.map(r => `${r.owner}/${r.repo}`).join('、')}。`;
    } else {
      fallbackOverview += `，本周无新的提交记录。`;
    }
  }

  // Per-repo data
  const repoRows = [];
  let totalCommits = 0;
  for (const repo of repos) {
    const commits = commitsByRepo.get(repo.id);
    if (!commits || commits.length === 0) continue;
    totalCommits += commits.length;

    const key = `${repo.owner}/${repo.repo}`;
    const meta = repoMetadata?.get(repo.id) || {};
    const activity = repoActivity?.get(repo.id) || {};
    const aiBullets = parsedSummary?.repoSummaries?.get(key) || '';
    const topics = meta.topics?.length ? meta.topics.join(', ') : '-';

    repoRows.push({ repo, commits, meta, activity, aiBullets, topics });
  }

  const hasHighlights = repoRows.length > 0;
  const manualRepos = repos.filter(r => r.source === 'manual').length;
  const discoveredCount = repos.filter(r => r.source === 'discovered').length;
  const reposWithCommits = [...commitsByRepo.values()].filter(c => c.length > 0).length;

  return { weekStart, weekEnd, overviewText, fallbackOverview, repoRows, hasHighlights, totalCommits, manualRepos, discoveredCount, reposWithCommits, discoveredRepos: discoveredRepos || [] };
}

// ── HTML ──

function buildHTML(data) {
  const { weekStart, weekEnd, overviewText, fallbackOverview, repoRows, hasHighlights, totalCommits, manualRepos, discoveredCount, reposWithCommits, discoveredRepos } = data;
  let h = '';

  h += `<h1>GitHub Weekly Report: ${esc(weekStart)} ~ ${esc(weekEnd)}</h1>\n`;

  // Overview
  h += `<div class="section overview">\n<h2>Overview</h2>\n`;
  if (overviewText) {
    h += `<div class="ai-summary">${renderAI(overviewText)}</div>\n`;
  } else {
    h += `<p>${esc(fallbackOverview)}</p>\n`;
  }
  h += `</div>\n`;

  // Repo Highlights
  h += `<div class="section highlights">\n<h2>Repo Highlights</h2>\n`;
  if (!hasHighlights) {
    h += `<p class="muted">No repos with new commits this week.</p>\n`;
  }
  for (const r of repoRows) {
    const { repo, commits, meta, activity, aiBullets, topics } = r;
    h += `<div class="repo-card">\n`;
    h += `<h3><a href="https://github.com/${esc(repo.owner)}/${esc(repo.repo)}" target="_blank">${esc(repo.owner)}/${esc(repo.repo)}</a></h3>\n`;
    h += `<h4>项目简介</h4>\n<p>${esc(meta.description || repo.description || '暂无简介')}</p>\n`;
    h += `<h4>基础信息</h4>\n<ul>\n`;
    h += `<li>⭐ Stars: ${(meta.stars ?? '-').toLocaleString()}</li>\n`;
    h += `<li>🍴 Forks: ${(meta.forks ?? '-').toLocaleString()}</li>\n`;
    h += `<li>👀 Watchers: ${(meta.watchers ?? '-').toLocaleString()}</li>\n`;
    h += `<li>🔤 Language: ${esc(meta.language || repo.language || '-')}</li>\n`;
    h += `<li>📜 License: ${esc(meta.license || '-')}</li>\n`;
    h += `<li>📅 Created: ${formatDate(meta.created_at)}</li>\n`;
    h += `<li>🔄 Updated: ${formatDate(meta.updated_at)}</li>\n`;
    h += `<li>🏷️ Topics: ${esc(topics)}</li>\n</ul>\n`;

    const starDelta = activity.starDelta, forkDelta = activity.forkDelta;
    const starStr = starDelta != null ? `+${starDelta}` : 'N/A';
    const forkStr = forkDelta != null ? `+${forkDelta}` : 'N/A';
    h += `<h4>活动</h4>\n<ul>\n`;
    h += `<li>⭐ Star 增长（本周）: ${starStr}</li>\n`;
    h += `<li>🍴 Fork 增长（本周）: ${forkStr}</li>\n`;
    h += `<li>📝 Commits（本周）: ${commits.length} 次</li>\n`;
    h += `<li>🐛 Issues（本周）: ${activity.issuesCreated ?? '-'} 新增 / ${activity.issuesClosed ?? '-'} 关闭</li>\n`;
    h += `</ul>\n`;

    if (aiBullets) {
      h += `<h4>概述</h4>\n<div class="ai-summary">${renderAI(aiBullets)}</div>\n`;
    }
    h += `</div>\n`;
  }
  h += `</div>\n`;

  // Tracked Repositories
  h += `<div class="section commits">\n<h2>Tracked Repositories</h2>\n`;
  for (const { repo, commits } of repoRows) {
    h += `<h3><a href="https://github.com/${esc(repo.owner)}/${esc(repo.repo)}" target="_blank">${esc(repo.owner)}/${esc(repo.repo)}</a></h3>\n<ul>\n`;
    for (const c of commits) {
      const d = c.committed_at ? new Date(c.committed_at).toISOString().slice(0, 10) : '';
      h += `<li><a href="${esc(c.url)}" target="_blank"><code>${esc(c.sha.slice(0, 7))}</code></a> ${esc(c.message)} — <em>${esc(c.author)}${d ? ', ' + d : ''}</em></li>\n`;
    }
    h += `</ul>\n`;
  }
  h += `</div>\n`;

  // Discovered
  if (discoveredRepos.length > 0) {
    h += `<div class="section discovered">\n<h2>Newly Discovered Trending Repos</h2>\n`;
    h += `<table class="data-table">\n<thead><tr><th>Repository</th><th>Stars</th><th>Language</th><th>Description</th></tr></thead>\n<tbody>\n`;
    for (const r of discoveredRepos) {
      h += `<tr><td><a href="https://github.com/${esc(r.owner)}/${esc(r.repo)}" target="_blank">${esc(r.owner)}/${esc(r.repo)}</a></td><td>+${r.stars}</td><td>${esc(r.language || '-')}</td><td>${esc(r.description || '-')}</td></tr>\n`;
    }
    h += `</tbody></table>\n</div>\n`;
  }

  // Statistics
  h += `<div class="section stats">\n<h2>Statistics</h2>\n<ul>\n`;
  h += `<li>Repos tracked: ${manualRepos + discoveredCount} (${manualRepos} manual + ${discoveredCount} discovered)</li>\n`;
  h += `<li>Repos with new commits: ${reposWithCommits}</li>\n`;
  h += `<li>Commits analyzed: ${totalCommits}</li>\n`;
  h += `<li>New trending repos discovered: ${discoveredRepos.length}</li>\n`;
  h += `<li>Generated: ${new Date().toISOString()}</li>\n`;
  h += `</ul>\n</div>\n`;

  return h;
}

// ── Markdown ──

function buildMarkdown(data) {
  const { weekStart, weekEnd, overviewText, fallbackOverview, repoRows, hasHighlights, totalCommits, manualRepos, discoveredCount, reposWithCommits, discoveredRepos } = data;
  let md = '';

  md += `# GitHub Weekly Report: ${weekStart} ~ ${weekEnd}\n\n`;

  // Overview
  md += `## Overview\n\n`;
  if (overviewText) {
    md += `${overviewText}\n\n`;
  } else {
    md += `${fallbackOverview}\n\n`;
  }
  md += `---\n\n`;

  // Repo Highlights
  md += `## Repo Highlights\n\n`;
  if (!hasHighlights) {
    md += `_No repos with new commits this week._\n\n`;
  }
  for (const r of repoRows) {
    const { repo, commits, meta, activity, aiBullets, topics } = r;
    md += `### [${repo.owner}/${repo.repo}](https://github.com/${repo.owner}/${repo.repo})\n\n`;
    md += `#### 项目简介\n\n${meta.description || repo.description || '暂无简介'}\n\n`;
    md += `#### 基础信息\n\n`;
    md += `| 属性 | 值 |\n|------|-----|\n`;
    md += `| ⭐ Stars | ${(meta.stars ?? '-').toLocaleString()} |\n`;
    md += `| 🍴 Forks | ${(meta.forks ?? '-').toLocaleString()} |\n`;
    md += `| 👀 Watchers | ${(meta.watchers ?? '-').toLocaleString()} |\n`;
    md += `| 🔤 Language | ${meta.language || repo.language || '-'} |\n`;
    md += `| 📜 License | ${meta.license || '-'} |\n`;
    md += `| 📅 Created | ${formatDate(meta.created_at)} |\n`;
    md += `| 🔄 Updated | ${formatDate(meta.updated_at)} |\n`;
    md += `| 🏷️ Topics | ${topics} |\n\n`;

    const starDelta = activity.starDelta, forkDelta = activity.forkDelta;
    const starStr = starDelta != null ? `+${starDelta}` : 'N/A';
    const forkStr = forkDelta != null ? `+${forkDelta}` : 'N/A';
    md += `#### 活动\n\n`;
    md += `- ⭐ Star 增长（本周）: ${starStr}\n`;
    md += `- 🍴 Fork 增长（本周）: ${forkStr}\n`;
    md += `- 📝 Commits（本周）: ${commits.length} 次\n`;
    md += `- 🐛 Issues（本周）: ${activity.issuesCreated ?? '-'} 新增 / ${activity.issuesClosed ?? '-'} 关闭\n\n`;

    if (aiBullets) {
      md += `#### 概述\n\n${aiBullets}\n\n`;
    }
    md += `---\n\n`;
  }

  // Tracked Repositories
  md += `## Tracked Repositories\n\n`;
  for (const { repo, commits } of repoRows) {
    md += `### [${repo.owner}/${repo.repo}](https://github.com/${repo.owner}/${repo.repo})\n\n`;
    for (const c of commits) {
      const d = c.committed_at ? new Date(c.committed_at).toISOString().slice(0, 10) : '';
      md += `- [\`${c.sha.slice(0, 7)}\`](${c.url}) ${c.message} — _${c.author}${d ? ', ' + d : ''}_\n`;
    }
    md += '\n';
  }
  md += `---\n\n`;

  // Discovered
  if (discoveredRepos.length > 0) {
    md += `## Newly Discovered Trending Repos\n\n`;
    md += `| Repository | Stars | Language | Description |\n|---|---|---|---|\n`;
    for (const r of discoveredRepos) {
      md += `| [${r.owner}/${r.repo}](https://github.com/${r.owner}/${r.repo}) | +${r.stars} | ${r.language || '-'} | ${r.description || '-'} |\n`;
    }
    md += '\n---\n\n';
  }

  // Statistics
  md += `## Statistics\n\n`;
  md += `- Repos tracked: ${manualRepos + discoveredCount} (${manualRepos} manual + ${discoveredCount} discovered)\n`;
  md += `- Repos with new commits: ${reposWithCommits}\n`;
  md += `- Commits analyzed: ${totalCommits}\n`;
  md += `- New trending repos discovered: ${discoveredRepos.length}\n`;
  md += `- Generated: ${new Date().toISOString()}\n`;

  return md;
}

// ── Word (.doc) — HTML-based, opens in Word/WPS/LibreOffice ──

function buildDoc(data) {
  const { weekStart, weekEnd, overviewText, fallbackOverview, repoRows, hasHighlights, totalCommits, manualRepos, discoveredCount, reposWithCommits, discoveredRepos } = data;

  let d = '';
  // Word-compatible HTML header
  d += `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">\n`;
  d += `<head><meta charset="utf-8">\n`;
  d += `<style>@page { size: A4; margin: 2cm; } body { font-family: 'SimSun', sans-serif; font-size: 12pt; line-height: 1.6; color: #222; } h1 { font-size: 18pt; } h2 { font-size: 14pt; border-bottom: 1px solid #999; padding-bottom: 4pt; } h3 { font-size: 12pt; } h4 { font-size: 11pt; color: #555; } table { border-collapse: collapse; width: 100%; margin: 8pt 0; } th, td { border: 1px solid #999; padding: 4pt 8pt; } th { background: #e1e4e8; } ul { margin: 4pt 0 4pt 20pt; } li { margin: 2pt 0; } code { background: #f0f0f0; padding: 1pt 4pt; font-size: 10pt; } em { color: #666; } .muted { color: #999; } hr { border: 0; border-top: 1px solid #ccc; margin: 16pt 0; }</style>\n`;
  d += `</head><body>\n`;

  d += `<h1>GitHub Weekly Report: ${esc(weekStart)} ~ ${esc(weekEnd)}</h1>\n`;

  // Overview
  d += `<h2>Overview</h2>\n`;
  if (overviewText) {
    d += `<div>${renderAI(overviewText)}</div>\n`;
  } else {
    d += `<p>${esc(fallbackOverview)}</p>\n`;
  }
  d += `<hr>\n`;

  // Repo Highlights
  d += `<h2>Repo Highlights</h2>\n`;
  if (!hasHighlights) {
    d += `<p class="muted">No repos with new commits this week.</p>\n`;
  }
  for (const r of repoRows) {
    const { repo, commits, meta, activity, aiBullets, topics } = r;
    d += `<h3>${esc(repo.owner)}/${esc(repo.repo)}</h3>\n`;
    d += `<h4>项目简介</h4>\n<p>${esc(meta.description || repo.description || '暂无简介')}</p>\n`;
    d += `<h4>基础信息</h4>\n<ul>\n`;
    d += `<li>⭐ Stars: ${(meta.stars ?? '-').toLocaleString()}</li>\n`;
    d += `<li>🍴 Forks: ${(meta.forks ?? '-').toLocaleString()}</li>\n`;
    d += `<li>👀 Watchers: ${(meta.watchers ?? '-').toLocaleString()}</li>\n`;
    d += `<li>🔤 Language: ${esc(meta.language || repo.language || '-')}</li>\n`;
    d += `<li>📜 License: ${esc(meta.license || '-')}</li>\n`;
    d += `<li>📅 Created: ${formatDate(meta.created_at)}</li>\n`;
    d += `<li>🔄 Updated: ${formatDate(meta.updated_at)}</li>\n`;
    d += `<li>🏷️ Topics: ${esc(topics)}</li>\n`;
    d += `</ul>\n`;

    const starDelta = activity.starDelta, forkDelta = activity.forkDelta;
    const starStr = starDelta != null ? `+${starDelta}` : 'N/A';
    const forkStr = forkDelta != null ? `+${forkDelta}` : 'N/A';
    d += `<h4>活动</h4>\n<ul>\n`;
    d += `<li>⭐ Star 增长（本周）: ${starStr}</li>\n`;
    d += `<li>🍴 Fork 增长（本周）: ${forkStr}</li>\n`;
    d += `<li>📝 Commits（本周）: ${commits.length} 次</li>\n`;
    d += `<li>🐛 Issues（本周）: ${activity.issuesCreated ?? '-'} 新增 / ${activity.issuesClosed ?? '-'} 关闭</li>\n`;
    d += `</ul>\n`;

    if (aiBullets) {
      d += `<h4>概述</h4>\n<div>${renderAI(aiBullets)}</div>\n`;
    }
    d += `<hr>\n`;
  }

  // Tracked Repositories
  d += `<h2>Tracked Repositories</h2>\n`;
  for (const { repo, commits } of repoRows) {
    d += `<h3>${esc(repo.owner)}/${esc(repo.repo)}</h3>\n<ul>\n`;
    for (const c of commits) {
      const dt = c.committed_at ? new Date(c.committed_at).toISOString().slice(0, 10) : '';
      d += `<li><code>${esc(c.sha.slice(0, 7))}</code> ${esc(c.message)} — <em>${esc(c.author)}${dt ? ', ' + dt : ''}</em></li>\n`;
    }
    d += `</ul>\n`;
  }
  d += `<hr>\n`;

  // Discovered
  if (discoveredRepos.length > 0) {
    d += `<h2>Newly Discovered Trending Repos</h2>\n<table><thead><tr><th>Repository</th><th>Stars</th><th>Language</th><th>Description</th></tr></thead><tbody>\n`;
    for (const r of discoveredRepos) {
      d += `<tr><td>${esc(r.owner)}/${esc(r.repo)}</td><td>+${r.stars}</td><td>${esc(r.language || '-')}</td><td>${esc(r.description || '-')}</td></tr>\n`;
    }
    d += `</tbody></table>\n<hr>\n`;
  }

  // Statistics
  d += `<h2>Statistics</h2>\n<ul>\n`;
  d += `<li>Repos tracked: ${manualRepos + discoveredCount} (${manualRepos} manual + ${discoveredCount} discovered)</li>\n`;
  d += `<li>Repos with new commits: ${reposWithCommits}</li>\n`;
  d += `<li>Commits analyzed: ${totalCommits}</li>\n`;
  d += `<li>New trending repos discovered: ${discoveredRepos.length}</li>\n`;
  d += `<li>Generated: ${new Date().toISOString()}</li>\n`;
  d += `</ul>\n`;

  d += `</body></html>\n`;
  return d;
}

// ── Main entry ──

function generateReport(opts) {
  const formats = opts.formats || config.OUTPUT_FORMATS; // ['html','md','doc']
  const data = buildReportData(opts);
  const baseName = `${data.weekEnd}_weekly_report`;
  const result = { filePath: null, html: null };

  const builders = {
    html: { ext: '.html', fn: buildHTML },
    md:   { ext: '.md',   fn: buildMarkdown },
    doc:  { ext: '.doc',  fn: buildDoc },
  };

  for (const fmt of formats) {
    const b = builders[fmt];
    if (!b) { console.warn(`[report] Unknown format: ${fmt}`); continue; }
    const content = b.fn(data);
    const path = `${config.REPORT_DIR}/${baseName}${b.ext}`;
    fs.writeFileSync(path, content, 'utf-8');
    console.log(`[report] Written: ${path}`);
    if (fmt === 'html') { result.filePath = path; result.html = content; }
    if (fmt === 'md')   { result.mdPath = path; }
    if (fmt === 'doc')  { result.docPath = path; }
  }

  return result;
}

// ── AI markdown → HTML helpers ──

function renderAI(md) {
  if (!md) return '';
  let out = esc(md);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  const blocks = out.split(/\n\n+/);
  const htmlBlocks = [];
  for (const block of blocks) {
    const lines = block.trim().split('\n').filter(Boolean);
    if (lines.length === 0) continue;
    const listLines = lines.filter(l => /^\s*[-*]\s/.test(l) || /^\s*\d+\.\s/.test(l));
    if (listLines.length === lines.length) {
      htmlBlocks.push(renderList(lines));
    } else if (listLines.length > 0) {
      const nonList = lines.filter(l => !/^\s*[-*]\s/.test(l) && !/^\s*\d+\.\s/.test(l));
      if (nonList.length) htmlBlocks.push(`<p>${nonList.join('<br>')}</p>`);
      htmlBlocks.push(renderList(lines.filter(l => /^\s*[-*]\s/.test(l) || /^\s*\d+\.\s/.test(l))));
    } else {
      htmlBlocks.push(`<p>${lines.join('<br>')}</p>`);
    }
  }
  return htmlBlocks.join('\n');
}

function renderList(lines) {
  if (!lines.length) return '';
  const items = lines.map(l => `<li>${l.replace(/^\s*[-*]\s+/, '').replace(/^\s*\d+\.\s+/, '')}</li>`);
  return `<ul>\n${items.join('\n')}\n</ul>`;
}

module.exports = { generateReport };
