/**
 * Notebook Appearance V1 — durable Notebook Designer metadata foundation.
 *
 * Lives on Free Space object `content.appearance` only.
 * Never stored in documentBody / body / codec / TipTap JSON.
 *
 * paperStyle, notebookSurface, and icon remain separate notebook-level SoTs.
 * Absence of appearance = product defaults (resolve at read time; never write on hydrate).
 *
 * Presets resolve into structured tokens. Renderers consume persisted tokens —
 * never "if preset === midnight" CSS branches as source of truth.
 */

export const NOTEBOOK_APPEARANCE_VERSION_V1 = 1 as const;

export type NotebookAppearanceVersion = typeof NOTEBOOK_APPEARANCE_VERSION_V1;

export type NotebookDesignPresetId =
  | 'classic'
  | 'minimal'
  | 'soft'
  | 'academic'
  | 'midnight'
  | 'glass'
  | 'blueprint'
  | 'pastel'
  | 'aurora'
  | 'ember'
  | 'slate'
  | 'ink';

export type NotebookIdentityColor =
  | 'neutral'
  | 'blue'
  | 'cyan'
  | 'green'
  | 'amber'
  | 'orange'
  | 'rose'
  | 'purple'
  | 'indigo';

export type NotebookIdentityTreatment =
  | 'flat'
  | 'paper'
  | 'soft'
  | 'glass'
  | 'gradient'
  | 'lined-edge'
  | 'blueprint';

export type NotebookWritingWidth = 'compact' | 'comfortable' | 'wide';

export type NotebookWritingDensity = 'compact' | 'comfortable' | 'spacious';

export interface NotebookAppearanceIdentityV1 {
  preset?: NotebookDesignPresetId;
  color?: NotebookIdentityColor;
  accent?: NotebookIdentityColor;
  treatment?: NotebookIdentityTreatment;
}

export interface NotebookAppearanceWritingV1 {
  width?: NotebookWritingWidth;
  density?: NotebookWritingDensity;
}

export interface NotebookAppearanceV1 {
  version: NotebookAppearanceVersion;
  identity?: NotebookAppearanceIdentityV1;
  writing?: NotebookAppearanceWritingV1;
}

/** Fully resolved tokens for read/render — never persist merely by resolving. */
export interface ResolvedNotebookAppearanceV1 {
  identity: {
    preset: NotebookDesignPresetId | null;
    color: NotebookIdentityColor;
    accent: NotebookIdentityColor | null;
    treatment: NotebookIdentityTreatment;
  };
  writing: {
    width: NotebookWritingWidth;
    density: NotebookWritingDensity;
  };
}

export type NotebookDesignPresetDefinition = {
  id: NotebookDesignPresetId;
  /** Product label — visual polish deferred to Designer UI phase. */
  label: string;
  identity: {
    color: NotebookIdentityColor;
    accent?: NotebookIdentityColor;
    treatment: NotebookIdentityTreatment;
  };
  writing: {
    width: NotebookWritingWidth;
    density: NotebookWritingDensity;
  };
};

export const NOTEBOOK_DESIGN_PRESET_IDS: readonly NotebookDesignPresetId[] = [
  'classic',
  'minimal',
  'soft',
  'academic',
  'midnight',
  'glass',
  'blueprint',
  'pastel',
  'aurora',
  'ember',
  'slate',
  'ink',
] as const;

export const NOTEBOOK_IDENTITY_COLORS: readonly NotebookIdentityColor[] = [
  'neutral',
  'blue',
  'cyan',
  'green',
  'amber',
  'orange',
  'rose',
  'purple',
  'indigo',
] as const;

export const NOTEBOOK_IDENTITY_TREATMENTS: readonly NotebookIdentityTreatment[] = [
  'flat',
  'paper',
  'soft',
  'glass',
  'gradient',
  'lined-edge',
  'blueprint',
] as const;

export const NOTEBOOK_WRITING_WIDTHS: readonly NotebookWritingWidth[] = [
  'compact',
  'comfortable',
  'wide',
] as const;

export const NOTEBOOK_WRITING_DENSITIES: readonly NotebookWritingDensity[] = [
  'compact',
  'comfortable',
  'spacious',
] as const;

/**
 * Typed catalog foundation. Token values are structural placeholders —
 * final visual specification happens in the Designer UI/visual phase.
 */
export const NOTEBOOK_DESIGN_PRESETS: Record<
  NotebookDesignPresetId,
  NotebookDesignPresetDefinition
