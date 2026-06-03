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

function generateReport({
  weekStart, weekEnd, aiSummary, parsedSummary,
  repos, commitsByRepo, discoveredRepos,
  repoMetadata, repoActivity,
}) {
  let h = '';

  // Title
  h += `<h1>GitHub Weekly Report: ${esc(weekStart)} ~ ${esc(weekEnd)}</h1>\n`;

  // --- Section 1: Overview ---
  h += `<div class="section overview">\n<h2>Overview</h2>\n`;
  const overviewText = parsedSummary?.overview || aiSummary || '';
  if (overviewText) {
    h += `<div class="ai-summary">${renderAI(overviewText)}</div>\n`;
  } else {
    // Fallback: simple data-driven summary when AI is unavailable
    const active = repos.filter(r => { const c = commitsByRepo.get(r.id); return c && c.length > 0; });
    const totalC = active.reduce((sum, r) => sum + (commitsByRepo.get(r.id) || []).length, 0);
    const top = [...active].sort((a, b) =>
      (commitsByRepo.get(b.id) || []).length - (commitsByRepo.get(a.id) || []).length
    ).slice(0, 5);
    h += `<p>本周共追踪 <strong>${repos.length}</strong> 个仓库`;
    if (active.length > 0) {
      h += `，其中 <strong>${active.length}</strong> 个仓库有新的提交`;
      h += `，累计 <strong>${totalC}</strong> 次提交。`;
      h += `最活跃的仓库：${top.map(r => `<a href="https://github.com/${esc(r.owner)}/${esc(r.repo)}">${esc(r.owner)}/${esc(r.repo)}</a>`).join('、')}。`;
    } else {
      h += `，本周无新的提交记录。`;
    }
    h += `</p>\n`;
  }
  h += `</div>\n`;

  // --- Section 2: Repo Highlights ---
  h += `<div class="section highlights">\n<h2>Repo Highlights</h2>\n`;

  let hasHighlights = false;
  for (const repo of repos) {
    const commits = commitsByRepo.get(repo.id);
    if (!commits || commits.length === 0) continue;
    hasHighlights = true;

    const key = `${repo.owner}/${repo.repo}`;
    const meta = repoMetadata?.get(repo.id) || {};
    const activity = repoActivity?.get(repo.id) || {};
    const aiBullets = parsedSummary?.repoSummaries?.get(key) || '';

    h += `<div class="repo-card">\n`;
    h += `<h3><a href="https://github.com/${esc(repo.owner)}/${esc(repo.repo)}" target="_blank">${esc(repo.owner)}/${esc(repo.repo)}</a></h3>\n`;

    // 项目简介
    h += `<h4>项目简介</h4>\n`;
    h += `<p>${esc(meta.description || repo.description || '暂无简介')}</p>\n`;

    // 基础信息
    h += `<h4>基础信息</h4>\n`;
    const topics = meta.topics?.length ? meta.topics.join(', ') : '-';
    h += `<ul>\n`;
    h += `<li>⭐ Stars: ${(meta.stars ?? '-').toLocaleString()}</li>\n`;
    h += `<li>🍴 Forks: ${(meta.forks ?? '-').toLocaleString()}</li>\n`;
    h += `<li>👀 Watchers: ${(meta.watchers ?? '-').toLocaleString()}</li>\n`;
    h += `<li>🔤 Language: ${esc(meta.language || repo.language || '-')}</li>\n`;
    h += `<li>📜 License: ${esc(meta.license || '-')}</li>\n`;
    h += `<li>📅 Created: ${formatDate(meta.created_at)}</li>\n`;
    h += `<li>🔄 Updated: ${formatDate(meta.updated_at)}</li>\n`;
    h += `<li>🏷️ Topics: ${esc(topics)}</li>\n`;
    h += `</ul>\n`;

    // 活动
    h += `<h4>活动</h4>\n`;
    const starDelta = activity.starDelta;
    const forkDelta = activity.forkDelta;
    const starStr = starDelta != null ? `+${starDelta}` : 'N/A';
    const forkStr = forkDelta != null ? `+${forkDelta}` : 'N/A';
    const commitCount = commits.length;
    const issuesCreated = activity.issuesCreated ?? '-';
    const issuesClosed = activity.issuesClosed ?? '-';
    h += `<ul>\n`;
    h += `<li>⭐ Star 增长（本周）: ${starStr}</li>\n`;
    h += `<li>🍴 Fork 增长（本周）: ${forkStr}</li>\n`;
    h += `<li>📝 Commits（本周）: ${commitCount} 次</li>\n`;
    h += `<li>🐛 Issues（本周）: ${issuesCreated} 新增 / ${issuesClosed} 关闭</li>\n`;
    h += `</ul>\n`;

    // 概述 (AI per-repo summary)
    if (aiBullets) {
      h += `<h4>概述</h4>\n`;
      h += `<div class="ai-summary">${renderAI(aiBullets)}</div>\n`;
    }

    h += `</div>\n`;
  }

  if (!hasHighlights) {
    h += `<p class="muted">No repos with new commits this week.</p>\n`;
  }
  h += `</div>\n`;

  // --- Section 3: Tracked Repositories ---
  h += `<div class="section commits">\n<h2>Tracked Repositories</h2>\n`;
  let totalCommits = 0;
  for (const repo of repos) {
    const commits = commitsByRepo.get(repo.id);
    if (!commits || commits.length === 0) continue;
    totalCommits += commits.length;
    h += `<h3><a href="https://github.com/${esc(repo.owner)}/${esc(repo.repo)}" target="_blank">${esc(repo.owner)}/${esc(repo.repo)}</a></h3>\n`;
    h += `<ul>\n`;
    for (const c of commits) {
      const d = c.committed_at ? new Date(c.committed_at).toISOString().slice(0, 10) : '';
      h += `<li><a href="${esc(c.url)}" target="_blank"><code>${esc(c.sha.slice(0, 7))}</code></a> ${esc(c.message)} — <em>${esc(c.author)}${d ? ', ' + d : ''}</em></li>\n`;
    }
    h += `</ul>\n`;
  }
  h += `</div>\n`;

  // --- Section 4: Discovered Repos ---
  if (discoveredRepos && discoveredRepos.length > 0) {
    h += `<div class="section discovered">\n<h2>Newly Discovered Trending Repos</h2>\n`;
    h += `<table class="data-table">\n`;
    h += `<thead><tr><th>Repository</th><th>Stars</th><th>Language</th><th>Description</th></tr></thead>\n`;
    h += `<tbody>\n`;
    for (const r of discoveredRepos) {
      h += `<tr><td><a href="https://github.com/${esc(r.owner)}/${esc(r.repo)}" target="_blank">${esc(r.owner)}/${esc(r.repo)}</a></td><td>+${r.stars}</td><td>${esc(r.language || '-')}</td><td>${esc(r.description || '-')}</td></tr>\n`;
    }
    h += `</tbody></table>\n</div>\n`;
  }

  // --- Section 5: Statistics ---
  const manualRepos = repos.filter(r => r.source === 'manual').length;
  const discoveredCount = repos.filter(r => r.source === 'discovered').length;
  const reposWithCommits = [...commitsByRepo.values()].filter(c => c.length > 0).length;

  h += `<div class="section stats">\n<h2>Statistics</h2>\n`;
  h += `<ul>\n`;
  h += `<li>Repos tracked: ${repos.length} (${manualRepos} manual + ${discoveredCount} discovered)</li>\n`;
  h += `<li>Repos with new commits: ${reposWithCommits}</li>\n`;
  h += `<li>Commits analyzed: ${totalCommits}</li>\n`;
  h += `<li>New trending repos discovered: ${discoveredRepos.length}</li>\n`;
  h += `<li>Generated: ${new Date().toISOString()}</li>\n`;
  h += `</ul>\n`;
  h += `</div>\n`;

  // Write to file
  const filename = `${weekEnd}_weekly_report.html`;
  const filePath = `${config.REPORT_DIR}/${filename}`;
  fs.writeFileSync(filePath, h, 'utf-8');
  console.log(`[report] Written: ${filePath}`);

  return { filePath, html: h };
}

