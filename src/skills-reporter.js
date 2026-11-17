const fs = require('fs');
const config = require('./config');
function buildPrompt(data) {
  // 兜底：不存在就为空数组，防止 undefined.slice
  const newSkills = data.newSkills || [];
  const updatedSkills = data.updatedSkills || [];
  const topNew = newSkills.slice(0, 30);
  const topUpdated = updatedSkills.slice(0, 20);
  return [
    '你是一位 AI Agent 技能生态分析师。基于以下 ClawHub 技能数据，生成一份中文 Markdown 周报。',
    '',
    '## 数据',
    `- 本周: ${data.overview.weekStart} ~ ${data.overview.weekEnd}`,
    `- 共采集: ${data.overview.totalCollected} 个技能`,
    `- 本周新增: ${data.overview.newCount} 个`,
    `- 本周更新: ${data.overview.updatedCount} 个`,
    `- 热门标签: ${(data.overview.topTags || []).join(', ')}`,
    '',
    '### 本周新增技能 (30 个样本)',
    JSON.stringify(topNew, null, 2),
    '',
    '### 本周更新技能 (20 个样本)',
    JSON.stringify(topUpdated, null, 2),
    '',
    '### 🔥本周热门精选 Top10（综合⭐stars ×5 + 📥downloads打分）',
    JSON.stringify(data.trending || [], null, 2),
    '',
    '### 标签分布 (前 30)',
    JSON.stringify(data.topTags || [], null, 2),
    '',
    '## 要求',
    '请生成以下结构的 Markdown 报告，用简体中文：',
    '> 重要规则：所有技能名称必须写成Markdown链接，格式 `[技能名称](https://clawhub.ai/{owner}/skills/{slug})`，owner使用对应技能owner字段，若owner为空，填unknown。slug使用对应技能的slug字段，支持点击直达页面。**不要写成 /skills/slug，必须带上owner用户名路径段。**',
    '',
    '1. **Overview** — 2-4 句中文总结本周技能生态动态',
    '2. **🔥 值得关注的新技能** — 从新增中挑 10-15 个最有价值的，每个带可点击链接、slug、一句话介绍',
    '3. **📈 重要更新** — 从更新中挑 10 个最重要的，说明更新了什么，技能名称带可点击链接',
    '4. **🏆 本周热门精选** — 从上面Top10热门列表挑选5-8个，重点说明价值、热度（stars/downloads），技能名称带可点击链接',
    '5. **📊 趋势分析** — 从标签分布分析热点领域，指出上升趋势',
    '6. **📋 统计摘要** — 列关键数字',
    '',
    '要求：专业、简洁、有洞察。不要啰嗦。',
  ].join('\n');
}
async function callLLM(prompt) {
  const { summarizeCommits } = require('./ai-summarizer');
  return summarizeCommits(prompt, '', '');
}
function generateFallbackMarkdown(data) {
  const newSkills = data.newSkills || [];
  const updatedSkills = data.updatedSkills || [];
  const trending = data.trending || [];
  const topTags = data.topTags || [];

  let md = '';
  md += `# Skill Weekly Report: ${data.overview.weekStart} ~ ${data.overview.weekEnd}\n\n`;
  md += `## Overview\n\n`;
  md += `本周 ClawHub 共采集到 ${data.overview.totalCollected} 个活跃技能，`;
  md += `其中 ${data.overview.newCount} 个为新发布，${data.overview.updatedCount} 个有更新。\n\n`;
  md += `热门标签: ${(data.overview.topTags || []).join(', ')}\n\n`;
  md += `---\n\n`;
  md += `## 🔥 值得关注的新技能\n\n`;
  for (const s of newSkills.slice(0, 15)) {
    const owner = s.owner || 'unknown';
    const linkUrl = `https://clawhub.ai/${owner}/skills/${s.slug}`;
    md += `### [${s.name}](${linkUrl}) (\`${s.slug}\`)\n\n`;
    md += `${s.summary || '_无简介_'}\n\n`;
    md += `- ⭐ ${s.stars} | ⬇ ${s.downloads} | 📦 ${s.installs || 0} installs\n\n`;
  }
  md += `---\n\n`;
  md += `## 📈 重要更新\n\n`;
  for (const s of updatedSkills.slice(0, 10)) {
    const owner = s.owner || 'unknown';
    const linkUrl = `https://clawhub.ai/${owner}/skills/${s.slug}`;
    md += `### [${s.name}](${linkUrl}) (\`${s.slug}\`)\n\n`;
    md += `${s.summary || '_无简介_'}\n\n`;
    md += `- ⭐ ${s.stars} | ⬇ ${s.downloads}\n\n`;
  }
  md += `---\n\n`;
  md += `## 🏆 本周热门精选 Top10\n\n`;
  for (const s of trending) {
    const owner = s.owner || 'unknown';
    const linkUrl = `https://clawhub.ai/${owner}/skills/${s.slug}`;
    md += `### [${s.name}](${linkUrl}) (\`${s.slug}\`)\n\n`;
    md += `${s.summary || '_无简介_'}\n\n`;
    md += `- ⭐ ${s.stars} | ⬇ ${s.downloads}\n\n`;
  }
  md += `---\n\n`;
  md += `## 📊 趋势分析\n\n`;
  md += `本周 Top 30 标签：\n\n`;
  for (const t of topTags) {
    md += `- \`${t.tag}\`: ${t.count} 次\n`;
  }
  md += '\n---\n\n';
  md += `## 📋 统计摘要\n\n`;
  md += `| 指标 | 值 |\n|---|---|\n`;
  md += `| 采集技能总数 | ${data.overview.totalCollected} |\n`;
  md += `| 本周新增 | ${data.overview.newCount} |\n`;
  md += `| 本周更新 | ${data.overview.updatedCount} |\n`;
  md += `| 热门精选Top5 | ${trending.slice(0, 5).map(t => {
    const o = t.owner || 'unknown';
    return `[${t.name}](https://clawhub.ai/${o}/skills/${t.slug})`;
  }).join(', ')} |\n`;
  md += `| 生成时间 | ${new Date().toISOString()} |\n`;
  return md;
}
// 简易md转html，和主项目保持一致
function mdToHtml(md) {
  let html = md
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^- (.*)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n/g, '<br>');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ClawHub Skill Weekly Report</title></head><body>${html}</body></html>`;
}
async function generateReport(data, formats = ['md','html','doc']) {
  const prompt = buildPrompt(data);
  let aiRaw = null;
  try {
    console.log('[reporter] Calling LLM...');
    aiRaw = await callLLM(prompt);
  } catch (e) {
    console.warn('[reporter] LLM call failed:', e.message);
  }
  let markdown;
  if (aiRaw && aiRaw.length > 200) {
    const chCount = (aiRaw.match(/[一-鿿]/g) || []).length;
    if (chCount > 20) {
      markdown = `# Skill Weekly Report: ${data.overview.weekStart} ~ ${data.overview.weekEnd}\n\n${aiRaw}`;
    } else {
      console.warn('[reporter] LLM output appears to be reasoning only, using fallback');
      markdown = generateFallbackMarkdown(data);
    }
  } else {
    console.log('[reporter] LLM unavailable, using data-driven fallback');
    markdown = generateFallbackMarkdown(data);
  }
  const baseName = `skills-${data.overview.weekEnd}_weekly_report`;
  const outputs = {};
  for(const fmt of formats) {
    let content, ext;
    switch(fmt) {
      case 'md':
        ext = 'md';
        content = markdown;
        break;
      case 'html':
        ext = 'html';
        content = mdToHtml(markdown);
        break;
      case 'doc':
        ext = 'doc';
        content = markdown;
        break;
      default:
        console.warn(`[reporter] unknown format ${fmt}, skip`);
        continue;
    }
    const filePath = `${config.REPORT_DIR}/${baseName}.${ext}`;
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`[reporter] Written: ${filePath}`);
    outputs[fmt] = filePath;
  }
  return outputs;
}
module.exports = { generateReport };
