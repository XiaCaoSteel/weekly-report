const config = require('./config');

function authHeaders() {
  const h = { 'User-Agent': 'weekly-report', Accept: 'application/vnd.github+json' };
  if (config.GITHUB_TOKEN) {
    h.Authorization = `Bearer ${config.GITHUB_TOKEN}`;
  }
  return h;
}

function delay() {
  const ms = config.GITHUB_TOKEN ? config.REQUEST_DELAY_AUTH_MS : config.REQUEST_DELAY_MS;
  return new Promise(r => setTimeout(r, ms));
}

async function searchTrendingRepos() {
  const allRepos = [];
  const seen = new Set();

  // Window: repos pushed to in the last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const dateStr = sevenDaysAgo.toISOString().slice(0, 10);

  for (const lang of config.GITHUB_SEARCH_LANGUAGES) {
    await delay();

    const q = `language:${lang} stars:>${config.GITHUB_SEARCH_MIN_STARS} pushed:>${dateStr}`;
    const url = `${config.GITHUB_API_BASE}/search/repositories` +
      `?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${config.GITHUB_SEARCH_MAX_RESULTS}`;

    try {
      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) {
        console.warn(`[github-search] HTTP ${res.status} for ${lang}`);
        continue;
      }
      const data = await res.json();
      const items = data.items || [];

      for (const item of items) {
        const name = item.full_name || '';
        if (seen.has(name)) continue;

        const text = (name + ' ' + (item.description || '')).toLowerCase();
        const match = config.AI_KEYWORDS.some(kw => text.includes(kw));
        if (!match) continue;

        seen.add(name);
        const [owner, repo] = name.split('/');
        if (!owner || !repo) continue;

        allRepos.push({
          owner,
          repo,
          description: item.description || '',
          stars: item.stargazers_count || 0,
          language: item.language || lang,
        });
      }
    } catch (e) {
      console.warn(`[github-search] Error for ${lang}: ${e.message}`);
    }
  }

  allRepos.sort((a, b) => b.stars - a.stars);
  console.log(`[github-search] Found ${allRepos.length} repos`);
  return allRepos;
}

module.exports = { searchTrendingRepos };
