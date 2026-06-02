const config = require('./config');

const SYSTEM_PROMPT = [
  'You are a technical report writer specializing in AI/LLM open-source projects.',
  'Summarize the following weekly git commit data in Markdown format.',
  '',
  'OUTPUT FORMAT (follow exactly — use THREE hashes ### for all section headers):',
  '',
  '### OVERVIEW',
  'Write a short paragraph (2-4 sentences) summarizing overall trends across all repos this week.',
  '',
  '### REPO: owner/repo (use exactly THREE hashes + space + REPO: + owner/repo)',
  'For each repository, write 1-3 bullet points grouped by category (e.g. "关键特性", "性能优化", "Bug修复").',
  'Use bold for category labels: **Category**: description.',
  'Group related work together. Highlight new features, breaking changes, performance improvements, or security fixes.',
  '',
  'Keep the report professional and factual. Do not invent details not present in the commits.',
  'Respond in Chinese (简体中文).',
].join('\n');

async function summarizeCommits(commitText, weekStart, weekEnd) {
  const horizonEnvPath = '/root/.claude/projects/Horizon/.env';
  const envVars = {};
  try {
    const fs = require('fs');
    const envContent = fs.readFileSync(horizonEnvPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const eq = line.indexOf('=');
      if (eq > 0 && !line.trim().startsWith('#')) {
        const key = line.slice(0, eq).trim();
        const val = line.slice(eq + 1).trim();
        envVars[key] = val;
      }
    }
  } catch (e) {
    console.warn('[ai] Cannot read Horizon .env:', e.message);
    return null;
  }

  const apiKey = envVars.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'sk-ant-xxx') {
    console.warn('[ai] No valid OpenRouter API key found');
    return null;
  }

  const userPrompt = `Report period: ${weekStart} to ${weekEnd}\n\n${commitText}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${config.OPENROUTER_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:8088',
          'X-Title': 'Weekly Report Tool',
        },
        body: JSON.stringify({
          model: config.AI_MODEL,
          temperature: config.AI_TEMPERATURE,
          max_tokens: config.AI_MAX_TOKENS,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.warn(`[ai] OpenRouter HTTP ${res.status}: ${errText.slice(0, 200)}`);
        if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content || null;
    } catch (e) {
      console.warn(`[ai] Request error (attempt ${attempt}): ${e.message}`);
      if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
    }
  }

  return null;
}

// Parse structured AI output into overview + per-repo summaries
function parseAISummary(rawText) {
  if (!rawText) return { overview: '', repoSummaries: new Map() };

  // Extract OVERVIEW block (accept ## or ###)
  const overviewMatch = rawText.match(/#{2,3}\s*OVERVIEW\s*\n([\s\S]*?)(?=#{2,3}\s*REPO:|$)/i);
  const overview = overviewMatch ? overviewMatch[1].trim() : '';

  // Extract each REPO: owner/repo block (accept ## or ###)
  const repoSummaries = new Map();
  const repoPattern = /#{2,3}\s*REPO:\s*(\S+)\s*\n([\s\S]*?)(?=#{2,3}\s*REPO:|$)/gi;
  let match;
  while ((match = repoPattern.exec(rawText)) !== null) {
    const repoKey = match[1].trim();
    const summary = match[2].trim();
    repoSummaries.set(repoKey, summary);
  }

  // Fallback: if no structured output detected, treat entire text as overview
  if (repoSummaries.size === 0 && overview.length === 0) {
    return { overview: rawText.trim(), repoSummaries: new Map() };
  }

  console.log(`[ai] Parsed summary: overview + ${repoSummaries.size} repo summaries`);
  return { overview, repoSummaries };
}

module.exports = { summarizeCommits, parseAISummary };
