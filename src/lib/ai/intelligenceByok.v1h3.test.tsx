/**
 * @vitest-environment happy-dom
 *
 * V1-H3 — BYOK / Intelligence clearly separated from Ask ZIKUK.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../../lib/ai/client', () => ({
  aiComplete: vi.fn(async () => ({ ok: true, text: 'ok' })),
}));

vi.mock('../../lib/ai/storage', () => ({
  loadAIUserSettings: () => ({
    enabled: false,
    providerId: 'openai',
    apiKey: '',
    baseUrl: '',
    model: 'gpt-4o-mini',
  }),
  saveAIUserSettings: vi.fn(),
}));

const { IntelligenceModal } = await import('../../components/ai/IntelligenceModal');

const TOKENS = {
  pageBg: '#14100c',
  textPrimary: '#f8fafc',
  textSecondary: '#cbd5e1',
  textMuted: '#94a3b8',
  textGhost: '#64748b',
  cardBg: '#1e293b',
  wellBg: '#0f172a',
  cardBorder: '#334155',
  divider: 'rgba(255,255,255,0.08)',
  focusBorder: '#38bdf8',
  accent: '#38bdf8',
} as unknown as AtmosphereTokens;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(el: ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(el);
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
});

describe('Intelligence / BYOK V1-H3', () => {
  it('8. BYOK UI is clearly isolated from Ask ZIKUK', () => {
    mount(createElement(IntelligenceModal, { tokens: TOKENS, onClose: () => {} }));
    const text = host!.textContent ?? '';
    expect(text).toMatch(/Ask ZIKUK/);
    expect(text).toMatch(/does not use this API key/i);
    expect(host!.querySelector('[data-fw-intelligence-ask-note="1"]')).toBeTruthy();
    expect(text).toMatch(/Legacy/i);
  });

  it('7. Ask ZIKUK controller does not depend on BYOK key state', () => {
    const controller = readFileSync(
      resolve(process.cwd(), 'src/lib/ai/askCourse/useAskCourseController.ts'),
      'utf8',
    );
    const session = readFileSync(
      resolve(process.cwd(), 'src/lib/ai/askCourse/useAskCourseSession.ts'),
      'utf8',
    );
    const gateway = readFileSync(
      resolve(process.cwd(), 'src/lib/ai/gatewayClient/client.ts'),
      'utf8',
    );
    for (const src of [controller, session]) {
      expect(src).not.toMatch(/loadAIUserSettings/);
      expect(src).not.toMatch(/\baiComplete\b/);
      expect(src).not.toMatch(/apiKey/);
    }
    expect(gateway).not.toMatch(/loadAIUserSettings/);
    expect(gateway).not.toMatch(/\baiComplete\b/);
    // Gateway may mention apiKey only to forbid client transmission.
    expect(gateway).toMatch(/Does not accept provider\/model\/apiKey/);
    expect(gateway).toMatch(/zikukAiRequest/);
    expect(controller).toMatch(/zikukAiRequest/);
  });
});
