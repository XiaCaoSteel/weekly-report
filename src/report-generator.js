const fs = require('fs');
const config = require('./config');

function formatDate(isoStr) {
  if (!isoStr) return '-';
  return isoStr.slice(0, 10);
}

function generateReport({
  weekStart, weekEnd, aiSummary, parsedSummary,
  repos, commitsByRepo, discoveredRepos,
  repoMetadata, repoActivity,
}) {
  let md = '';

  md += `# AI/LLM Weekly Report: ${weekStart} ~ ${weekEnd}\n\n`;

  // --- Section 1: Overview ---
  md += `## Overview\n\n`;
  const overviewText = parsedSummary?.overview || aiSummary || '';
  if (overviewText) {
    md += `${overviewText}\n\n`;
  } else {
    md += `_AI summary unavailable for this week._\n\n`;
  }

  md += `---\n\n`;

  // --- Section 2: Repo Highlights ---
  md += `## Repo Highlights\n\n`;
  const repoNames = new Map(); // repoId -> "owner/repo"
  for (const repo of repos) {
    repoNames.set(repo.id, `${repo.owner}/${repo.repo}`);
  }

  let hasHighlights = false;
  for (const repo of repos) {
    const commits = commitsByRepo.get(repo.id);
    if (!commits || commits.length === 0) continue;
    hasHighlights = true;

    const key = `${repo.owner}/${repo.repo}`;
    const meta = repoMetadata?.get(repo.id) || {};
    const activity = repoActivity?.get(repo.id) || {};
    const aiBullets = parsedSummary?.repoSummaries?.get(key) || '';

    md += `### [${repo.owner}/${repo.repo}](https://github.com/${repo.owner}/${repo.repo})\n\n`;

    // 项目简介
    md += `#### 项目简介\n\n`;
    md += `${meta.description || repo.description || '_暂无简介_'}\n\n`;

    // 基础信息
    md += `#### 基础信息\n\n`;
    md += `| 属性 | 值 |\n`;
    md += `|------|-----|\n`;
    md += `| ⭐ Stars | ${(meta.stars ?? '-').toLocaleString()} |\n`;
    md += `| 🍴 Forks | ${(meta.forks ?? '-').toLocaleString()} |\n`;
    md += `| 👀 Watchers | ${(meta.watchers ?? '-').toLocaleString()} |\n`;
    md += `| 📅 Created | ${formatDate(meta.created_at)} |\n`;
    md += `| 🔄 Updated | ${formatDate(meta.updated_at)} |\n`;
    md += `| 🔤 Language | ${meta.language || repo.language || '-'} |\n`;
    md += `| 📜 License | ${meta.license || '-'} |\n`;
    const topics = meta.topics?.length ? meta.topics.join(', ') : '-';
    md += `| 🏷️ Topics | ${topics} |\n`;
    md += '\n';

    // 活动
    md += `#### 活动\n\n`;
    const starDelta = activity.starDelta;
    const forkDelta = activity.forkDelta;
    const starStr = starDelta != null ? `+${starDelta}` : 'N/A';
    const forkStr = forkDelta != null ? `+${forkDelta}` : 'N/A';
    const commitCount = commits.length;
    const issuesCreated = activity.issuesCreated ?? '-';
    const issuesClosed = activity.issuesClosed ?? '-';
    md += `- ⭐ Star 增长（本周）: ${starStr}\n`;
    md += `- 🍴 Fork 增长（本周）: ${forkStr}\n`;
    md += `- 📝 Commits（本周）: ${commitCount} 次\n`;
    md += `- 🐛 Issues（本周）: ${issuesCreated} 新增 / ${issuesClosed} 关闭\n`;
    md += '\n';

    // 概述 (AI per-repo summary)
    if (aiBullets) {
      md += `#### 概述\n\n`;
      md += `${aiBullets}\n\n`;
    }

    md += `---\n\n`;
  }

  if (!hasHighlights) {
    md += `_No repos with new commits this week._\n\n`;
    md += `---\n\n`;
  }

  // --- Section 3: Tracked Repositories (unchanged) ---
  md += `## Tracked Repositories\n\n`;
  let totalCommits = 0;
  for (const repo of repos) {
    const commits = commitsByRepo.get(repo.id);
    if (!commits || commits.length === 0) continue;
    totalCommits += commits.length;
    md += `### [${repo.owner}/${repo.repo}](https://github.com/${repo.owner}/${repo.repo})\n\n`;
    for (const c of commits) {
      const d = c.committed_at ? new Date(c.committed_at).toISOString().slice(0, 10) : '';
      md += `- [\`${c.sha.slice(0, 7)}\`](${c.url}) ${c.message} — _${c.author}${d ? ', ' + d : ''}_\n`;
    }
    md += '\n';
  }

  md += `---\n\n`;

  // --- Section 4: Discovered Repos (unchanged) ---
  if (discoveredRepos && discoveredRepos.length > 0) {
    md += `## Newly Discovered Trending Repos\n\n`;
    md += `| Repository | Stars | Language | Description |\n`;
    md += `|---|---|---|---|\n`;
    for (const r of discoveredRepos) {
      md += `| [${r.owner}/${r.repo}](https://github.com/${r.owner}/${r.repo}) | +${r.stars} | ${r.language || '-'} | ${r.description || '-'} |\n`;
    }
    md += '\n';
    md += `---\n\n`;
  }

  // --- Section 5: Statistics (unchanged) ---
  const manualRepos = repos.filter(r => r.source === 'manual').length;
  const discoveredCount = repos.filter(r => r.source === 'discovered').length;
  const reposWithCommits = [...commitsByRepo.values()].filter(c => c.length > 0).length;

  md += `## Statistics\n\n`;
  md += `- Repos tracked: ${repos.length} (${manualRepos} manual + ${discoveredCount} discovered)\n`;
  md += `- Repos with new commits: ${reposWithCommits}\n`;
  md += `- Commits analyzed: ${totalCommits}\n`;
  md += `- New trending repos discovered: ${discoveredRepos.length}\n`;
  md += `- Generated: ${new Date().toISOString()}\n`;

  // Write to file
  const filename = `${weekEnd}_weekly_report.md`;
  const filePath = `${config.REPORT_DIR}/${filename}`;
  fs.writeFileSync(filePath, md, 'utf-8');
  console.log(`[report] Written: ${filePath}`);

  return { filePath, markdown: md };
}

module.exports = { generateReport };
