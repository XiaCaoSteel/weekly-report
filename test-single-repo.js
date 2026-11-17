const { fetchRepoCommits, resolveDefaultBranch } = require('./src/github-fetcher');

(async ()=>{
  console.log("=== 测试 nestjs/nest ===");
  const branch = await resolveDefaultBranch("nestjs", "nest");
  console.log("默认分支：", branch);
  const commits = await fetchRepoCommits("nestjs", "nest", 7);
  console.log("近7天提交数量：", commits.length);
  if(commits.length>0) console.log("第一条：", commits[0]);
})();
