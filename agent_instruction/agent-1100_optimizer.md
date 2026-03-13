STEP 11 — Performance Optimizer
Objective

Create a learning system that adjusts future content generation based on performance data.

Input

Metrics:

data/metrics/

Topics:

data/topics/

Scripts:

data/scripts/
Output

Updated strategy:

data/strategy.json

Example:

{
 "bestChannel": "anime_explains",
 "topTopics": ["AI models","coding tricks"],
 "recommendedFrequency": 3
}
Optimization Logic

Compute performance:

engagement score
watch time ratio
growth rate
Strategy Updates

Example rules:

if anime channel performs best
increase generation frequency
Module API
modules/optimizer/updateStrategy()

CLI:

npx autoshorts optimize
Self-Improving Pipeline

Future runs should read:

data/strategy.json

to prioritize:

high-performing topics
Acceptance Criteria

Running optimizer updates strategy file.

PR

Branch:

feature/optimizer

Title:

feat(optimizer): adaptive content strategy