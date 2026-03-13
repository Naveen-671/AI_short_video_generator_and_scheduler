STEP 1 — Setup & Project Scaffold
Objective

Create the base repository, TypeScript monorepo scaffold, CI, linting, CLI skeleton, sample fixture repository, and baseline automation scripts. This is the mandatory first task. Do not proceed to other modules until PR for this step is merged.

Goals / Acceptance criteria

npm run dev or pnpm dev starts no-op dev server and returns {status:"ok"} from GET /health.

node ./dist/cli/index.js tests/fixtures/simple-sample runs and produces ./data/results/scan-simple-sample.json.

ESLint and TypeScript compile cleanly (npm run lint, npm run build).

CI (GitHub Actions) runs install -> build -> test on PRs.

README.md placeholder present with Getting started section.

progress.md updated with "step-100 scaffold completed" on PR merge.

Tooling & versions

Node.js >= 18

TypeScript >= 5.x

pnpm recommended (fallback to npm)

ESLint + Prettier

Vitest or Jest for tests

Husky (pre-commit hooks) optional but recommended

Files to create (concrete)

package.json with scripts:

dev (start server)

build

lint

test

cli (build + run cli)

tsconfig.json (strict: true) and tsconfig.build.json if needed.

.eslintrc.cjs and .prettierrc

src/server/index.ts — express/fastify server with /health endpoint.

cli/index.ts — CLI entry with run(repoPathOrUrl) exported.

modules/ai/providers.ts — stub provider adapter with mock generate() for local dev.

tests/fixtures/simple-sample/ — small sample repo:

simple-sample/
  src/
    app.js  (calls api.js)
    api.js  (exports handle)
    service.js (exports doThing)

tests/parser.test.ts — simple smoke test asserting cli generates JSON.

.github/workflows/ci.yml — run pnpm install && pnpm build && pnpm test.

Implementation details

Initialize repository and install dependencies.

Implement server skeleton:

GET /health returns {"status":"ok"}.

GET /progress returns contents of progress.md if exists.

Implement CLI skeleton:

Argument parsing: npx autoshorts <path-or-url> [--force].

For now, if input is path to tests/fixtures/simple-sample, run a simple file scanner that lists files and writes data/results/scan-simple-sample.json with file list and timestamps.

Add modules/fsutils.ts with safeMkdir, writeJson, readJson.

Add basic logger utility modules/logger.ts writing to LOG_DIR.

Add .env.example with the environment var names listed in agent-000_overview.md.

Add progress.md initial content:

# AutoShorts Progress
- [ ] scaffold

The agent must update this file when the step completes.

Commands the agent must create and test locally

Install: pnpm install

Build: pnpm build

Dev: pnpm dev

CLI test run: node ./dist/cli/index.js tests/fixtures/simple-sample

Tests

Unit test: cli run against simple-sample produces data/results/scan-simple-sample.json and contains the expected 3 files.

Server test: GET /health returns 200 and JSON {status:"ok"}.

Checkpointing and idempotence

If data/results/scan-simple-sample.json exists and --force not provided, CLI should exit with message: "artifact exists — use --force to re-run".

PR instructions

Branch: feature/setup-scaffold

Title: chore(setup): scaffold project, CLI skeleton, health endpoint

PR body: include commands to run locally, sample output path, and CI badge. Update progress.md on merge.