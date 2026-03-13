STEP 7 — Captions Generator (Whisper-based transcription & SRT)
Objective

Implement the captions generation pipeline that converts the rendered audio into accurate timed subtitles (.srt) and produces burn-in subtitle-compatible SRT and optional speaker markers. Use an offline-first approach via whisper.cpp or local Whisper models; allow cloud Whisper fallback if available.

Required env vars
WHISPER_PROVIDER  # 'whisper-local' | 'openai-whisper' | 'whisper.cpp'
WHISPER_MODEL     # model name if needed (e.g., 'ggml-small.en')
CACHE_DIR
LOG_DIR
Export

Implement modules/captions/generateForVideos(runId: string, options?: {language?: string, burnIn?: boolean}) : Promise<string> which returns path to data/captions/<runId>.json. Also produce SRT files next to videos: data/videos/<runId>/<videoFile>.srt. If burnIn=true, also produce data/videos/<runId>/<videoFile>.burned.mp4.

CLI: npx autoshorts captions --runId=<runId> --burnIn=false --language=en

Behavior & constraints

Offline-first:

Prefer whisper.cpp / local model for transcription.

If not available and WHISPER_PROVIDER=openai-whisper is set, use API (respect quotas).

Accuracy & formatting:

Segment audio and run transcription with VAD or fixed segment length (e.g., 30s windows) to avoid timeouts.

Post-process transcripts to:

Fix common punctuation errors.

Break into subtitle chunks ≤ 70 characters per line, ≤ 2 lines per subtitle.

Ensure no overlapping timestamps; SRT times in HH:MM:SS,ms.

Word highlighting:

Identify key terms (from displayBullets and script) and add a metadata array of highlights with {word, startSec, endSec} where detectable.

Save highlights to data/captions/<runId>/<videoFile>.highlights.json.

Speaker labels:

For this project typically single-speaker. Allow future speaker metadata field but default to Narrator.

Burn-in subtitles:

If burnIn=true, use ffmpeg subtitles filter or drawtext to burn them into a new MP4 at data/videos/<runId>/<video>.burned.mp4.

Styling: font from assets/fonts/, font size configurable per template, background semi-opaque box for readability.

SRT output path:

Save data/videos/<runId>/<videoFile>.srt and data/videos/<runId>.vtt (WebVTT) for platforms that prefer it.

Quality checks:

Compute confidence metric as average token confidence from provider where available; when confidence < 0.7, flag subtitle file as needs_review:true in manifest.

Sync with segments:

Use timedSegments from data/scripts as guiding anchors; prefer align words in segments to those anchors. If misalignment > 1s, log warning.

Caching:

Cache raw transcription outputs by sha256(audioFile) in CACHE_DIR/whisper/.

Edge cases:

Short audio (<1s) — generate a single subtitle or skip (log).

No speech detected — mark noSpeech:true and skip caption generation.

Output manifest

Write data/captions/<runId>.json:

{
  "runId":"2026-03-13T12:00:00Z",
  "items":[
    {
      "videoFile":"openai-gpt54-anime-001.mp4",
      "srtPath":"data/videos/2026-03-13T12:00:00Z/openai-gpt54-anime-001.srt",
      "vttPath":"...",
      "burnedPath": null,
      "confidence":0.92,
      "needs_review": false
    }
  ]
}
Tests & acceptance

Unit: transcription function returns expected segments for sample MP3 from tests/fixtures/audio/sample.mp3.

Integration: run full captions on tests/fixtures/videos/sample.mp4 and assert .srt exists, timestamps monotonic, and total text length > 0.

Confidence test: simulate low-confidence provider response and assert needs_review: true.

Logging & artifacts

Log each transcription run to logs/captions.log with duration and model used.

Save raw provider outputs (not secrets) to CACHE_DIR/whisper/<hash>.json.

PR instructions

Branch: feature/captions

Title: feat(captions): whisper-based transcription and srt generation

PR body: include example SRT content in PR artifacts and commands to run local transcription (and instructions to install whisper.cpp if needed).