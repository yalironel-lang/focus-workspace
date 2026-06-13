import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { ChecklistItem } from './useCustomBlocks';
import { fwPersistWarn, boardScopedFreeSpaceKeys } from '../lib/freeSpacePersistence';
import { copyPdfBlob } from '../lib/freeSpacePdfIdb';
import { copyPdfStudyMarks } from '../lib/pdfStudyMarks/pdfStudyMarksIdb';
import { copyImageBlob } from '../lib/freeSpaceImageIdb';
import { registerFreeSpacePersistFlush } from '../lib/freeSpacePersistFlush';
import { copyStudyFileBlob } from '../lib/freeSpaceStudyFileIdb';
import type { StudyFileKind, StudyFileRole } from '../lib/studyFiles';
import {
  buildCompanionContent,
  sanitizeCompanionPreferredSize,
  type CompanionEmbedMode,
  type CompanionPanelContentFields,
} from '../lib/companionPanels';
import type { DeskComputeHistoryEntry, DeskFormulaItem, DeskLayoutState } from '../lib/mathDesk/types';
import { sanitizeStudyLayout, type StudyLayoutMode } from '../lib/mathDesk/studyLayout';
import {
  sanitizeDeskComputeHistory,
  sanitizeDeskFormulas,
  sanitizeDeskGraphExpression,
  sanitizeDeskLayout,
  sanitizeDeskScratch,
} from '../lib/mathDesk/sanitize';

export type { DeskFormulaItem, DeskLayoutState, DeskComputeHistoryEntry, DeskZoneId } from '../lib/mathDesk/types';

export type ProjectObjectType =
  | 'notebook'
  | 'note'
  | 'mistake'
  | 'link'
  | 'checklist'
  | 'image'
  | 'calculator'
  | 'graph'
  | 'pdf'
  | 'studyfile'
  | 'companion';

export type UniversalObjectViewMode = 'floating' | 'split' | 'fullscreen';
export type UniversalObjectSplitSide = 'left' | 'right';

export type MistakeConfidence = 'low' | 'medium' | 'high' | 'mastered';
export type MistakeVariant = 'mistake' | 'recall';

export type CalculatorHistoryEntry = { expr: string; result: string };

export type NotebookPaperStyle = 'blank' | 'ruled' | 'grid';
/** Document page vs dark spatial writing surface. */
export type NotebookSurface = 'spatial' | 'paper';
export type NotebookMode = 'normal' | 'math' | 'math-workspace' | 'scratch';
/** Text = typed lines (default). Ink = page ink surface (Apple Pencil). */
export type NotebookWritingMode = 'text' | 'ink';

export type ProjectObjectContent =
  | {
      type: 'notebook';
      body: string;
      paperStyle: NotebookPaperStyle;
      notebookSurface?: NotebookSurface;
      notebookMode?: NotebookMode;
      /** Absent = text. Ink mode uses PAGE_INK_BLOCK_KEY in IDB. */
      writingMode?: NotebookWritingMode;
      icon?: string;
      accentColor?: string;
      subtitle?: string;
      /** Math desk — user formula memory cards */
      deskFormulas?: DeskFormulaItem[];
      deskScratch?: string;
      deskLayout?: DeskLayoutState;
      deskGraphExpression?: string;
      deskComputeHistory?: DeskComputeHistoryEntry[];
      /** Viewport study layout (math desk beside PDF); `canvas` = normal free-space card. */
      studyLayout?: StudyLayoutMode;
    }
  | { type: 'note'; body: string }
  | {
      type: 'mistake';
      variant?: MistakeVariant;
      whatWrong: string;
      correction: string;
      whyConfused: string;
      tags: string[];
      confidence: MistakeConfidence;
      timesReviewed: number;
      lastReviewedAt: number | null;
      /** Optional lineage — primary PDF/source this mistake came from. */
      sourceObjectId?: string | null;
      /** V1 learning loop — notebook/note anchor for repair linkage. */
      anchorObjectId?: string | null;
      /** What the user believed on a failed attempt (confusion capture). */
      confusionBelief?: string;
      loopOpen?: boolean;
      pendingReAttempt?: boolean;
      repairedAt?: number | null;
      lastAttemptOutcome?: 'pass' | 'fail' | null;
      lastAttemptAt?: number | null;
      attemptHistory?: Array<{ at: number; outcome: 'pass' | 'fail'; belief?: string }>;
    }
  | { type: 'link'; title: string; url: string; description?: string }
  | { type: 'checklist'; items: ChecklistItem[] }
  | {
      type: 'image';
      url: string;
      alt?: string;
      caption?: string;
      fileName?: string;
      fileSize?: number;
      naturalWidth?: number;
      naturalHeight?: number;
    }
  | { type: 'calculator'; input: string; history: CalculatorHistoryEntry[] }
  | {
      type: 'graph';
      expression: string;
      xmin: number;
      xmax: number;
      ymin: number;
      ymax: number;
    }
  | {
      type: 'pdf';
      fileName: string;
      fileType: string;
      fileSize: number;
      lastOpenedAt: number | null;
      /** 1-based page for viewer hash */
      page: number;
      /** Display scale (1 = 100%) */
      zoom: number;
      // ── Spatial ingestion fields (Stage 1) ───────────────────────────────
      /** Total page count from PDF.js metadata. Populated after client-side extraction. */
      pageCount?: number;
      /** Title from PDF document metadata — may differ from the filename. */
      documentTitle?: string;
      /** First-page JPEG thumbnail as data URL (~10–20 KB). */
      thumbnailDataUrl?: string;
      /**
       * Ingestion lifecycle phase.
       * 'materializing' — object created, extraction in progress.
       * 'ready'         — extraction complete (or timed out gracefully).
       * Absent on objects created before this feature.
       */
      ingestionPhase?: 'materializing' | 'ready';
    }
  | {
      type: 'studyfile';
      fileName: string;
      fileType: string;
      fileSize: number;
      fileKind: StudyFileKind;
      role: StudyFileRole;
      usageLabel: string;
      externalUrl: string | null;
      lastOpenedAt: number | null;
      page: number;
      zoom: number;
    }
  | ({ type: 'companion' } & CompanionPanelContentFields);

