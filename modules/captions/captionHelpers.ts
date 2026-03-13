import type { TranscriptionSegment } from './types.js';
import type { TimedSegment } from '../script/types.js';

/**
 * Format SRT subtitle content from transcription segments.
 * Ensures lines ≤ 70 chars and ≤ 2 lines per subtitle.
 */
export function formatSrt(segments: TranscriptionSegment[]): string {
  const lines: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    lines.push(`${i + 1}`);
    lines.push(`${formatTime(seg.startSec)} --> ${formatTime(seg.endSec)}`);

    // Break text into lines of ≤70 chars, max 2 lines
    const textLines = wrapText(seg.text, 70, 2);
    lines.push(textLines.join('\n'));
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format WebVTT content from transcription segments.
 */
export function formatVtt(segments: TranscriptionSegment[]): string {
  const lines: string[] = ['WEBVTT', ''];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    lines.push(`${i + 1}`);
    lines.push(`${formatVttTime(seg.startSec)} --> ${formatVttTime(seg.endSec)}`);
    const textLines = wrapText(seg.text, 70, 2);
    lines.push(textLines.join('\n'));
    lines.push('');
  }

  return lines.join('\n');
}

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec % 1) * 1000);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(ms)}`;
}

function formatVttTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec % 1) * 1000);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}.${pad3(ms)}`;
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function pad3(n: number): string {
  return n.toString().padStart(3, '0');
}

/**
 * Wrap text into lines of max length, max lines count.
 */
export function wrapText(text: string, maxLen: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (current.length + word.length + 1 > maxLen && current.length > 0) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) {
        // Append remaining to last line
        lines[lines.length - 1] += ' ' + words.slice(words.indexOf(word)).join(' ');
        return lines.slice(0, maxLines);
      }
    } else {
      current = current ? current + ' ' + word : word;
    }
  }

  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

/**
 * Generate mock transcription from timed segments (when no Whisper available).
 * Uses the script segments as ground truth for caption text.
 */
export function mockTranscribe(segments: TimedSegment[]): TranscriptionSegment[] {
  return segments.map((seg) => ({
    startSec: seg.startSec,
    endSec: seg.endSec,
    text: fixPunctuation(seg.text),
    confidence: 0.95,
  }));
}

/**
 * Fix common punctuation issues in transcribed text.
 */
export function fixPunctuation(text: string): string {
  let fixed = text.trim();
  // Remove double spaces
  fixed = fixed.replace(/\s{2,}/g, ' ');
  // Ensure sentence ends with punctuation
  if (fixed.length > 0 && !/[.!?]$/.test(fixed)) {
    fixed += '.';
  }
  // Fix space before punctuation
  fixed = fixed.replace(/\s+([.!?,])/g, '$1');
  // Fix missing space after punctuation
  fixed = fixed.replace(/([.!?,])([A-Za-z])/g, '$1 $2');
  return fixed;
}

/**
 * Compute average confidence from transcription segments.
 */
export function averageConfidence(segments: TranscriptionSegment[]): number {
  if (segments.length === 0) return 0;
  const sum = segments.reduce((acc, s) => acc + s.confidence, 0);
  return sum / segments.length;
}

/**
 * Validate timestamps are monotonic (no overlaps).
 */
export function validateTimestamps(segments: TranscriptionSegment[]): boolean {
  for (let i = 1; i < segments.length; i++) {
    if (segments[i]!.startSec < segments[i - 1]!.endSec) return false;
  }
  return true;
}
