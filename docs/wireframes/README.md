# Mission Control Visual Wireframes

Interactive grayscale wireframes aligned with [`mission-control-design-spec.md`](../mission-control-design-spec.md).

| Version | File | Purpose |
|---------|------|---------|
| **V1.2** (current) | [`mission-control-v1.2.html`](mission-control-v1.2.html) | Orientation Block + Nearby Strip — 5-second comprehension validation |
| V1.1 | [`mission-control-v1.1.html`](mission-control-v1.1.html) | Baseline anteroom structure (Setup · Active · Library) |

ASCII reference: [`mission-control-wireframes-v1.2.md`](../mission-control-wireframes-v1.2.md)

## Open

From repo root:

```bash
open docs/wireframes/mission-control-v1.2.html
```

Or serve locally:

```bash
npx --yes serve docs/wireframes -p 3456
```

Then visit `http://localhost:3456/mission-control-v1.2.html`

## Controls

| Control | Purpose |
|---------|---------|
| Viewport | Desktop 1280×800 or Mobile 390×844 |
| Screen | Cold · Warm · New · Empty · Exam Week |
| Zones | Dashed outlines on orientation, desk, nearby, storage |
| Weights | Dominance annotations (desktop, V1.2 budget) |
| Expand Setup / Active / Library | Cabinet behavior (one at a time) |

## V1.2 evaluation lens (5-second test)

Without opening cabinets, can you answer:

1. **What does this course contain?** → Orientation line 1 (`This course:`)
2. **What was I doing?** → Orientation line 2 (`You:`) + monument
3. **Why does MC exist?** → Orientation line 3 (`Here:`)
4. **What next?** → One primary CTA in desk zone

Also check: Does the desk zone still dominate? Do cabinets stay peripheral? Does it still feel like an anteroom — not a dashboard or LMS?

## Screens

- **Cold Return** — canonical MC with Orientation Block + Nearby Strip
- **Warm Return** — Workspace + delegate strip (unchanged from V1.1)
- **New Course** — Orientation only; no Nearby; Setup auto-expanded
- **Empty Course** — Orientation + 2-item Nearby
- **Exam Week** — same as cold; L0 + date emphasis only
