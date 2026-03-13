STEP 9 — Scheduler / Automation Engine
Objective

Implement an automation engine that runs the pipeline on a schedule.

The scheduler orchestrates the workflow:

trend detection
→ topic generation
→ script generation
→ voice generation
→ video rendering
→ captions
→ upload
Scheduling System

Default schedule:

every 6 hours

Use Node cron scheduler:

node-cron
Workflow

Execution pipeline:

detect trends
generate ideas
generate scripts
synthesize voice
render video
generate captions
upload
collect analytics
Module API

Implement:

modules/scheduler/startScheduler()

CLI:

npx autoshorts run
Configuration

Read scheduler settings from:

config/scheduler.json

Example:

{
 "intervalHours": 6,
 "channels": ["anime_explains","ai_tools","tech_facts"]
}
Safety Mechanisms

Prevent duplicate runs:

lock file system

Example:

data/locks/pipeline.lock
Logging

Each run creates log entry:

logs/scheduler.log

Example entry:

2026-03-13 12:00 pipeline started
Acceptance Criteria

Running:

npx autoshorts run

should execute the entire pipeline once.

Tests

Mock scheduler runs and verify modules called in correct order.

PR

Branch:

feature/scheduler

Title:

feat(scheduler): automated pipeline execution