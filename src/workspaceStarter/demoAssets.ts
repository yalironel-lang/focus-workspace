/**
 * Built-in demo visuals — no IndexedDB, no reconnect flows.
 * Stored inline so the example room works on every device/session.
 */

const DEMO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a1510"/>
      <stop offset="100%" stop-color="#0f0d0a"/>
    </linearGradient>
  </defs>
  <rect width="480" height="320" fill="url(#bg)"/>
  <rect x="24" y="24" width="432" height="272" rx="12" fill="none" stroke="#f59e0b" stroke-opacity="0.35" stroke-width="2"/>
  <text x="40" y="56" fill="rgba(255,255,255,0.9)" font-family="system-ui,sans-serif" font-size="20" font-weight="600">Sample screenshot</text>
  <text x="40" y="88" fill="rgba(255,255,255,0.55)" font-family="system-ui,sans-serif" font-size="14">Diagrams live beside your notes</text>
  <path d="M60 200 L180 140 L300 220 L420 160" fill="none" stroke="#f59e0b" stroke-width="3" stroke-opacity="0.75"/>
</svg>`;

export const DEMO_SCREENSHOT_DATA_URL = `data:image/svg+xml,${encodeURIComponent(DEMO_SVG)}`;