> = {
  classic: {
    id: 'classic',
    label: 'Classic',
    identity: { color: 'neutral', treatment: 'flat' },
    writing: { width: 'comfortable', density: 'comfortable' },
  },
  minimal: {
    id: 'minimal',
    label: 'Minimal',
    identity: { color: 'neutral', treatment: 'flat' },
    writing: { width: 'comfortable', density: 'spacious' },
  },
  soft: {
    id: 'soft',
    label: 'Soft',
    identity: { color: 'rose', accent: 'amber', treatment: 'soft' },
    writing: { width: 'comfortable', density: 'comfortable' },
  },
  academic: {
    id: 'academic',
    label: 'Academic',
    identity: { color: 'indigo', accent: 'blue', treatment: 'lined-edge' },
    writing: { width: 'comfortable', density: 'comfortable' },
  },
  midnight: {
    id: 'midnight',
    label: 'Midnight',
    identity: { color: 'purple', accent: 'indigo', treatment: 'glass' },
    writing: { width: 'comfortable', density: 'comfortable' },
  },
  glass: {
    id: 'glass',
    label: 'Glass',
    identity: { color: 'cyan', accent: 'blue', treatment: 'glass' },
    writing: { width: 'wide', density: 'comfortable' },
  },
  blueprint: {
    id: 'blueprint',
    label: 'Blueprint',
    identity: { color: 'blue', accent: 'cyan', treatment: 'blueprint' },
    writing: { width: 'wide', density: 'compact' },
  },
  pastel: {
    id: 'pastel',
    label: 'Pastel',
    identity: { color: 'green', accent: 'rose', treatment: 'soft' },
    writing: { width: 'comfortable', density: 'spacious' },
  },
  aurora: {
    id: 'aurora',
    label: 'Aurora',
    identity: { color: 'indigo', accent: 'purple', treatment: 'gradient' },
    writing: { width: 'comfortable', density: 'comfortable' },
  },
  ember: {
    id: 'ember',
    label: 'Ember',
    identity: { color: 'orange', accent: 'amber', treatment: 'paper' },
    writing: { width: 'comfortable', density: 'comfortable' },
  },
  slate: {
    id: 'slate',
    label: 'Slate',
    identity: { color: 'neutral', accent: 'indigo', treatment: 'flat' },
    writing: { width: 'comfortable', density: 'compact' },
  },
  ink: {
    id: 'ink',
    label: 'Ink',
    identity: { color: 'purple', accent: 'rose', treatment: 'lined-edge' },
    writing: { width: 'compact', density: 'comfortable' },
  },
};

const PRESET_SET = new Set<string>(NOTEBOOK_DESIGN_PRESET_IDS);
const COLOR_SET = new Set<string>(NOTEBOOK_IDENTITY_COLORS);
const TREATMENT_SET = new Set<string>(NOTEBOOK_IDENTITY_TREATMENTS);
const WIDTH_SET = new Set<string>(NOTEBOOK_WRITING_WIDTHS);
const DENSITY_SET = new Set<string>(NOTEBOOK_WRITING_DENSITIES);

export function isNotebookDesignPresetId(v: unknown): v is NotebookDesignPresetId {
  return typeof v === 'string' && PRESET_SET.has(v);
}

export function isNotebookIdentityColor(v: unknown): v is NotebookIdentityColor {
  return typeof v === 'string' && COLOR_SET.has(v);
}

export function isNotebookIdentityTreatment(v: unknown): v is NotebookIdentityTreatment {
  return typeof v === 'string' && TREATMENT_SET.has(v);
}

export function isNotebookWritingWidth(v: unknown): v is NotebookWritingWidth {
  return typeof v === 'string' && WIDTH_SET.has(v);
}

export function isNotebookWritingDensity(v: unknown): v is NotebookWritingDensity {
  return typeof v === 'string' && DENSITY_SET.has(v);
}

/**
 * Whitelist sanitize for notebook content.appearance.
 * Returns undefined when absent or when nothing valid remains (no default injection).
 * Never throws.
 */
export function sanitizeNotebookAppearance(raw: unknown): NotebookAppearanceV1 | undefined {
  try {
    if (raw === undefined || raw === null) return undefined;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const r = raw as Record<string, unknown>;
    if (r.version !== NOTEBOOK_APPEARANCE_VERSION_V1) return undefined;

    let identity: NotebookAppearanceIdentityV1 | undefined;
    if (
      r.identity !== undefined &&
      r.identity !== null &&
      typeof r.identity === 'object' &&
      !Array.isArray(r.identity)
    ) {
      const id = r.identity as Record<string, unknown>;
      const next: NotebookAppearanceIdentityV1 = {};
      if (isNotebookDesignPresetId(id.preset)) next.preset = id.preset;
      if (isNotebookIdentityColor(id.color)) next.color = id.color;
      if (isNotebookIdentityColor(id.accent)) next.accent = id.accent;
      if (isNotebookIdentityTreatment(id.treatment)) next.treatment = id.treatment;
      if (Object.keys(next).length > 0) identity = next;
    }

    let writing: NotebookAppearanceWritingV1 | undefined;
    if (
      r.writing !== undefined &&
      r.writing !== null &&
      typeof r.writing === 'object' &&
      !Array.isArray(r.writing)
    ) {
      const w = r.writing as Record<string, unknown>;
      const next: NotebookAppearanceWritingV1 = {};
      if (isNotebookWritingWidth(w.width)) next.width = w.width;
      if (isNotebookWritingDensity(w.density)) next.density = w.density;
      if (Object.keys(next).length > 0) writing = next;
    }

    // Legacy narrow draft shape (theme / page.width) was never shipped — drop silently.
    if (!identity && !writing) return undefined;

    return {
      version: NOTEBOOK_APPEARANCE_VERSION_V1,
      ...(identity ? { identity } : {}),
      ...(writing ? { writing } : {}),
    };
  } catch {
    return undefined;
  }
}

