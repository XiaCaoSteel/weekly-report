const db = require('./src/db');

(async function main() {
  try {
    await db.initDB();
    const res = await db.pool.query('SELECT * FROM repos;');
    console.log('repos表行数：', res.rows.length);
    console.log('数据：', res.rows);
  } catch(e) {
    console.error('查询失败', e);
  } finally {
    await db.pool.end();
  }
})();
