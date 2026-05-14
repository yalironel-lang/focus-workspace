export type CompanionEmbedMode = 'embedded' | 'external-only' | 'auto';

export interface CompanionPreferredSize {
  w: number;
  h: number;
}

export interface CompanionPanelContentFields {
  url: string;
  title: string;
  favicon: string;
  embedMode: CompanionEmbedMode;
  lastOpenedAt: number | null;
  description?: string;
  preferredSize?: CompanionPreferredSize;
}

export interface CompanionDraftInput {
  url: string;
  title?: string;
  description?: string;
  embedMode?: CompanionEmbedMode;
  lastOpenedAt?: number | null;
  preferredSize?: CompanionPreferredSize;
}

export type CompanionKind =
  | 'ai'
  | 'math'
  | 'research'
  | 'video'
  | 'docs'
  | 'mail'
  | 'general';

const KNOWN_TITLE_SUFFIXES: Array<[suffix: string, label: string]> = [
  ['chatgpt.com', 'ChatGPT'],
  ['chat.openai.com', 'ChatGPT'],
  ['claude.ai', 'Claude'],
  ['desmos.com', 'Desmos'],
  ['wolframalpha.com', 'WolframAlpha'],
  ['youtube.com', 'YouTube'],
  ['youtu.be', 'YouTube'],
  ['wikipedia.org', 'Wikipedia'],
  ['docs.google.com', 'Google Docs'],
  ['drive.google.com', 'Google Drive'],
  ['mail.google.com', 'Gmail'],
  ['gmail.com', 'Gmail'],
  ['notion.so', 'Notion'],
  ['notion.site', 'Notion'],
  ['overleaf.com', 'Overleaf'],
  ['arxiv.org', 'arXiv'],
  ['scholar.google.com', 'Google Scholar'],
  ['perplexity.ai', 'Perplexity'],
  ['gemini.google.com', 'Gemini'],
];

const EXTERNAL_ONLY_SUFFIXES = [
  'chatgpt.com',
  'chat.openai.com',
  'claude.ai',
  'mail.google.com',
  'gmail.com',
  'docs.google.com',
  'drive.google.com',
];

function withProtocol(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^[a-z]+:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function normalizeCompanionUrl(raw: string): string {
  const normalized = withProtocol(raw);
  const url = new URL(normalized);
  if (!url.hostname) throw new Error('Missing hostname');
  return url.toString();
}

export function sanitizeCompanionUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    return normalizeCompanionUrl(trimmed);
  } catch {
    return withProtocol(trimmed);
  }
}

export function getCompanionHostname(rawUrl: string): string {
  try {
    return new URL(sanitizeCompanionUrl(rawUrl)).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function stripCommonSubdomains(host: string): string {
  return host.replace(/^www\./, '').replace(/^m\./, '');
}

function titleFromHost(host: string): string {
  const cleaned = stripCommonSubdomains(host).split('.').slice(0, -1).join('.');
  if (!cleaned) return 'Companion';
  return cleaned
    .split(/[-_.]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getSuggestedCompanionTitle(rawUrl: string, title?: string): string {
  const explicit = title?.trim();
  if (explicit) return explicit;
  const host = getCompanionHostname(rawUrl);
  if (!host) return 'Companion';
  for (const [suffix, label] of KNOWN_TITLE_SUFFIXES) {
    if (host === suffix || host.endsWith(`.${suffix}`)) return label;
  }
  return titleFromHost(host);
}

export function getCompanionFavicon(rawUrl: string): string {
  const host = getCompanionHostname(rawUrl);
  if (!host) return '';
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
}

export function getCompanionKind(
  rawUrl: string,
  title?: string,
  description?: string,
): CompanionKind {
  const host = getCompanionHostname(rawUrl);
  const text = `${title ?? ''} ${description ?? ''}`.toLowerCase();

  if (
    host.includes('chatgpt') ||
    host.includes('openai') ||
    host.includes('claude') ||
    host.includes('perplexity') ||
    host.includes('gemini') ||
    host.includes('copilot') ||
    text.includes('assistant')
  ) {
    return 'ai';
  }

  if (
    host.includes('desmos') ||
    host.includes('wolfram') ||
    host.includes('symbolab') ||
    host.includes('geogebra')
  ) {
    return 'math';
  }

  if (
    host.includes('youtube') ||
    host.includes('youtu.be') ||
    host.includes('vimeo') ||
    text.includes('lecture') ||
    text.includes('video')
  ) {
    return 'video';
  }

  if (
    host.includes('docs.google') ||
    host.includes('drive.google') ||
    host.includes('notion') ||
    host.includes('overleaf') ||
    host.includes('sheets.google') ||
    host.includes('slides.google')
  ) {
    return 'docs';
  }

  if (
    host.includes('wikipedia') ||
    host.includes('arxiv') ||
    host.includes('scholar.google') ||
    host.includes('jstor') ||
    host.includes('pubmed') ||
    host.includes('sciencedirect') ||
    text.includes('research') ||
    text.includes('article')
  ) {
    return 'research';
  }

  if (
    host.includes('gmail') ||
    host.includes('mail.google') ||
    host.includes('outlook') ||
    host.includes('mail.yahoo')
  ) {
    return 'mail';
  }

  return 'general';
}

export function isLikelyExternalOnlyCompanion(rawUrl: string): boolean {
  const host = getCompanionHostname(rawUrl);
  if (!host) return false;
  return EXTERNAL_ONLY_SUFFIXES.some(
    suffix => host === suffix || host.endsWith(`.${suffix}`),
  );
}

export function getDefaultCompanionPreferredSize(rawUrl: string): CompanionPreferredSize {
  switch (getCompanionKind(rawUrl)) {
    case 'video':
      return { w: 560, h: 360 };
    case 'docs':
      return { w: 520, h: 380 };
    case 'math':
      return { w: 500, h: 360 };
    case 'ai':
      return { w: 460, h: 360 };
    case 'research':
      return { w: 480, h: 340 };
    default:
      return { w: 460, h: 320 };
  }
}

export function sanitizeCompanionPreferredSize(raw: unknown): CompanionPreferredSize | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Record<string, unknown>;
  const w = typeof value.w === 'number' ? value.w : Number(value.w);
  const h = typeof value.h === 'number' ? value.h : Number(value.h);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return undefined;
  return {
    w: Math.max(320, Math.min(960, Math.round(w))),
    h: Math.max(220, Math.min(720, Math.round(h))),
  };
}

export function buildCompanionContent(
  input: CompanionDraftInput,
): CompanionPanelContentFields {
  const url = sanitizeCompanionUrl(input.url);
  const title = getSuggestedCompanionTitle(url, input.title);
  const description = input.description?.trim() || undefined;
  const preferredSize =
    sanitizeCompanionPreferredSize(input.preferredSize) ??
    getDefaultCompanionPreferredSize(url);

  return {
    url,
    title,
    favicon: getCompanionFavicon(url),
    embedMode:
      input.embedMode === 'embedded' || input.embedMode === 'external-only'
        ? input.embedMode
        : 'auto',
    lastOpenedAt:
      typeof input.lastOpenedAt === 'number' && Number.isFinite(input.lastOpenedAt)
        ? input.lastOpenedAt
        : null,
    ...(description ? { description } : {}),
    preferredSize,
  };
}
