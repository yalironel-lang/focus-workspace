import type { LucideIcon } from 'lucide-react';

export type CommandGroupId =
  | 'navigation'
  | 'quick'
  | 'workspace'
  | 'free-space'
  | 'search';

export interface CommandItem {
  id: string;
  group: CommandGroupId;
  groupLabel: string;
  label: string;
  subtitle?: string;
  keywords?: string[];
  icon?: LucideIcon;
  /** Lower = better when sorting matches */
  priority?: number;
  disabled?: boolean;
  disabledHint?: string;
  run: () => void;
}

export interface FreeSpaceCommandHandlers {
  addNotebook: () => void;
  addTextCard: () => void;
  addCalculator: () => void;
  addGraph: () => void;
}
