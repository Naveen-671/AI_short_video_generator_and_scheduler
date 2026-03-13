import type { TimedSegment } from '../script/types.js';

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
 * Build ffmpeg filter_complex string for drawtext overlays.
 */
export function buildDrawtextFilter(
  segments: TimedSegment[],
  fontFamily: string,
  fontSize: number,
  textColor: string,
): string {
  const filters: string[] = [];

  for (const seg of segments) {
    const escapedText = seg.text
      .replace(/'/g, "\\'")
      .replace(/:/g, '\\:')
      .replace(/\\/g, '\\\\');

    // Position text in lower third
    const y = seg.label === 'hook' ? '(h-th)/2' : 'h-th-100';
    const size = seg.label === 'hook' ? fontSize * 1.3 : fontSize;

    filters.push(
      `drawtext=text='${escapedText}':fontfile=${fontFamily}:fontsize=${size}:fontcolor=${textColor}:x=(w-tw)/2:y=${y}:enable='between(t,${seg.startSec},${seg.endSec})'`,
    );
  }

  return filters.join(',');
}

/**
 * Build full ffmpeg command for rendering a video.
 */
export function buildFfmpegCommand(
  audioPath: string,
  outputPath: string,
  durationSec: number,
  segments: TimedSegment[],
  template: { bgColor: string; fontFamily: string; fontSize: number; textColor: string },
  watermarkPath?: string,
): string[] {
  const args: string[] = ['ffmpeg', '-y'];

  // Generate solid color background
  args.push(
    '-f', 'lavfi',
    '-i', `color=c=${template.bgColor}:s=1080x1920:d=${durationSec}:r=30`,
  );

  // Audio input
  args.push('-i', audioPath);

  // Build filter
  const textFilter = buildDrawtextFilter(
    segments,
    template.fontFamily,
    template.fontSize,
    template.textColor,
  );

  let filterComplex = `[0:v]${textFilter}`;

  if (watermarkPath) {
    args.push('-i', watermarkPath);
    filterComplex += `[txt];[txt][2:v]overlay=W-w-20:H-h-20`;
  }

  filterComplex += '[outv]';

  args.push('-filter_complex', filterComplex);
  args.push('-map', '[outv]', '-map', '1:a');
  args.push(
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
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
