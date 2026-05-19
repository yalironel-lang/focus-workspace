/**
 * External study file metadata — references and previews, not an office suite.
 */

export type StudyFileKind =
  | 'pdf'
  | 'docx'
  | 'pptx'
  | 'xlsx'
  | 'google-doc'
  | 'google-sheet'
  | 'google-slides'
  | 'web'
  | 'other';

export type StudyFileRole = 'lecture' | 'assignment' | 'lab' | 'reference' | 'general';

export interface GoogleStudyLinkInfo {
  kind: Extract<StudyFileKind, 'google-doc' | 'google-sheet' | 'google-slides'>;
  url: string;
  suggestedTitle: string;
}

const OFFICE_EXT: Record<string, StudyFileKind> = {
  docx: 'docx',
  doc: 'docx',
  pptx: 'pptx',
  ppt: 'pptx',
  xlsx: 'xlsx',
  xls: 'xlsx',
  xlsm: 'xlsx',
  csv: 'xlsx',
};

const ROLE_LABELS: Record<StudyFileRole, string> = {
  lecture: 'Lecture',
  assignment: 'Assignment',
  lab: 'Lab',
  reference: 'Reference',
  general: 'Source',
};

const KIND_LABELS: Record<StudyFileKind, string> = {
  pdf: 'PDF',
  docx: 'Word document',
  pptx: 'Presentation',
  xlsx: 'Spreadsheet',
  'google-doc': 'Google Doc',
  'google-sheet': 'Google Sheet',
  'google-slides': 'Google Slides',
  web: 'Web link',
  other: 'Study file',
};

export function studyFileRoleLabel(role: StudyFileRole | undefined): string {
  return ROLE_LABELS[role ?? 'general'];
}

export function studyFileKindLabel(kind: StudyFileKind): string {
  return KIND_LABELS[kind] ?? 'Study file';
}

export function detectStudyFileKindFromName(fileName: string, mime = ''): StudyFileKind {
  const lower = fileName.trim().toLowerCase();
  const ext = lower.includes('.') ? lower.split('.').pop() ?? '' : '';
  if (ext === 'pdf') return 'pdf';
  if (OFFICE_EXT[ext]) return OFFICE_EXT[ext];
  const t = mime.toLowerCase();
  if (t.includes('pdf')) return 'pdf';
  if (t.includes('wordprocessingml') || t.includes('msword')) return 'docx';
  if (t.includes('presentationml') || t.includes('powerpoint')) return 'pptx';
  if (t.includes('spreadsheetml') || t.includes('excel')) return 'xlsx';
  return 'other';
}

export function parseGoogleStudyUrl(raw: string): GoogleStudyLinkInfo | null {
  const url = raw.trim();
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./, '');
  if (host !== 'docs.google.com' && host !== 'drive.google.com') return null;

  const path = parsed.pathname;
  if (path.includes('/document/')) {
    return { kind: 'google-doc', url: parsed.href, suggestedTitle: 'Google Doc' };
  }
  if (path.includes('/spreadsheets/')) {
    return { kind: 'google-sheet', url: parsed.href, suggestedTitle: 'Google Sheet' };
  }
  if (path.includes('/presentation/')) {
    return { kind: 'google-slides', url: parsed.href, suggestedTitle: 'Google Slides' };
  }
  return null;
}

export function isGoogleStudyUrl(url: string): boolean {
  return parseGoogleStudyUrl(url) != null;
}

export function inferStudyFileKindFromUrl(url: string): StudyFileKind {
  const g = parseGoogleStudyUrl(url);
  if (g) return g.kind;
  return 'web';
}

export function isStudySourceObjectType(type: string): boolean {
  return type === 'pdf' || type === 'studyfile';
}

export function continuityLabelForStudyFile(
  fileKind: StudyFileKind,
  role: StudyFileRole | undefined,
  usageLabel: string | undefined,
  fileName: string,
): string {
  if (usageLabel?.trim()) return usageLabel.trim();
  if (role && role !== 'general') {
    return `${studyFileRoleLabel(role)} · ${fileName || studyFileKindLabel(fileKind)}`;
  }
  return fileName || studyFileKindLabel(fileKind);
}

export function openStudyFileExternally(
  opts: {
    fileKind: StudyFileKind;
    externalUrl: string | null;
    blobUrl: string | null;
    fileName: string;
  },
): void {
  const target = opts.externalUrl?.trim() || opts.blobUrl;
  if (!target) return;
  window.open(target, '_blank', 'noopener,noreferrer');
}

export const STUDY_FILE_ROLE_OPTIONS: Array<{ id: StudyFileRole; label: string }> = [
  { id: 'lecture', label: 'Lecture' },
  { id: 'assignment', label: 'Assignment' },
  { id: 'lab', label: 'Lab' },
  { id: 'reference', label: 'Reference' },
  { id: 'general', label: 'General source' },
];
