const config = require('./config');

const SYSTEM_PROMPT = [
  'You are a technical report writer specializing in AI/LLM open-source projects.',
  'Summarize the following weekly git commit data. You MUST respond in Chinese (简体中文).',
  '',
  'CRITICAL — follow this EXACT output format. The markers ARE the parser:',
  '',
  '### OVERVIEW',
  'Write a short paragraph (2-4 sentences) summarizing overall trends across all repos this week.',
  '',
  '### REPO: owner/repo',
  'For each repository, write 1-3 bullet points grouped by category (e.g. **关键特性**, **性能优化**, **Bug修复**).',
  'Each bullet must start with "- " and category labels must use **bold**.',
  'Highlight new features, breaking changes, performance improvements, or security fixes.',
  '',
  'RULES:',
  '- The OVERVIEW marker MUST be exactly "### OVERVIEW" (uppercase English).',
  '- Each repo section MUST start with exactly "### REPO: owner/repo" (no Chinese, no variation).',
  '- Keep the report factual. Do not invent details not present in the commits.',
  '- Do NOT add extra sections or commentary before/after the requested format.',
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

  let overview = '';
  const repoSummaries = new Map();

  // Try to extract OVERVIEW block (accept ## or ###, English or Chinese header)
  const overviewMatch = rawText.match(/#{2,3}\s*(?:OVERVIEW|概览)\s*\n([\s\S]*?)(?=#{2,3}\s*(?:REPO:|[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)|$)/i);
  overview = overviewMatch ? overviewMatch[1].trim() : '';

  // Extract each REPO: owner/repo block (accept ## or ###)
  let repoPattern = /#{2,3}\s*REPO:\s*(\S+)\s*\n([\s\S]*?)(?=#{2,3}\s*(?:REPO:|\S+\/[a-zA-Z0-9_.-]+)|$)/gi;
  let match;
  while ((match = repoPattern.exec(rawText)) !== null) {
    repoSummaries.set(match[1].trim(), match[2].trim());
  }

  // Fallback: if no REPO: prefix found, try matching ### owner/repo patterns
  if (repoSummaries.size === 0) {
    const fallbackPattern = /#{2,3}\s+([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)\s*\n([\s\S]*?)(?=#{2,3}\s+(?:[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)|#{2,3}\s*(?:统计|STATS|$)|$)/gi;
    while ((match = fallbackPattern.exec(rawText)) !== null) {
      const key = match[1].trim();
      if (!repoSummaries.has(key)) {
        repoSummaries.set(key, match[2].trim());
      }
    }
  }

  // Final fallback: if no structured output detected, treat entire text as overview
  if (repoSummaries.size === 0 && overview.length === 0) {
    return { overview: rawText.trim(), repoSummaries: new Map() };
  }

  // If overview is empty but we have repos, try to get overview from text before first repo
  if (!overview && repoSummaries.size > 0) {
    const firstRepoIdx = rawText.search(/#{2,3}\s*\S+\/[a-zA-Z0-9_.-]+/);
    if (firstRepoIdx > 0) {
      const preText = rawText.slice(0, firstRepoIdx).trim();
      // Remove any leftover header markers
      overview = preText.replace(/^#{1,3}\s+\S.*\n?/gm, '').trim();
    }
  }

  console.log(`[ai] Parsed summary: overview + ${repoSummaries.size} repo summaries`);
  return { overview, repoSummaries };
}

module.exports = { summarizeCommits, parseAISummary };
