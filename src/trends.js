const config = require('./config');

// Keywords to monitor across repos, commits, and topics
const MONITOR_KEYWORDS = {
  AI:     ['ai', 'llm', 'gpt', 'transformer', 'deep-learning', 'machine-learning', 'neural', 'agent', 'langchain', 'rag', 'embedding', 'copilot', 'chatgpt', 'generative', 'reasoning', 'inference'],
  Rust:   ['rust', 'cargo', 'wasm', 'tokio', 'actix', 'bevy'],
  Security: ['security', 'cve', 'vulnerability', 'exploit', 'patch', 'crypto', 'auth', 'tls', 'ssl', 'oauth', 'sandbox'],
  DevOps: ['docker', 'kubernetes', 'k8s', 'ci/cd', 'terraform', 'ansible', 'prometheus', 'grafana', 'helm', 'serverless', 'devops'],
  Database: ['database', 'sql', 'nosql', 'postgres', 'mysql', 'redis', 'mongodb', 'vector', 'storage'],
  Frontend: ['react', 'vue', 'angular', 'svelte', 'css', 'tailwind', 'component', 'ui/', 'browser', 'dom'],
};

function computeTrends({ repos, commitsByRepo, repoActivity, repoMetadata }) {
  // ── 1. Trending: Star Growth ──
  const starGrowth = [];
  const commitVelocity = [];

  for (const repo of repos) {
    const commits = commitsByRepo.get(repo.id);
    if (!commits || commits.length === 0) continue;
    const activity = repoActivity.get(repo.id) || {};
    const meta = repoMetadata.get(repo.id) || {};

    starGrowth.push({
      owner: repo.owner, repo: repo.repo,
      language: meta.language || repo.language || '?',
      stars: meta.stars || 0,
      delta: typeof activity.starDelta === 'number' ? activity.starDelta : null,
    });
    commitVelocity.push({
      owner: repo.owner, repo: repo.repo,
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
      if (!authorMap.has(author)) authorMap.set(author, { commits: 0, repos: new Set(), langs: new Set() });
      const a = authorMap.get(author);
      a.commits++;
      a.repos.add(`${repo.owner}/${repo.repo}`);
      a.langs.add(lang);
    }
    if (commits.length > 0) techStackMap.set(lang, (techStackMap.get(lang) || 0) + commits.length);
  }
  const authors = [...authorMap.entries()]
    .map(([name, d]) => ({ name, commits: d.commits, repos: d.repos.size, langs: [...d.langs].slice(0, 3) }))
    .sort((a, b) => b.commits - a.commits).slice(0, 10);
  const languages = [...techStackMap.entries()]
    .map(([lang, count]) => ({ lang, count }))
    .sort((a, b) => b.count - a.count).slice(0, 8);

  // ── 3. Keyword Monitoring — deep analysis ──

  // 3a. Build global keyword frequency from commit messages + repo metadata
  const kwFreq = new Map(); // keyword → { totalCommits, repos: Set, samples: [] }
  for (const [cat, kws] of Object.entries(MONITOR_KEYWORDS)) {
    for (const kw of kws) {
      if (!kwFreq.has(kw)) kwFreq.set(kw, { category: cat, count: 0, repos: new Set(), samples: [] });
    }
  }

  for (const repo of repos) {
    const commits = commitsByRepo.get(repo.id);
    if (!commits || commits.length === 0) continue;
    const meta = repoMetadata.get(repo.id) || {};
    const topics = (meta.topics || []).join(' ').toLowerCase();

    for (const c of commits) {
      const msg = c.message.toLowerCase();
      const combined = msg + ' ' + topics;
      for (const [kw, data] of kwFreq) {
        if (combined.includes(kw)) {
          data.count++;
          data.repos.add(`${repo.owner}/${repo.repo}`);
          if (data.samples.length < 3) data.samples.push(c.message.slice(0, 120));
        }
      }
    }
  }

  // 3b. Hot keywords — ranked by commit frequency
  const hotKeywords = [...kwFreq.entries()]
    .map(([kw, d]) => ({ keyword: kw, category: d.category, commits: d.count, repos: d.repos.size, samples: d.samples }))
    .filter(d => d.commits > 0)
    .sort((a, b) => b.commits - a.commits)
    .slice(0, 20);

  // 3c. Category summaries
  const keywordByCategory = {};
  for (const [cat] of Object.entries(MONITOR_KEYWORDS)) {
    const catKws = hotKeywords.filter(k => k.category === cat);
    if (catKws.length === 0) continue;
    const totalCommits = catKws.reduce((s, k) => s + k.commits, 0);
    const totalRepos = new Set(catKws.flatMap(k => [...(kwFreq.get(k.keyword)?.repos || [])])).size;
    const topKws = catKws.slice(0, 5).map(k => k.keyword);
    keywordByCategory[cat] = {
      totalCommits, totalRepos, topKeywords: topKws,
      details: catKws.map(k => ({
        keyword: k.keyword, commits: k.commits, repos: k.repos,
        sample: k.samples[0] || '',
      })),
    };
  }

  // 3d. Per-repo keyword profile — which keywords each repo hits
  const repoKeywords = new Map();
  for (const repo of repos) {
    const commits = commitsByRepo.get(repo.id);
    if (!commits || commits.length === 0) continue;
    const meta = repoMetadata.get(repo.id) || {};
    const topics = (meta.topics || []).join(' ').toLowerCase();
    const allMsg = commits.map(c => c.message.toLowerCase()).join(' ');
    const combined = allMsg + ' ' + topics;

    const hits = [];
    for (const [kw, data] of kwFreq) {
      if (data.repos.has(`${repo.owner}/${repo.repo}`)) {
        hits.push({ keyword: kw, category: data.category });
      }
    }
    if (hits.length > 0) {
      repoKeywords.set(`${repo.owner}/${repo.repo}`, { commits: commits.length, hits });
    }
  }

  return {
    starGrowth: starGrowth.slice(0, 10),
    commitVelocity: commitVelocity.slice(0, 10),
    authors,
    languages,
    hotKeywords,
    keywordByCategory,
    repoKeywords,
  };
}

module.exports = { computeTrends };
