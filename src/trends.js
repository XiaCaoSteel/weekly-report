const config = require('./config');

// Keywords to monitor across repos, commits, and topics
const MONITOR_KEYWORDS = {
  AI: ['ai', 'llm', 'gpt', 'transformer', 'deep-learning', 'machine-learning', 'neural', 'agent', 'langchain', 'rag', 'embedding', 'copilot', 'chatgpt', 'generative'],
  Rust: ['rust', 'cargo', 'wasm', 'tokio', 'actix', 'bevy'],
  Security: ['security', 'cve', 'vulnerability', 'exploit', 'patch', 'crypto', 'auth', 'tls', 'ssl', 'oauth', 'sandbox', 'fuzzer'],
  DevOps: ['docker', 'kubernetes', 'k8s', 'ci', 'cd', 'terraform', 'ansible', 'prometheus', 'grafana', 'helm', 'serverless'],
  Database: ['database', 'sql', 'nosql', 'postgres', 'mysql', 'redis', 'mongodb', 'vector', 'embedding', 'storage'],
};

function computeTrends({ repos, commitsByRepo, repoActivity, repoMetadata }) {
  // ── 1. Trending: Star Growth (per monitored repos) ──
  const starGrowth = [];
  const commitVelocity = [];

  for (const repo of repos) {
    const commits = commitsByRepo.get(repo.id);
    if (!commits || commits.length === 0) continue;

    const activity = repoActivity.get(repo.id) || {};
    const meta = repoMetadata.get(repo.id) || {};

    starGrowth.push({
      owner: repo.owner,
      repo: repo.repo,
      language: meta.language || repo.language || '?',
      stars: meta.stars || 0,
      delta: typeof activity.starDelta === 'number' ? activity.starDelta : null,
    });

    commitVelocity.push({
      owner: repo.owner,
      repo: repo.repo,
      language: meta.language || repo.language || '?',
      commits: commits.length,
    });
  }

  starGrowth.sort((a, b) => (b.delta ?? -999) - (a.delta ?? -999));
  commitVelocity.sort((a, b) => b.commits - a.commits);

  // ── 2. Active Developers ──
  const authorMap = new Map();
  const techStackMap = new Map();

  for (const repo of repos) {
    const commits = commitsByRepo.get(repo.id);
    if (!commits) continue;
    const meta = repoMetadata.get(repo.id) || {};
    const lang = meta.language || repo.language || '?';

    for (const c of commits) {
      const author = c.author || 'unknown';
      if (!authorMap.has(author)) {
        authorMap.set(author, { commits: 0, repos: new Set(), langs: new Set() });
      }
      const a = authorMap.get(author);
      a.commits++;
      a.repos.add(`${repo.owner}/${repo.repo}`);
      a.langs.add(lang);
    }

    if (commits.length > 0) {
      techStackMap.set(lang, (techStackMap.get(lang) || 0) + commits.length);
    }
  }

  const authors = [...authorMap.entries()]
    .map(([name, d]) => ({ name, commits: d.commits, repos: d.repos.size, langs: [...d.langs].slice(0, 3) }))
    .sort((a, b) => b.commits - a.commits)
    .slice(0, 10);

  const languages = [...techStackMap.entries()]
    .map(([lang, count]) => ({ lang, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // ── 3. Keyword Monitoring ──
  const keywordHits = {};
  for (const [category, keywords] of Object.entries(MONITOR_KEYWORDS)) {
    const matches = [];
    for (const repo of repos) {
      const commits = commitsByRepo.get(repo.id);
      if (!commits || commits.length === 0) continue;
      const meta = repoMetadata.get(repo.id) || {};
      const text = [
        repo.owner + '/' + repo.repo,
        meta.description || repo.description || '',
        ...(meta.topics || []),
        ...commits.map(c => c.message),
      ].join(' ').toLowerCase();

      const hitKws = keywords.filter(kw => text.includes(kw));
      if (hitKws.length > 0) {
        matches.push({
          owner: repo.owner,
          repo: repo.repo,
          commits: commits.length,
          matched: hitKws.slice(0, 5),
        });
      }
    }
    matches.sort((a, b) => b.commits - a.commits);
    keywordHits[category] = matches.slice(0, 8);
  }

  return { starGrowth: starGrowth.slice(0, 10), commitVelocity: commitVelocity.slice(0, 10), authors, languages, keywordHits };
}

module.exports = { computeTrends };
