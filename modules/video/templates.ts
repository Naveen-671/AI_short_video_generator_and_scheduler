import type { TemplateConfig } from './types.js';

export const TEMPLATES: Record<string, TemplateConfig> = {
  anime_template: {
    name: 'anime_template',
    description: 'Two anime characters discussing tech topics',
    channels: ['anime_explains'],
    bgColor: '#1a1a2e',
    fontFamily: 'Arial',
    fontSize: 48,
    textColor: '#ffffff',
    accentColor: '#e94560',
    overlayStyle: 'dialogue',
    captionStyle: 'highlight',
    captionBgColor: '#6b21a8',
    captionHighlightColor: '#facc15',
    characterScale: 0.4,
  },
  tech_template: {
    name: 'tech_template',
    description: 'Dev and intern discussing AI tools',
    channels: ['ai_tools'],
    bgColor: '#0f0f23',
    fontFamily: 'Arial',
    fontSize: 42,
    textColor: '#e0e0e0',
    accentColor: '#00d4ff',
    overlayStyle: 'dialogue',
    captionStyle: 'highlight',
    captionBgColor: '#1e3a5f',
    captionHighlightColor: '#00d4ff',
    characterScale: 0.4,
  },
  fact_template: {
    name: 'fact_template',
    description: 'Professor and student on tech facts',
    channels: ['tech_facts'],
    bgColor: '#121212',
    fontFamily: 'Arial',
    fontSize: 40,
    textColor: '#f5f5f5',
    accentColor: '#76ff03',
    overlayStyle: 'dialogue',
    captionStyle: 'highlight',
    captionBgColor: '#1b5e20',
    captionHighlightColor: '#76ff03',
    characterScale: 0.4,
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
