# GitHub Weekly Report Tool — SPEC

## Overview

An internal tool that automatically generates weekly GitHub commit reports by tracking active open-source repositories, fetching their commit data, summarizing via OpenRouter AI, and presenting results as HTML pages served through a simple web UI.

The system self-evolves: inactive repos are pruned, trending repos are auto-discovered, maintaining a stable ~20 repos.

---

## Users & Scope

- **Target users**: Internal software development team, ≤100 people
- **Use case**: Stay informed about activity across ~20 active AI/LLM open-source repositories each week
- **Purely read-only**: no manual editing, no comments, no collaboration features

---

## Functional Requirements

### 1. Repository Management — Self-Evolving

- **Manually configured repos**: stored in database, managed via web UI (add / remove). Never fully deleted — marked as `inactive` when idle.
- **Auto-discovered trending repos**: fetched from OSS Insight API, filtered by AI/LLM keywords. GitHub Search API as fallback.
- **Evolution strategy** (runs every report cycle):
  1. Count active repos by source (manual / discovered)
  2. Target discovered = max(0, 20 - manual-active). If manual repos fill all 20 slots, purge discovered.
  3. Repos with 0 commits for 2 consecutive weeks are auto-pruned:
     - **Manual repos** → status marked `inactive` (preserved as annotation, not deleted)
     - **Discovered repos** → deleted
  4. Fill empty slots by discovering trending repos (OSS Insight → GitHub Search fallback)
  5. After commit fetching, repos with ≥1 commit get `last_active_at` refreshed
- Config: `EVO_MAX_TOTAL_REPOS: 20`, `EVO_INACTIVE_WEEKS: 2`

### 2. Commit Fetching

- Default branch only (auto-detected per repo)
- Past 7 days of commits
- Limit to ~2KB of commit data per repo (for AI context)
- Per-page limit: 30 commits per repo from GitHub API
- Rate-limit aware: 200ms delay with GITHUB_TOKEN, 1s without

### 3. AI Summarization

- Provider: OpenRouter
- Model: `nvidia/nemotron-3-super-120b-a12b:free` (free tier, 1M context)
- API key: loaded from `/root/.claude/projects/Horizon/.env`
- Input: commit messages trimmed to fit model context
- Output: structured markdown (### OVERVIEW + ### REPO: owner/repo)
- Fallback: if AI fails (rate limit / error), reports use data-driven summary:
  - "本周共追踪 X 个仓库，其中 Y 个有新提交，累计 Z 次提交。最活跃的仓库：..."

### 4. Report Generation

- Format: HTML file (semantic HTML with inline CSS)
- Sections:
  - Overview (AI-generated or data-driven fallback)
  - Repo Highlights (per-repo cards: 项目简介, 基础信息, 活动, 概述)
  - Tracked Repositories (full commit list)
  - Newly Discovered Trending Repos table (when applicable)
  - Statistics (repo count, commit count, discovered count, timestamp)
- Saved to: `reports/{YYYY-MM-DD}_weekly_report.html`
- Title: "GitHub Weekly Report"

### 5. Scheduling

- **Auto**: Saturday 2:00 PM server local time (cron: `0 14 * * 6`)
- **Manual**: Web UI trigger button (`POST /trigger`)

### 6. Web UI

- Port: **8088**
- Pages:
  - `/` — Report history list (date range, repo count, commit count, status)
  - `/reports/:id` — Single report view (native HTML, no markdown conversion)
  - `/repos` — Repo management (list all with Source/Status/Last Active, add, delete manual repos)
- Server-side HTML rendering; no client-side JavaScript
- Minimal inline CSS; no CSS framework
- No authentication

### 7. Historical Reports

- All reports persisted in database and on disk
- Web UI allows browsing all past reports

---

## Evolution Strategy (Summary)

```
每周触发 evolveRepoList()
  ├─ 统计: manual=N, discovered=M, target = max(0, 20-N)
  ├─ N ≥ 20 → 清空 discovered（不退出手动仓库）
  ├─ 连续 2 周无提交 → auto-prune
  │   ├─ 手动仓库 → status=inactive（注释保留）
  │   └─ 发现仓库 → DELETE
  ├─ 计算空位 = 20 - 活跃仓库数
  └─ 补充: OSS Insight → GitHub Search 降级
```

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | Node.js | User preference, existing environment |
| Database | PostgreSQL 15 | Already running in Docker (`todo_postgres`, port 5432) |
| Web framework | Express | Standard, minimal, no unnecessary complexity |
| AI SDK | Native `fetch` to OpenRouter HTTP API | No need for SDK; one endpoint |
| GitHub API | Native `fetch` to GitHub REST API v3 + Search API | No SDK needed |
| Scheduling | node-cron (in-process) | Simpler than systemd timer; single process |
| Template engine | JavaScript template literals | Only 3 page types; avoid dependency |
| CSS framework | None (minimal inline styles) | Internal tool, no design requirements |
| Auth | None | Internal team, low risk |
| Dependencies | 4 total (`express`, `pg`, `node-cron`, `dotenv`) | Deliberately minimal |

---

## Database Tables

### repos

```
id, owner, repo, default_branch, source (manual|discovered),
status (active|inactive), description, language, stars,
last_active_at, added_at, updated_at
UNIQUE(owner, repo)
```

- `status`: active repos are monitored; inactive manual repos are preserved as annotations
- `last_active_at`: updated each week a repo produces ≥1 commit; used for inactivity detection

### weekly_reports

```
id, week_start, week_end, file_path, title, summary, content,
commit_count, repo_count, status (pending|running|completed|failed),
error_message, created_at, completed_at
```

### report_commits

```
id, report_id (FK), repo_id (FK), sha, message, author,
committed_at, url
UNIQUE(report_id, sha)
```

### repo_snapshots

```
id, repo_id (FK), recorded_at, stars, forks, watchers
UNIQUE(repo_id, recorded_at)
```

- Daily snapshots of repo metrics for star/fork growth tracking

---

## Project Structure

```
weekly-report/
  package.json
  .env
  SPEC.md
  src/
    index.js            # Entry point
    config.js           # Constants + evolution tuning
    db.js               # Pool, initDB, query helpers + evolution queries
    github-fetcher.js   # GitHub REST API calls
    github-search.js    # GitHub Search API (discovery fallback)
    ossinsight.js       # OSS Insight trending repo discovery
    repo-evolution.js   # Self-evolving repo management algorithm
    ai-summarizer.js    # OpenRouter chat completions + parser
    report-generator.js # HTML assembly + file write
    orchestrator.js     # Main pipeline (evolution → fetch → AI → report)
    scheduler.js        # node-cron
    web-server.js       # Express routes + inline CSS
  reports/              # Generated .html files
```

---

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Report history page |
| GET | `/reports/:id` | View single report (HTML) |
| GET | `/repos` | Repo management page (all repos, source, status) |
| POST | `/repos` | Add a repo |
| POST | `/repos/:id/delete` | Remove a manual repo |
| POST | `/trigger` | Manual report generation |

---

## Non-Requirements (explicitly out of scope)

- No user authentication
- No manual report editing or annotations
- No trend charts or statistics visualizations
- No multi-branch commit tracking
- No Issues/PR data (commits only)
- No email/IM notifications
- No caching layer
- No comparison to previous weeks

---

## Constraints

- Single server, single process
- GitHub API unauthenticated rate limit: 60 req/hr (mitigated by delays + token)
- OpenRouter free model: 50 requests/day, rate-limit aware with 2 retries
- Total report generation time: estimated 2–5 minutes for ~20 repos
