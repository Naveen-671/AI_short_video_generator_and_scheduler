export type EmotionHint = 'excited' | 'surprised' | 'dramatic' | 'calm' | 'cheerful' | 'serious' | 'curious' | 'sarcastic';

export interface TimedSegment {
  label: string;
  startSec: number;
  endSec: number;
  text: string;
  speaker?: 'narrator' | 'reactor';
  emotion?: EmotionHint;
}

export interface ScriptArtifact {
  scriptId: string;
  ideaId: string;
  channel: string;
  title: string;
  hook: string;
  timedSegments: TimedSegment[];
  displayBullets: string[];
  estimatedLengthSec: number;
  notesForVoice: string;
  dialogueMode?: boolean;
  metadata: {
    styleHints: Record<string, unknown>;
    visualHints: Record<string, unknown>;
  };
  llm_cache_key: string;
  requires_verification: boolean;
  failed?: boolean;
  createdAt: string;
}
