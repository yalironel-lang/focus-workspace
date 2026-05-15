import type { LucideIcon } from 'lucide-react';
import {
  Square,
  Lamp,
  Moon,
  FileText,
  Microscope,
  Sun,
  Mountain,
  Snowflake,
  Zap,
  Telescope,
  Sparkles,
  Rainbow,
  Cloud,
  Orbit,
  CircleDot,
  Palette,
  Layers,
} from 'lucide-react';
import type { BackgroundPresetId } from '../workspaceBackgroundStudio';

export type PresetGroup = 'professional' | 'light' | 'space' | 'zodiac';

export interface PresetMeta {
  icon: LucideIcon;
  group: PresetGroup;
  mood: string;
}

export const PRESET_GROUP_LABELS: Record<PresetGroup, string> = {
  professional: 'Professional',
  light: 'Light',
  space: 'Space',
  zodiac: 'Zodiac',
};

export const PRESET_META: Record<BackgroundPresetId, PresetMeta> = {
  'deep-graphite': { icon: Square, group: 'professional', mood: 'Neutral focus' },
  'warm-studio': { icon: Lamp, group: 'professional', mood: 'Amber study' },
  'midnight-navy': { icon: Moon, group: 'professional', mood: 'Deep calm' },
  'paper-dark': { icon: FileText, group: 'professional', mood: 'Paper comfort' },
  'research-lab': { icon: Microscope, group: 'professional', mood: 'Analytical' },
  'minimal-light': { icon: Sun, group: 'light', mood: 'Clean daylight' },
  'soft-sand': { icon: Mountain, group: 'light', mood: 'Warm dunes' },
  arctic: { icon: Snowflake, group: 'light', mood: 'Cool clarity' },
  'electric-blue': { icon: Zap, group: 'space', mood: 'Controlled energy' },
  observatory: { icon: Telescope, group: 'space', mood: 'Stargazing' },
  'cosmic-dust': { icon: Sparkles, group: 'space', mood: 'Interstellar haze' },
  aurora: { icon: Rainbow, group: 'space', mood: 'Northern lights' },
  'nebula-purple': { icon: Cloud, group: 'space', mood: 'Violet nebula' },
  'milky-way': { icon: Orbit, group: 'space', mood: 'Galaxy band' },
  'deep-space': { icon: Layers, group: 'space', mood: 'Void depth' },
  'zodiac-chamber': { icon: CircleDot, group: 'zodiac', mood: 'Celestial wheel' },
  custom: { icon: Palette, group: 'professional', mood: 'Your color' },
  'cosmic-drift': { icon: Orbit, group: 'space', mood: 'Celestial drift' },
  'ocean-depths': { icon: Cloud, group: 'space', mood: 'Deep water' },
  'ancient-forest': { icon: Mountain, group: 'space', mood: 'Forest fog' },
  'dinosaur-realm': { icon: Layers, group: 'space', mood: 'Cinematic wild' },
};

export const PRESET_GROUP_ORDER: PresetGroup[] = ['professional', 'light', 'space', 'zodiac'];

export function presetsInGroup(ids: BackgroundPresetId[], group: PresetGroup): BackgroundPresetId[] {
  return ids.filter(id => id !== 'custom' && PRESET_META[id]?.group === group);
}
