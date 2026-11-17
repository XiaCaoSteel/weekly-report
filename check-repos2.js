const { Pool } = require('pg');
// 改成你.env里面的PG配置
const pool = new Pool({
  host: '127.0.0.1',
  port: 5432,
  user: 'postgres',
  password: 'passok',
  database: 'passok'
});

(async ()=>{
  try {
    const result = await pool.query('SELECT id,owner,repo,source,status,"last_active_at" FROM repos;');
    console.log("repos表总行数：", result.rows.length);
    console.log("数据内容：", result.rows);
  } catch(err) {
    console.error("数据库查询异常：", err);
  } finally {
    await pool.end();
  }
})();
