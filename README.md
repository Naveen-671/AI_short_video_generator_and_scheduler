# AutoShorts Engine

Automated short-form video pipeline — from trend detection to upload.

## Getting Started

### Prerequisites

- Node.js >= 18
- pnpm (recommended) or npm
- ffmpeg (for video rendering modules)
- Python 3.8+ (for optional adapters)

### Installation

```bash
pnpm install
```

### Configuration

Copy `.env.example` to `.env` and fill in your API keys:

```bash
cp .env.example .env
```

### Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server (GET /health) |
| `pnpm build` | Compile TypeScript |
| `pnpm lint` | Run ESLint |
| `pnpm test` | Run Vitest test suite |
| `pnpm cli -- <path>` | Run CLI scanner on a directory |

### CLI Usage

```bash
# Scan a sample fixture
node ./dist/cli/index.js tests/fixtures/simple-sample

# Force re-scan (overwrite existing artifact)
node ./dist/cli/index.js tests/fixtures/simple-sample --force
```

### Artifact Locations

| Type | Path |
|------|------|
| Scan results | `data/results/scan-*.json` |
| Checkpoints | `data/checkpoints/<module>/<runId>/` |
| Logs | `logs/<module>.log` |
| Cache | `data/cache/<module>/` |

## Project Structure

```
src/server/index.ts    — Express server with /health and /progress endpoints
cli/index.ts           — CLI entry point for file scanning
modules/ai/providers.ts — AI provider abstraction (mock for now)
modules/fsutils.ts     — File-system utilities (safeMkdir, writeJson, readJson)
modules/logger.ts      — Structured logger writing to logs/
tests/                 — Vitest test suite
```
