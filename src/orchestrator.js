const db = require('./db');
const { discoverTrendingRepos } = require('./ossinsight');
const { fetchAllCommits, fetchAllRepoMetadata, fetchRepoIssues, trimForAI } = require('./github-fetcher');
const { summarizeCommits, parseAISummary } = require('./ai-summarizer');
const { generateReport } = require('./report-generator');

async function runReportGeneration() {
  const weekEnd = new Date();
  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekStart.getDate() - 7);

  const ws = weekStart.toISOString().slice(0, 10);
  const we = weekEnd.toISOString().slice(0, 10);
  const sinceISO = weekStart.toISOString();

  console.log(`[orchestrator] Starting report ${ws} ~ ${we}`);

  let reportId;
  try {
    reportId = await db.createReport(ws, we);
  } catch (e) {
    console.error('[orchestrator] Failed to create report:', e.message);
    return null;
  }

  try {
    // Step 1: Discover trending repos
    console.log('[orchestrator] Discovering trending repos...');
    const trending = await discoverTrendingRepos();

    await db.deleteDiscoveredRepos();
    for (const r of trending) {
      await db.addRepo(r.owner, r.repo, 'main', 'discovered', r.description, r.language, r.stars);
    }

    // Step 2: Get all repos
    const allRepos = await db.getAllRepos();
    console.log(`[orchestrator] Total repos: ${allRepos.length}`);

    // Step 3: Fetch commits
    console.log('[orchestrator] Fetching commits...');
    const commitsByRepo = await fetchAllCommits(allRepos, sinceISO);

    // Step 4: Flatten commits for DB
    const allCommits = [];
    let totalCommits = 0;
    for (const [repoId, commits] of commitsByRepo) {
      for (const c of commits) {
        allCommits.push({
          repo_id: repoId, sha: c.sha, message: c.message,
          author: c.author, committed_at: c.committed_at, url: c.url,
        });
      }
      totalCommits += commits.length;
    }
    await db.insertCommits(reportId, allCommits);

    // Step 5: Fetch repo metadata + issues + save snapshots
    console.log('[orchestrator] Fetching repo metadata...');
    const repoMetadata = await fetchAllRepoMetadata(allRepos, commitsByRepo);

    const repoActivity = new Map();
    const today = we; // YYYY-MM-DD

    for (const repo of allRepos) {
      const commits = commitsByRepo.get(repo.id);
      if (!commits || commits.length === 0) continue;

      const meta = repoMetadata.get(repo.id);
      const activity = {};

      // Issue counts
      try {
        const issues = await fetchRepoIssues(repo.owner, repo.repo, sinceISO);
        activity.issuesCreated = issues.created;
        activity.issuesClosed = issues.closed;
      } catch (e) {
        console.warn(`[orchestrator] Issue fetch failed for ${repo.owner}/${repo.repo}: ${e.message}`);
        activity.issuesCreated = '-';
        activity.issuesClosed = '-';
      }

      // Star/Fork growth via snapshots
      if (meta) {
        const prev = await db.getPreviousSnapshot(repo.id, today);
        activity.starDelta = prev ? (meta.stars - prev.stars) : null;
        activity.forkDelta = prev ? (meta.forks - prev.forks) : null;

        // Save current snapshot
        await db.saveReposnapshot(repo.id, meta.stars, meta.forks, meta.watchers);
      } else {
        activity.starDelta = null;
        activity.forkDelta = null;
      }

      repoActivity.set(repo.id, activity);
    }

    console.log(`[orchestrator] Activity data computed for ${repoActivity.size} repos`);

    // Step 6: AI summarize
    console.log('[orchestrator] Summarizing with AI...');
    const commitText = trimForAI(allRepos, commitsByRepo);
    const aiRaw = commitText ? await summarizeCommits(commitText, ws, we) : null;
    const parsedSummary = parseAISummary(aiRaw);

    // Step 7: Generate markdown
    console.log('[orchestrator] Generating report...');
    const { filePath, markdown } = generateReport({
      weekStart: ws, weekEnd: we,
      aiSummary: aiRaw,
      parsedSummary,
      repos: allRepos, commitsByRepo, discoveredRepos: trending,
      repoMetadata, repoActivity,
    });

    // Step 8: Update record
    await db.updateReport(reportId, {
      week_start: ws, week_end: we, file_path: filePath,
      title: `AI/LLM Weekly Report: ${ws} ~ ${we}`,
      summary: parsedSummary.overview || aiRaw, content: markdown,
      commit_count: totalCommits,
      repo_count: [...commitsByRepo.values()].filter(c => c.length > 0).length,
      status: 'completed', completed_at: new Date().toISOString(),
    });

    console.log(`[orchestrator] Report #${reportId} completed: ${filePath}`);
    return { reportId, filePath };
  } catch (e) {
    console.error('[orchestrator] Failed:', e.message);
    try {
      await db.updateReport(reportId, { status: 'failed', error_message: e.message });
    } catch (_) {}
    return null;
  }
}

module.exports = { runReportGeneration };
