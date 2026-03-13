STEP 5 — Voice Generation (TTS Pipeline)
Objective

Implement the voice generation pipeline that converts script artifacts into high-quality narration audio files. Support multiple TTS backends and automatic fallback: preferred edge-tts (network; high quality), fallback piper (local), fallback coqui (local). Save outputs to data/audio/<runId>/<scriptId>.mp3 and record metadata in data/audio/<runId>.json.

Required env vars
# LLM & optional TTS APIs
LLM_PROVIDER
LLM_API_KEY

# For any network TTS if used
TTS_PROVIDER  # 'edge' | 'piper' | 'coqui' | 'local'
TTS_API_KEY   # optional, if provider requires
CACHE_DIR
LOG_DIR
Exports

Implement modules/voice/synthesizeForScripts(runId: string, options?: { voice?: string, concurrency?: number }) : Promise<string> which returns path to data/audio/<runId>.json.

CLI: npx autoshorts voice --runId=<runId> --voice=anime --concurrency=2

Behavior & strategy

Voice profiles: For each channel define voice profile mapping:

anime_explains → voice: youthful, energetic, slightly playful

ai_tools → voice: clear, professional

tech_facts → voice: neutral, authoritative
These map to TTS voice names if provider supports named voices.

Audio specs:

output: 44.1kHz or 48kHz, stereo or mono per provider default (normalize later).

save as MP3 or AAC (mp3 preferred for YouTube/IG).

Pacing & SSML:

Use SSML where supported (edge-tts) to control pauses, emphasis.

For local engines without SSML, inject punctuation-aware pauses and split long segments.

Chunking:

For each timedSegments produce one TTS call per segment to allow precise alignment and re-use; then concatenate segments using ffmpeg.

Caching & dedup:

Cache synthesized audio per sha256(scriptText + voiceProfile) to CACHE_DIR/tts/<hash>.mp3.

If cached, copy to data/audio/<runId>/<scriptId>.mp3 and avoid re-synthesis.

Fallback logic:

Try preferred provider first (configurable). If network error or quota, fallback to next provider.

If all providers fail and --allow-local-fallback=true, use piper or coqui locally; if not available, mark script as tts_failed.

Normalization & concatenation:

After obtaining per-segment audio files, normalize loudness (EbuR128 or simple RMS) and concatenate in correct order with ffmpeg. Output final file and generate a small waveform metadata JSON (duration, peaks).

Timing verification:

The final audio duration must match estimatedLengthSec within ±1 second. If mismatch > 1s, log warning and adjust video rendering segment timing (write audioTiming into metadata).

Concurrency & resource limits:

Default concurrency 2 synthesis tasks at once. Allow CLI override.

Edge cases:

For scripts flagged requires_verification, prepend a short sentence: “Note: report is based on early reports.” This is optional and controlled by config.

Implementation notes per provider
Edge-TTS (preferred)

Use edge-tts wrapper (node or python).

Supports SSML and high-quality voices.

Respect usage patterns and rate limits.

Piper (local)

Use local binary or Python binding.

Ensure local dependency install instructions in README (pip/npm) and fallback.

Coqui (local)

Use Coqui TTS models if available; provide small models for offline use to avoid GPU requirement.

Output manifest

Write data/audio/<runId>.json:

{
  "runId":"2026-03-13T12:00:00Z",
  "items":[
    {
      "scriptId":"openai-gpt54-anime-001-30s-v1",
      "audioPath":"data/audio/2026-03-13T12:00:00Z/openai-gpt54-anime-001-30s-v1.mp3",
      "durationSec":30.1,
      "voiceProfile":"anime_energetic_v1",
      "cacheKey":"sha256(...)",
      "synthesisProvider":"edge-tts",
      "createdAt":"2026-03-13T12:00:05Z"
    }
  ]
}
Tests & acceptance

Unit: mock TTS providers to emulate responses and failovers; assert final MP3 exists and duration approx equals estimatedLengthSec.

Integration: run against tests/fixtures/scripts/fixture1.json generating audio for all scripts; assert data/audio/<runId>.json created, one MP3 per script.

Performance: measure average synthesis time per 30s (simulate or run real); log to logs/voice.log.

Logging & artifacts

Log each synthesis attempt in logs/voice.log with provider, duration, success/failure.

Store provider responses (not secrets) in CACHE_DIR/tts/responses/<hash>.json for debugging.

PR instructions

Branch: feature/voice-generator

Title: feat(voice): modular TTS pipeline with provider fallback

PR body: include data/audio/<sampleRun>.json and sample MP3s in artifacts (or link to download).