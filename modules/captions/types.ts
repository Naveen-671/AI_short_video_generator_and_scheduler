export type WhisperProviderName = 'whisper-local' | 'openai-whisper' | 'whisper.cpp' | 'mock';

export interface TranscriptionSegment {
  startSec: number;
  endSec: number;
  text: string;
  confidence: number;
}

export interface WordHighlight {
  word: string;
  startSec: number;
  endSec: number;
}

export interface CaptionResult {
  videoFile: string;
  srtPath: string;
  vttPath: string;
  burnedPath: string | null;
  highlightsPath: string | null;
  confidence: number;
  needs_review: boolean;
  noSpeech: boolean;
  speaker: string;
}

export interface CaptionsManifest {
  runId: string;
  items: CaptionResult[];
}

export interface CaptionOptions {
  language?: string;
  burnIn?: boolean;
}
