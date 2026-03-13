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

/**
 * Word-wrap text into lines that fit on screen.
 * Targets ~maxChars characters per line, breaking at word boundaries.
 */
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
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
 * │ ▓▓ TOPIC TITLE ▓▓▓▓▓ │  ← Title bar (persistent, 80px)
 * │                       │
 * │     SPEAKER NAME      │  ← Speaker name (y=350)
 * │   ┌──────────────┐    │
 * │   │  Caption L1   │   │  ← Word-wrapped caption lines (y=400+)
 * │   │  Caption L2   │   │     Max 4 lines, centered
 * │   │  Caption L3   │   │
 * │   └──────────────┘    │
 * │                       │
 * │  • Bullet 1           │  ← Progressive facts (y=750+)
 * │  • Bullet 2           │
 * │                       │
 * │  ┌────┐      ┌────┐   │  ← Characters (270px wide, bottom)
 * │  │ N  │      │ R  │   │
 * │  └────┘      └────┘   │
 * │  Source: HN            │  ← Source citation
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
  const baseFontSize = template.fontSize;
  const fontFamily = template.fontFamily;

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

  // --- Step 2: Overlay character sprites (smaller: 25% width = ~270px) ---
  const charW = Math.round(1080 * 0.25);
  const charMargin = 30;

  if (hasNarratorSprite && narratorInput >= 0) {
    filterParts.push(`[${narratorInput}:v]scale=${charW}:-1[narrator_scaled]`);

    const narratorEnableExprs = segments
      .filter(s => s.speaker === 'narrator')
      .map(s => `between(t\\,${s.startSec}\\,${s.endSec})`)
      .join('+');

    if (narratorEnableExprs) {
      filterParts.push(
        `${currentLabel}drawbox=x=0:y=ih-500:w=${charW + 2 * charMargin}:h=500:color=${captionHighlight}@0.08:t=fill:enable=${narratorEnableExprs}[bg_n_glow]`
      );
      filterParts.push(`[bg_n_glow][narrator_scaled]overlay=x=${charMargin}:y=H-h-60[bg_n]`);
    } else {
      filterParts.push(`${currentLabel}[narrator_scaled]overlay=x=${charMargin}:y=H-h-60[bg_n]`);
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
        `${currentLabel}drawbox=x=iw-${charW + 2 * charMargin}:y=ih-500:w=${charW + 2 * charMargin}:h=500:color=${captionHighlight}@0.08:t=fill:enable=${reactorEnableExprs}[bg_r_glow]`
      );
      filterParts.push(`[bg_r_glow][reactor_scaled]overlay=x=W-w-${charMargin}:y=H-h-60[bg_r]`);
    } else {
      filterParts.push(`${currentLabel}[reactor_scaled]overlay=x=W-w-${charMargin}:y=H-h-60[bg_r]`);
    }
    currentLabel = '[bg_r]';
  }

  // --- Step 3: Word-wrapped captions with background box ---
  // Dynamic font size: scale down for long texts
  const captionMaxChars = 38; // chars per line at base font
  const captionBaseY = 380;   // top of caption area
  const captionLineH = Math.round(baseFontSize * 1.4); // line height
  const boxPadding = 14;

  let segIdx = 0;
  for (const seg of segments) {
    // Adapt font size based on text length
    let fontSize = baseFontSize;
    if (seg.text.length > 200) fontSize = Math.round(baseFontSize * 0.7);
    else if (seg.text.length > 120) fontSize = Math.round(baseFontSize * 0.8);
    else if (seg.text.length > 80) fontSize = Math.round(baseFontSize * 0.9);

    const lineH = Math.round(fontSize * 1.4);
    const maxChars = Math.round(captionMaxChars * (baseFontSize / fontSize));
    const lines = wrapText(seg.text, maxChars);
    // Limit to 5 lines max
    const displayLines = lines.slice(0, 5);

    const isNarrator = seg.speaker === 'narrator';
    const boxColor = isNarrator ? captionBg : captionHighlight;

    // Draw a background box for the entire caption area
    const totalCaptionH = displayLines.length * lineH + boxPadding * 2;
    filterParts.push(
      `${currentLabel}drawbox=x=40:y=${captionBaseY - boxPadding}:w=1000:h=${totalCaptionH}:color=${boxColor}@0.80:t=fill:` +
      `enable=between(t\\,${seg.startSec}\\,${seg.endSec})[cbox_${segIdx}]`
    );
    currentLabel = `[cbox_${segIdx}]`;

    // Draw each line of wrapped text
    for (let lineIdx = 0; lineIdx < displayLines.length; lineIdx++) {
      const escaped = escapeDrawtext(displayLines[lineIdx]!);
      const yPos = captionBaseY + lineIdx * lineH;
      const labelSuffix = `${segIdx}_${lineIdx}`;

      filterParts.push(
        `${currentLabel}drawtext=text=${escaped}:font=${fontFamily}:fontsize=${fontSize}:fontcolor=${textColor}:` +
        `x=(w-tw)/2:y=${yPos}:` +
        `enable=between(t\\,${seg.startSec}\\,${seg.endSec})` +
        `[cap_${labelSuffix}]`
      );
      currentLabel = `[cap_${labelSuffix}]`;
    }
    segIdx++;
  }

  // --- Step 4: Speaker name indicator (above caption area) ---
  const speakerFontSize = Math.round(baseFontSize * 0.55);
  const nameY = captionBaseY - 50;

  for (const seg of segments) {
    const speakerName = seg.speaker === 'narrator' ? pair.narrator.name : pair.reactor.name;
    const escapedName = escapeDrawtext(speakerName.toUpperCase());
    // Speaker indicator circle: colored dot before name
    const dotColor = seg.speaker === 'narrator' ? captionBg : captionHighlight;

    filterParts.push(
      `${currentLabel}drawbox=x=420:y=${nameY + 4}:w=16:h=16:color=${dotColor}:t=fill:` +
      `enable=between(t\\,${seg.startSec}\\,${seg.endSec})[ndot_${seg.label}]`
    );
    currentLabel = `[ndot_${seg.label}]`;

    filterParts.push(
      `${currentLabel}drawtext=text=${escapedName}:font=${fontFamily}:fontsize=${speakerFontSize}:fontcolor=${captionHighlight}:` +
      `x=445:y=${nameY}:` +
      `enable=between(t\\,${seg.startSec}\\,${seg.endSec})` +
      `[name_${seg.label}]`
    );
    currentLabel = `[name_${seg.label}]`;
  }

  // --- Step 5: Info overlays (title, source, bullets, progress bar) ---
  if (overlay) {
    const accentColor = (template.accentColor ?? '#e94560').replace(/^#/, '0x');
    const overlayFontSize = Math.round(baseFontSize * 0.52);
    const smallFontSize = Math.round(baseFontSize * 0.42);
    const dur = overlay.totalDuration;

    // 5a: Title bar — dark strip at top
    filterParts.push(
      `${currentLabel}drawbox=x=0:y=0:w=iw:h=80:color=0x000000@0.70:t=fill[title_bg]`
    );
    currentLabel = '[title_bg]';

    // Accent line under title
    filterParts.push(
      `${currentLabel}drawbox=x=0:y=78:w=iw:h=3:color=${accentColor}@0.6:t=fill[title_line]`
    );
    currentLabel = '[title_line]';

    const escapedTitle = escapeDrawtext(overlay.title.toUpperCase());
    filterParts.push(
      `${currentLabel}drawtext=text=${escapedTitle}:font=${fontFamily}:fontsize=${overlayFontSize}:fontcolor=${captionHighlight}:` +
      `x=(w-tw)/2:y=22[title_txt]`
    );
    currentLabel = '[title_txt]';

    // 5b: Bullet points — appear progressively below caption area
    if (overlay.displayBullets.length > 0) {
      const bulletStartTime = Math.max(5, dur * 0.1);
      const bulletInterval = (dur * 0.6) / Math.max(1, overlay.displayBullets.length);
      const bulletX = 80;
      const bulletStartY = 700;
      const bulletLineH = Math.round(smallFontSize * 1.8);

      for (let i = 0; i < Math.min(overlay.displayBullets.length, 5); i++) {
        const bulletLines = wrapText(overlay.displayBullets[i]!, 45);
        const bulletText = escapeDrawtext(`\u25B8 ${bulletLines[0]!}`);
        const showTime = bulletStartTime + i * bulletInterval;
        const yPos = bulletStartY + i * bulletLineH;

        // Bullet background
        filterParts.push(
          `${currentLabel}drawbox=x=55:y=${yPos - 3}:w=970:h=${bulletLineH - 4}:color=0x000000@0.50:t=fill:` +
          `enable=gte(t\\,${showTime.toFixed(2)})[bul_bg_${i}]`
        );
        currentLabel = `[bul_bg_${i}]`;

        // Accent left bar
        filterParts.push(
          `${currentLabel}drawbox=x=55:y=${yPos - 3}:w=4:h=${bulletLineH - 4}:color=${accentColor}@0.8:t=fill:` +
          `enable=gte(t\\,${showTime.toFixed(2)})[bul_bar_${i}]`
        );
        currentLabel = `[bul_bar_${i}]`;

        filterParts.push(
          `${currentLabel}drawtext=text=${bulletText}:font=${fontFamily}:fontsize=${smallFontSize}:fontcolor=0xf0f0f0:` +
          `x=${bulletX}:y=${yPos}:` +
          `enable=gte(t\\,${showTime.toFixed(2)})[bul_${i}]`
        );
        currentLabel = `[bul_${i}]`;
      }
    }

    // 5c: Source citation — above characters, bottom area
    if (overlay.sourceLine) {
      const escapedSource = escapeDrawtext(overlay.sourceLine);
      filterParts.push(
        `${currentLabel}drawbox=x=0:y=ih-52:w=iw:h=46:color=0x000000@0.60:t=fill[src_bg]`
      );
      currentLabel = '[src_bg]';

      filterParts.push(
        `${currentLabel}drawtext=text=${escapedSource}:font=${fontFamily}:fontsize=${smallFontSize}:fontcolor=0xbbbbbb:` +
        `x=(w-tw)/2:y=h-44[src_txt]`
      );
      currentLabel = '[src_txt]';
    }

    // 5d: Progress bar — accent-colored bar at the very bottom
    filterParts.push(
      `${currentLabel}drawbox=x=0:y=ih-6:w=iw*t/${dur.toFixed(2)}:h=6:color=${accentColor}@0.9:t=fill[prog]`
    );
    currentLabel = '[prog]';
  }

  // Final output label
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
    '-preset', 'medium',
    '-crf', '18',
    '-c:a', 'aac',
    '-b:a', '192k',
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
