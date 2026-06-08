const { execFileSync } = require('child_process');

const EXPLORE_LIMIT = 200;

// Fetch skills from ClawHub whose updatedAt falls within [weekStartMs, weekEndMs).
// clawhub explore returns up to 200 items per call (no cursor pagination yet).
// Expects timestamps in milliseconds (JS epoch).
async function fetchWeeklySkills(weekStartMs, weekEndMs) {
  console.log(`[fetcher] Scanning ClawHub (${new Date(weekStartMs).toISOString().slice(0, 10)} ~ ${new Date(weekEndMs).toISOString().slice(0, 10)})`);

  const skills = [];

  // Try multiple sort orders to maximise coverage
  for (const sort of ['newest', 'trending', 'downloads']) {
    let stdout;
    try {
      stdout = require('child_process').execFileSync('clawhub',
        ['explore', '--limit', '200', '--sort', sort, '--json'],
        { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: 30000 }
      );
    } catch (e) {
      console.warn(`[fetcher] clawhub explore (sort=${sort}) failed:`, e.message.slice(0, 80));
      continue;
    }

    const jsonStart = stdout.indexOf('{');
    if (jsonStart < 0) { console.warn(`[fetcher] No JSON for sort=${sort}`); continue; }
    let data;
    try { data = JSON.parse(stdout.slice(jsonStart)); } catch (e) {
      console.warn(`[fetcher] JSON parse error for sort=${sort}`); continue;
    }

    const items = data.items || [];
    let added = 0;
    for (const item of items) {
      const ts = item.updatedAt || item.createdAt || 0;
      if (ts >= weekStartMs && ts < weekEndMs) {
        skills.push(item);
        added++;
      }
    }
    console.log(`[fetcher] sort=${sort}: ${items.length} items, ${added} in range`);
  }

  // Deduplicate by slug
  const seen = new Set();
  const unique = skills.filter(s => {
    if (seen.has(s.slug)) return false;
    seen.add(s.slug);
    return true;
  });

  console.log(`[fetcher] Done: ${unique.length} skills (deduped from ${skills.length})`);
  return unique;
}

module.exports = { fetchWeeklySkills };
