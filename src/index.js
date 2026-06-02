const { createApp } = require('./web-server');
const { startScheduler } = require('./scheduler');
const { initDB } = require('./db');
const config = require('./config');

async function main() {
  console.log('[init] Initializing database...');
  await initDB();

  const app = createApp();
  app.listen(config.PORT, () => {
    console.log(`[server] Listening on http://localhost:${config.PORT}`);
  });

  startScheduler();
}

main().catch(e => {
  console.error('[init] Fatal:', e.message);
  process.exit(1);
});
