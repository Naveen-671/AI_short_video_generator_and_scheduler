STEP 4 — Script Generator (Full Implementation Spec)
Objective

Create the script generator module that converts a channel-specific idea into 1–3 concrete script variants ready for voice synthesis and video rendering. Scripts must be short-video optimized (primary target: 30 seconds; support 15s, 45s variants). Each output includes timed segments, on-screen display bullets, a hook, and metadata used later for rendering.

Overview

Input: data/topics/<runId>.json (ideas from Topic Engine).

Output: data/scripts/<runId>.json (array of generated script artifacts).

Each script artifact must include: scriptId, channel, title, scriptText, timedSegments, displayBullets, styleHints, estimatedLengthSec, llm_cache_key, and metadata (voice style, visual hints).

Use provider-agnostic LLM adapter modules/ai/providers.ts for all LLM calls.

Cache LLM responses in CACHE_DIR using SHA256(prompt+topic+channel+style).

Required env vars (validate at runtime)
LLM_PROVIDER
LLM_API_KEY
CACHE_DIR=./data/cache
LOG_DIR=./logs
Function export

Implement modules/script/generateScriptsFromTopics(runId: string, options?: { variants?: number, lengths?: number[] }) : Promise<string> which returns path to data/scripts/<runId>.json.

CLI binding: npx autoshorts scripts --runId=<runId> --variants=3 --lengths=30,45,15

Behavior & constraints

Variants: produce variants script variants per idea (default 3). Variants should differ in phrasing, hook type (question/hypothesis/shocking stat), and display bullets wording.

Lengths: support multiple target lengths (15,30,45). For each idea produce variant for each length requested.

Token economy: send only compact metadata to LLM. Do not send full topic run lists or examples. Include:

topic title

channel name

styleHints from visualHints

brief trend context (1-line)

Prompting:

Use a deterministic prompt template (provided below). Generate JSON output from LLM and validate schema. If LLM returns plain text, attempt to parse; if parse fails, retry up to 2x with stricter JSON instruction.

Timing:

Each timedSegments item must include label, startSec, endSec, text.

Ensure sum of segment durations ≈ estimatedLengthSec ± 1 second.

Display bullets:

Produce 3 short lines (4–6 words) for on-screen overlay.

Hook:

Hook must be 1 sentence, ≤ 8 words, designed for first 3 seconds.

Safety:

Ensure factual claims are qualified (“appears”, “reported”) if the trend source is not official. Flag any strong factual claim with requires_verification: true in metadata.

Caching:

Cache responses keyed by sha256(topic + channel + styleHints + length + variantIndex) and reuse cached script if present.

Error handling:

On LLM error, retry twice with exponential backoff. If still failing, write an error entry to logs/script.log and continue with other ideas, marking the idea as failed: true.

Prompt templates (use verbatim unless optimizing)
Primary generation prompt (JSON output required)
You are a professional short-form video copywriter specialized in 15–60 second educational content.

Given the compact input metadata, produce a JSON object with a single script variant tailored to the requested length.

Input:
{
  "topic": "{{topic}}",
  "channel": "{{channel}}",
  "styleHints": "{{styleHints}}",
  "targetLengthSec": {{lengthSec}},
  "briefContext": "{{briefContext}}"
}

Output JSON format:
{
  "title": "Short, clickable title (max 60 chars)",
  "hook": "1-line hook, <= 8 words, suitable for first 3 seconds",
  "timedSegments": [
    {"label":"hook","startSec":0,"endSec":3,"text":"..."},
    {"label":"point1","startSec":3,"endSec":12,"text":"..."},
    {"label":"point2","startSec":12,"endSec":22,"text":"..."},
    {"label":"cta","startSec":22,"endSec":30,"text":"..."}
  ],
  "displayBullets": ["bullet 1","bullet 2","bullet 3"],
  "estimatedLengthSec": {{lengthSec}},
  "notesForVoice": "tone: energetic, pacing: medium-slow",
  "requires_verification": false
}
Secondary prompt when parsing fails
The previous response failed JSON validation. Re-output only the valid JSON object conforming exactly to the schema provided earlier. Do NOT include any explanation text.
Output schema

Save data/scripts/<runId>.json as an array:

[
  {
    "scriptId": "openai-gpt54-anime-001-30s-v1",
    "ideaId": "openai-gpt54-anime-001",
    "channel": "anime_explains",
    "title": "...",
    "hook": "...",
    "timedSegments":[...],
    "displayBullets":[...],
    "estimatedLengthSec":30,
    "notesForVoice":"...",
    "metadata": { "styleHints": {...}, "visualHints": {...} },
    "llm_cache_key": "...",
    "createdAt": "2026-03-13T12:00:00Z"
  }
]
Tests & acceptance

Unit test: stub modules/ai/providers.ts to return pre-recorded LLM outputs and assert data/scripts/<runId>.json created, each script has timedSegments whose durations sum to estimatedLengthSec ± 1s.

Integration: run npx autoshorts scripts on tests/fixtures/topics/fixture1.json to create scripts for all ideas; assert each idea generated variants.

Edge case: if LLM returns content longer than slot, ensure generator truncates and re-tunes segments, logging any truncation.

Logging & artifacts

Log to logs/script.log run summary: total ideas processed, successes, failures.

Write individual LLM request/response in CACHE_DIR/llm/script/<hash>.json with timestamp for traceability.

On success, append a summary to progress.md with timestamp: ✔ step-400 script generator completed <timestamp>.

PR instructions

Branch: feature/script-generator

Title: feat(script): generate multi-variant short scripts from ideas

PR body: include sample data/scripts/<runId>.json, commands to run unit/integration tests, and CI status.