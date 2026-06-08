const { fetchWeeklySkills } = require('./skills-fetcher');
const { aggregateSkills } = require('./skills-aggregator');
const { generateReport } = require('./skills-reporter');

async function main() {
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setHours(23, 59, 59, 999);

  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);

  const weekStartMs = weekStart.getTime();
  const weekEndMs = weekEnd.getTime() + 1;

  console.log(`[skills] Week: ${weekStart.toISOString().slice(0, 10)} ~ ${now.toISOString().slice(0, 10)}`);

  // Step 1: Fetch
  console.log('[skills] Fetching skills from ClawHub...');
  const skills = await fetchWeeklySkills(weekStartMs, weekEndMs);

  if (skills.length === 0) {
    console.log('[skills] No skills found in this week range.');
    return;
  }

  // Step 2: Aggregate
  console.log('[skills] Aggregating...');
  const data = aggregateSkills(skills, weekStartMs, weekEndMs);

  // Step 3: Generate report
  console.log('[skills] Generating report...');
  const { filePath } = await generateReport(data);

  console.log(`[skills] Done: ${filePath}`);
}

if (require.main === module) {
  main().catch(e => {
    console.error('[skills] Fatal:', e.message);
    process.exit(1);
  });
}
