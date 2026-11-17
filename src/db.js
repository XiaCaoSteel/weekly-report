const { Pool } = require('pg');
const config = require('./config');

const rootPool = new Pool({
  host: config.DB_HOST,
  port: config.DB_PORT,
  user: config.DB_USER,
  password: config.DB_PASSWORD,
  database: 'postgres',
});

let pool;

async function initDB() {
  // Create database if not exists
  const { rows } = await rootPool.query(
    `SELECT 1 FROM pg_database WHERE datname = $1`,
    [config.DB_NAME]
  );
  if (rows.length === 0) {
    await rootPool.query(`CREATE DATABASE "${config.DB_NAME}"`);
    console.log(`[db] Created database: ${config.DB_NAME}`);
  }
  await rootPool.end();

  pool = new Pool({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
  });

  // Create tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS repos (
      id SERIAL PRIMARY KEY,
      owner VARCHAR(255) NOT NULL,
      repo VARCHAR(255) NOT NULL,
      default_branch VARCHAR(255) DEFAULT 'main',
      source VARCHAR(50) NOT NULL DEFAULT 'manual',
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      description TEXT,
      language VARCHAR(100),
      stars INTEGER DEFAULT 0,
      last_active_at TIMESTAMPTZ,
      added_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(owner, repo)
    )
  `);

  // Migrate existing tables — add columns if missing
  await pool.query(`ALTER TABLE repos ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'`);
  await pool.query(`ALTER TABLE repos ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS weekly_reports (
      id SERIAL PRIMARY KEY,
      week_start DATE NOT NULL,
      week_end DATE NOT NULL,
      file_path VARCHAR(500),
      title VARCHAR(500),
      commit_count INTEGER DEFAULT 0,
      repo_count INTEGER DEFAULT 0,
      summary TEXT,
      content TEXT,
      status VARCHAR(50) DEFAULT 'pending',
      error_message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS report_commits (
      id SERIAL PRIMARY KEY,
      report_id INTEGER REFERENCES weekly_reports(id) ON DELETE CASCADE,
      repo_id INTEGER REFERENCES repos(id) ON DELETE CASCADE,
      sha VARCHAR(40) NOT NULL,
      message TEXT NOT NULL,
      author VARCHAR(255),
      committed_at TIMESTAMPTZ NOT NULL,
      url VARCHAR(500),
      UNIQUE(report_id, sha)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS repo_snapshots (
      id SERIAL PRIMARY KEY,
      repo_id INTEGER REFERENCES repos(id) ON DELETE CASCADE,
      recorded_at DATE NOT NULL DEFAULT CURRENT_DATE,
      stars INTEGER DEFAULT 0,
      forks INTEGER DEFAULT 0,
      watchers INTEGER DEFAULT 0,
      UNIQUE(repo_id, recorded_at)
    )
  `);

  console.log('[db] Tables initialized');
}

// --- Reports ---

async function createReport(weekStart, weekEnd) {
  const { rows } = await pool.query(
    `INSERT INTO weekly_reports (week_start, week_end, status)
     VALUES ($1, $2, 'running') RETURNING id`,
    [weekStart, weekEnd]
  );
  return rows[0].id;
}

async function updateReport(id, fields) {
  const set = [];
  const vals = [];
  let i = 1;
  for (const [k, v] of Object.entries(fields)) {
    set.push(`${k} = $${i++}`);
    vals.push(v);
  }
  vals.push(id);
  await pool.query(
    `UPDATE weekly_reports SET ${set.join(', ')} WHERE id = $${i}`,
    vals
  );
}

async function getReports() {
  const { rows } = await pool.query(
    `SELECT id, week_start, week_end, title, commit_count, repo_count,
            status, error_message, created_at, completed_at
     FROM weekly_reports ORDER BY week_start DESC`
  );
  return rows;
}

async function getReportById(id) {
  const { rows } = await pool.query(
    `SELECT * FROM weekly_reports WHERE id = $1`, [id]
  );
  return rows[0] || null;
}

async function getReportCommits(reportId) {
  const { rows } = await pool.query(
    `SELECT rc.*, r.owner, r.repo
     FROM report_commits rc
     JOIN repos r ON rc.repo_id = r.id
     WHERE rc.report_id = $1
     ORDER BY r.owner, r.repo, rc.committed_at DESC`,
    [reportId]
  );
  return rows;
}

// --- Repos ---

async function getRepos(source) {
  let q = `SELECT * FROM repos`;
  const vals = [];
  if (source) {
    q += ` WHERE source = $1`;
    vals.push(source);
  }
  q += ` ORDER BY stars DESC`;
  const { rows } = await pool.query(q, vals);
  return rows;
}

async function getAllRepos() {
  return getRepos(null);
}

