STEP 3 — Topic Selection Engine (Ideas & Channel Mapping)
Objective

Implement the engine that converts raw trend detection output into channel-specific video ideas formatted for the three channels: anime_explains, ai_tools, and tech_facts. Each idea should include a short internal brief (1–3 lines), a 30-second script outline, a visual/template hint, estimated tags/hashtags, and a priority score. Save outputs to ./data/topics/<run-timestamp>.json.

Inputs

Trend detection artifact: ./data/trends/<runId>.json.

Channel config: config/channels.json describing voice style, video template, posting cadence.

Optional: templates/* per channel with text placeholders.

Output data model

Save JSON objects with the following structure to data/topics/<runId>.json (array of ideas):

{
  "ideaId": "openai-gpt54-anime-001",
  "channel": "anime_explains",
  "topic": "openai gpt-5.4 release",
  "title": "Gojo explains the GPT-5.4 release in 30s",
  "priority": 0.92,
  "brief": "Short hook + 3 key improvements + benchmark summary",
  "scriptOutline": {
    "hook":"3s: 'OpenAI just released GPT-5.4 — it's faster and smarter.'",
    "point1":"what is new (10s)",
    "point2":"benchmark highlights (8s)",
    "cta":"follow for tech explained in 30s (4s)"
  },
  "visualHints": {
    "character":"gojo.png",
    "overlay":"benchmark-bar-chart",
    "bgMusic":"energetic-loop-01"
  },
  "hashtags":["#OpenAI","#GPT5","#AIExplained"],
  "estimatedLengthSec": 30
}
Responsibilities & behavior

Idea generation:

For each mergedTopic from trend detection, generate N candidate ideas (N configurable, default 3) across channels.

For each channel apply its voice/style template to create a channel-appropriate title + brief.

Script outline generation:

Produce a concise script outline with timed segments (hook, 1–3 points, CTA) that fits within the estimatedLengthSec window.

Provide an option for two variants: concise (30s) and expanded (45–60s).

Visual/template hints:

For anime_explains: choose a character from assets/anime_characters/ (ensure attribution or original art). Provide camera movement hints (e.g., zoom_in, pan_left), and overlay recommendations (charts, numbers).

For ai_tools: recommend screen capture segments, short tool screenshots, or animated bullet points.

For tech_facts: recommend infographic style, numeric overlays, and fast cuts.

Priority scoring:

Compute a priority score for each idea combining:

trendScore (from trend module)

recency (how new)

channelFit (binary weight, higher if keywords match channel topic map)

diversityPenalty (reduce duplicates)

Output normalized priority in [0,1].

Filtering:

Reject ideas which violate policy (copyrighted headlines, explicit adult content).

Avoid ideas with extremely low trendScore or flagged as noise by trend filter.

Batching & persistence:

Save final idea list to ./data/topics/<runId>.json.

Cache per-run to avoid re-generating identical ideas.

Algorithm & heuristics

Channel keyword maps:

anime_explains → keywords: model release, new model, AI announcement, benchmarks

ai_tools → tool, plugin, workflow, extension

tech_facts → how, what, explained, facts

Priority formula (suggested):

priority = normalize(0.5*trendScore + 0.2*recencyBoost + 0.2*channelFit + 0.1*(1 - diversityPenalty))

RecencyBoost: 1.0 for run time within 2 hours of first observed spike, decays linearly to 0 at 24 hours.

LLM usage & prompts

Use the provider adapter modules/ai/providers.ts for scriptOutline generation. Do not send full topic lists; provide compact metadata only.

Prompt template (use verbatim unless optimizing):

Prompt: Generate 30s script outline

You are a concise short-video copywriter. Given a topic and channel style, produce a 30-second script outline divided into segments. Keep the hook under 4 seconds. Provide 3 short bullet lines for display text that can be overlaid on-screen.

Input:
topic: {{topic}}
channel: {{channel}}
styleHints: {{styleHints}}  # e.g., "anime, character: energetic, fun"

Output JSON:
{
 "title": "...",
 "scriptOutline": {
   "hook": "...",
   "seg1": "...",
   "seg2": "...",
   "cta": "..."
 },
 "displayBullets": ["...", "...", "..."]
}

Use small token budgets; cache responses keyed by sha256(topic+channel+styleHints).

CLI/API

Export function modules/topic/generateFromTrends(trendArtifactPath, options) producing data/topics/<runId>.json.

CLI command: npx autoshorts topics --runId=<runId> --variants=3.

Tests

Unit test: given a synthetic mergedTopic for "openai gpt-5.4", the engine must produce at least one idea for each channel with non-empty scriptOutline and visualHints.

Integration: pipeline test reading tests/fixtures/trend/fixture1.json and asserting data/topics/<run>.json exists and contains N ideas.

Edge case: duplicate topics across runs should be flagged with duplicateOf pointing to first idea id.

Logging & artifact naming

Log a summary to logs/topic.log: number of ideas generated, top 3 ideas with priority.

Idea IDs must be deterministic (e.g., slug(topic)-channel-hash).

Acceptance criteria

Running npx autoshorts topics --runId=<existingTrendRun> creates data/topics/<runId>.json.

Generated ideas include:

title, channel, priority, brief, scriptOutline, visualHints, hashtags.

Unit tests and integration tests pass in CI.

PR instructions

Branch: feature/topic-engine

Title: feat(topic): convert trends to channel-specific video ideas

PR body: include sample data/topics/<runId>.json and commands to run tests.