/**
 * Pure helpers for Milestone 3 real-Notebook TipTap shadow:
 * source immutability, canonicalization vs user-edit dirty detection, diff summary.
 */

import type { JSONContent } from '@tiptap/core';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBody } from './tiptapDocToBody';
import {
  isNotebookTiptapConversionError,
  type NotebookTiptapErrorCode,
} from './errors';

export type ShadowSerializeStatus = 'SAFE' | 'UNSERIALIZABLE';

export type ShadowDirtyKind =
  /** Serialized equals original source (or no TipTap doc yet). */
  | 'same'
  /** TipTap→body differs from source, but user has not edited (adapter canonicalization). */
  | 'canonical_only'
  /** User performed TipTap edits and serialized body differs from source. */
  | 'user_edit';

export type ShadowDiffSummary = {
  same: boolean;
  dirtyKind: ShadowDirtyKind;
  originalLineCount: number;
  serializedLineCount: number;
  changedLineCount: number;
  firstChangedLine: number | null;
  firstChangedPreview: string | null;
};

export type ShadowSerializeSnapshot = {
  status: ShadowSerializeStatus;
  body: string | null;
  errorCode?: NotebookTiptapErrorCode;
  errorMessage?: string;
  json: JSONContent;
  dirtyKind: ShadowDirtyKind;
  diff: ShadowDiffSummary;
  /** True only after a TipTap transaction that changed the doc (not initial load). */
  userEdited: boolean;
};

export function attemptShadowSerialize(doc: JSONContent): {
  status: ShadowSerializeStatus;
  body: string | null;
  errorCode?: NotebookTiptapErrorCode;
  errorMessage?: string;
  json: JSONContent;
} {
  try {
    const body = tiptapDocToBody(doc);
    return { status: 'SAFE', body, json: doc };
  } catch (err) {
    if (isNotebookTiptapConversionError(err)) {
      return {
        status: 'UNSERIALIZABLE',
        body: null,
        errorCode: err.code,
        errorMessage: err.message,
        json: doc,
      };
    }
    return {
      status: 'UNSERIALIZABLE',
      body: null,
      errorCode: 'malformed_input',
      errorMessage: err instanceof Error ? err.message : String(err),
      json: doc,
    };
  }
}

/** Round-trip body → TipTap → body; returns null if conversion fails closed. */
export function tryCanonicalBody(sourceBody: string): string | null {
  try {
    return tiptapDocToBody(bodyToTiptapDoc(sourceBody));
  } catch {
    return null;
  }
}

export function summarizeBodyDiff(original: string, serialized: string | null): Omit<ShadowDiffSummary, 'dirtyKind' | 'same'> & {
  same: boolean;
} {
  if (serialized == null) {
    const origLines = original.split('\n');
    return {
      same: false,
      originalLineCount: origLines.length,
      serializedLineCount: 0,
      changedLineCount: origLines.length,
      firstChangedLine: 0,
      firstChangedPreview: origLines[0] ?? '',
    };
  }
  if (original === serialized) {
    const n = original.split('\n').length;
    return {
      same: true,
      originalLineCount: n,
      serializedLineCount: n,
      changedLineCount: 0,
      firstChangedLine: null,
      firstChangedPreview: null,
    };
  }
  const a = original.split('\n');
  const b = serialized.split('\n');
  const max = Math.max(a.length, b.length);
  let first: number | null = null;
  let changed = 0;
  for (let i = 0; i < max; i += 1) {
    if ((a[i] ?? '') !== (b[i] ?? '')) {
      changed += 1;
      if (first == null) first = i;
    }
  }
  return {
    same: false,
    originalLineCount: a.length,
    serializedLineCount: b.length,
    changedLineCount: changed,
    firstChangedLine: first,
    firstChangedPreview:
      first == null
        ? null
        : `− ${(a[first] ?? '').slice(0, 80)}\n+ ${(b[first] ?? '').slice(0, 80)}`,
  };
}

export function classifyDirtyKind(opts: {
  originalBody: string;
  serializedBody: string | null;
  userEdited: boolean;
  status: ShadowSerializeStatus;
}): ShadowDirtyKind {
  if (opts.status === 'UNSERIALIZABLE') {
    return opts.userEdited ? 'user_edit' : 'canonical_only';
  }
  if (opts.serializedBody === opts.originalBody) return 'same';
  if (!opts.userEdited) return 'canonical_only';
  return 'user_edit';
}

export function buildShadowSnapshot(opts: {
  originalBody: string;
  doc: JSONContent;
  userEdited: boolean;
}): ShadowSerializeSnapshot {
  const ser = attemptShadowSerialize(opts.doc);
  const dirtyKind = classifyDirtyKind({
    originalBody: opts.originalBody,
    serializedBody: ser.body,
    userEdited: opts.userEdited,
    status: ser.status,
  });
  const base = summarizeBodyDiff(opts.originalBody, ser.body);
  return {
    ...ser,
    userEdited: opts.userEdited,
    dirtyKind,
    diff: { ...base, dirtyKind },
  };
}