async function addRepo(owner, repo, defaultBranch, source, description, language, stars) {
  const { rows } = await pool.query(
    `INSERT INTO repos (owner, repo, default_branch, source, description, language, stars)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (owner, repo) DO UPDATE SET
       source = CASE WHEN repos.source = 'manual' THEN 'manual' ELSE EXCLUDED.source END,
       description = COALESCE(EXCLUDED.description, repos.description),
       language = COALESCE(EXCLUDED.language, repos.language),
       stars = COALESCE(EXCLUDED.stars, repos.stars),
       status = 'active',
       updated_at = NOW()
     RETURNING id`,
    [owner, repo, defaultBranch, source, description, language, stars]
  );
  return rows[0];
}

async function deleteRepo(id) {
  await pool.query(`DELETE FROM repos WHERE id = $1`, [id]);
}

async function deleteDiscoveredRepos() {
  await pool.query(`DELETE FROM repos WHERE source = 'discovered'`);
}

async function updateRepoBranch(id, branch) {
  await pool.query(
    `UPDATE repos SET default_branch = $1, updated_at = NOW() WHERE id = $2`,
    [branch, id]
  );
}

// --- Evolution ---

async function getActiveRepos() {
  const { rows } = await pool.query(
    `SELECT * FROM repos WHERE status = 'active' ORDER BY stars DESC`
  );
  return rows;
}

async function getRepoCounts() {
  const { rows } = await pool.query(
    `SELECT source, COUNT(*)::int AS count FROM repos WHERE status = 'active' GROUP BY source`
  );
  const result = { manual: 0, discovered: 0 };
  for (const row of rows) result[row.source] = row.count;
  return result;
}

async function markReposActive(repoIds) {
  if (!repoIds || repoIds.length === 0) return;
  await pool.query(
    `UPDATE repos SET status = 'active', last_active_at = NOW() WHERE id = ANY($1::int[])`,
    [repoIds]
  );
}

async function markReposInactive(repoIds) {
  if (!repoIds || repoIds.length === 0) return;
  await pool.query(
    `UPDATE repos SET status = 'inactive', updated_at = NOW() WHERE id = ANY($1::int[]) AND source = 'manual'`,
    [repoIds]
  );
}

async function deleteInactiveDiscovered() {
  const { rowCount } = await pool.query(
    `DELETE FROM repos WHERE source = 'discovered' AND status = 'inactive'`
  );
  return rowCount;
}

async function getInactiveRepos(weeksThreshold) {
  const { rows } = await pool.query(
    `SELECT id, owner, repo, source, last_active_at, added_at FROM repos
     WHERE status = 'active'
       AND (
         (last_active_at IS NOT NULL
          AND last_active_at < NOW() - ($1 || ' weeks')::INTERVAL)
         OR
         (last_active_at IS NULL
          AND added_at < NOW() - ($1 || ' weeks')::INTERVAL)
       )`,
    [String(weeksThreshold)]
  );
  return rows;
}

// --- Commits ---

async function insertCommits(reportId, commits) {
  if (commits.length === 0) return;
  const vals = [];
  const rows = [];
  let i = 1;
  for (const c of commits) {
    rows.push(`($${i}, $${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5}, $${i + 6})`);
    vals.push(reportId, c.repo_id, c.sha, c.message, c.author, c.committed_at, c.url);
    i += 7;
  }
  await pool.query(
    `INSERT INTO report_commits (report_id, repo_id, sha, message, author, committed_at, url)
     VALUES ${rows.join(', ')} ON CONFLICT (report_id, sha) DO NOTHING`,
    vals
  );
}

// --- Snapshots ---

async function saveReposnapshot(repoId, stars, forks, watchers) {
  await pool.query(
    `INSERT INTO repo_snapshots (repo_id, recorded_at, stars, forks, watchers)
     VALUES ($1, CURRENT_DATE, $2, $3, $4)
     ON CONFLICT (repo_id, recorded_at) DO UPDATE SET
       stars = EXCLUDED.stars,
       forks = EXCLUDED.forks,
       watchers = EXCLUDED.watchers`,
    [repoId, stars, forks, watchers]
  );
}

async function getPreviousSnapshot(repoId, beforeDate) {
  const { rows } = await pool.query(
    `SELECT stars, forks, watchers FROM repo_snapshots
     WHERE repo_id = $1 AND recorded_at < $2
     ORDER BY recorded_at DESC LIMIT 1`,
    [repoId, beforeDate]
  );
  return rows[0] || null;
}

async function listAllRepoFullNames() {
  const res = await pool.query('SELECT owner || \'/\' || repo AS fullname FROM repos');
  return res.rows.map(r => r.fullname);
}

module.exports = {
  initDB,
  createReport,
  updateReport,
  getReports,
  getReportById,
  getReportCommits,
  getRepos,
  getAllRepos,
  getActiveRepos,
  getRepoCounts,
  addRepo,
  deleteRepo,
  deleteDiscoveredRepos,
  deleteInactiveDiscovered,
  updateRepoBranch,
  markReposActive,
  markReposInactive,
  getInactiveRepos,
  insertCommits,
  saveReposnapshot,
  getPreviousSnapshot,
  listAllRepoFullNames,
};
