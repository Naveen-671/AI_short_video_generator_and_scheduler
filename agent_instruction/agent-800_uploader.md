STEP 8 — Video Upload Module
Objective

Implement the uploader module that automatically publishes generated videos to supported platforms.

Primary targets:

YouTube Shorts

Instagram Reels

The uploader must read video artifacts and metadata, upload them using official APIs, and record upload status.

Inputs

Video files produced by renderer:

data/videos/<runId>/*.mp4

Metadata:

data/scripts/<runId>.json
data/topics/<runId>.json

Captions:

data/videos/<runId>/*.srt
Outputs

Write upload manifest:

data/uploads/<runId>.json

Example:

{
 "platform": "youtube",
 "videoId": "abc123",
 "scriptId": "openai-gpt54-anime-001",
 "uploadedAt": "2026-03-13T12:00:00Z",
 "status": "success"
}
Required Environment Variables
YOUTUBE_CLIENT_ID
YOUTUBE_CLIENT_SECRET
YOUTUBE_REFRESH_TOKEN

IG_BUSINESS_ACCOUNT_ID
FB_PAGE_ACCESS_TOKEN
Module API

Implement:

modules/uploader/uploadVideos(runId: string, options?)

CLI:

npx autoshorts upload --runId=<runId>
Upload Strategy
YouTube Shorts

Use official YouTube Data API.

Video constraints:

≤ 60 seconds
vertical 9:16

Metadata generation:

title = script.title
description = script.displayBullets.join("\n")
tags = hashtags

Also upload captions:

.srt file
Instagram Reels

Use Instagram Graph API.

Steps:

1 create container
2 upload video
3 publish media

Limit:

~100 API posts per day
Error Handling

Retry policy:

3 retries
exponential backoff

Log failures to:

logs/uploader.log
Tests

Unit tests:

mock YouTube API

verify metadata generation

Integration tests:

simulate upload responses

Acceptance Criteria

Running:

npx autoshorts upload --runId=test

should create:

data/uploads/test.json

with successful upload records.

PR

Branch:

feature/uploader

Title:

feat(uploader): automated video upload pipeline