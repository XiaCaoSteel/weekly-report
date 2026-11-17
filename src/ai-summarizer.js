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
  // ========== 修复：改为读取 OPENROUTER_API_KEY ==========
  const apiKey = process.env.OPENAI_API_KEY;
  console.log('[ai] apiKey loaded, length:', apiKey ? apiKey.length : 0);
  if (!apiKey || apiKey === 'sk-ant-xxx') {
    console.warn('[ai] No valid OpenRouter API key found');
    return null;
  }
  const userPrompt = `Report period: ${weekStart} to ${weekEnd}\n\n${commitText}`;
  console.log('[ai] Starting AI call, model:', config.AI_MODEL, 'commitText length:', commitText.length);
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
      const content = data.choices?.[0]?.message?.content || null;
      console.log('[ai] AI raw response preview:', content ? content.slice(0,400) : 'EMPTY');
      return content;
    } catch (e) {
      console.warn(`[ai] Request error (attempt ${attempt}): ${e.message}`);
      if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
    }
  }
  return null;
}

// Parse structured AI output into overview + per-repo summaries
function parseAISummary(rawText) {
  console.log('[ai] parseAISummary rawText preview:', rawText ? rawText.slice(0,400) : 'NULL');
  if (!rawText) return { overview: '', repoSummaries: new Map() };
  // Strip English reasoning preamble — nemotron outputs chain-of-thought before the actual summary.
  // Find the last occurrence of the OVERVIEW marker, which is the real summary start.
  const overviewMarker = rawText.match(/^#{2,3}\s*(?:OVERVIEW|概览)\s*$/m);
  if (overviewMarker) {
    const idx = overviewMarker.index;
    if (idx > 0 && (rawText.slice(0, idx).split('\n').filter(Boolean).length > 3)) {
      const pre = rawText.slice(0, idx);
      // Only strip if preamble looks like reasoning (mostly English, contains reasoning words)
      const enCount = (pre.match(/[a-zA-Z]/g) || []).length;
      const chCount = (pre.match(/[一-鿿]/g) || []).length;
      if (enCount > chCount * 2 || /\b(we are given|let me|steps?[:.]|let's|i need|break down)/i.test(pre)) {
        rawText = rawText.slice(idx);
        console.log('[ai] Stripped reasoning preamble, keeping summary');
      }
    }
  } else if (/\b(we are given|let me explain|steps?[:.]|i need to)/i.test(rawText.slice(0, 500))) {
    // No OVERVIEW marker at all, and text starts with reasoning — likely full reasoning output
    console.warn('[ai] Output appears to be reasoning only, treating as empty');
    return { overview: '', repoSummaries: new Map() };
  }
  let overview = '';
  const repoSummaries = new Map();
  // Extract OVERVIEW block (accept ## or ###, English or Chinese header)
  const overviewMatch = rawText.match(/#{2,3}\s*(?:OVERVIEW|概览)\s*\n([\s\S]*?)(?=#{2,3}\s*(?:REPO:|[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)|#{2,3}\s*(?:统计|STATS|$)|$)/i);
  overview = overviewMatch ? overviewMatch[1].trim() : '';
  // Verify overview isn't just English reasoning
  if (overview) {
    const chCount = (overview.match(/[一-鿿]/g) || []).length;
    const enCount = (overview.match(/[a-zA-Z]/g) || []).length;
    if (chCount === 0 && enCount > 50 && /\b(we|steps|let's)\b/i.test(overview.slice(0, 100))) {
      overview = ''; // reasoning text, discard
    }
  }
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
  console.log(`[ai] Parsed summary: overview=${overview.length} chars, ${repoSummaries.size} repo summaries`);
  return { overview, repoSummaries };
}

module.exports = { summarizeCommits, parseAISummary };
