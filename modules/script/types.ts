export interface TimedSegment {
  label: string;
  startSec: number;
  endSec: number;
  text: string;
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
  metadata: {
    styleHints: Record<string, unknown>;
    visualHints: Record<string, unknown>;
  };
  llm_cache_key: string;
  requires_verification: boolean;
  failed?: boolean;
  createdAt: string;
}
