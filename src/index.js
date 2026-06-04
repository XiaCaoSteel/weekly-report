const { createApp } = require('./web-server');
const { startScheduler } = require('./scheduler');
const { initDB } = require('./db');
const config = require('./config');

function parseFormats(args) {
  for (let i = 2; i < args.length; i++) {
    if ((args[i] === '--format' || args[i] === '-f') && args[i + 1]) {
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

// Parse CLI args; apply to config so all modules see it
const cliFormats = parseFormats(process.argv);
if (cliFormats) {
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
  main().catch(e => {
    console.error('[init] Fatal:', e.message);
    process.exit(1);
  });
}
