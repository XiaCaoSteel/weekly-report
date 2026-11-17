const fs = require('fs');
const path = require('path');
const config = require('./config');
const { fetchWeeklySkills } = require('./skills-fetcher');
const { aggregateSkills } = require('./skills-aggregator');
const { generateReport } = require('./skills-reporter');

async function main() {
  console.log('[skills-index] 开始执行技能周报生成');
  const now = new Date();
  const weekEnd = new Date(now);
  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0,0,0,0);
  weekEnd.setHours(23,59,59,999);

  const ws = weekStart.toISOString().slice(0,10);
  const we = weekEnd.toISOString().slice(0,10);
  const weekStartMs = weekStart.getTime();
  const weekEndMs = weekEnd.getTime() + 1;

  console.log(`[skills] Week: ${ws} ~ ${we}`);
  console.log('[skills] Fetching skills from ClawHub...');
  const rawSkills = await fetchWeeklySkills(weekStartMs, weekEndMs);
  console.log(`[debug] rawSkills count: ${rawSkills.length}`);

  const aggregated = aggregateSkills(rawSkills, weekStartMs, weekEndMs);
  console.log(`[debug] aggregated newSkills:`, aggregated.newSkills?.length);

  // ✅ 修复：直接传 aggregated，不要外层包装
  const outputs = await generateReport(aggregated, ['md']);
  console.log(`[debug] generateReport outputs:`, outputs);

  // 优先取返回的md路径
  let archiveFilePath;
  if(outputs && outputs.md){
    archiveFilePath = outputs.md;
  }else{
    // 兜底拼接文件名
    archiveFilePath = path.join(config.REPORT_DIR, `skills-${we}_weekly_report.md`);
  }
  const reportsDir = path.dirname(archiveFilePath);
  const fixedSkillPath = path.join(reportsDir, 'claw_skill_weekly_report.md');
  fs.copyFileSync(archiveFilePath, fixedSkillPath);
  console.log(`✅ 技能周报归档文件：${archiveFilePath}`);
  console.log(`✅ OpenClaw读取固定副本：${fixedSkillPath}`);
}

if(require.main === module){
  main().catch(err=>{
    console.error('[skills-index] Fatal:', err.stack);
    process.exit(1);
  })
}
