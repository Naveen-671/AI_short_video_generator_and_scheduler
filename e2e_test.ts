/* eslint-disable no-console */
/**
 * End-to-end dialogue pipeline test.
 * Runs: scripts → voice (emotional TTS) → video render
 * Uses existing topic data from a prior trend run.
 */
import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { generateScriptsFromTopics } from './modules/script/generateScripts.js';
import { synthesizeForScripts } from './modules/voice/synthesizeForScripts.js';
import { renderFromScript } from './modules/video/renderFromScript.js';
import { readJson } from './modules/fsutils.js';
import type { VideoIdea } from './modules/topic/types.js';
import type { ScriptArtifact } from './modules/script/types.js';
import type { AudioManifest } from './modules/voice/types.js';
import type { VideoManifest } from './modules/video/types.js';

const RUN_ID = 'e2e-dialogue-test';

async function main() {
  console.log('=== End-to-End Dialogue Pipeline Test ===\n');

  // Find existing topics file
  const topicsDir = path.resolve('data/topics');
  const topicFiles = fs.existsSync(topicsDir)
    ? fs.readdirSync(topicsDir).filter(f => f.endsWith('.json'))
    : [];

  if (topicFiles.length === 0) {
    console.error('No topic files found. Run trend detection first.');
    process.exit(1);
  }

  // Copy latest topics to our runId
  const srcTopics = path.join(topicsDir, topicFiles[0]!);
  const dstTopics = path.join(topicsDir, `${RUN_ID}.json`);
  fs.copyFileSync(srcTopics, dstTopics);
  console.log(`Using topics from: ${topicFiles[0]}`);

  // Limit to 1 idea for speed (modify the copied file)
  const ideas = readJson<VideoIdea[]>(dstTopics)!;
  const limitedIdeas = ideas.slice(0, 1); // Just 1 video for testing
  fs.writeFileSync(dstTopics, JSON.stringify(limitedIdeas, null, 2));
  console.log(`Topic: "${limitedIdeas[0].topic}" (channel: ${limitedIdeas[0].channel})\n`);

  // Step 1: Generate dialogue scripts
  console.log('--- Step 1: Generating dialogue script ---');
  const t1 = Date.now();
  const scriptsPath = await generateScriptsFromTopics(RUN_ID, {
    variants: 1,
    lengths: [60],
    force: true,
  });
  console.log(`Scripts: ${scriptsPath} (${Date.now() - t1}ms)`);

  // Show the script content
  const scripts = readJson<ScriptArtifact[]>(scriptsPath)!;
  for (const s of scripts) {
    console.log(`\n  Title: "${s.title}"`);
    console.log(`  Dialogue mode: ${s.dialogueMode}`);
    console.log(`  Segments:`);
    for (const seg of s.timedSegments) {
      const emotion = seg.emotion ? ` [${seg.emotion}]` : '';
      console.log(`    ${seg.startSec}-${seg.endSec}s ${seg.speaker?.toUpperCase() ?? 'UNKNOWN'}: "${seg.text}"${emotion}`);
    }
  }

  // Step 2: Synthesize with emotional TTS
  console.log('\n--- Step 2: Voice synthesis (emotional TTS) ---');
  const t2 = Date.now();
  const audioPath = await synthesizeForScripts(RUN_ID, { concurrency: 1 });
  console.log(`Audio: ${audioPath} (${Date.now() - t2}ms)`);

  const audioManifest = readJson<AudioManifest>(audioPath)!;
  for (const item of audioManifest.items) {
    const fileSize = fs.existsSync(item.audioPath) ? fs.statSync(item.audioPath).size : 0;
    console.log(`  ${item.scriptId}: ${item.durationSec}s, ${(fileSize / 1024).toFixed(1)}KB, voice: ${item.voiceProfile}`);
  }

  // Step 3: Render composite video
  console.log('\n--- Step 3: Video rendering (dialogue composite) ---');
  const t3 = Date.now();
  try {
    const videoPath = await renderFromScript(RUN_ID, { concurrency: 1 });
    console.log(`Video: ${videoPath} (${Date.now() - t3}ms)`);

    const videoManifest = readJson<VideoManifest>(videoPath)!;
    for (const item of videoManifest.items) {
      const fileSize = fs.existsSync(item.videoPath) ? fs.statSync(item.videoPath).size : 0;
      console.log(`  ${item.scriptId}: ${item.durationSec}s, ${(fileSize / 1024).toFixed(1)}KB`);
      console.log(`  Video: ${item.videoPath}`);
      console.log(`  SRT:   ${item.srtPath}`);
      if (fileSize < 10000) {
        console.log(`  WARNING: Video file is very small (${fileSize} bytes) — ffmpeg may have failed!`);
      }
    }
  } catch (err) {
    console.error('Video rendering error:', err);
  }

  console.log('\n=== Pipeline Complete ===');
  console.log(`Total time: ${Date.now() - t1}ms`);
}

main().catch(err => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