/** Read-time defaults — do not persist these merely because appearance is absent. */
export const DEFAULT_NOTEBOOK_IDENTITY_COLOR: NotebookIdentityColor = 'neutral';
export const DEFAULT_NOTEBOOK_IDENTITY_TREATMENT: NotebookIdentityTreatment = 'flat';
export const DEFAULT_NOTEBOOK_WRITING_WIDTH: NotebookWritingWidth = 'comfortable';
export const DEFAULT_NOTEBOOK_WRITING_DENSITY: NotebookWritingDensity = 'comfortable';

export function getNotebookDesignPreset(
  id: NotebookDesignPresetId,
): NotebookDesignPresetDefinition {
  return NOTEBOOK_DESIGN_PRESETS[id];
}

/**
 * Resolve a catalog preset into structured tokens (data foundation only).
 * Does not touch notebook content / body / codec.
 */
export function resolveNotebookDesignPresetTokens(
  id: NotebookDesignPresetId,
): Pick<NotebookAppearanceV1, 'identity' | 'writing'> {
  const preset = NOTEBOOK_DESIGN_PRESETS[id];
  return {
    identity: {
      preset: id,
      color: preset.identity.color,
      ...(preset.identity.accent !== undefined ? { accent: preset.identity.accent } : {}),
      treatment: preset.identity.treatment,
    },
    writing: {
      width: preset.writing.width,
      density: preset.writing.density,
    },
  };
}

/**
 * Build a persistable appearance snapshot from a preset selection.
 * Caller decides whether/when to write — this helper never mutates notebooks.
 */
export function appearanceFromNotebookDesignPreset(
  id: NotebookDesignPresetId,
): NotebookAppearanceV1 {
  const tokens = resolveNotebookDesignPresetTokens(id);
  return {
    version: NOTEBOOK_APPEARANCE_VERSION_V1,
    identity: tokens.identity,
    writing: tokens.writing,
  };
}

/**
 * Read-time resolution for renderers. Pure — never writes defaults into content.
 */
export function resolveNotebookAppearance(
  appearance: NotebookAppearanceV1 | null | undefined,
): ResolvedNotebookAppearanceV1 {
  const identity = appearance?.identity;
  const writing = appearance?.writing;
  return {
    identity: {
      preset: identity?.preset ?? null,
      color: identity?.color ?? DEFAULT_NOTEBOOK_IDENTITY_COLOR,
      accent: identity?.accent ?? null,
      treatment: identity?.treatment ?? DEFAULT_NOTEBOOK_IDENTITY_TREATMENT,
    },
    writing: {
      width: writing?.width ?? DEFAULT_NOTEBOOK_WRITING_WIDTH,
      density: writing?.density ?? DEFAULT_NOTEBOOK_WRITING_DENSITY,
    },
  };
}

export function resolveNotebookIdentityColor(
  appearance: NotebookAppearanceV1 | null | undefined,
): NotebookIdentityColor {
  return resolveNotebookAppearance(appearance).identity.color;
}

export function resolveNotebookWritingWidth(
  appearance: NotebookAppearanceV1 | null | undefined,
): NotebookWritingWidth {
  return resolveNotebookAppearance(appearance).writing.width;
}

export function resolveNotebookWritingDensity(
  appearance: NotebookAppearanceV1 | null | undefined,
): NotebookWritingDensity {
  return resolveNotebookAppearance(appearance).writing.density;
}

/**
 * True when resolved identity+writing tokens still match the named catalog preset.
 * Used later for Custom vs preset labeling — pure comparison, no writes.
 */
export function appearanceMatchesNotebookDesignPreset(
  appearance: NotebookAppearanceV1 | null | undefined,
  presetId: NotebookDesignPresetId,
): boolean {
  const expected = resolveNotebookDesignPresetTokens(presetId);
  const resolved = resolveNotebookAppearance(appearance);
  const expAccent = expected.identity?.accent ?? null;
  return (
    resolved.identity.color === expected.identity!.color &&
    resolved.identity.accent === expAccent &&
    resolved.identity.treatment === expected.identity!.treatment &&
    resolved.writing.width === expected.writing!.width &&
    resolved.writing.density === expected.writing!.density
  );
}
