const config = require('./config');

async function discoverTrendingRepos() {
  const allRepos = [];
  const seen = new Set();

  const languages = ['All', 'Python', 'TypeScript', 'JavaScript', 'Rust'];

  for (const lang of languages) {
    const url = `${config.OSSINSIGHT_BASE}?period=past_7_days&language=${encodeURIComponent(lang)}&limit=50`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[ossinsight] HTTP ${res.status} for language: ${lang}`);
        continue;
      }
      const data = await res.json();
      const items = data.data || [];
      for (const item of items) {
        const name = item.repo_name || '';
        if (seen.has(name)) continue;
        const text = (name + ' ' + (item.description || '')).toLowerCase();
        const match = config.AI_KEYWORDS.some(kw => text.includes(kw));
        if (!match) continue;
        const stars = item.stars || 0;
        if (stars < config.OSSINSIGHT_MIN_STARS) continue;
        seen.add(name);
        const [owner, repo] = name.split('/');
        if (!owner || !repo) continue;
        allRepos.push({
          owner,
          repo,
          description: item.description || '',
          stars,
          language: item.language || lang,
        });
      }
    } catch (e) {
      console.warn(`[ossinsight] Error for ${lang}: ${e.message}`);
    }
  }

  allRepos.sort((a, b) => b.stars - a.stars);
  const top = allRepos.slice(0, config.OSSINSIGHT_MAX_ITEMS);
  console.log(`[ossinsight] Discovered ${top.length} trending repos`);
  return top;
}

module.exports = { discoverTrendingRepos };
