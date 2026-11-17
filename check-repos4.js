const config = require('./src/config');
const { Pool } = require('pg');

const pool = new Pool({
  host: config.DB_HOST,
  port: config.DB_PORT,
  user: config.DB_USER,
  password: config.DB_PASSWORD,
  database: config.DB_NAME
});

(async ()=>{
  try {
    const res = await pool.query('SELECT id,owner,repo,source,status,"last_active_at" FROM repos;');
    console.log("✅ repos表总行数：", res.rows.length);
    console.log("📋 数据：", res.rows);
  } catch(e) {
    console.error("❌ 查询失败：", e);
  } finally {
    await pool.end();
  }
})();
