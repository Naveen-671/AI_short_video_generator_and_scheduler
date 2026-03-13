AutoShorts Autonomous Build Orchestrator
Purpose

This file is the single orchestration spec for an autonomous coding agent that will build the AutoShorts Engine step-by-step. The agent must follow these rules exactly: read one agent-***.md file at a time, implement the tasks in that file fully (code, tests, CI), commit, open a PR, update progress.md, and only then move to the next spec.

Supported external platforms referenced during implementation (one explicit reference each; the agent may use their APIs later):

GitHub

YouTube

Instagram

TikTok

Groq

NVIDIA

Execution Summary (must be obeyed)

Single-file focus — At startup, read agent-000_overview.md (already present). Then process spec files strictly in the order listed in that overview. Do not open or process any future .md until the current file’s PR is merged.

Atomic task loop — For each spec file:

Parse the spec and derive atomic tasks.

Implement code with TypeScript (where requested), add tests, and run lint, build, test.

Create a feature branch, commit changes, push, and open a PR to main.

PR must include run instructions, artifact paths (e.g., data/results/...) and test commands.

On PR merge, append a one-line status in progress.md: ✔ <spec-file> completed — <ISO-8601 timestamp>.

Fail-fast on missing env — If required environment variables for the current module are not present, log the missing keys to logs/missing_env.log and exit with a clear error. Do not attempt network calls without required credentials.

Checkpointing — Long-running or network-dependent work must write resumable artifacts under data/checkpoints/<module>/<runId>/. If a run is interrupted, re-run should resume from latest checkpoint unless --force is passed.

Provider abstraction — All AI / cloud calls must go through modules/ai/providers.ts. Tests must include a mock provider implementation.

No secrets in repo — Do not commit secrets. Use .env locally (gitignored) or environment variables in CI. If a secret is accidentally staged, abort commit and open an Issue with remediation steps.

Observability — All modules must log to logs/<module>.log. Logs must include timestamps, correlation runId, and error stack traces.

Spec file order (agent must process these in sequence)

agent-000_overview.md (already read)

agent-100_setup_and_scaffold.md

agent-200_trend_detection.md

agent-300_topic_engine.md

agent-400_script_generator.md

agent-500_voice_generation.md

agent-600_video_renderer.md

agent-700_captions_generator.md

agent-800_uploader.md

agent-900_scheduler.md

agent-1000_analytics.md

agent-1100_optimizer.md

The agent may create additional tests/fixtures and helper modules, but must not create or edit future agent-***.md files.

Branch / Commit / PR conventions (mandatory)

Branch format: feature/<module>-<short>-<timestamp> (example: feature/trend-detection-20260313T1200).

Commit messages: feat(<module>): short description — #<taskid> or fix(<module>): short description — #<taskid>.

PR title: same as the commit summary. PR body must contain:

What changed (short)

How to run locally (commands)

Expected artifacts and paths

Tests run & results

Risk notes & next steps

Include minimal reproducible artifacts (JSON examples) under tests/expected/ when applicable.

Required developer tools & runtime (agent must validate)

Node.js >= 18

pnpm (preferred) or npm

TypeScript >= 5.x (tsconfig.json with strict: true)

ESLint + Prettier

Vitest or Jest for tests

ffmpeg installed and discoverable in PATH for video tasks

Local python 3.8+ available for optional adapters (pytrends adapter uses a subprocess)

If any required tool is missing, log to logs/env_check.log and abort.

Environment variables (agent must validate before starting each module)

Common variables (module-specific lists are in each spec file):

GITHUB_TOKEN
LLM_PROVIDER
LLM_API_KEY
EMBEDDING_PROVIDER
EMBEDDING_API_KEY
YOUTUBE_CLIENT_ID
YOUTUBE_CLIENT_SECRET
YOUTUBE_REFRESH_TOKEN
IG_BUSINESS_ACCOUNT_ID
FB_PAGE_ACCESS_TOKEN
CACHE_DIR=./data/cache
LOG_DIR=./logs
NODE_ENV=development

Agent must perform a pre-flight check at the beginning of each module and fail fast if required module vars are missing.

Run & test commands (required in every PR)

Install: pnpm install (or npm install)

Lint: pnpm lint

Build: pnpm build

Tests: pnpm test

Dev server: pnpm dev (available after scaffold)

CLI run example (module-specific): node ./dist/cli/index.js <args>

PRs that do not pass lint, build, and test will be rejected. The agent must fix issues before requesting merge.

Checkpoint & artifact locations (standardized)

Checkpoints: data/checkpoints/<module>/<runId>/

Results: data/results/<module>/<runId>.json

Logs: logs/<module>.log

Cache: data/cache/<module>/

Progress file: progress.md (root)

All modules must read/write to these locations. Use stable filenames and include ISO-8601 timestamps.

Error handling & retry policy

Network calls: retry up to 3 times with exponential backoff (500ms, 2s, 8s).

For persistent failures: create Issue file issues/<module>-<runId>.md with logs and abort that module run.

If a module fails and leaves partial artifacts, mark run as failed in the manifest and continue to next spec only after human inspection or explicit --force override.

Security & policy

Do not implement or push any automation that violates platform terms (no mass DM, no bot engagement).

For uploads, use official APIs and respect rate limits and quotas.

Always redact or avoid including any sensitive tokens in logs; if a token appears in logs, rotate it immediately and record the event in logs/security.log.

Acceptance criteria for a merged module PR

CI green (lint/build/test)

Example artifact(s) committed to tests/expected/ or available as CI build artifact

progress.md updated with a one-line status on merge

logs/<module>.log contains a successful run entry for the module

README updated with module-specific run instructions if new commands were added

Progress reporting format (progress.md)

Agent must append one line per merged module in this exact format:

✔ <module> — <short description> — <ISO-8601 timestamp> — artifacts: <data/results/...json>

Example:

✔ agent-200_trend_detection — multi-source trend detector implemented — 2026-03-13T12:34:56Z — artifacts: data/results/trend/2026-03-13T12:00:00Z.json
Finish condition

When the agent has merged the last spec (agent-1100_optimizer.md) and npx autoshorts run successfully executes a full end-to-end cycle on tests/fixtures/simple-sample producing data/uploads/<runId>.json entries and data/metrics/<date>.json, it should:

Append ✔ all modules completed — <timestamp> to progress.md.

Create a release branch release/v0.1.0 and open a PR titled chore(release): initial v0.1.0 with release notes and example artifacts.

Safety net (stop condition)

If the agent attempts to:

write credentials to repository,

call upload endpoints with live credentials before a dry-run approval flag,

or create more than 5 PRs in 24 hours automatically,

it must pause and create an Issue issues/auto-pause-<timestamp>.md describing the reason and await human review.

Minimal human signals

The agent should require human confirmation only for:

granting live upload credentials (YOUTUBE/IG tokens)

enabling --auto-pr (automated PR creation against remote repos)

any large refactor that touches > 50 files in one PR

All other actions must be autonomous.