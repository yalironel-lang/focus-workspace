# Focus Workspace — Project Context

## What this app is
Focus Workspace is a futuristic productivity/workspace app with a dark cinematic interface, spatial canvas, notebook blocks, sections, and project objects.

## Design style
- Dark mode
- Premium Apple-level polish
- Deep navy / black background
- Purple and blue glow accents
- Minimal, calm, intelligent UI
- Spatial workspace feeling
- Soft shadows, depth, glassmorphism
- Avoid noisy UI

## Current active work
We are improving the Free Space / Canvas cinematic focus experience.

## Already implemented
- ProjectNotebookBlock now supports free-space context.
- Notebook editing state is propagated upward.
- ProjectSpaceObjectRenderer forwards notebook editing changes.
- SectionPage tracks which Free Space object is being edited.
- FreeformCanvas receives focusEditingId / hasDeepFocus.
- TypeScript build passes.

## Remaining tasks
1. Add active vs inactive surface styling around FreeformBlock in FreeformCanvas.
2. Add subtle spatial structure layer behind blocks.
3. Add viewport lighting / vignette tied to focusEditingId.
4. Tighten and soften cluster/capture/focus bubble backdrops.
5. Reduce visual competition from canvas controls.

## Important rules
- Do not break notebook editing.
- Do not rewrite unrelated systems.
- Keep TypeScript clean.
- Preserve existing interactions.
- Make changes incrementally.