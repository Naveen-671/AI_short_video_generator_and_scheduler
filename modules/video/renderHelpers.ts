import * as path from 'node:path';
import * as fs from 'node:fs';
import type { TimedSegment } from '../script/types.js';
import type { TemplateConfig } from './types.js';
import { getCharacterPair, getBackgroundAsset } from './characters.js';

/**
 * Generate SRT subtitle content from timed segments.
 */
export function generateSrt(segments: TimedSegment[]): string {
  const lines: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    lines.push(`${i + 1}`);
    lines.push(`${formatSrtTime(seg.startSec)} --> ${formatSrtTime(seg.endSec)}`);
    lines.push(seg.text);
    lines.push('');
  }

  return lines.join('\n');
}

function formatSrtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec % 1) * 1000);

  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(ms)}`;
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function pad3(n: number): string {
  return n.toString().padStart(3, '0');
}

/**
 * Escape text for ffmpeg drawtext filter (without single-quote wrapping).
 * We avoid wrapping in single quotes because apostrophes in text would
 * break ffmpeg's filter-level quote parsing.
 */
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')       // \ → \\
    .replace(/'/g, '\u2019')       // ASCII apostrophe → Unicode right single quote (visually identical)
    .replace(/:/g, '\\:')         // : → \: (option separator)
    .replace(/;/g, '\\;')         // ; → \; (filter chain separator)
    .replace(/,/g, '\\,')         // , → \, (filter separator within chain)
    .replace(/%/g, '%%')          // % → %% (printf escape)
    .replace(/\[/g, '\\[')        // [ → \[ (stream label bracket)
    .replace(/]/g, '\\]');         // ] → \] (stream label bracket)
}

/**
 * Build ffmpeg filter_complex for the dialogue composite video.
 *
 * Layout (1080×1920 vertical):
 * ┌──────────────────┐
 * │                  │  ← Background video/color (full frame)
 * │                  │
 * │   ┌──────────┐   │  ← Caption box (center, word-highlighted)
 * │   │ CAPTION  │   │
 * │   └──────────┘   │
 * │                  │
 * │  ┌───┐    ┌───┐  │  ← Character sprites (bottom left/right)
 * │  │ N │    │ R │  │
 * │  └───┘    └───┘  │
 * └──────────────────┘
 */
export function buildDialogueFilter(
  segments: TimedSegment[],
  template: TemplateConfig,
  channel: string,
  hasBackground: boolean,
  hasNarratorSprite: boolean,
  hasReactorSprite: boolean,
): { filterComplex: string; inputCount: number } {
  const pair = getCharacterPair(channel);
  const captionBg = (template.captionBgColor ?? '#6b21a8').replace(/^#/, '0x');
  const captionHighlight = (template.captionHighlightColor ?? '#facc15').replace(/^#/, '0x');
  const textColor = template.textColor.replace(/^#/, '0x');
  const fontSize = template.fontSize;
  const fontFamily = template.fontFamily;

  // Track input indices
  // [0] = background (color or video), [1] = audio, [2+] = sprite images
  let nextInput = 2;
  const narratorInput = hasNarratorSprite ? nextInput++ : -1;
  const reactorInput = hasReactorSprite ? nextInput++ : -1;

  const filterParts: string[] = [];
  let currentLabel = '[0:v]';

  // --- Step 1: Scale/prepare background ---
  if (hasBackground) {
    filterParts.push(`${currentLabel}scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[bg]`);
  } else {
    filterParts.push(`${currentLabel}setsar=1[bg]`);
  }
  currentLabel = '[bg]';

  // --- Step 2: Overlay character sprites ---
  // Character scale: ~40% of width = 432px wide
  const charW = Math.round(1080 * (template.characterScale ?? 0.4));
  const charMargin = 20;

  if (hasNarratorSprite && narratorInput >= 0) {
    filterParts.push(`[${narratorInput}:v]scale=${charW}:-1[narrator_scaled]`);

    // Build speaker glow: narrator glows when speaking
    const narratorEnableExprs = segments
      .filter(s => s.speaker === 'narrator')
      .map(s => `between(t\\,${s.startSec}\\,${s.endSec})`)
      .join('+');

    // Position narrator at bottom-left
    if (narratorEnableExprs) {
      // Add a subtle highlight rectangle behind narrator when speaking
      filterParts.push(
        `${currentLabel}drawbox=x=0:y=ih-${charW + 200}:w=${charW + 2 * charMargin}:h=${charW + 200}:color=${captionHighlight}@0.15:t=fill:enable=${narratorEnableExprs}[bg_n_glow]`
      );
      filterParts.push(`[bg_n_glow][narrator_scaled]overlay=x=${charMargin}:y=H-h-${charMargin}[bg_n]`);
    } else {
      filterParts.push(`${currentLabel}[narrator_scaled]overlay=x=${charMargin}:y=H-h-${charMargin}[bg_n]`);
    }
    currentLabel = '[bg_n]';
  }

  if (hasReactorSprite && reactorInput >= 0) {
    filterParts.push(`[${reactorInput}:v]scale=${charW}:-1[reactor_scaled]`);

    const reactorEnableExprs = segments
      .filter(s => s.speaker === 'reactor')
      .map(s => `between(t\\,${s.startSec}\\,${s.endSec})`)
      .join('+');

    if (reactorEnableExprs) {
      filterParts.push(
        `${currentLabel}drawbox=x=iw-${charW + 2 * charMargin}:y=ih-${charW + 200}:w=${charW + 2 * charMargin}:h=${charW + 200}:color=${captionHighlight}@0.15:t=fill:enable=${reactorEnableExprs}[bg_r_glow]`
      );
      filterParts.push(`[bg_r_glow][reactor_scaled]overlay=x=W-w-${charMargin}:y=H-h-${charMargin}[bg_r]`);
    } else {
      filterParts.push(`${currentLabel}[reactor_scaled]overlay=x=W-w-${charMargin}:y=H-h-${charMargin}[bg_r]`);
    }
    currentLabel = '[bg_r]';
  }

  // --- Step 3: Draw caption text with highlight box ---
  // Caption position: center of screen, above character sprites
  const captionY = 'h/2-60';
  const boxPadding = 12;

  for (const seg of segments) {
    const escaped = escapeDrawtext(seg.text);
    // Use accent color background for the speaking character
    const isNarrator = seg.speaker === 'narrator';
    const boxColor = isNarrator ? captionBg : `${captionHighlight}`;

    // Caption box: colored background with white text
    filterParts.push(
      `${currentLabel}drawtext=text=${escaped}:font=${fontFamily}:fontsize=${fontSize}:fontcolor=${textColor}:` +
      `x=(w-tw)/2:y=${captionY}:` +
      `box=1:boxcolor=${boxColor}@0.85:boxborderw=${boxPadding}:` +
      `enable=between(t\\,${seg.startSec}\\,${seg.endSec})` +
      `[cap_${seg.label}]`
    );
    currentLabel = `[cap_${seg.label}]`;
  }

  // --- Step 4: Speaker name indicator ---
  const speakerFontSize = Math.round(fontSize * 0.6);
  const nameY = 'h/2-100';

  for (const seg of segments) {
    const speakerName = seg.speaker === 'narrator' ? pair.narrator.name : pair.reactor.name;
    const escapedName = escapeDrawtext(speakerName.toUpperCase());

    filterParts.push(
      `${currentLabel}drawtext=text=${escapedName}:font=${fontFamily}:fontsize=${speakerFontSize}:fontcolor=${captionHighlight}:` +
      `x=(w-tw)/2:y=${nameY}:` +
      `enable=between(t\\,${seg.startSec}\\,${seg.endSec})` +
      `[name_${seg.label}]`
    );
    currentLabel = `[name_${seg.label}]`;
  }

  // Final output label — replace the last occurrence of currentLabel with [outv]
  const finalFilter = filterParts.join(';');
  const lastIdx = finalFilter.lastIndexOf(currentLabel);
  const outputFilter = lastIdx >= 0
    ? finalFilter.slice(0, lastIdx) + '[outv]' + finalFilter.slice(lastIdx + currentLabel.length)
    : finalFilter;

  return {
    filterComplex: outputFilter,
    inputCount: nextInput,
  };
}

/**
 * Build full ffmpeg command for dialogue-style composite video.
 */
export function buildFfmpegCommand(
  audioPath: string,
  outputPath: string,
  durationSec: number,
  segments: TimedSegment[],
  template: TemplateConfig,
  channel: string,
  watermarkPath?: string,
): string[] {
  const args: string[] = ['ffmpeg', '-y'];

  // --- Input 0: Background ---
  const bgAsset = getBackgroundAsset(channel);
  const hasBackground = !!bgAsset;

  if (bgAsset) {
    // Loop background video to match duration
    args.push('-stream_loop', '-1', '-i', bgAsset);
  } else {
    // Solid color background fallback
    const bgColor = template.bgColor.replace(/^#/, '0x');
    args.push('-f', 'lavfi', '-i', `color=c=${bgColor}:s=1080x1920:d=${durationSec}:r=30`);
  }

  // --- Input 1: Audio ---
  args.push('-i', audioPath);

  // --- Input 2+: Character sprites ---
  const pair = getCharacterPair(channel);
  const narratorSpritePath = path.resolve(pair.narrator.spritePath);
  const reactorSpritePath = path.resolve(pair.reactor.spritePath);
  const hasNarratorSprite = fs.existsSync(narratorSpritePath);
  const hasReactorSprite = fs.existsSync(reactorSpritePath);

  if (hasNarratorSprite) args.push('-i', narratorSpritePath);
  if (hasReactorSprite) args.push('-i', reactorSpritePath);

  // --- Build filter ---
  const { filterComplex } = buildDialogueFilter(
    segments,
    template,
    channel,
    hasBackground,
    hasNarratorSprite,
    hasReactorSprite,
  );

  // Handle watermark (append to filter)
  let finalFilter = filterComplex;
  if (watermarkPath && fs.existsSync(watermarkPath)) {
    const wmIdx = (hasNarratorSprite ? 1 : 0) + (hasReactorSprite ? 1 : 0) + 2;
    args.push('-i', watermarkPath);
    finalFilter = finalFilter.replace('[outv]', `[pre_wm];[pre_wm][${wmIdx}:v]overlay=W-w-20:H-h-20[outv]`);
  }

  args.push('-filter_complex', finalFilter);
  args.push('-map', '[outv]', '-map', '1:a');
  args.push(
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    '-shortest',
    '-t', durationSec.toString(),
    outputPath,
  );

  return args;
}

/**
 * Calculate total video duration from segments.
 */
export function calculateDuration(segments: TimedSegment[]): number {
  if (segments.length === 0) return 0;
  return Math.max(...segments.map((s) => s.endSec));
}
