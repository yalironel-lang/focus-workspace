/**
 * useCustomTools — store and manage user-created formula tools.
 *
 * Each tool is a named card with:
 *   - named inputs (numeric)
 *   - a safe math formula referencing those inputs by ID
 *   - an output label
 *
 * Stored in localStorage as `fw_custom_tools_v1`.
 * Shape is designed so future Supabase persistence is a drop-in replacement.
 */

import { useState, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ToolInput {
  id:           string;   // slug used in formula, e.g. "midterm"
  label:        string;   // display label, e.g. "Midterm Score"
  defaultValue: number;
  min?:         number;
  max?:         number;
}

export interface CustomTool {
  id:          string;
  name:        string;
  description: string;
  emoji:       string;
  inputs:      ToolInput[];
  formula:     string;    // safe math expression
  outputLabel: string;    // e.g. "Final Grade"
  precision:   number;    // decimal places to show
  createdAt:   string;    // ISO
  updatedAt:   string;    // ISO
}

// ── Presets — shipped examples users can load ─────────────────────────────────

export const TOOL_PRESETS: Omit<CustomTool, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name:        'Grade Calculator',
    description: 'Weighted average of midterm and final exam scores.',
    emoji:       '🎓',
    inputs: [
      { id: 'midterm', label: 'Midterm Score',  defaultValue: 75, min: 0, max: 100 },
      { id: 'final',   label: 'Final Score',    defaultValue: 80, min: 0, max: 100 },
      { id: 'w1',      label: 'Midterm Weight', defaultValue: 40, min: 0, max: 100 },
    ],
    formula:     '(midterm * w1 + final * (100 - w1)) / 100',
    outputLabel: 'Final Grade',
    precision:   1,
  },
  {
    name:        'GPA Estimator',
    description: 'Estimate GPA from percentage score.',
    emoji:       '📊',
    inputs: [
      { id: 'score', label: 'Percentage Score', defaultValue: 85, min: 0, max: 100 },
    ],
    formula:     'score / 25',
    outputLabel: 'GPA (out of 4)',
    precision:   2,
  },
  {
    name:        'Budget Splitter',
    description: 'Split a total cost equally across people.',
    emoji:       '💰',
    inputs: [
      { id: 'total',  label: 'Total Cost ($)',  defaultValue: 120, min: 0 },
      { id: 'people', label: 'Number of People', defaultValue: 4,  min: 1 },
    ],
    formula:     'total / people',
    outputLabel: 'Per Person ($)',
    precision:   2,
  },
  {
    name:        'Study Hours Tracker',
    description: 'Total study time across multiple subjects.',
    emoji:       '📚',
    inputs: [
      { id: 'h1', label: 'Subject 1 (hrs)', defaultValue: 2, min: 0 },
      { id: 'h2', label: 'Subject 2 (hrs)', defaultValue: 1.5, min: 0 },
      { id: 'h3', label: 'Subject 3 (hrs)', defaultValue: 3, min: 0 },
    ],
    formula:     'h1 + h2 + h3',
    outputLabel: 'Total Study Hours',
    precision:   1,
  },
  {
    name:        'Percentage Calculator',
    description: 'What percentage is A of B?',
    emoji:       '📐',
    inputs: [
      { id: 'part',  label: 'Part',  defaultValue: 45, min: 0 },
      { id: 'total', label: 'Total', defaultValue: 60, min: 0 },
    ],
    formula:     '(part / total) * 100',
    outputLabel: 'Percentage (%)',
    precision:   1,
  },
  {
    name:        'Tip Calculator',
    description: 'Calculate tip and total for a meal.',
    emoji:       '🍽',
    inputs: [
      { id: 'bill',    label: 'Bill Amount ($)', defaultValue: 50, min: 0 },
      { id: 'tip_pct', label: 'Tip % ',         defaultValue: 18, min: 0, max: 100 },
    ],
    formula:     'bill + (bill * tip_pct / 100)',
    outputLabel: 'Total to Pay ($)',
    precision:   2,
  },
];

// ── Storage helpers ───────────────────────────────────────────────────────────

const STORAGE_KEY = 'fw_custom_tools_v1';

function load(): CustomTool[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CustomTool[]) : [];
  } catch {
    return [];
  }
}

function persist(tools: CustomTool[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tools)); } catch { /* quota */ }
}

function uid(): string {
  return `tool-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface CustomToolsState {
  tools:        CustomTool[];
  addTool:      (spec: Omit<CustomTool, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateTool:   (id: string, patch: Partial<Omit<CustomTool, 'id' | 'createdAt'>>) => void;
  deleteTool:   (id: string) => void;
  getTool:      (id: string) => CustomTool | undefined;
}

export function useCustomTools(): CustomToolsState {
  const [tools, setTools] = useState<CustomTool[]>(load);

  const addTool = useCallback(
    (spec: Omit<CustomTool, 'id' | 'createdAt' | 'updatedAt'>): string => {
      const now  = new Date().toISOString();
      const tool: CustomTool = { ...spec, id: uid(), createdAt: now, updatedAt: now };
      setTools(prev => {
        const next = [...prev, tool];
        persist(next);
        return next;
      });
      return tool.id;
    },
    [],
  );

  const updateTool = useCallback((id: string, patch: Partial<Omit<CustomTool, 'id' | 'createdAt'>>) => {
    setTools(prev => {
      const next = prev.map(t =>
        t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t,
      );
      persist(next);
      return next;
    });
  }, []);

  const deleteTool = useCallback((id: string) => {
    setTools(prev => {
      const next = prev.filter(t => t.id !== id);
      persist(next);
      return next;
    });
  }, []);

  const getTool = useCallback(
    (id: string): CustomTool | undefined => tools.find(t => t.id === id),
    [tools],
  );

  return { tools, addTool, updateTool, deleteTool, getTool };
}
