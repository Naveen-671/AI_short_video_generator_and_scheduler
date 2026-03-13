STEP 10 — Analytics Collector
Objective

Collect engagement metrics from platforms and store them locally.

Metrics will later help determine which content performs best.

Metrics Collected

For each video:

views
likes
comments
shares
watch_time
Data Source

Primary:

YouTube API

Secondary:

Instagram insights API

Output

Write metrics:

data/metrics/<date>.json

Example:

{
 "videoId": "abc123",
 "views": 12000,
 "likes": 800,
 "comments": 50,
 "watchTime": 30000
}
Module API
modules/analytics/collectMetrics()

CLI:

npx autoshorts analytics
Data Aggregation

Compute engagement score:

engagement =
views*0.4 + likes*0.3 + comments*0.3
Storage

Metrics stored locally:

data/metrics/
Tests

Mock API responses.

Verify metrics aggregation.

Acceptance Criteria

Running:

npx autoshorts analytics

creates metrics files.

PR

Branch:

feature/analytics

Title:

feat(analytics): video performance tracking