AutoShorts Engine — Agent Instructions (OVERVIEW)
Purpose

AutoShorts Engine detects trending topics in technology/AI, converts them into short-video ideas for multiple channels (anime_explains, ai_tools, tech_facts), generates scripts and media, and uploads short vertical videos to platforms automatically. This repository is built by an autonomous agent reading sequential .md spec files; follow the execution rules precisely.

Execution rules (strict)

Single-file focus: the agent must read only the current agent-***.md file being executed. Do not load future spec files except agent-000_overview.md.

Task loop:

Read specification file completely.

Break it into atomic tasks.

Implement code and tests for each task.

Run lint/build/test locally.

Commit, push branch, open PR.

Record progress to progress.md.

Commits & PRs:

Branch naming: feature/<short>-<ticket> or chore/<short>-<ticket>.

Commit message format: feat(<module>): short description — #<taskid> or fix(...).

PR title: same as commit summary; PR body must include run commands and acceptance steps.

No secrets in repo: all credentials must be read from environment variables (.env allowed locally but must be in .gitignore).

Code quality:

TypeScript strict: true for all TS modules.

Sane JSDoc/TSDoc on exported functions.

ESLint + Prettier configuration present and passing on CI.

Idempotence & resume: long-running modules must checkpoint intermediate results to data/ so runs are resumable.

Provider-agnostic: AI calls must go through a single adapter module modules/ai/providers.ts. Implement provider mocks for tests.

Testing: unit tests for core logic; integration smoke tests verify end-to-end on tests/fixtures/simple-sample.

Observability: log to ./logs/<module>.log. Fatal errors must write stack traces with timestamps.

Deliverables (MVP)

Trend detection service able to emit candidate trending topics (with score and source).

Topic selection engine that turns trends into channel-specific video ideas.

Project scaffold: CLI, modules, scheduler skeleton, sample fixture, CI.

Documentation: README, CONTRIBUTING, LICENSE (MIT).

progress.md updated by agent after each successful spec.

Repository layout (target)
autoshorts/
├─ modules/
│  ├─ trend/
│  ├─ topic/
│  ├─ script/
│  ├─ voice/
│  ├─ video/
│  ├─ captions/
│  ├─ uploader/
│  ├─ analytics/
│  └─ ai/
├─ agents/
├─ channels/
│  ├─ anime_explains/
│  ├─ ai_tools/
│  └─ tech_facts/
├─ cli/
├─ tests/
│  └─ fixtures/simple-sample
├─ data/
│  ├─ trends/
│  ├─ topics/
│  └─ metrics/
├─ config/
│  └─ channels.json
├─ .env.example
└─ progress.md
Environment variables (agent must validate at runtime)
# Git & platform
GITHUB_TOKEN

# AI inference (provider-agnostic)
LLM_PROVIDER        # 'groq' | 'nim' | 'openai' | 'local'
LLM_API_KEY

# Optional embeddings (for later)
EMBEDDING_PROVIDER
EMBEDDING_API_KEY

# YouTube upload (for uploader module)
YOUTUBE_CLIENT_ID
YOUTUBE_CLIENT_SECRET
YOUTUBE_REFRESH_TOKEN  # keep private, used only when uploader implemented

# Instagram (optional, used later)
IG_BUSINESS_ACCOUNT_ID
FB_PAGE_ACCESS_TOKEN

# Scheduler / operation
NODE_ENV=development
CACHE_DIR=./data/cache
LOG_DIR=./logs

Agent requirement: If any required variable for the current module is missing, fail fast with a descriptive message and write it to logs/missing_env.log.

Acceptance policy

Each PR must pass CI (lint + build + tests).

Each module writes a JSON artifact to ./data/results/<module>/<run-timestamp>.json as output.

Agent must update progress.md with a brief status and a timestamp on PR merge.