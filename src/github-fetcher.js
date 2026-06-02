const config = require('./config');

function authHeaders() {
  const h = { 'User-Agent': 'weekly-report', Accept: 'application/vnd.github+json' };
  if (config.GITHUB_TOKEN) {
    h.Authorization = `Bearer ${config.GITHUB_TOKEN}`;
  }
  return h;
}

function delay() {
  const ms = config.GITHUB_TOKEN ? config.REQUEST_DELAY_AUTH_MS : config.REQUEST_DELAY_MS;
  return new Promise(r => setTimeout(r, ms));
}

// Fetch full repo info (metadata + default_branch) from GET /repos/{owner}/{repo}
async function fetchRepoInfo(owner, repo) {
  const res = await fetch(`${config.GITHUB_API_BASE}/repos/${owner}/${repo}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch repo info for ${owner}/${repo}: ${res.status}`);
  const data = await res.json();
  return {
    default_branch: data.default_branch || 'main',
    description: data.description || '',
    stars: data.stargazers_count || 0,
    forks: data.forks_count || 0,
    watchers: data.subscribers_count || 0,
    created_at: data.created_at || '',
    updated_at: data.updated_at || '',
    language: data.language || '',
    license: data.license?.spdx_id || (data.license?.name || ''),
    topics: data.topics || [],
  };
}

// Legacy wrapper — still used by fetchAllCommits
async function resolveDefaultBranch(owner, repo) {
  const info = await fetchRepoInfo(owner, repo);
  return info.default_branch;
}

async function fetchRepoCommits(owner, repo, branch, sinceISO) {
  const url = `${config.GITHUB_API_BASE}/repos/${owner}/${repo}/commits` +
    `?sha=${encodeURIComponent(branch)}&since=${encodeURIComponent(sinceISO)}&per_page=${config.COMMIT_PER_PAGE}`;

  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    console.warn(`[github] ${owner}/${repo}: HTTP ${res.status}`);
    return [];
  }
  const data = await res.json();
  if (!Array.isArray(data)) return [];

  return data.map(c => ({
    sha: c.sha,
    message: (c.commit.message || '').split('\n')[0].slice(0, 200),
    author: c.commit.author?.name || c.author?.login || 'unknown',
    committed_at: c.commit.author?.date || c.commit.committer?.date,
    url: c.html_url,
  }));
}

async function fetchAllCommits(repos, sinceISO) {
  const results = new Map();

  for (const repo of repos) {
    let branch = repo.default_branch || 'main';
    try {
      branch = await resolveDefaultBranch(repo.owner, repo.repo);
    } catch (e) {
      console.warn(`[github] Skipping ${repo.owner}/${repo.repo}: ${e.message}`);
      continue;
    }
    await delay();

    try {
      const commits = await fetchRepoCommits(repo.owner, repo.repo, branch, sinceISO);
      if (commits.length > 0) {
        results.set(repo.id, commits);
      }
    } catch (e) {
      console.warn(`[github] Error fetching commits for ${repo.owner}/${repo.repo}: ${e.message}`);
    }
    await delay();
  }

  console.log(`[github] Fetched commits from ${results.size} repos`);
  return results;
}

// Fetch issue counts for the week using GitHub Search API
// Search API rate limit: 30 req/min (authenticated). We use 2.5s delay to stay safe.
async function fetchRepoIssues(owner, repo, sinceISO) {
  const sinceDate = sinceISO.slice(0, 10); // YYYY-MM-DD
  let created = 0;
  let closed = 0;

  const searchDelay = () => new Promise(r => setTimeout(r, 2500));

  try {
    // Issues created this week
    const createdQ = encodeURIComponent(`repo:${owner}/${repo} type:issue created:>=${sinceDate}`);
    const createdRes = await fetch(
      `${config.GITHUB_API_BASE}/search/issues?q=${createdQ}&per_page=1`,
      { headers: authHeaders() }
    );
    if (createdRes.ok) {
      const data = await createdRes.json();
      created = data.total_count || 0;
    } else if (createdRes.status === 403 || createdRes.status === 422) {
      // Rate limited or repo renamed/redirected — skip silently
    } else {
      console.warn(`[github] Issue search (created) failed for ${owner}/${repo}: ${createdRes.status}`);
    }
    await searchDelay();

    // Issues closed this week
    const closedQ = encodeURIComponent(`repo:${owner}/${repo} type:issue closed:>=${sinceDate}`);
    const closedRes = await fetch(
      `${config.GITHUB_API_BASE}/search/issues?q=${closedQ}&per_page=1`,
      { headers: authHeaders() }
    );
    if (closedRes.ok) {
      const data = await closedRes.json();
      closed = data.total_count || 0;
    } else if (closedRes.status === 403 || closedRes.status === 422) {
      // Rate limited or repo renamed/redirected — skip silently
    } else {
      console.warn(`[github] Issue search (closed) failed for ${owner}/${repo}: ${closedRes.status}`);
    }
  } catch (e) {
    console.warn(`[github] Issue search error for ${owner}/${repo}: ${e.message}`);
  }

  return { created, closed };
}

// Batch fetch repo metadata for all repos with commits
async function fetchAllRepoMetadata(repos, commitsByRepo) {
  const metadataMap = new Map();

  for (const repo of repos) {
    const commits = commitsByRepo.get(repo.id);
    if (!commits || commits.length === 0) continue;

    try {
      const info = await fetchRepoInfo(repo.owner, repo.repo);
      metadataMap.set(repo.id, info);
    } catch (e) {
      console.warn(`[github] Metadata fetch failed for ${repo.owner}/${repo.repo}: ${e.message}`);
    }
    await delay();
  }

  console.log(`[github] Fetched metadata for ${metadataMap.size} repos`);
  return metadataMap;
}

function trimForAI(repos, commitsByRepo) {
  const parts = [];
  for (const repo of repos) {
    const commits = commitsByRepo.get(repo.id);
    if (!commits || commits.length === 0) continue;
    let text = `### REPO: ${repo.owner}/${repo.repo}\n`;
    for (const c of commits) {
      text += `- [${c.sha.slice(0, 7)}] ${c.message} (${c.author}, ${c.committed_at})\n`;
    }
    if (text.length > config.COMMIT_TRIM_CHARS) {
      text = text.slice(0, config.COMMIT_TRIM_CHARS) + '\n...(truncated)';
    }
    parts.push(text);
  }
  return parts.join('\n');
}

module.exports = {
  fetchRepoInfo,
  resolveDefaultBranch,
  fetchRepoCommits,
  fetchAllCommits,
  fetchRepoIssues,
  fetchAllRepoMetadata,
  trimForAI,
};
