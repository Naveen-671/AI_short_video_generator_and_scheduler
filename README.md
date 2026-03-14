# AutoShorts Engine

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)

> **Automated short-form video pipeline — from trend detection to multi-platform upload**

AutoShorts Engine is an intelligent, end-to-end automation system for generating viral-worthy short videos. It continuously monitors trending topics across multiple sources, generates AI-powered scripts with emotional dialogue, synthesizes natural-sounding voiceovers, renders professional videos with dynamic characters and captions, and automatically uploads to YouTube, Instagram, and TikTok.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Pipeline Flow](#pipeline-flow)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Configuration](#configuration)
- [Usage](#usage)
  - [Running the Full Pipeline](#running-the-full-pipeline)
  - [CLI Commands](#cli-commands)
  - [Server Mode](#server-mode)
  - [End-to-End Testing](#end-to-end-testing)
- [Project Structure](#project-structure)
- [Modules](#modules)
- [Configuration](#configuration-1)
- [API Reference](#api-reference)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Features

### 🔍 **Intelligent Trend Detection**
- Multi-source trend aggregation (Google Trends, Reddit, Hacker News, RSS feeds)
- Real-time monitoring with configurable intervals
- Smart caching to reduce API calls
- Trend normalization and scoring

### 📝 **AI-Powered Script Generation**
- Topic-to-script conversion using LLM providers
- Multi-character dialogue support with emotional context
- Configurable script lengths (15s, 30s, 60s, 90s)
- Multiple variants per topic for A/B testing

### 🎙️ **Emotional Voice Synthesis**
- Text-to-speech with emotion modeling (happy, excited, serious, curious)
- Multi-speaker dialogue with distinct voice profiles
- Seamless audio timeline generation
- Support for multiple TTS providers

### 🎬 **Professional Video Rendering**
- Character-based animations with customizable assets
- Dynamic subtitle generation with timing
- Background music integration
- Template-based rendering (vertical 9:16 for shorts)
- FFmpeg-powered video composition

### 📊 **Analytics & Optimization**
- Performance metrics collection
- Engagement tracking (views, likes, comments)
- Content strategy optimization based on performance data
- Historical trend analysis

### 🚀 **Multi-Platform Upload**
- YouTube Shorts automation
- Instagram Reels integration
- TikTok support
- Scheduled publishing with configurable intervals

### ⚙️ **Production-Ready Features**
- Checkpoint system for pipeline recovery
- Concurrent processing with configurable limits
- Comprehensive logging and error handling
- Pipeline locking to prevent concurrent runs
- Artifact management (JSON manifests for all stages)

---

## Architecture

AutoShorts Engine follows a modular pipeline architecture where each stage produces artifacts consumed by the next stage:

```
┌─────────────────────────────────────────────────────────────────┐
│                      AUTOSHORTS ENGINE                          │
└─────────────────────────────────────────────────────────────────┘

    ┌───────────────┐
    │ Trend Sources │  (Google, Reddit, HackerNews, RSS)
    └───────┬───────┘
            │
            ▼
    ┌───────────────┐
    │ Trend         │──► data/trends/*.json
    │ Detection     │
    └───────┬───────┘
            │
            ▼
    ┌───────────────┐
    │ Topic         │──► data/topics/*.json
    │ Generation    │    (Channel-specific video ideas)
    └───────┬───────┘
            │
            ▼
    ┌───────────────┐
    │ Script        │──► data/scripts/*.json
    │ Generation    │    (Timed dialogue with emotions)
    └───────┬───────┘
            │
            ▼
    ┌───────────────┐
    │ Voice         │──► data/audio/*.mp3 + manifest.json
    │ Synthesis     │    (Emotional TTS for each segment)
    └───────┬───────┘
            │
            ▼
    ┌───────────────┐
    │ Video         │──► data/videos/*.mp4 + *.srt
    │ Rendering     │    (Composite with characters & captions)
    └───────┬───────┘
            │
            ▼
    ┌───────────────┐
    │ Caption       │──► Enhanced SRT files
    │ Generation    │
    └───────┬───────┘
            │
            ▼
    ┌───────────────┐
    │ Multi-Platform│──► Upload to YouTube, IG, TikTok
    │ Upload        │
    └───────────────┘
            │
            ▼
    ┌───────────────┐
    │ Analytics     │──► data/metrics/*.json
    │ Collection    │    (Performance tracking & optimization)
    └───────────────┘
```

---

## Pipeline Flow

Each pipeline run follows these steps:

1. **Trend Detection**: Fetches trending topics from configured sources
2. **Topic Generation**: Converts trends into channel-specific video ideas
3. **Script Writing**: Generates dialogue scripts with character emotions
4. **Voice Synthesis**: Creates audio files for each script segment
5. **Video Rendering**: Composites video with characters, audio, and subtitles
6. **Caption Enhancement**: Generates or refines subtitle files
7. **Upload**: Publishes videos to configured platforms
8. **Analytics**: Collects performance metrics for optimization

All stages support **checkpointing** for recovery and **force mode** for re-running steps.

---

## Getting Started

### Prerequisites

Ensure you have the following installed:

- **Node.js** >= 18.0.0 ([Download](https://nodejs.org/))
- **pnpm** (recommended) or npm
  ```bash
  npm install -g pnpm
  ```
- **FFmpeg** for video rendering
  ```bash
  # macOS
  brew install ffmpeg

  # Ubuntu/Debian
  sudo apt-get install ffmpeg

  # Windows
  # Download from https://ffmpeg.org/download.html
  ```
- **Python 3.8+** (optional, for certain adapters)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Naveen-671/AI_short_video_generator_and_scheduler.git
   cd AI_short_video_generator_and_scheduler
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Build the project**
   ```bash
   pnpm build
   ```

### Configuration

1. **Copy environment template**
   ```bash
   cp .env.example .env
   ```

2. **Configure environment variables** (edit `.env`)
   ```bash
   # AI Providers
   LLM_PROVIDER=openai              # or 'anthropic', 'mock'
   LLM_API_KEY=your_api_key_here
   EMBEDDING_PROVIDER=openai
   EMBEDDING_API_KEY=your_api_key_here

   # Social Media Platforms
   YOUTUBE_CLIENT_ID=your_youtube_client_id
   YOUTUBE_CLIENT_SECRET=your_youtube_secret
   YOUTUBE_REFRESH_TOKEN=your_refresh_token

   IG_BUSINESS_ACCOUNT_ID=your_instagram_id
   FB_PAGE_ACCESS_TOKEN=your_facebook_token

   # Optional
   GITHUB_TOKEN=                    # For GitHub trending integration
   CACHE_DIR=./data/cache
   LOG_DIR=./logs
   NODE_ENV=development
   ```

3. **Configure channels** (optional, edit `config/channels.json`)
   ```json
   {
     "channels": {
       "anime_explains": {
         "style": "anime, character: energetic, fun",
         "keywords": ["AI", "GPT", "model release"],
         "defaultLengthSec": 30,
         "character": "gojo.png",
         "bgMusic": "energetic-loop-01"
       }
     }
   }
   ```

4. **Configure scheduler** (optional, edit `config/scheduler.json`)
   ```json
   {
     "intervalHours": 6,
     "channels": ["anime_explains", "ai_tools", "tech_facts"],
     "pipeline": {
       "trends": true,
       "topics": true,
       "scripts": true,
       "voice": true,
       "video": true,
       "captions": true,
       "upload": true
     },
     "defaults": {
       "variants": 3,
       "lengths": [30],
       "concurrency": 2
     }
   }
   ```

---

## Usage

### Running the Full Pipeline

Execute the complete pipeline with the scheduler:

```bash
pnpm dev
```

This starts the Express server with the scheduler running at the configured interval.

### CLI Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server with `/health` and `/progress` endpoints |
| `pnpm build` | Compile TypeScript to JavaScript |
| `pnpm lint` | Run ESLint for code quality |
| `pnpm test` | Run Vitest test suite |
| `pnpm cli -- <path>` | Run CLI scanner on a directory |

### Server Mode

Start the Express server for monitoring:

```bash
pnpm dev
```

**Available Endpoints:**
- `GET /health` - Health check
- `GET /progress` - View pipeline status and progress

### End-to-End Testing

Run the full pipeline test with dialogue generation:

```bash
node --loader tsx e2e_test.ts
```

This executes:
1. Script generation from existing topics
2. Voice synthesis with emotional TTS
3. Video rendering with dialogue compositing

### CLI Usage

Scan a directory for analysis:

```bash
# Build first
pnpm build

# Scan a sample fixture
node ./dist/cli/index.js tests/fixtures/simple-sample

# Force re-scan (overwrite existing artifact)
node ./dist/cli/index.js tests/fixtures/simple-sample --force
```

---

## Project Structure

```
.
├── cli/                    # CLI entry point for file scanning
│   └── index.ts
├── config/                 # Configuration files
│   ├── channels.json       # Channel definitions and styles
│   ├── scheduler.json      # Pipeline scheduler configuration
│   └── trend_sources.json  # Trend source URLs and settings
├── modules/                # Core pipeline modules
│   ├── ai/                 # AI provider abstraction
│   ├── analytics/          # Performance metrics collection
│   ├── captions/           # Subtitle generation
│   ├── optimizer/          # Content strategy optimization
│   ├── scheduler/          # Pipeline orchestration
│   ├── script/             # Script generation from topics
│   ├── topic/              # Topic generation from trends
│   ├── trend/              # Trend detection & normalization
│   ├── uploader/           # Multi-platform upload
│   ├── video/              # Video rendering & composition
│   ├── voice/              # Voice synthesis (TTS)
│   ├── fsutils.ts          # File system utilities
│   ├── logger.ts           # Structured logging
│   └── retry.ts            # Retry logic for external calls
├── src/                    # Server implementation
│   └── server/
│       └── index.ts        # Express server with health/progress routes
├── tests/                  # Vitest test suite
│   ├── fixtures/           # Test data and samples
│   └── *.test.ts           # Unit and integration tests
├── assets/                 # Video assets (characters, backgrounds, music)
├── data/                   # Generated artifacts (auto-created)
│   ├── trends/             # Trend detection results
│   ├── topics/             # Generated video ideas
│   ├── scripts/            # Generated scripts
│   ├── audio/              # Synthesized voice files
│   ├── videos/             # Rendered videos
│   ├── cache/              # API response cache
│   ├── checkpoints/        # Pipeline checkpoints
│   └── runs/               # Pipeline execution history
├── logs/                   # Module-specific logs (auto-created)
├── e2e_test.ts             # End-to-end pipeline test
├── package.json            # Dependencies and scripts
├── tsconfig.json           # TypeScript configuration
└── vitest.config.ts        # Vitest test configuration
```

---

## Modules

### Trend Detection (`modules/trend/`)
- **Adapters**: Google Trends, Reddit, Hacker News, RSS
- **Features**: Caching, normalization, score calculation
- **Output**: `data/trends/<runId>.json`

### Topic Generation (`modules/topic/`)
- Converts trends into channel-specific video ideas
- Uses AI to generate engaging topics
- **Output**: `data/topics/<runId>.json`

### Script Generator (`modules/script/`)
- Multi-character dialogue with emotions
- Timed segments for synchronization
- **Output**: `data/scripts/<runId>.json`

### Voice Synthesis (`modules/voice/`)
- Emotional TTS with speaker profiles
- Supports multiple providers
- **Output**: `data/audio/<runId>/` with manifest

### Video Renderer (`modules/video/`)
- Character animations
- Dynamic captions (word-level timing)
- Background music integration
- **Output**: `data/videos/<runId>/*.mp4` + `*.srt`

### Uploader (`modules/uploader/`)
- YouTube Shorts, Instagram Reels, TikTok
- OAuth authentication handling
- **Output**: Upload confirmations in logs

### Analytics (`modules/analytics/`)
- Metrics collection from platforms
- Performance tracking
- **Output**: `data/metrics/<runId>.json`

### Optimizer (`modules/optimizer/`)
- Strategy updates based on performance
- Content recommendation engine

---

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `LLM_PROVIDER` | AI provider (`openai`, `anthropic`, `mock`) | Yes |
| `LLM_API_KEY` | API key for LLM provider | Yes (unless mock) |
| `YOUTUBE_CLIENT_ID` | YouTube OAuth client ID | For uploads |
| `YOUTUBE_CLIENT_SECRET` | YouTube OAuth secret | For uploads |
| `YOUTUBE_REFRESH_TOKEN` | YouTube refresh token | For uploads |
| `IG_BUSINESS_ACCOUNT_ID` | Instagram Business Account ID | For uploads |
| `FB_PAGE_ACCESS_TOKEN` | Facebook Page Access Token | For uploads |
| `CACHE_DIR` | Cache directory path | No (default: `./data/cache`) |
| `LOG_DIR` | Log directory path | No (default: `./logs`) |
| `NODE_ENV` | Environment (`development`, `production`) | No |

### Channel Configuration (`config/channels.json`)

Define multiple channels with unique styles:

```json
{
  "channels": {
    "your_channel": {
      "style": "description of visual style",
      "keywords": ["keyword1", "keyword2"],
      "defaultLengthSec": 30,
      "character": "character.png",
      "bgMusic": "music-track-id"
    }
  }
}
```

### Scheduler Configuration (`config/scheduler.json`)

Control pipeline execution:

```json
{
  "intervalHours": 6,
  "channels": ["channel1", "channel2"],
  "pipeline": {
    "trends": true,
    "topics": true,
    "scripts": true,
    "voice": true,
    "video": true,
    "captions": true,
    "upload": false
  },
  "defaults": {
    "variants": 3,
    "lengths": [30, 60],
    "concurrency": 2
  }
}
```

---

## API Reference

### Server Endpoints

#### `GET /health`
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-03-14T14:00:00.000Z"
}
```

#### `GET /progress`
View pipeline execution progress.

**Response:**
```json
{
  "currentRun": {
    "runId": "2026-03-14T10-00-00-000Z",
    "startedAt": "2026-03-14T10:00:00.000Z",
    "steps": [...]
  }
}
```

---

## Development

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test tests/trend-integration.test.ts

# Run tests in watch mode
pnpm test -- --watch
```

### Linting

```bash
# Check code quality
pnpm lint

# Auto-fix issues
pnpm lint -- --fix
```

### Building

```bash
# Compile TypeScript
pnpm build

# Clean and rebuild
rm -rf dist && pnpm build
```

### Adding New Modules

1. Create module directory in `modules/`
2. Define types in `types.ts`
3. Implement core logic
4. Add tests in `tests/`
5. Integrate into pipeline (`modules/scheduler/pipeline.ts`)

---

## Troubleshooting

### Common Issues

**Problem: FFmpeg not found**
```
Error: FFmpeg not installed
```
**Solution:** Install FFmpeg using your package manager (see [Prerequisites](#prerequisites))

---

**Problem: API rate limits**
```
Error: Rate limit exceeded for Google Trends
```
**Solution:** Enable caching in `config/trend_sources.json` or reduce detection frequency

---

**Problem: Pipeline lock active**
```
Error: Pipeline lock is active — another run may be in progress
```
**Solution:** Remove stale lock file: `rm data/locks/pipeline.lock`

---

**Problem: Missing API keys**
```
Error: LLM_API_KEY is required
```
**Solution:** Configure `.env` with valid API credentials

---

**Problem: Video rendering fails**
```
WARNING: Video file is very small (0 bytes) — ffmpeg may have failed!
```
**Solution:** Check logs in `logs/video.log` for FFmpeg errors. Ensure all assets exist in `assets/` directory.

---

### Debugging Tips

1. **Check Logs**: Module-specific logs are in `logs/<module>.log`
2. **Inspect Artifacts**: All intermediate outputs are saved in `data/` with JSON manifests
3. **Use Force Mode**: Re-run stages with `--force` to skip checkpoints
4. **Test Individual Modules**: Run unit tests for specific modules
5. **Mock Mode**: Set `LLM_PROVIDER=mock` to test without API calls

---

## Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes**
   - Follow existing code style
   - Add tests for new functionality
   - Update documentation as needed
4. **Run tests and linting**
   ```bash
   pnpm test
   pnpm lint
   ```
5. **Commit your changes**
   ```bash
   git commit -m "Add: your feature description"
   ```
6. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```
7. **Open a Pull Request**

### Development Guidelines

- Use TypeScript with strict type checking
- Write tests for all new features
- Follow the existing module structure
- Document public APIs with JSDoc comments
- Keep functions focused and modular
- Use structured logging (`createLogger`)

---

## License

This project is licensed under the **MIT License**.

```
MIT License

Copyright (c) 2026 AutoShorts Engine Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Acknowledgments

- **OpenAI** / **Anthropic** for LLM capabilities
- **FFmpeg** for video processing
- **Google Trends**, **Reddit**, **Hacker News** for trend data
- All open-source contributors

---

## Support

For issues, questions, or feature requests:
- **GitHub Issues**: [Report an issue](https://github.com/Naveen-671/AI_short_video_generator_and_scheduler/issues)
- **Discussions**: [Join the discussion](https://github.com/Naveen-671/AI_short_video_generator_and_scheduler/discussions)

---

**Built with ❤️ for content creators who want to automate viral video production**
