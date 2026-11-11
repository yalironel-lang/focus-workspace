# Browser JPEG verification (Visual Capture V1)

Happy-dom cannot exercise Canvas2D/`toDataURL('image/jpeg')`. Use the Playwright harness:

```bash
node scripts/visual-capture-jpeg-browser.mjs
```

Requires Playwright Chromium (`npx playwright install chromium`). Synthetic canvases only — no private PDFs, no provider calls.

Checks: JPEG magic, byte/long-edge budgets, crop excludes synthetic UI chrome, aspect ratio stable across 1×/2× page bitmaps (zoom independence).
