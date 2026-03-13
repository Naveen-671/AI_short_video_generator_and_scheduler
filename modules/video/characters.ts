import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Prosody } from '../voice/types.js';

export interface CharacterConfig {
  id: string;
  name: string;
  spritePath: string;
  ttsVoice: string;
  /** Default speech prosody for this character's personality */
  defaultProsody: Prosody;
  position: 'left' | 'right';
}

export interface CharacterPair {
  narrator: CharacterConfig;
  reactor: CharacterConfig;
}

/**
 * Default character pairs per channel.
 * Uses the most expressive Edge-TTS Neural voices with style support.
 * Sprite paths are relative to project root assets/characters/.
 */
const CHARACTER_PAIRS: Record<string, CharacterPair> = {
  anime_explains: {
    narrator: {
      id: 'sensei',
      name: 'Sensei',
      spritePath: 'assets/characters/sensei.png',
      ttsVoice: 'en-US-AndrewNeural',       // deep, confident male
      defaultProsody: { rate: '+5%', pitch: '-2Hz', volume: '+5%' },
      position: 'left',
    },
    reactor: {
      id: 'kohai',
      name: 'Kohai',
      spritePath: 'assets/characters/kohai.png',
      ttsVoice: 'en-US-AriaNeural',         // most expressive female
      defaultProsody: { rate: '+8%', pitch: '+5Hz', volume: '+8%' },
      position: 'right',
    },
  },
  ai_tools: {
    narrator: {
      id: 'dev',
      name: 'Dev',
      spritePath: 'assets/characters/dev.png',
      ttsVoice: 'en-US-GuyNeural',          // professional male
      defaultProsody: { rate: '+3%', pitch: '+0Hz', volume: '+3%' },
      position: 'left',
    },
    reactor: {
      id: 'intern',
      name: 'Intern',
      spritePath: 'assets/characters/intern.png',
      ttsVoice: 'en-US-JennyNeural',        // versatile female
      defaultProsody: { rate: '+10%', pitch: '+6Hz', volume: '+8%' },
      position: 'right',
    },
  },
  tech_facts: {
    narrator: {
      id: 'professor',
      name: 'Professor',
      spritePath: 'assets/characters/professor.png',
      ttsVoice: 'en-US-RogerNeural',        // authoritative male
      defaultProsody: { rate: '-3%', pitch: '-3Hz', volume: '+3%' },
      position: 'left',
    },
    reactor: {
      id: 'student',
      name: 'Student',
      spritePath: 'assets/characters/student.png',
      ttsVoice: 'en-US-EmmaNeural',         // expressive female
      defaultProsody: { rate: '+12%', pitch: '+8Hz', volume: '+10%' },
      position: 'right',
    },
  },
};

export function getCharacterPair(channel: string): CharacterPair {
  return CHARACTER_PAIRS[channel] ?? CHARACTER_PAIRS['anime_explains']!;
}

export function getCharacterForSpeaker(channel: string, speaker: 'narrator' | 'reactor'): CharacterConfig {
  const pair = getCharacterPair(channel);
  return pair[speaker];
}

/**
 * Check if character sprite files exist.
 * Returns paths that are missing.
 */
export function getMissingSprites(channel: string): string[] {
  const pair = getCharacterPair(channel);
  const missing: string[] = [];
  for (const char of [pair.narrator, pair.reactor]) {
    const absPath = path.resolve(char.spritePath);
    if (!fs.existsSync(absPath)) missing.push(char.spritePath);
  }
  return missing;
}

/**
 * Get the background video/image path for a channel.
 * Falls back to a solid color if no background asset exists.
 */
export function getBackgroundAsset(channel: string): string | null {
  const bgDir = path.resolve('assets/backgrounds');
  const candidates = [
    path.join(bgDir, `${channel}.mp4`),
    path.join(bgDir, `${channel}.webm`),
    path.join(bgDir, 'default.mp4'),
    path.join(bgDir, 'default.webm'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}
