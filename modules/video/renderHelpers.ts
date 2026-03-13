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
 * Escape text for ffmpeg drawtext filter, wrapped in single quotes.
 * Apostrophes are replaced with Unicode right single quote so
 * single-quote wrapping is safe. Colons and other separators are
 * also backslash-escaped for double protection.
 */
function escapeDrawtext(text: string): string {
  const inner = text
    .replace(/\\/g, '\\\\')       // \ → \\
    .replace(/'/g, '\u2019')       // ASCII apostrophe → Unicode right single quote
    .replace(/:/g, '\\:')         // : → \: (option separator)
    .replace(/;/g, '\\;')         // ; → \; (filter chain separator)
    .replace(/,/g, '\\,')         // , → \, (filter separator)
    .replace(/%/g, '%%')          // % → %% (printf escape)
    .replace(/\[/g, '\\[')        // [ → \[
    .replace(/]/g, '\\]');         // ] → \]
  return `'${inner}'`;
}

export interface OverlayInfo {
  title: string;
  sourceLine: string;
  displayBullets: string[];
  totalDuration: number;
}

/**
 * Build ffmpeg filter_complex for the dialogue composite video.
 *
 * Layout (1080×1920 vertical):
 * ┌──────────────────────┐
 * │ ▓▓ TOPIC TITLE ▓▓▓▓▓ │  ← Title bar (persistent)
 * │                       │
 * │  • Bullet 1           │  ← Bullet points (appear progressively)
 * │  • Bullet 2           │
 * │  • Bullet 3           │
 * │                       │
 * │     SPEAKER NAME      │  ← Speaker name label
 * │   ┌──────────────┐    │  ← Caption box (center)
 * │   │  CAPTION TEXT │    │
 * │   └──────────────┘    │
 * │                       │
 * │  ┌───┐        ┌───┐   │  ← Character sprites (bottom)
 * │  │ N │        │ R │   │
 * │  └───┘        └───┘   │
 * │  Source: HackerNews    │  ← Source citation
 * │  ████████░░░░░░░░░░░░ │  ← Progress bar
 * └───────────────────────┘
 */
export function buildDialogueFilter(
  segments: TimedSegment[],
  template: TemplateConfig,
  channel: string,
  hasBackground: boolean,
  hasNarratorSprite: boolean,
  hasReactorSprite: boolean,
  overlay?: OverlayInfo,
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

  // --- Step 5: Info overlays (title, source, bullets, progress bar) ---
  if (overlay) {
    const accentColor = (template.accentColor ?? '#e94560').replace(/^#/, '0x');
    const overlayFontSize = Math.round(fontSize * 0.55);
    const smallFontSize = Math.round(fontSize * 0.45);
    const dur = overlay.totalDuration;

    // 5a: Title bar — dark semi-transparent strip at top with title text
    filterParts.push(
      `${currentLabel}drawbox=x=0:y=0:w=iw:h=90:color=0x000000@0.65:t=fill[title_bg]`
    );
    currentLabel = '[title_bg]';

    const escapedTitle = escapeDrawtext(overlay.title.toUpperCase());
    filterParts.push(
      `${currentLabel}drawtext=text=${escapedTitle}:font=${fontFamily}:fontsize=${overlayFontSize}:fontcolor=${captionHighlight}:` +
      `x=(w-tw)/2:y=28[title_txt]`
    );
    currentLabel = '[title_txt]';

    // 5b: Bullet points — appear progressively in the upper area
    if (overlay.displayBullets.length > 0) {
      const bulletStartTime = Math.max(3, dur * 0.08);
      const bulletInterval = (dur * 0.7) / Math.max(1, overlay.displayBullets.length);
      const bulletX = 60;
      const bulletStartY = 130;
      const bulletLineH = Math.round(overlayFontSize * 1.6);

      for (let i = 0; i < overlay.displayBullets.length; i++) {
        const bulletText = escapeDrawtext(`\u2022 ${overlay.displayBullets[i]!}`);
        const showTime = bulletStartTime + i * bulletInterval;
        const yPos = bulletStartY + i * bulletLineH;

        // Background strip for readability
        filterParts.push(
          `${currentLabel}drawbox=x=40:y=${yPos - 4}:w=1000:h=${bulletLineH}:color=0x000000@0.45:t=fill:` +
          `enable=gte(t\\,${showTime.toFixed(2)})[bul_bg_${i}]`
        );
        currentLabel = `[bul_bg_${i}]`;

        filterParts.push(
          `${currentLabel}drawtext=text=${bulletText}:font=${fontFamily}:fontsize=${smallFontSize}:fontcolor=0xf0f0f0:` +
          `x=${bulletX}:y=${yPos}:` +
          `enable=gte(t\\,${showTime.toFixed(2)})[bul_${i}]`
        );
        currentLabel = `[bul_${i}]`;
      }
    }

    // 5c: Source citation — bottom area, above the progress bar
    if (overlay.sourceLine) {
      const escapedSource = escapeDrawtext(overlay.sourceLine);
      filterParts.push(
        `${currentLabel}drawbox=x=0:y=ih-50:w=iw:h=44:color=0x000000@0.55:t=fill[src_bg]`
      );
      currentLabel = '[src_bg]';

      filterParts.push(
        `${currentLabel}drawtext=text=${escapedSource}:font=${fontFamily}:fontsize=${smallFontSize}:fontcolor=0xcccccc:` +
        `x=(w-tw)/2:y=h-44[src_txt]`
      );
      currentLabel = '[src_txt]';
    }

    // 5d: Progress bar — thin accent-colored bar at the very bottom
    filterParts.push(
      `${currentLabel}drawbox=x=0:y=ih-6:w=iw*t/${dur.toFixed(2)}:h=6:color=${accentColor}@0.9:t=fill[prog]`
    );
    currentLabel = '[prog]';
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
  overlay?: OverlayInfo,
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
    overlay,
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
