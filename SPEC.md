# Weekly Report Tool — SPEC

## Overview

An internal tool that automatically generates weekly project reports by fetching GitHub commit data from tracked AI/LLM open-source repositories, summarizing them via OpenRouter AI, and presenting results as Markdown files served through a simple web UI.

---

## Users & Scope

- **Target users**: Internal software development team, ≤100 people
- **Use case**: Stay informed about activity across 50–150 AI/LLM open-source repositories each week
- **Purely read-only**: no manual editing, no comments, no collaboration features

---

## Functional Requirements

### 1. Repository Management

- **Manually configured repos** (20–50): stored in database, managed via web UI (add / remove)
- **Auto-discovered trending repos** (30–100 per week): fetched from OSS Insight API, filtered by AI/LLM keywords
- Discovered repos are refreshed weekly (old ones deleted, new ones inserted)
- Repo config format: `owner`, `repo`, plus metadata (description, stars, language)

### 2. Commit Fetching

- Default branch only (auto-detected per repo)
- Past 7 days of commits
- Limit to ~2KB of commit data per repo (for AI context)
- Per-page limit: 30 commits per repo from GitHub API
- Rate-limit aware: 1s delay between unauthenticated requests; optional `GITHUB_TOKEN` support

### 3. AI Summarization

- Provider: OpenRouter
- Model: `openai/gpt-oss-120b:free` (free tier)
- API key: loaded from `/root/.claude/projects/Horizon/.env`
- Input: commit messages trimmed to fit model context
- Output: markdown-formatted summary per repo with 1–3 bullet points each
- Fallback: if AI fails, report is still generated with raw commit listings

### 4. Report Generation

- Format: Markdown file
- Sections:
  - Overview (AI-generated summary paragraph)
  - Per-repo commit breakdown (commit message, author, date, link)
  - Newly discovered trending repos table (repo, stars, language, description)
  - Statistics (repo count, commit count, discovered count, timestamp)
- Saved to: `reports/{YYYY-MM-DD}_weekly_report.md`

### 5. Scheduling

- **Auto**: Saturday 2:00 PM server local time (cron: `0 14 * * 6`)
- **Manual**: Web UI trigger button (`POST /trigger`)

### 6. Web UI

- Port: **8088**
- Pages:
  - `/` — Report history list (date range, repo count, commit count, status)
  - `/reports/:id` — Single report view (Markdown rendered to HTML)
  - `/repos` — Repo management (list, add, delete)
- Server-side HTML rendering with `marked`; no client-side JavaScript
- Minimal inline CSS; no CSS framework
- No authentication

### 7. Historical Reports

- All reports persisted in database and on disk
- Web UI allows browsing all past reports

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | Node.js | User preference, existing environment |
| Database | PostgreSQL 15 | Already running in Docker (`todo_postgres`, port 5432) |
| Web framework | Express | Standard, minimal, no unnecessary complexity |
| AI SDK | Native `fetch` to OpenRouter HTTP API | No need for SDK; one endpoint |
| GitHub API | Native `fetch` to GitHub REST API v3 | No SDK needed |
| Scheduling | node-cron (in-process) | Simpler than systemd timer; single process |
| Template engine | None (JavaScript template literals + `marked`) | Only 3 page types; avoid dependency |
| CSS framework | None (minimal inline styles) | Internal tool, no design requirements |
| Auth | None | Internal team, low risk |
| Dependencies | 5 total (`express`, `pg`, `node-cron`, `marked`, `dotenv`) | Deliberately minimal |

---

## Database Tables

### repos
```
id, owner, repo, default_branch, source (manual|discovered),
description, language, stars, added_at, updated_at
UNIQUE(owner, repo)
```

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

---

## Project Structure

```
weekly-report/
  package.json
  .env
  src/
    index.js            # Entry point
    config.js           # Constants
    db.js               # Pool, initDB, query helpers
    github-fetcher.js   # GitHub REST API calls
    ossinsight.js        # Trending repo discovery
    ai-summarizer.js    # OpenRouter chat completions
    report-generator.js # Markdown assembly + file write
    orchestrator.js     # Main pipeline
    scheduler.js        # node-cron
    web-server.js       # Express routes + HTML
  reports/              # Generated .md files
```

---

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Report history page |
| GET | `/reports/:id` | View single report (HTML) |
| GET | `/repos` | Repo management page |
| POST | `/repos` | Add a repo |
| POST | `/repos/:id/delete` | Remove a repo |
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
- GitHub API unauthenticated rate limit: 60 req/hr (mitigated by delays + optional token)
- OpenRouter free model rate limits (TBD)
- Total report generation time: estimated 2–5 minutes for 50–150 repos
