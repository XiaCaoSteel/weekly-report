const fs = require('fs');
const path = require('path');
const { createApp } = require('./web-server');
const { startScheduler } = require('./scheduler');
const { initDB } = require('./db');
const { runReportGeneration } = require('./orchestrator');
const config = require('./config');

function parseFormats(args) {
  for (let i = 2; i < args.length; i++) {
    if ((args[i] === '--format' || args[i + 1]) && args[i + 1]) {
      const val = args[i + 1];
      if (val === 'all') return ['html', 'md', 'doc'];
      const fmts = val.split(',').map(s => s.trim()).filter(Boolean);
      const valid = fmts.filter(f => ['html', 'md', 'doc'].includes(f));
      if (valid.length === 0) {
        console.warn(`[init] Invalid format: "${val}". Valid: html, md, doc, all`);
      }
      return valid.length > 0 ? valid : config.OUTPUT_FORMATS;
    }
  }
  return null; // not specified
}

// 新增：一次性执行周报任务函数
async function runReportOnce() {
  console.log('[run-report] 命令行模式，跳过web服务、scheduler');
  // 强制只输出md
  config.OUTPUT_FORMATS = ['html','md'];
  console.log(`[run-report] Formats: ${config.OUTPUT_FORMATS.join(', ')}`);
  console.log('[run-report] Initializing database...');
  await initDB();

  // 和 orchestrator 完全一致的日期逻辑
  const weekEnd = new Date();
  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekStart.getDate() - 7);
  // ws = weekStart, we = weekEnd；文件名用 we
  const ws = weekStart.toISOString().slice(0, 10);
  const we = weekEnd.toISOString().slice(0, 10);

  console.log(`[run-report] week range: ${ws} ~ ${we}`);

  // 执行周报生成流程
  await runReportGeneration(config.OUTPUT_FORMATS);

  // 重点：文件名使用 weekEnd (we)，和report-generator保持一致
  const archiveFilePath = path.join(__dirname, '../reports', `${we}_weekly_report.md`);
  const reportsDir = path.dirname(archiveFilePath);
  const fixedGithubPath = path.join(reportsDir, 'github_weekly_report.md');

  // 复制一份为固定文件名，供OpenClaw读取
  fs.copyFileSync(archiveFilePath, fixedGithubPath);

  console.log(`✅ 归档文件（永久保存）：${archiveFilePath}`);
  console.log(`✅ OpenClaw读取固定副本：${fixedGithubPath}`);
}

// Parse CLI args; apply to config so all modules see it
const args = process.argv.slice(2);
const isRunReport = args.includes('run-report');
const cliFormats = parseFormats(args);
if (cliFormats && !isRunReport) {
  config.OUTPUT_FORMATS = cliFormats;
}

async function main() {
  console.log(`[init] Formats: ${config.OUTPUT_FORMATS.join(', ')}`);
  console.log('[init] Initializing database...');
  await initDB();
  const app = createApp();
  app.listen(config.PORT, () => {
    console.log(`[server] Listening on http://localhost:${config.PORT}`);
  });
  startScheduler();
}

if (require.main === module) {
  if (isRunReport) {
    runReportOnce().catch(e => {
      console.error('[run-report] Fatal:', e.message);
      process.exit(1);
    });
  } else {
    main().catch(e => {
      console.error('[init] Fatal:', e.message);
      process.exit(1);
    });
  }
}
