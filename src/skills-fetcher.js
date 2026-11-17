const { execFileSync } = require('child_process');
const EXPLORE_LIMIT = 100;
// Fetch skills from ClawHub whose updatedAt falls within [weekStartMs, weekEndMs).
// clawhub explore returns up to 200 items per call (no cursor pagination yet).
// Expects timestamps in milliseconds (JS epoch).

// 辅助函数：抢救截断JSON，尽可能解析已输出的数组内容
function safeParsePartialJson(rawStr) {
  try {
    return JSON.parse(rawStr);
  } catch (e) {
    // 找到最后一个完整item，补全数组
    const lastComplete = rawStr.lastIndexOf('},');
    if (lastComplete > 0) {
      const repaired = rawStr.slice(0, lastComplete + 1) + ']}}';
      try {
        return JSON.parse(repaired);
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function fetchWeeklySkills(weekStartMs, weekEndMs) {
  console.log(`[fetcher] Scanning ClawHub (${new Date(weekStartMs).toISOString().slice(0, 10)} ~ ${new Date(weekEndMs).toISOString().slice(0, 10)})`);
  const skills = [];
  // Try multiple sort orders to maximise coverage
  for (const sort of ['newest', 'updated']) {
    let stdout = '';
    try {
      stdout = execFileSync('clawhub',
        ['explore', '--limit', '100', '--sort', sort, '--json'],
        { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: 30000 }
      );
    } catch (e) {
      // CLI报错时，取出已经输出的stdout，不再直接continue跳过
      stdout = e.stdout || '';
      console.warn(`[fetcher] clawhub explore (sort=${sort}) exited with error, trying to parse partial stdout:`, e.message.slice(0, 80));
    }

    const jsonStart = stdout.indexOf('{');
    if (jsonStart < 0) {
      console.warn(`[fetcher] No JSON for sort=${sort}`);
      continue;
    }
    const jsonRaw = stdout.slice(jsonStart);
    let data;
    try {
      data = JSON.parse(jsonRaw);
    } catch (e) {
      console.warn(`[fetcher] Full JSON parse failed for sort=${sort}, attempt partial recovery`);
      data = safeParsePartialJson(jsonRaw);
      if (!data) {
        console.warn(`[fetcher] Partial recovery also failed for sort=${sort}`);
        continue;
      }
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
