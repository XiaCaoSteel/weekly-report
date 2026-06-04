const cron = require('node-cron');
const config = require('./config');
const { runReportGeneration } = require('./orchestrator');

function startScheduler() {
  cron.schedule(config.CRON_EXPRESSION, async () => {
    console.log('[scheduler] Triggered weekly report generation');
    try {
      const result = await runReportGeneration(config.OUTPUT_FORMATS);
      if (result) {
        console.log(`[scheduler] Report: ${result.filePath}`);
      }
    } catch (e) {
      console.error('[scheduler] Error:', e.message);
    }
  });

  console.log(`[scheduler] Scheduled: ${config.CRON_EXPRESSION} (Saturday 2PM)`);
}

module.exports = { startScheduler };
