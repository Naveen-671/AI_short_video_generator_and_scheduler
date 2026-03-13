export interface Prosody {
  rate?: string;   // e.g. '+15%', '-10%'
  pitch?: string;  // e.g. '+8Hz', '-5Hz'
  volume?: string; // e.g. '+10%', '-5%'
}

export interface VoiceProfile {
  name: string;
  description: string;
  ttsVoiceName?: string;
  prosody?: Prosody;
}

export type TTSProviderName = 'edge' | 'piper' | 'coqui' | 'mock';

export interface TTSResult {
  audioPath: string;
  durationSec: number;
  provider: TTSProviderName;
  cacheKey: string;
}

export interface AudioManifestItem {
  scriptId: string;
  audioPath: string;
  durationSec: number;
  segmentDurations?: number[];
  voiceProfile: string;
  cacheKey: string;
  synthesisProvider: TTSProviderName;
  createdAt: string;
}

export interface AudioManifest {
  runId: string;
  items: AudioManifestItem[];
}

export interface TTSProvider {
  name: TTSProviderName;
  synthesize(text: string, voiceProfile: VoiceProfile, outputPath: string): Promise<TTSResult>;
  isAvailable(): boolean;
}

export interface SynthesizeOptions {
  voice?: string;
  concurrency?: number;
}
