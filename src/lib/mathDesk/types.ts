export type DeskZoneId = 'formula' | 'compute' | 'graph' | 'scratch';

export type DeskFormulaItem = {
  id: string;
  topic: string;
  formula: string;
  meaning?: string;
  whenToUse?: string;
  remember?: string;
  createdAt: number;
  updatedAt: number;
};

export type DeskLayoutState = {
  collapsed?: Partial<Record<DeskZoneId, boolean>>;
};

export type DeskComputeHistoryEntry = { expr: string; result: string };

export const DESK_GRAPH_DEFAULT = {
  expression: 'x^2',
  xmin: -6,
  xmax: 6,
  ymin: -4,
  ymax: 8,
} as const;

export function deskFormulaUid(): string {
  return `df_${Math.random().toString(36).slice(2, 11)}`;
}

export function isDeskZoneCollapsed(
  zone: DeskZoneId,
  _formulas: DeskFormulaItem[],
  layout: DeskLayoutState | undefined,
): boolean {
  const explicit = layout?.collapsed?.[zone];
  if (explicit !== undefined) return explicit;
  return true;
}
