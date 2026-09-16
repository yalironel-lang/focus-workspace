/**
 * Shared visual chrome for the TipTap product Notebook toolbar + Add menu.
 * Functional contracts stay in CandidateEditor / ProductBlockMenu — this is presentation only.
 */

import type { CSSProperties } from 'react';

/** Product-facing trigger label (convert + insert surface). */
export const NB_PRODUCT_TRIGGER_LABEL = 'Add';

export const NB_PRODUCT_CHROME = {
  ink: 'rgba(248,250,252,0.92)',
  mutedInk: 'rgba(148,163,184,0.82)',
  mutedLabel: 'rgba(148,163,184,0.62)',
  hairline: 'rgba(148,163,184,0.12)',
  hoverFill: 'rgba(148,163,184,0.12)',
  activeFill: 'rgba(56,189,248,0.14)',
  focusRing: 'rgba(56,189,248,0.55)',
  toolbarFade:
    'linear-gradient(180deg, rgba(15,23,42,0.92) 40%, rgba(15,23,42,0.72) 78%, rgba(15,23,42,0) 100%)',
  menuSurface: 'rgba(17,24,39,0.98)',
  menuBorder: 'rgba(148,163,184,0.16)',
  menuShadow: '0 12px 32px rgba(0,0,0,0.42), 0 0 0 1px rgba(15,23,42,0.4)',
  controlHeight: 30,
} as const;

export function nbProductIconBtnStyle(): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: NB_PRODUCT_CHROME.controlHeight,
    height: NB_PRODUCT_CHROME.controlHeight,
    padding: 0,
    border: 'none',
    borderRadius: 8,
    background: 'transparent',
    color: NB_PRODUCT_CHROME.ink,
    cursor: 'pointer',
    opacity: 0.9,
    flexShrink: 0,
  };
}

export function nbProductTriggerStyle(open: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    height: NB_PRODUCT_CHROME.controlHeight,
    padding: '0 10px 0 8px',
    border: 'none',
    borderRadius: 8,
    background: open ? NB_PRODUCT_CHROME.activeFill : 'transparent',
    color: NB_PRODUCT_CHROME.ink,
    fontSize: 12.5,
    fontWeight: 600,
    letterSpacing: '0.01em',
    cursor: 'pointer',
    fontFamily: 'inherit',
    boxShadow: open ? `inset 0 0 0 1px ${NB_PRODUCT_CHROME.focusRing}` : 'none',
  };
}

export function nbProductDirSelectStyle(): CSSProperties {
  return {
    height: NB_PRODUCT_CHROME.controlHeight,
    padding: '0 8px',
    border: 'none',
    borderRadius: 8,
    background: 'transparent',
    color: NB_PRODUCT_CHROME.mutedInk,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    outline: 'none',
    minWidth: 64,
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
  };
}

export function nbProductToolbarShellStyle(): CSSProperties {
  return {
    display: 'flex',
    flexWrap: 'nowrap',
    gap: 2,
    alignItems: 'center',
    position: 'sticky',
    top: 0,
    zIndex: 30,
    marginBottom: 8,
    paddingTop: 4,
    paddingBottom: 10,
    background: NB_PRODUCT_CHROME.toolbarFade,
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
  };
}

export function nbProductGroupStyle(): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 1,
    padding: '0 2px',
  };
}

export function nbProductGroupDividerStyle(): CSSProperties {
  return {
    width: 1,
    height: 16,
    margin: '0 6px',
    background: NB_PRODUCT_CHROME.hairline,
    flexShrink: 0,
  };
}
