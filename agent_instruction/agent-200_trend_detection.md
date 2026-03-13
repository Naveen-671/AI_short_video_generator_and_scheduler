STEP 2 — Trend Detection Module
Objective

Implement a robust trend-detection service that collects signals from multiple free sources (Google Trends via pytrends, Reddit (pushshift or API/scraping fallback), Hacker News (Algolia), and RSS feeds). The service produces normalized trending topic objects with a source-agnostic score and time series metadata. Results are saved as JSON artifacts to ./data/trends/<timestamp>.json.

Important: Keep service provider calls conservative and rate-limited. All network calls must implement retry/backoff and caching.

Inputs

Optional: since timestamp or hours window (default 6 hours).

Config: config/trend_sources.json lists which sources are enabled.

Outputs

Write ./data/trends/<run-timestamp>.json with shape:

{
  "runId": "2026-03-13T12:00:00Z",
  "sourceScores": [
    {
      "topic":"openai gpt-5.4",
      "source":"google_trends",
      "score": 0.87,
      "metadata": {"query": "openai gpt 5.4", "region": "global"}
    },
    {
      "topic":"anthropic model release",
      "source":"hackernews",
      "score": 0.63,
      "metadata": {"hn_item_id": 12345}
    }
  ],
  "mergedTopics":[
    {
      "topic":"openai gpt-5.4 release",
      "score": 0.82,
      "sources": ["google_trends", "reddit", "hackernews"],
      "examples": [{"source":"reddit","link":"https://reddit.com/..."}]
    }
  ]
}
Required environment variables
CACHE_DIR=./data/cache
LOG_DIR=./logs

No API keys required for the basic Google Trends + HN + Reddit scraping approach. If using Reddit API, allow optional REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET.

Module responsibilities

Source adapters (one adapter per source):

modules/trend/adapters/googleTrends.ts (uses pytrends via child process or a JS wrapper)

modules/trend/adapters/hackerNews.ts (Algolia HN API)

modules/trend/adapters/reddit.ts (Pushshift or Reddit API fallback)

modules/trend/adapters/rssFetcher.ts (list of tech RSS feeds configurable)

Normalization & merge:

Normalize raw results to a common topic text form.

Merge near-duplicate topics (use fuzzy text similarity, e.g., normalized stem + n-gram overlap).

Assign aggregated score: weighted average of source scores (weights configurable).

Time-series:

For each candidate topic store a small timeseries of counts (per minute/hour) for the run window.

Dedup & persistence:

Save run artifact: data/trends/<runId>.json.

Check data/trends/history.json and deduplicate repeated runs.

Rate limiting & caching:

Respect source rate limits; cache source raw responses to CACHE_DIR for 6 hours to avoid repeated calls during development.

Filtering:

Only keep topics relevant to channels (use a simple keyword match for tech, ai, software, models, release, benchmark).

Discard topics that match blacklist (celebrity gossip etc.).

Implementation details & heuristics

Score normalization: Convert each source's native metric to [0,1] scaled by observed historical maxima. For Google Trends use interest_over_time; for HN use points + comments normalized; for Reddit use upvotes & comment counts normalized.

Merge logic: compute cosine similarity between topic embeddings (optional) or use fuzzy match; if fuzzy match >= 0.85 merge them.

Output top-N trending topics (configurable, default 20) ranked by aggregated score.

API / CLI

Implement modules/trend/runTrendDetection(options) exported and callable from CLI.

CLI command: npx autoshorts trend --hours=6 --top=10 which writes artifact and prints summary to console.

Tests

Unit tests for each adapter using recorded fixture responses (store fixtures under tests/fixtures/trend/).

Integration smoke test: run trend detection in offline mode reading fixtures and assert output contains mergedTopics array and at least one item.

Edge-case test: network failure on a source triggers retries and then gracefully continues with other sources; record error in logs/trend.log.

Logging & observability

Each run must append to logs/trend.log with timestamp, runId, number of candidates, mergedTopics length, and any errors.

For each source adapter record request latency and HTTP status.

Acceptance criteria

Running npx autoshorts trend --hours=6 produces data/trends/<id>.json.

The artifact contains mergedTopics (non-empty when fixtures or real web data present).

The module respects caching: multiple immediate runs reuse cached source results and do not call remote endpoints.

PR instructions

Branch: feature/trend-detection

Title: feat(trend): multi-source trend detection adapters

PR body: include sample run output, commands to run offline with fixtures, and artifact path.