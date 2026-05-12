import type { LucideIcon } from 'lucide-react';

export type CommandGroupId =
  | 'navigation'
  | 'quick'
  | 'workspace'
  | 'free-space'
  | 'intelligence'
  | 'advanced-cloud-ai'
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
  addMistake?: () => void;
  addCalculator: () => void;
  addGraph: () => void;
  addPdf?: () => void;
  /** Current selected Free Space object id, if any */
  getFreeSpaceSelectedId?: () => string | null;
  /** Enter connect mode from the selected object (requires Free Space tab + selection) */
  startConnectFromSelected?: () => void;
  /** Remove all connections involving the selected object */
  clearConnectionsForSelected?: () => void;
  openMistakeReviewAll?: () => void;
  openMistakeReviewNeglected?: () => void;
  openMistakeReviewLowConfidence?: () => void;
  convertSelectedNoteToMistake?: () => void;
}
