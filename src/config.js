const path = require('path');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

module.exports = {
  // Database
  DB_HOST: 'localhost',
  DB_PORT: 5432,
  DB_USER: 'postgres',
  DB_PASSWORD: process.env.DB_PASSWORD || '',
  DB_NAME: 'weekly_report',

  // Server
  PORT: 8088,
  REPORT_DIR: path.join(__dirname, '..', 'reports'),

  // GitHub
  GITHUB_API_BASE: 'https://api.github.com',
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',

  // OpenRouter
  OPENROUTER_BASE: 'https://openrouter.ai/api/v1',
  AI_MODEL: 'nvidia/nemotron-3-super-120b-a12b:free',
  AI_TEMPERATURE: 0.3,
  AI_MAX_TOKENS: 4096,

  // OSS Insight
  OSSINSIGHT_BASE: 'https://api.ossinsight.io/v1/trends/repos',
  OSSINSIGHT_MIN_STARS: 10,
  OSSINSIGHT_MAX_ITEMS: 100,

  // Keywords for trending repo filtering
  AI_KEYWORDS: [
    'ai', 'llm', 'machine-learning', 'deep-learning', 'gpt', 'transformer',
    'rag', 'agent', 'langchain', 'embedding', 'vector', 'neural',
    'diffusion', 'text-to-image', 'stable-diffusion', 'whisper',
    'open-source', 'chatgpt', 'copilot', 'coding-assistant',
  ],

  // Scheduling
  CRON_EXPRESSION: '0 14 * * 6',

  // Output (may be overridden via CLI --format)
  OUTPUT_FORMATS: ['html', 'md', 'doc'],

  // Limits
  COMMIT_PER_PAGE: 30,
  COMMIT_TRIM_CHARS: 2000,
  REQUEST_DELAY_MS: 1000,
  REQUEST_DELAY_AUTH_MS: 200,

  // Repo Evolution
  EVO_MAX_TOTAL_REPOS: 20,
  EVO_INACTIVE_WEEKS: 2,

  // GitHub Search (fallback for OSS Insight)
  GITHUB_SEARCH_LANGUAGES: ['Python', 'TypeScript', 'JavaScript', 'Rust'],
  GITHUB_SEARCH_MAX_RESULTS: 30,
  GITHUB_SEARCH_MIN_STARS: 10,
};
