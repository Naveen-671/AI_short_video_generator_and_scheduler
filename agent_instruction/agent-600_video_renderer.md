STEP 6 — Video Renderer (Programmatic Video Composition)
Objective

Implement the video renderer module that composes visuals, subtitles, audio, overlays, and templates into vertical short videos (1080×1920) ready for upload. Must support channel templates, per-segment overlays, simple animated charts for benchmark numbers, and file export in MP4 format compatible with YouTube Shorts / Instagram Reels.

Required env vars
LOG_DIR
CACHE_DIR
FFMPEG_PATH  # optional; discover ffmpeg in PATH if not set
Export

Implement modules/video/renderFromScript(runId: string, options?: { template?: string, watermark?: string, concurrency?: number }) : Promise<string> returning path to data/videos/<runId>.json which lists rendered files and per-file metadata.

CLI: npx autoshorts render --runId=<runId> --template=anime_template --concurrency=2

General design principles

Template-driven: provide a small set of templates in modules/video/templates/:

anime_template (anime character + speech bubble + subtitles)

tech_template (minimal UI, bullet animations)

fact_template (charts, numbers, fast cuts)

Input:

data/scripts/<runId>.json (script variants)

data/audio/<runId>.json (audio produced)

assets/ (images, music, fonts)

optional data/visuals/<topicId>/* (charts rendered as PNG)

Outputs:

MP4 files in data/videos/<runId>/

data/videos/<runId>.json manifest with metadata: file path, duration, scriptId, templateUsed, thumbnailPath.

Rendering engine options:

Primary: ffmpeg + pre-rendered assets + simple filters

Advanced: MoviePy (Python) for easier composition; use for text animations if ffmpeg complex filters are unwieldy.

Alternative: Remotion (JS) for future React-based rendering (slower to add but more powerful).

Subtitles:

Burn subtitles into video using SRT + ffmpeg subtitles filter or overlay text for stylized display.

Also produce sidecar .srt in data/videos/<runId>/<file>.srt for later use.

Per-segment visuals:

For each timedSegments, render an overlay:

hook segment: big Title text + character zoom

point1/2: bullet list appear/disappear animations

cta: follow/subscribe overlay with channel logo

Achieve animations by rendering multiple small PNG frames or using ffmpeg drawtext + fade filters.

Animated charts (for benchmarks):

For numeric benchmark info, render a simple bar chart PNG per segment using Node canvas or Python matplotlib, then animate scale via ffmpeg overlay zoom or crossfade.

Audio alignment & lip-sync:

Use final audio durations as ground truth. Trim or pad visuals to match audio lengths precisely (allow ±0.5s tolerance).

Thumbnails:

Generate thumbnail PNG for each video (frame at 0.5s or designed overlay) saved to data/videos/<runId>/thumbs.

Watermark & branding:

Overlay a small watermark (configurable) on each video. Watermark file in assets/watermark.png.

Performance & batching:

Render tasks in parallel up to configured concurrency (default 1–2 because ffmpeg can be CPU-intensive).

Provide a dry-run mode that outputs planned ffmpeg commands without executing.

Video size & codecs:

Target MP4 H.264 baseline/profile mainstream, AAC audio, CRF ~23, preset veryfast for local machines.

FFmpeg example flags: -c:v libx264 -preset veryfast -crf 23 -vf scale=1080:1920 -c:a aac -b:a 128k -movflags +faststart

Fallbacks for missing assets:

If character image missing for anime channel, use a neutral placeholder and log a warning. Do not fail.

Example ffmpeg composition recipe (conceptual)

Pre-generate background (static or looped).

Render per-segment overlay PNGs/text frames.

Use ffmpeg to concat overlay segments with audio and timed fade transitions:

# high-level example (not final script)
ffmpeg -y \
 -i background.mp4 \
 -i audio.mp3 \
 -filter_complex "
  [0:v]scale=1080:1920,setsar=1,trim=0:30[fv];
  [fv][1:a]... # overlay text via drawtext or use overlay PNGs
 " -map ... -c:v libx264 -c:a aac out.mp4

The agent must implement precise ffmpeg commands or MoviePy sequences.

Tests & acceptance

Unit: small function tests for template rendering helpers, PNG generation, duration calculation.

Integration: render a sample 30s video using tests/fixtures/scripts/sample.json and tests/fixtures/audio/sample.mp3. Assert:

data/videos/<runId>/<file>.mp4 exists

duration matches estimatedLengthSec ± 1s

thumbnail exists

sidecar SRT exists

Quality: visually inspect the sample video (automated CI cannot visually verify, but manifest must include expected overlays and segments).

Performance: log overall render time and peak memory/CPU usage to logs/video.log.

Logging & artifacts

Per-render logs to logs/video.log with ffmpeg command lines and durations.

Save temporary intermediate files under data/videos/<runId>/tmp/ and delete on success; preserve when --keep-temp is passed.

PR instructions

Branch: feature/video-renderer

Title: feat(video): template-driven short video renderer using ffmpeg/MoviePy

PR body: include sample rendered MP4 in CI artifacts or a link to a hosted sample, ffmpeg command examples, and how to run locally with test fixtures.