// Convert AI markdown output to HTML (handles bold, code, links, lists, nested lists)
function renderAI(md) {
  if (!md) return '';
  // First escape, then selectively unescape for markdown conversion
  let out = esc(md);

  // Inline: code spans
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Inline: bold
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Inline: links
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  // Split blocks by blank lines
  const blocks = out.split(/\n\n+/);
  const htmlBlocks = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i].trim();
    if (!block) continue;
    const lines = block.split('\n');

    // Check if this block is a list (lines starting with - or * or numbered, possibly indented)
    const listLines = lines.filter(l => /^\s*[-*]\s/.test(l) || /^\s*\d+\.\s/.test(l));
    if (listLines.length === lines.length) {
      // Entire block is a list — render with nesting
      htmlBlocks.push(renderList(lines));
    } else if (listLines.length > 0 && listLines.length < lines.length) {
      // Mixed: list items + non-list lines. Render non-list as <p>, list as <ul>
      const nonList = lines.filter(l => !/^\s*[-*]\s/.test(l) && !/^\s*\d+\.\s/.test(l));
      if (nonList.length > 0) {
        htmlBlocks.push(`<p>${nonList.join('<br>\n')}</p>`);
      }
      const lists = lines.filter(l => /^\s*[-*]\s/.test(l) || /^\s*\d+\.\s/.test(l));
      if (lists.length > 0) {
        htmlBlocks.push(renderList(lists));
      }
    } else {
      // Paragraph — join with <br> for single line breaks within the paragraph
      htmlBlocks.push(`<p>${lines.join('<br>\n')}</p>`);
    }
  }

  return htmlBlocks.join('\n');
}

function renderList(lines) {
  if (lines.length === 0) return '';
  const items = lines.map(l => {
    const content = l.replace(/^\s*[-*]\s+/, '').replace(/^\s*\d+\.\s+/, '');
    return `<li>${content}</li>`;
  });
  return `<ul>\n${items.join('\n')}\n</ul>`;
}

module.exports = { generateReport };