export interface ProjectSpaceObject {
  id: string;
  type: ProjectObjectType;
  title: string;
  content: ProjectObjectContent;
  /** Other Free Space object ids this object is linked to (directed; persisted in localStorage). */
  connections?: string[];
  /** Universal object presentation mode (canvas default is floating). */
  viewMode?: UniversalObjectViewMode;
  /** Split-side preference when in split mode. */
  splitSide?: UniversalObjectSplitSide;
  createdAt: number;
  updatedAt: number;
}

function sanitizeUniversalViewMode(raw: unknown): UniversalObjectViewMode {
  return raw === 'split' || raw === 'fullscreen' ? raw : 'floating';
}

function sanitizeUniversalSplitSide(raw: unknown): UniversalObjectSplitSide {
  return raw === 'left' ? 'left' : 'right';
}

const OBJECT_TYPES = new Set<ProjectObjectType>([
  'notebook',
  'note',
  'mistake',
  'link',
  'checklist',
  'image',
  'calculator',
  'graph',
  'pdf',
  'studyfile',
  'companion',
]);

function key(sectionId: string, boardId = ''): string {
  return boardScopedFreeSpaceKeys(sectionId, boardId).objects;
}

function uid(type: ProjectObjectType): string {
  return `ps-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function makeDefaults(type: ProjectObjectType): { title: string; content: ProjectObjectContent } {
  switch (type) {
    case 'notebook':
      return {
        title: 'Notebook',
        content: {
          type: 'notebook',
          body: '',
          paperStyle: 'ruled',
          notebookSurface: 'spatial',
          notebookMode: 'normal',
        },
      };
    case 'note': return { title: 'Note', content: { type: 'note', body: '' } };
    case 'mistake':
      return {
        title: 'Mistake',
        content: {
          type: 'mistake',
          variant: 'mistake',
          whatWrong: '',
          correction: '',
          whyConfused: '',
          tags: [],
          confidence: 'low',
          timesReviewed: 0,
          lastReviewedAt: null,
          sourceObjectId: null,
          anchorObjectId: null,
          confusionBelief: '',
          loopOpen: true,
          pendingReAttempt: false,
          repairedAt: null,
          lastAttemptOutcome: null,
          lastAttemptAt: null,
          attemptHistory: [],
        },
      };
    case 'link': return { title: 'Reference Link', content: { type: 'link', title: 'Untitled link', url: '' } };
    case 'checklist': return { title: 'Checklist', content: { type: 'checklist', items: [] } };
    case 'image': return { title: 'Image', content: { type: 'image', url: '' } };
    case 'calculator':
      return { title: 'Calculator', content: { type: 'calculator', input: '', history: [] } };
    case 'graph':
      return {
        title: 'Graph',
        content: {
          type: 'graph',
          expression: 'x^2',
          xmin: -6,
          xmax: 6,
          ymin: -4,
          ymax: 8,
        },
      };
    case 'pdf':
      return {
        title: 'PDF',
        content: {
          type: 'pdf',
          fileName: '',
          fileType: '',
          fileSize: 0,
          lastOpenedAt: null,
          page: 1,
          zoom: 1,
        },
      };
    case 'studyfile':
      return {
        title: 'Study file',
        content: {
          type: 'studyfile',
          fileName: '',
          fileType: '',
          fileSize: 0,
          fileKind: 'other',
          role: 'general',
          usageLabel: '',
          externalUrl: null,
          lastOpenedAt: null,
          page: 1,
          zoom: 1,
        },
      };
    case 'companion':
      return {
        title: 'Companion',
        content: {
          type: 'companion',
          ...buildCompanionContent({
            url: '',
            title: 'Companion',
            embedMode: 'auto',
          }),
        },
      };
  }
}

function numOr(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeHistoryEntry(raw: unknown): CalculatorHistoryEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const expr = typeof o.expr === 'string' ? o.expr : '';
  const result = typeof o.result === 'string' ? o.result : '';
  if (!expr && !result) return null;
  return { expr, result };
}

function normalizeChecklistItem(raw: unknown): ChecklistItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' && o.id ? o.id : `chk-${Math.random().toString(36).slice(2, 9)}`;
  const text = typeof o.text === 'string' ? o.text : '';
  const checked = typeof o.checked === 'boolean' ? o.checked : false;
  return { id, text, checked };
}

/**
 * Returns canonical content for a Free Space object type. Use after loading from storage
 * or in the renderer so malformed JSON never crashes the UI.
 */
export function ensureProjectObjectContent(type: ProjectObjectType, raw: unknown): ProjectObjectContent {
  const defaults = makeDefaults(type).content;
  if (!raw || typeof raw !== 'object') return defaults;
  const r = raw as Record<string, unknown>;
  if (r.type !== type) return defaults;

  switch (type) {
    case 'notebook': {
      const body = typeof r.body === 'string' ? r.body : '';
      const ps = r.paperStyle;
      const paperStyle =
        ps === 'blank' || ps === 'ruled' || ps === 'grid' ? ps : 'ruled';
      const nm = r.notebookMode;
      const notebookMode: NotebookMode =
        nm === 'math' ? 'math'
        : nm === 'math-workspace' ? 'math-workspace'
        : nm === 'scratch' ? 'scratch'
        : 'normal';
      const ns = r.notebookSurface;
      const notebookSurface: NotebookSurface = ns === 'paper' ? 'paper' : 'spatial';
      const icon = typeof r.icon === 'string' && r.icon ? r.icon : undefined;
      const accentColor = typeof r.accentColor === 'string' && r.accentColor ? r.accentColor : undefined;
      const subtitle = typeof r.subtitle === 'string' && r.subtitle ? r.subtitle : undefined;
      const deskFormulas = sanitizeDeskFormulas(r.deskFormulas);
      const deskScratch = sanitizeDeskScratch(r.deskScratch);
      const deskLayout = sanitizeDeskLayout(r.deskLayout);
      const deskGraphExpression = sanitizeDeskGraphExpression(r.deskGraphExpression);
      const deskComputeHistory = sanitizeDeskComputeHistory(r.deskComputeHistory);
      const studyLayout = sanitizeStudyLayout(r.studyLayout);
      const wm = r.writingMode;
      const writingMode: NotebookWritingMode | undefined =
        wm === 'ink' ? 'ink' : wm === 'text' ? 'text' : undefined;
      return {
        type: 'notebook', body, paperStyle, notebookMode, notebookSurface,
        ...(icon !== undefined ? { icon } : {}),
        ...(accentColor !== undefined ? { accentColor } : {}),
        ...(subtitle !== undefined ? { subtitle } : {}),
        ...(deskFormulas !== undefined ? { deskFormulas } : {}),
        ...(deskScratch !== undefined ? { deskScratch } : {}),
        ...(deskLayout !== undefined ? { deskLayout } : {}),
        ...(deskGraphExpression !== undefined ? { deskGraphExpression } : {}),
        ...(deskComputeHistory !== undefined ? { deskComputeHistory } : {}),
        ...(studyLayout !== 'canvas' ? { studyLayout } : {}),
        ...(writingMode !== undefined ? { writingMode } : {}),
      };
    }
    case 'note':
      return { type: 'note', body: typeof r.body === 'string' ? r.body : '' };
    case 'mistake': {
      const tagsRaw = Array.isArray(r.tags) ? r.tags : [];
      const tags = tagsRaw
        .map((t: unknown) => (typeof t === 'string' ? t.trim() : ''))
        .filter(Boolean);
      const conf = r.confidence;
      const confidence: MistakeConfidence =
        conf === 'medium' || conf === 'high' || conf === 'mastered' ? conf : 'low';
      const variant: MistakeVariant = r.variant === 'recall' ? 'recall' : 'mistake';
      const last = r.lastReviewedAt;
      const lastReviewedAt =
        typeof last === 'number' && Number.isFinite(last) ? last : null;
      const sourceRaw = r.sourceObjectId;
      const sourceObjectId =
        typeof sourceRaw === 'string' && sourceRaw.trim() ? sourceRaw.trim() : null;
      const anchorRaw = r.anchorObjectId;
      const anchorObjectId =
        typeof anchorRaw === 'string' && anchorRaw.trim() ? anchorRaw.trim() : null;
      const repairedRaw = r.repairedAt;
      const repairedAt =
        typeof repairedRaw === 'number' && Number.isFinite(repairedRaw) ? repairedRaw : null;
      const lastAttemptRaw = r.lastAttemptAt;
      const lastAttemptAt =
        typeof lastAttemptRaw === 'number' && Number.isFinite(lastAttemptRaw) ? lastAttemptRaw : null;
      const lastOutcome = r.lastAttemptOutcome;
      const lastAttemptOutcome =
        lastOutcome === 'pass' || lastOutcome === 'fail' ? lastOutcome : null;
      const histRaw = Array.isArray(r.attemptHistory) ? r.attemptHistory : [];
      const attemptHistory = histRaw
        .map((entry: unknown) => {
          if (!entry || typeof entry !== 'object') return null;
          const e = entry as Record<string, unknown>;
          const at = typeof e.at === 'number' && Number.isFinite(e.at) ? e.at : null;
          const outcome = e.outcome === 'pass' || e.outcome === 'fail' ? e.outcome : null;
          if (at == null || !outcome) return null;
          const belief = typeof e.belief === 'string' ? e.belief : undefined;
          return { at, outcome, ...(belief ? { belief } : {}) };
        })
        .filter((x): x is { at: number; outcome: 'pass' | 'fail'; belief?: string } => x !== null)
        .slice(-24);
      return {
        type: 'mistake',
        variant,
        whatWrong: typeof r.whatWrong === 'string' ? r.whatWrong : '',
        correction: typeof r.correction === 'string' ? r.correction : '',
        whyConfused: typeof r.whyConfused === 'string' ? r.whyConfused : '',
        tags,
        confidence,
        timesReviewed: Math.max(0, Math.floor(numOr(r.timesReviewed, 0))),
        lastReviewedAt,
        sourceObjectId,
        anchorObjectId,
        confusionBelief: typeof r.confusionBelief === 'string' ? r.confusionBelief : '',
        loopOpen: r.loopOpen === false ? false : true,
        pendingReAttempt: r.pendingReAttempt === true,
        repairedAt,
        lastAttemptOutcome,
        lastAttemptAt,
        attemptHistory,
      };
    }
    case 'link': {
      const title = typeof r.title === 'string' ? r.title : 'Untitled link';
      const url = typeof r.url === 'string' ? r.url : '';
      const description = typeof r.description === 'string' ? r.description : undefined;
      return description !== undefined
        ? { type: 'link', title, url, description }
        : { type: 'link', title, url };
    }
    case 'checklist': {
      const itemsRaw = Array.isArray(r.items) ? r.items : [];
      const items = itemsRaw.map(normalizeChecklistItem).filter((x): x is ChecklistItem => x !== null);
      return { type: 'checklist', items };
    }
    case 'image': {
      const url = typeof r.url === 'string' ? r.url : '';
      const alt = typeof r.alt === 'string' ? r.alt : undefined;
      const caption = typeof r.caption === 'string' ? r.caption : undefined;
      const fileName = typeof r.fileName === 'string' ? r.fileName : undefined;
      const fileSize = typeof r.fileSize === 'number' && Number.isFinite(r.fileSize) ? r.fileSize : undefined;
      const naturalWidth =
        typeof r.naturalWidth === 'number' && Number.isFinite(r.naturalWidth) ? r.naturalWidth : undefined;
      const naturalHeight =
        typeof r.naturalHeight === 'number' && Number.isFinite(r.naturalHeight) ? r.naturalHeight : undefined;
      return {
        type: 'image',
        url,
        ...(alt !== undefined ? { alt } : {}),
        ...(caption !== undefined ? { caption } : {}),
        ...(fileName !== undefined ? { fileName } : {}),
        ...(fileSize !== undefined ? { fileSize } : {}),
        ...(naturalWidth !== undefined ? { naturalWidth } : {}),
        ...(naturalHeight !== undefined ? { naturalHeight } : {}),
      };
    }
    case 'calculator': {
      const input = typeof r.input === 'string' ? r.input : '';
      const histRaw = Array.isArray(r.history) ? r.history : [];
      const history = histRaw.map(normalizeHistoryEntry).filter((x): x is CalculatorHistoryEntry => x !== null);
      return { type: 'calculator', input, history };
    }
    case 'graph': {
      const g = makeDefaults('graph').content as Extract<ProjectObjectContent, { type: 'graph' }>;
      const expression = typeof r.expression === 'string' ? r.expression : g.expression;
      return {
        type: 'graph',
        expression,
        xmin: numOr(r.xmin, g.xmin),
        xmax: numOr(r.xmax, g.xmax),
        ymin: numOr(r.ymin, g.ymin),
        ymax: numOr(r.ymax, g.ymax),
      };
    }
    case 'pdf': {
      const d = makeDefaults('pdf').content as Extract<ProjectObjectContent, { type: 'pdf' }>;
      const fileName = typeof r.fileName === 'string' ? r.fileName : d.fileName;
      const fileType = typeof r.fileType === 'string' ? r.fileType : d.fileType;
      const fileSize = Math.max(0, Math.floor(numOr(r.fileSize, d.fileSize)));
      const last = r.lastOpenedAt;
      const lastOpenedAt =
        typeof last === 'number' && Number.isFinite(last) ? last : null;
      const page = Math.max(1, Math.floor(numOr(r.page, d.page)));
      const zoom = Math.min(2.5, Math.max(0.5, numOr(r.zoom, d.zoom)));
      // Optional spatial ingestion fields — preserved as-is, no coercion needed
      const pageCount      = typeof r.pageCount      === 'number' && r.pageCount > 0 ? r.pageCount : undefined;
      const documentTitle  = typeof r.documentTitle  === 'string' && r.documentTitle.trim() ? r.documentTitle.trim() : undefined;
      const thumbnailDataUrl = typeof r.thumbnailDataUrl === 'string' && r.thumbnailDataUrl.startsWith('data:') ? r.thumbnailDataUrl : undefined;
      const ingestionPhase = r.ingestionPhase === 'materializing' || r.ingestionPhase === 'ready' ? r.ingestionPhase : undefined;
      return {
        type: 'pdf',
        fileName,
        fileType,
        fileSize,
        lastOpenedAt,
        page,
        zoom,
        ...(pageCount         !== undefined ? { pageCount }         : {}),
        ...(documentTitle     !== undefined ? { documentTitle }     : {}),
        ...(thumbnailDataUrl  !== undefined ? { thumbnailDataUrl }  : {}),
        ...(ingestionPhase    !== undefined ? { ingestionPhase }    : {}),
      };
    }
    case 'studyfile': {
      const d = makeDefaults('studyfile').content as Extract<ProjectObjectContent, { type: 'studyfile' }>;
      const fileName = typeof r.fileName === 'string' ? r.fileName : d.fileName;
      const fileType = typeof r.fileType === 'string' ? r.fileType : d.fileType;
      const fileSize = Math.max(0, Math.floor(numOr(r.fileSize, d.fileSize)));
      const fk = r.fileKind;
      const fileKind: StudyFileKind =
        fk === 'pdf' || fk === 'docx' || fk === 'pptx' || fk === 'xlsx' ||
        fk === 'google-doc' || fk === 'google-sheet' || fk === 'google-slides' ||
        fk === 'web' || fk === 'other'
          ? fk
          : d.fileKind;
      const roleRaw = r.role;
      const role: StudyFileRole =
        roleRaw === 'lecture' || roleRaw === 'assignment' || roleRaw === 'lab' ||
        roleRaw === 'reference' || roleRaw === 'general'
          ? roleRaw
          : d.role;
      const usageLabel = typeof r.usageLabel === 'string' ? r.usageLabel : d.usageLabel;
      const ext = r.externalUrl;
      const externalUrl =
        typeof ext === 'string' && ext.trim() ? ext.trim() : null;
      const last = r.lastOpenedAt;
      const lastOpenedAt =
        typeof last === 'number' && Number.isFinite(last) ? last : null;
      const page = Math.max(1, Math.floor(numOr(r.page, d.page)));
      const zoom = Math.min(2.5, Math.max(0.5, numOr(r.zoom, d.zoom)));
      return {
        type: 'studyfile',
        fileName,
        fileType,
        fileSize,
        fileKind,
        role,
        usageLabel,
        externalUrl,
        lastOpenedAt,
        page,
        zoom,
      };
    }
    case 'companion': {
      const url = typeof r.url === 'string' ? r.url : '';
      const title = typeof r.title === 'string' ? r.title : 'Companion';
      const favicon = typeof r.favicon === 'string' ? r.favicon : '';
      const embedMode: CompanionEmbedMode =
        r.embedMode === 'embedded' || r.embedMode === 'external-only' ? r.embedMode : 'auto';
      const last = r.lastOpenedAt;
      const lastOpenedAt =
        typeof last === 'number' && Number.isFinite(last) ? last : null;
      const description =
        typeof r.description === 'string' && r.description.trim()
          ? r.description.trim()
          : undefined;
      const preferredSize = sanitizeCompanionPreferredSize(r.preferredSize);
      const companion = buildCompanionContent({
        url,
        title,
        description,
        embedMode,
        lastOpenedAt,
        preferredSize,
      });
      return {
        type: 'companion',
        ...companion,
        favicon: favicon || companion.favicon,
      };
    }
  }
}

function normalizeProjectSpaceObject(raw: unknown): ProjectSpaceObject | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' && o.id ? o.id : null;
  const type = typeof o.type === 'string' && OBJECT_TYPES.has(o.type as ProjectObjectType)
    ? (o.type as ProjectObjectType)
    : null;
  if (!id || !type) return null;

  const d = makeDefaults(type);
  const content = ensureProjectObjectContent(type, o.content);
  const title =
    typeof o.title === 'string' && o.title.trim()
      ? o.title
      : type === 'companion'
        ? (content as Extract<ProjectObjectContent, { type: 'companion' }>).title
        : d.title;
  const createdAt = typeof o.createdAt === 'number' && Number.isFinite(o.createdAt) ? o.createdAt : Date.now();
  const updatedAt = typeof o.updatedAt === 'number' && Number.isFinite(o.updatedAt) ? o.updatedAt : createdAt;

  const viewMode = sanitizeUniversalViewMode(o.viewMode);
  const splitSide = sanitizeUniversalSplitSide(o.splitSide);
  return {
    id,
    type,
    title,
    content,
    ...(viewMode !== 'floating' ? { viewMode } : {}),
    ...(splitSide !== 'right' ? { splitSide } : {}),
    createdAt,
    updatedAt,
  };
}

/**
 * Coerce persisted `connections` to id strings. Never treat a string as iterable for spread —
 * `[...connections, id]` would expand a string into single characters and corrupt storage.
 */
export function coerceFreeSpaceConnectionIds(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const x of raw) {
      if (typeof x !== 'string' || !x.trim()) continue;
      const id = x.trim();
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }
  if (typeof raw === 'string' && raw.trim()) {
    const s = raw.trim();
    if (s.includes(',')) {
      const parts = s.split(',').map(p => p.trim()).filter(Boolean);
      const seen = new Set<string>();
      const out: string[] = [];
      for (const id of parts) {
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(id);
      }
      return out;
    }
    return [s];
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const vals = Object.values(raw as Record<string, unknown>).filter(
      (v): v is string => typeof v === 'string' && v.trim() !== '',
    );
    return coerceFreeSpaceConnectionIds(vals);
  }
  return [];
}

function normalizeConnectionsField(selfId: string, raw: unknown, validIds: Set<string>): string[] | undefined {
  const base = coerceFreeSpaceConnectionIds(raw);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of base) {
    if (id === selfId || !validIds.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.length ? out : undefined;
}

function pruneConnectionsFromObjects(objects: ProjectSpaceObject[], removedId: string): ProjectSpaceObject[] {
  return objects.map(o => {
    const prevList = coerceFreeSpaceConnectionIds(o.connections);
    const next = prevList.filter(cid => cid !== removedId && cid !== o.id);
    if (next.length === prevList.length) return o;
    return {
      ...o,
      connections: next.length ? next : undefined,
      updatedAt: Date.now(),
    };
  });
}

/**
 * Normalize Free Space objects from parsed JSON (storage or import).
 * Returns repaired=true when rows were dropped or coerced so callers may persist.
 */
export function repairFreeSpaceObjectList(
  parsed: unknown,
  sectionId: string,
): { objects: ProjectSpaceObject[]; repaired: boolean } {
  if (!sectionId) return { objects: [], repaired: false };
  if (!Array.isArray(parsed)) {
    fwPersistWarn(
      `Free Space objects for section "${sectionId}" were not a JSON array; using empty list until storage is fixed (key: ${key(sectionId)}).`,
    );
    return { objects: [], repaired: true };
  }

  const staged: ProjectSpaceObject[] = [];
  const rawRows: unknown[] = [];
  let repaired = false;
  for (const item of parsed) {
    const n = normalizeProjectSpaceObject(item);
    if (!n) {
      repaired = true;
      continue;
    }
    staged.push(n);
    rawRows.push(item);
  }
  const validIds = new Set(staged.map(o => o.id));
  const normalized: ProjectSpaceObject[] = staged.map((o, i) => {
    const rawConn = (rawRows[i] && typeof rawRows[i] === 'object')
      ? (rawRows[i] as Record<string, unknown>).connections
      : undefined;
    const connections = normalizeConnectionsField(o.id, rawConn, validIds);
    const rawCoerced = coerceFreeSpaceConnectionIds(rawConn);
    const nextCoerced = coerceFreeSpaceConnectionIds(connections);
    if (
      rawCoerced.length !== nextCoerced.length ||
      rawCoerced.some((id, idx) => id !== nextCoerced[idx])
    ) {
      repaired = true;
    }
    return nextCoerced.length ? { ...o, connections: nextCoerced } : o;
  });
  if (parsed.length !== normalized.length) repaired = true;
  return { objects: normalized, repaired };
}

function load(sectionId: string, boardId = ''): ProjectSpaceObject[] {
  if (!sectionId) return [];
  try {
    const raw = localStorage.getItem(key(sectionId, boardId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    const { objects: normalized, repaired } = repairFreeSpaceObjectList(parsed, sectionId);
    const serialized = JSON.stringify(normalized);
    if (repaired && serialized !== raw) {
      if (import.meta.env.DEV) {
        fwPersistWarn(
          `Repaired Free Space objects for section "${sectionId}"; rewriting storage (${Array.isArray(parsed) ? parsed.length : 0} rows → ${normalized.length} valid).`,
        );
      }
      try {
        localStorage.setItem(key(sectionId, boardId), serialized);
      } catch { /* quota */ }
    }
    return normalized;
  } catch (e) {
    fwPersistWarn(`Free Space objects JSON unreadable for section "${sectionId}": ${String(e)}`);
    return [];
  }
}

function persist(sectionId: string, boardId: string, objects: ProjectSpaceObject[]): void {
  if (!sectionId) return;
  try {
    localStorage.setItem(key(sectionId, boardId), JSON.stringify(objects));
  } catch { /* quota */ }
}

export interface SectionFreeSpaceObjectsState {
  objects: ProjectSpaceObject[];
  /** Single persist write; use for workspace starters and batched inserts. */
  appendObjects: (incoming: ProjectSpaceObject[]) => void;
  addObject: (type: ProjectObjectType) => ProjectSpaceObject;
  /** One persist write: new note with title + body (avoids batched add+patch races). */
  addQuickCaptureNote: (body: string) => ProjectSpaceObject;
  /** Fast mistake capture: title from first line, body maps to “what went wrong”. */
  addQuickCaptureMistake: (rawBody: string) => ProjectSpaceObject;
  /** Lightweight recall capture from an existing notebook block or concept. */
  addRecallItem: (prompt: string) => ProjectSpaceObject;
  /** Turn selected note into a mistake card (preserves note body as whatWrong). */
  convertNoteToMistake: (id: string) => ProjectSpaceObject | null;
  updateObjectContent: (id: string, content: ProjectObjectContent) => void;
  /** Update title and/or content in one persist write (e.g. quick capture). */
  updateObjectFields: (
    id: string,
    fields: {
      title?: string;
      content?: ProjectObjectContent;
      viewMode?: UniversalObjectViewMode;
      splitSide?: UniversalObjectSplitSide;
    },
  ) => void;
  addConnection: (fromId: string, toId: string) => void;
  clearConnectionsForObject: (id: string) => void;
  removeObject: (id: string) => void;
  duplicateObject: (id: string) => ProjectSpaceObject | null;
  getObject: (id: string) => ProjectSpaceObject | undefined;
}

export function useSectionFreeSpaceObjects(sectionId: string, boardId = ''): SectionFreeSpaceObjectsState {
  const [objects, setObjects] = useState<ProjectSpaceObject[]>(() => load(sectionId, boardId));
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPersistRef = useRef<{ sectionId: string; boardId: string; objects: ProjectSpaceObject[] } | null>(null);
  /** Always-current scope — avoids stale boardId in callbacks after board switch (data loss / cross-board bleed). */
  const scopeRef = useRef({ sectionId, boardId });
  scopeRef.current = { sectionId, boardId };
  const persistScopeGenRef = useRef(0);

  const flushPersist = useCallback(() => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    const pending = pendingPersistRef.current;
    if (!pending) return;
    pendingPersistRef.current = null;
    persist(pending.sectionId, pending.boardId, pending.objects);
  }, []);

  const schedulePersist = useCallback((next: ProjectSpaceObject[]) => {
    const { sectionId: sid, boardId: bid } = scopeRef.current;
    if (!sid) {
      fwPersistWarn('Free Space persist skipped: missing sectionId.');
      return;
    }
    const gen = persistScopeGenRef.current;
    pendingPersistRef.current = { sectionId: sid, boardId: bid, objects: next };
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      if (gen !== persistScopeGenRef.current) return;
      const pending = pendingPersistRef.current;
      if (!pending) return;
      pendingPersistRef.current = null;
      persist(pending.sectionId, pending.boardId, pending.objects);
    }, 400);
  }, []);

  useEffect(() => {
    persistScopeGenRef.current += 1;
    flushPersist();
    setObjects(load(sectionId, boardId));
  }, [sectionId, boardId, flushPersist]);

  useEffect(() => () => flushPersist(), [flushPersist]);

  useEffect(() => registerFreeSpacePersistFlush(flushPersist), [flushPersist]);

  const appendObjects = useCallback((incoming: ProjectSpaceObject[]) => {
    if (!incoming.length) return;
    setObjects(prev => {
      const next = [...prev, ...incoming];
      schedulePersist(next);
      return next;
    });
  }, [schedulePersist]);

  const addObject = useCallback((type: ProjectObjectType): ProjectSpaceObject => {
    const d = makeDefaults(type);
    const now = Date.now();
    const obj: ProjectSpaceObject = {
      id: uid(type),
      type,
      title: d.title,
      content: d.content,
      createdAt: now,
      updatedAt: now,
    };
    setObjects(prev => {
      const next = [...prev, obj];
      schedulePersist(next);
      return next;
    });
    return obj;
  }, [schedulePersist]);

  const addQuickCaptureNote = useCallback((rawBody: string): ProjectSpaceObject => {
    const trimmed = rawBody.trim();
    const firstLine = trimmed.split(/\n/)[0]?.trim() ?? trimmed;
    const title = firstLine.length > 56 ? `${firstLine.slice(0, 54)}…` : (firstLine || 'Note');
    const now = Date.now();
    const obj: ProjectSpaceObject = {
      id: uid('note'),
      type: 'note',
      title,
      content: { type: 'note', body: trimmed },
      createdAt: now,
      updatedAt: now,
    };
    setObjects(prev => {
      const next = [...prev, obj];
      schedulePersist(next);
      return next;
    });
    return obj;
  }, [schedulePersist]);

  const addQuickCaptureMistake = useCallback((rawBody: string): ProjectSpaceObject => {
    const trimmed = rawBody.trim();
    const firstLine = trimmed.split(/\n/)[0]?.trim() ?? trimmed;
    const title = firstLine.length > 56 ? `${firstLine.slice(0, 54)}…` : (firstLine || 'Mistake');
    const now = Date.now();
    const obj: ProjectSpaceObject = {
      id: uid('mistake'),
      type: 'mistake',
      title,
      content: {
        type: 'mistake',
        variant: 'mistake',
        whatWrong: trimmed || 'What went wrong',
        correction: '',
        whyConfused: '',
        tags: [],
        confidence: 'low',
        timesReviewed: 0,
        lastReviewedAt: null,
        sourceObjectId: null,
        anchorObjectId: null,
        confusionBelief: '',
        loopOpen: true,
        pendingReAttempt: false,
        repairedAt: null,
        lastAttemptOutcome: null,
        lastAttemptAt: null,
        attemptHistory: [],
      },
      createdAt: now,
      updatedAt: now,
    };
    setObjects(prev => {
      const next = [...prev, obj];
      schedulePersist(next);
      return next;
    });
    return obj;
  }, [schedulePersist]);

  const addRecallItem = useCallback((rawPrompt: string): ProjectSpaceObject => {
    const trimmed = rawPrompt.trim();
    const firstLine = trimmed.split(/\n/)[0]?.trim() ?? trimmed;
    const title = firstLine.length > 56 ? `${firstLine.slice(0, 54)}…` : (firstLine || 'Recall');
    const now = Date.now();
    const obj: ProjectSpaceObject = {
      id: uid('mistake'),
      type: 'mistake',
      title,
      content: {
        type: 'mistake',
        variant: 'recall',
        whatWrong: trimmed || 'Recall prompt',
        correction: '',
        whyConfused: '',
        tags: [],
        confidence: 'medium',
        timesReviewed: 0,
        lastReviewedAt: null,
        sourceObjectId: null,
        anchorObjectId: null,
        confusionBelief: '',
        loopOpen: true,
        pendingReAttempt: false,
        repairedAt: null,
        lastAttemptOutcome: null,
        lastAttemptAt: null,
        attemptHistory: [],
      },
      createdAt: now,
      updatedAt: now,
    };
    setObjects(prev => {
      const next = [...prev, obj];
      schedulePersist(next);
      return next;
    });
    return obj;
  }, [schedulePersist]);

  const convertNoteToMistake = useCallback((objectId: string): ProjectSpaceObject | null => {
    let out: ProjectSpaceObject | null = null;
    setObjects(prev => {
      const o = prev.find(x => x.id === objectId);
      if (!o || o.type !== 'note') return prev;
      const noteBody = ensureProjectObjectContent('note', o.content);
      const body = noteBody.type === 'note' ? noteBody.body : '';
      const trimmed = body.trim();
      const firstLine = trimmed.split(/\n/)[0]?.trim() ?? trimmed;
      const title =
        (o.title && o.title !== 'Note' ? o.title : firstLine) ||
        firstLine ||
        'Mistake';
      const nextObj: ProjectSpaceObject = {
        ...o,
        type: 'mistake',
        title: title.length > 80 ? `${title.slice(0, 78)}…` : title,
        content: {
          type: 'mistake',
          variant: 'mistake',
          whatWrong: trimmed || 'What went wrong',
          correction: '',
          whyConfused: '',
          tags: [],
          confidence: 'low',
          timesReviewed: 0,
          lastReviewedAt: null,
          sourceObjectId: null,
          anchorObjectId: null,
          confusionBelief: '',
          loopOpen: true,
          pendingReAttempt: false,
          repairedAt: null,
          lastAttemptOutcome: null,
          lastAttemptAt: null,
          attemptHistory: [],
        },
        updatedAt: Date.now(),
      };
      out = nextObj;
      const next = prev.map(x => (x.id === objectId ? nextObj : x));
      schedulePersist(next);
      return next;
    });
    return out;
  }, [schedulePersist]);

  const updateObjectContent = useCallback((id: string, content: ProjectObjectContent) => {
    setObjects(prev => {
      const next = prev.map(o => o.id === id ? { ...o, content, updatedAt: Date.now() } : o);
      schedulePersist(next);
      return next;
    });
  }, [schedulePersist]);

  const updateObjectFields = useCallback(
    (
      objectId: string,
      fields: {
        title?: string;
        content?: ProjectObjectContent;
        viewMode?: UniversalObjectViewMode;
        splitSide?: UniversalObjectSplitSide;
      },
    ) => {
      setObjects(prev => {
        const i = prev.findIndex(o => o.id === objectId);
        if (i === -1) return prev;
        const o = prev[i];
        const nextObj: ProjectSpaceObject = {
          ...o,
          ...(fields.title !== undefined ? { title: fields.title } : {}),
          ...(fields.content !== undefined ? { content: fields.content } : {}),
          ...(fields.viewMode !== undefined
            ? (fields.viewMode === 'floating' ? { viewMode: undefined } : { viewMode: fields.viewMode })
            : {}),
          ...(fields.splitSide !== undefined
            ? (fields.splitSide === 'right' ? { splitSide: undefined } : { splitSide: fields.splitSide })
            : {}),
          updatedAt: Date.now(),
        };
        const next = [...prev.slice(0, i), nextObj, ...prev.slice(i + 1)];
        schedulePersist(next);
        return next;
      });
    },
    [schedulePersist],
  );

  const addConnection = useCallback((fromId: string, toId: string) => {
    if (!fromId || !toId || fromId === toId) return;
    setObjects(prev => {
      const idSet = new Set(prev.map(o => o.id));
      if (!idSet.has(fromId) || !idSet.has(toId)) return prev;
      const fromObj = prev.find(o => o.id === fromId);
      const toObj = prev.find(o => o.id === toId);
      if (!fromObj || !toObj) return prev;
      const fromList = coerceFreeSpaceConnectionIds(fromObj.connections);
      const toList = coerceFreeSpaceConnectionIds(toObj.connections);
      // Same directed edge, or reverse (same undirected pair)
      if (fromList.includes(toId) || toList.includes(fromId)) return prev;
      const next = prev.map(o => {
        if (o.id !== fromId) return o;
        const cur = coerceFreeSpaceConnectionIds(o.connections);
        if (cur.includes(toId)) return o;
        return { ...o, connections: [...cur, toId], updatedAt: Date.now() };
      });
      schedulePersist(next);
      return next;
    });
  }, [schedulePersist]);

  const clearConnectionsForObject = useCallback((id: string) => {
    if (!id) return;
    setObjects(prev => {
      const next = prev.map(o => {
        if (o.id === id) {
          const cur = coerceFreeSpaceConnectionIds(o.connections);
          if (cur.length === 0) return o;
          return { ...o, connections: undefined, updatedAt: Date.now() };
        }
        const prevList = coerceFreeSpaceConnectionIds(o.connections);
        const filtered = prevList.filter(cid => cid !== id);
        if (filtered.length === prevList.length) return o;
        return {
          ...o,
          connections: filtered.length ? filtered : undefined,
          updatedAt: Date.now(),
        };
      });
      schedulePersist(next);
      return next;
    });
  }, [schedulePersist]);

  const removeObject = useCallback((id: string) => {
    setObjects(prev => {
      const victim = prev.find(o => o.id === id);
      if (victim) {
        void import('../lib/knowledge/tombstoneStore').then(({ writeFreeSpaceObjectTombstone }) =>
          writeFreeSpaceObjectTombstone(sectionId, boardId, victim),
        );
      }
      const rest = prev.filter(o => o.id !== id);
      const next = pruneConnectionsFromObjects(rest, id);
      schedulePersist(next);
      return next;
    });
  }, [schedulePersist]);

  const duplicateObject = useCallback((id: string): ProjectSpaceObject | null => {
    const source = objects.find(o => o.id === id);
    if (!source) return null;
    const now = Date.now();
    const validTargets = new Set(objects.map(o => o.id));
    const dupConnections = coerceFreeSpaceConnectionIds(source.connections).filter(
      cid => cid !== id && cid !== source.id && validTargets.has(cid),
    );
    const copy: ProjectSpaceObject = {
      ...source,
      id: uid(source.type),
      createdAt: now,
      updatedAt: now,
      connections: dupConnections.length ? dupConnections : undefined,
    };
    if (source.type === 'pdf') {
      void copyPdfBlob(sectionId, source.id, copy.id);
      void copyPdfStudyMarks(sectionId, source.id, copy.id);
    }
    if (source.type === 'image') {
      void copyImageBlob(sectionId, source.id, copy.id);
    }
    if (source.type === 'studyfile') {
      void copyStudyFileBlob(sectionId, source.id, copy.id);
    }
    setObjects(prev => {
      const next = [...prev, copy];
      schedulePersist(next);
      return next;
    });
    return copy;
  }, [objects, schedulePersist, sectionId]);

  const getObject = useCallback((id: string) => objects.find(o => o.id === id), [objects]);

  return useMemo(() => ({
    objects,
    appendObjects,
    addObject,
    addQuickCaptureNote,
    addQuickCaptureMistake,
    addRecallItem,
    convertNoteToMistake,
    updateObjectContent,
    updateObjectFields,
    addConnection,
    clearConnectionsForObject,
    removeObject,
    duplicateObject,
    getObject,
  }), [
    objects,
    appendObjects,
    addObject,
    addQuickCaptureNote,
    addQuickCaptureMistake,
    addRecallItem,
    convertNoteToMistake,
    updateObjectContent,
    updateObjectFields,
    addConnection,
    clearConnectionsForObject,
    removeObject,
    duplicateObject,
    getObject,
  ]);
}
