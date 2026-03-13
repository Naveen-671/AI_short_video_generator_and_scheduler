import type { TemplateConfig } from './types.js';

export const TEMPLATES: Record<string, TemplateConfig> = {
  anime_template: {
    name: 'anime_template',
    description: 'Anime character + speech bubble + subtitles',
    channels: ['anime_explains'],
    bgColor: '#1a1a2e',
    fontFamily: 'Arial',
    fontSize: 48,
    textColor: '#ffffff',
    accentColor: '#e94560',
    overlayStyle: 'speech-bubble',
  },
  tech_template: {
    name: 'tech_template',
    description: 'Minimal UI, bullet animations',
    channels: ['ai_tools'],
    bgColor: '#0f0f23',
    fontFamily: 'Roboto',
    fontSize: 42,
    textColor: '#e0e0e0',
    accentColor: '#00d4ff',
    overlayStyle: 'bullet-list',
  },
  fact_template: {
    name: 'fact_template',
    description: 'Charts, numbers, fast cuts',
    channels: ['tech_facts'],
    bgColor: '#121212',
    fontFamily: 'Consolas',
    fontSize: 40,
    textColor: '#f5f5f5',
    accentColor: '#76ff03',
    overlayStyle: 'chart-overlay',
  },
};

/**
 * Get template config for a channel, falling back to tech_template.
 */
export function getTemplateForChannel(channel: string, overrideName?: string): TemplateConfig {
  if (overrideName && TEMPLATES[overrideName]) {
    return TEMPLATES[overrideName]!;
  }

  for (const tpl of Object.values(TEMPLATES)) {
    if (tpl.channels.includes(channel)) return tpl;
  }

  return TEMPLATES['tech_template']!;
}
