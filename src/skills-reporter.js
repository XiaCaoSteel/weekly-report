const fs = require('fs');
const config = require('./config');

function buildPrompt(data) {
  const topNew = data.newSkills.slice(0, 30);
  const topUpdated = data.updatedSkills.slice(0, 20);

  return [
    '你是一位 AI Agent 技能生态分析师。基于以下 ClawHub 技能数据，生成一份中文 Markdown 周报。',
    '',
    '## 数据',
    `- 本周: ${data.overview.weekStart} ~ ${data.overview.weekEnd}`,
    `- 共采集: ${data.overview.totalCollected} 个技能`,
    `- 本周新增: ${data.overview.newCount} 个`,
    `- 本周更新: ${data.overview.updatedCount} 个`,
    `- 热门标签: ${data.overview.topTags.join(', ')}`,
    '',
    '### 本周新增技能 (30 个样本)',
    JSON.stringify(topNew, null, 2),
    '',
    '### 本周更新技能 (20 个样本)',
    JSON.stringify(topUpdated, null, 2),
    '',
    '### Trending (前 20)',
    JSON.stringify(data.trending, null, 2),
    '',
    '### 标签分布 (前 30)',
    JSON.stringify(data.topTags, null, 2),
    '',
    '## 要求',
    '请生成以下结构的 Markdown 报告，用简体中文：',
    '',
    '1. **Overview** — 2-4 句中文总结本周技能生态动态',
    '2. **🔥 值得关注的新技能** — 从新增中挑 10-15 个最有价值的，每个带 slug、一句话介绍',
    '3. **📈 重要更新** — 从更新中挑 10 个最重要的，说明更新了什么',
    '4. **📊 趋势分析** — 从标签分布分析热点领域，指出上升趋势',
    '5. **📋 统计摘要** — 列关键数字',
    '',
    '要求：专业、简洁、有洞察。不要啰嗦。',
  ].join('\n');
}

async function callLLM(prompt) {
  // Reuse the existing OpenRouter summarizer
  const { summarizeCommits } = require('./ai-summarizer');
  return summarizeCommits(prompt, '', '');
}

function generateFallbackMarkdown(data) {
  let md = '';
  md += `# Skill Weekly Report: ${data.overview.weekStart} ~ ${data.overview.weekEnd}\n\n`;

  md += `## Overview\n\n`;
  md += `本周 ClawHub 共采集到 ${data.overview.totalCollected} 个活跃技能，`;
  md += `其中 ${data.overview.newCount} 个为新发布，${data.overview.updatedCount} 个有更新。\n\n`;
  md += `热门标签: ${data.overview.topTags.join(', ')}\n\n`;
  md += `---\n\n`;

  md += `## 🔥 值得关注的新技能\n\n`;
  for (const s of data.newSkills.slice(0, 15)) {
    md += `### ${s.name} (\`${s.slug}\`)\n\n`;
    md += `${s.summary || '_无简介_'}\n\n`;
    md += `- ⭐ ${s.stars} | ⬇ ${s.downloads} | 📦 ${s.installs} installs\n\n`;
  }

  md += `---\n\n`;
  md += `## 📈 重要更新\n\n`;
  for (const s of data.updatedSkills.slice(0, 10)) {
    md += `### ${s.name} (\`${s.slug}\`)\n\n`;
    md += `${s.summary || '_无简介_'}\n\n`;
    md += `- ⭐ ${s.stars} | ⬇ ${s.downloads}\n\n`;
  }

  md += `---\n\n`;
  md += `## 📊 趋势分析\n\n`;
  md += `本周 Top 30 标签：\n\n`;
  for (const t of data.topTags) {
    md += `- \`${t.tag}\`: ${t.count} 次\n`;
  }
  md += '\n---\n\n';

  md += `## 📋 统计摘要\n\n`;
  md += `| 指标 | 值 |\n|---|---|\n`;
  md += `| 采集技能总数 | ${data.overview.totalCollected} |\n`;
  md += `| 本周新增 | ${data.overview.newCount} |\n`;
  md += `| 本周更新 | ${data.overview.updatedCount} |\n`;
  md += `| Trending Top5 | ${data.trending.slice(0, 5).map(t => t.slug).join(', ')} |\n`;
  md += `| 生成时间 | ${new Date().toISOString()} |\n`;

  return md;
}

async function generateReport(data) {
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
    // Check it's not just reasoning
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

  const filename = `skills-${data.overview.weekEnd}_weekly_report.md`;
  const filePath = `${config.REPORT_DIR}/${filename}`;
  fs.writeFileSync(filePath, markdown, 'utf-8');
  console.log(`[reporter] Written: ${filePath}`);

  return { filePath, markdown };
}

module.exports = { generateReport };
