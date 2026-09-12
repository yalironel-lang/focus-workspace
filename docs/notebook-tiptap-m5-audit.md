# M5 audit — approved versioned M5.1 codec

Baseline: `cb2705ed28aa244b7603875b428696b0c37be653`, whose parent is
`7a077aa472bf025e734ca9073f2d04b690287726`. Neither commit was changed.
The initial dry-run audit below is retained as history. The approved M5.1 codec implementation
is documented in the final section. No save callback, stored content rewrite, real TipTap
persistence flag, or live database operation was added.

## Existing save and hydration pipeline

1. Legacy text/format commands in `ProjectNotebookBlock` update `blocks`/`blocksRef`,
   call `serializeBlocks`, then `pushContent` with the canonical body.
2. `pushContent` uses effective page/navigation state from `contentRef`, invokes
   `applyNotebookPersist`, and compares body plus Notebook manifest fingerprints.
3. With the existing V1 pages flag, `applyNotebookPersist` calls
   `dualWriteNotebookPages`: the editor body updates the active document page's
   `pages[].documentBody`. Without that flag the existing legacy body contract remains.
4. Page navigation overlay is updated; a content snapshot and commit closure are
   retained behind the existing 420 ms Notebook debounce.
5. `flushNotebookPersist` commits that snapshot through `persistNotebookContent`.
   This reapplies the dual-write contract and calls `prepareNotebookForCloudPersist`,
   retaining authoritative page bodies and a compatible top-level body projection,
   while excluding device-local active page/section navigation from the cloud payload.
6. `emitContentChange` reaches the renderer's `onChange`, then
   `useSectionFreeSpaceObjects.updateObjectContent`. That marks the object dirty,
   updates its timestamp, and uses the existing 400 ms object debounce.
7. Durable object persistence merges with localStorage before enqueueing an UPDATE
   in IndexedDB `focus_cache_v1` pending operations. Existing pending CREATE/UPDATE
   coalescing, retry and scope handling remain responsible for offline sync.
8. The existing pending-operation flusher sends the object JSON through the existing
   `free_space_objects` upsert. Notebook body strings remain inside object content;
   TipTap JSON is not part of this contract.
9. Local reload and remote pulls normalize/merge objects. Notebook page hydration
   derives the active editor body from the document page, using device-local navigation.

## Flush and navigation audit

- Shell page operations await handwriting flush, flush the Notebook debounce, then
  serialize `blocksRef` before applying page mutations/navigation.
- Notebook scope change/unmount flushes the pending editor snapshot.
- Object scope change/unmount flushes its object snapshot. The object hook registers
  with the existing global Free Space persistence flush registry.
- `main.tsx` invokes global flushing on visibility-hidden, pagehide and beforeunload.
- No corresponding registration of the Notebook's 420 ms text debounce was found
  in `ProjectNotebookBlock`. Therefore fast browser refresh must not be assumed
  safe merely because the object debounce has a global flusher.
- Safe Close unmounts the Notebook after handwriting flush; Mission Control retains
  the mounted workspace and flushes registered object persistence when opened.
- A future bridge must keep legacy `blocksRef` synchronized with candidate body edits:
  otherwise a page mutation can serialize stale legacy blocks over the candidate edit.
- The pending Notebook commit closure reads the navigation ref when invoked. Page
  identity and flush ordering must be tested before connecting candidate saves.

## Current candidate flow and write-loop risks

`effectiveContent.body` → `sourceDocumentBody` → `parseNotebookBody` →
`bodyToTiptapDoc` → editable sandbox schema. Document updates call `tiptapDocToBody`
only to create an in-memory snapshot. There is no save callback.

The hydration effect calls `setContent(..., { emitUpdate: false })` on page/source
changes and resets the dirty flag. Its dependencies include `onSnapshot`; replacing
that callback can also rerun hydration. Connecting writes without revising this
behavior risks replacing local edits, losing selection/history, or feedback loops.

A future bridge needs all of these gates before real writes:

- Explicit DEV persistence opt-in independent of visibility/parity flags.
- Suppress mount/hydration updates; `docChanged` alone does not prove a user edit.
- Canonical equality to suppress direction-only, selection/cursor/focus/toolbar,
  repeated formatting and otherwise identical output.
- Acknowledge self-originated parent echoes without reloading the editor.
- Detect external updates while local edits are pending; never blindly overwrite
  either version. Conflict policy is not implemented in this stopped pass.
- Capture object/page identity and keep `blocksRef`/canonical page state aligned.
- Make callback identity changes and StrictMode setup/cleanup idempotent.
- Reuse existing Notebook and object flushes in order, including rapid refresh,
  page switch, navigation, Safe Close and Mission Control transitions.

## M5.1 dry-run and reproduced blockers

`inspectCandidatePersistence` is a pure diagnostic helper. It reports source and
candidate canonical body equality, line differences, serialization errors, and
semantic block equivalence after reload. It ignores transient ids/direction and
uses existing ordered-sequence normalization. It has no persistence callback.

The existing golden bodies pass through the actual editable schema, including all
block kinds, media references, inline marks, Hebrew/English/math, and interior blank
lines. However, serializable does **not** imply lossless:

1. A candidate **paragraph** with literal `# Literal title` serializes to that exact
   string, then reloads as a **title**. Other reproduced prefixes are `##`, `---`,
   `- `, `- [ ]`, `=>`, `!theorem`, and `::hw::hw-literal::`. The last example
   reclassifies ordinary text as a handwriting reference. No automatic conversion
   occurred while editing; the corruption happens at the body reload boundary.
2. Three empty candidate paragraphs serialize as newlines but reload as the legacy
   empty-title/empty-paragraph sentinel. A stored all-blank body also collapses to
   an empty string under the existing parser/serializer. Interior blank lines in
   nonempty documents pass; all-blank documents are a distinct failing case.

Tests intentionally assert that the dry-run rejects these cases. Passing those
regression tests does not mean the losslessness blocker is resolved.

## Stop decision

M5.2 is not implemented. No persistence flag was added or enabled. The candidate
remains memory-only with its existing default-OFF visibility flag. Legacy editing,
Notebook dialect, SQL, pending operations, Safe Close and Recently Deleted are untouched.

Before continuing, the canonical representation of literal dialect-prefix text and
all-empty documents must be resolved without silently changing meaning. Do not enable
writes by excluding these cases from testing or by treating serialization success as
proof of a lossless round-trip.

## Follow-up: complete escaping audit (no parser change)

The block classifier recognizes:

- `#` titles, `##` sections (including additional hashes; no separating space required).
- A trimmed line equal to `---` as divider.
- Digits followed by `.` as ordered items (space optional; subsequent numbers normalize).
- `- ` as bullets, with indentation converted to depth and capped at two.
- `- [ ]`, `- [x]`, `- [X]` tasks, including accepted bracket whitespace.
- `>` quotes and `=>` steps (space optional).
- `!summary`, `!concept`, `!review`, `!definition`, `!theorem`, `!example`, `!mistake`
  case-insensitively, without a required word boundary after the tone.
- `$$` followed by whitespace/content as block math.
- Whole-line `::img::<key>::<alt>::` and `::hw::<key>::` references.
- `¶` and `¶¶` paragraph variants.
- Rich mark envelopes `⟨m⟩...⟨/m⟩`, recognized and removed anywhere in text,
  including malformed/non-array metadata.

Most block prefixes also classify after surrounding whitespace is trimmed. Plain
NBSP normalizes to space. Structured text payloads trim whitespace, all-whitespace
bodies become the legacy empty title/body sentinel, and serialization normalizes
ordered sequences. These are additional compatibility constraints, not just prefix
collisions. Mid-paragraph block syntax is generally literal; mark envelopes are not.

A serializer-only approach can use the **existing** empty mark envelope
`⟨m⟩[]⟨/m⟩` to protect an ordinary literal paragraph, including whitespace and empty
paragraphs. The current parser already recognizes this representation. Existing
nonempty formatting envelopes similarly protect syntax-like text. No decoder change
is needed for those cases, but the serializer currently removes the empty envelope.

This is not a complete escaping solution: `serializeRichLine` strips literal mark
envelopes from the user's text, and `parseRichLine` strips them anywhere inside a
payload. Prepending another empty envelope does not prevent that loss. Recognizing
a new escape sequence or changing those decoder rules globally could reinterpret
existing stored text or old metadata payloads.

### Proposed compatibility strategy — requires approval before implementation

1. Keep legacy decoding unchanged for every existing Notebook with no codec version.
2. Introduce an explicit opt-in text-codec version **outside the body string**, so a
   coincidental literal prefix in an old body cannot activate new decoding.
3. In that codec only, encode ambiguous text payloads reversibly (including marker
   delimiters, whitespace, and empty blocks); retain canonical block semantics and
   offsets for marks. Decode once, not recursively. This would remain a Notebook
   text codec, not persisted TipTap/ProseMirror JSON.
4. Use the existing empty mark envelope only where the old decoder can already
   preserve the full text. Do not claim it solves arbitrary literal metadata text.
5. No opening-time migration/rewrite, SQL change, or real write enablement. Any future
   version transition must be explicit and tested separately.

An out-of-band codec version would extend application-level persisted metadata and
reader plumbing. It has **not** been implemented. A new reserved body prefix alone
cannot guarantee collision-free compatibility because existing paragraph text can
contain that prefix. Per the user's stop rule, only characterization fixtures were
added in this follow-up; canonical parser/serializer behavior is unchanged.


## Approved M5.1 implementation (supersedes the earlier stop decision)

### Metadata contract

`pages[].documentBodyCodecVersion` describes only that page's authoritative
`documentBody`. `bodyCodecVersion` describes only the top-level `body` projection.
Both fields are optional application JSON numbers; neither changes SQL, IndexedDB
store definitions, or the existing Notebook pages schemaVersion. Missing means
legacy. Version 1 opts in; unsupported numeric versions fail decoding explicitly.
The codec is never inferred from body text.

Hydration, sanitization, navigation, dual-write, manifest comparison, and cloud
payload preparation transport each body/version pair together. Switching back to
an unversioned page clears the projection version. New pages remain unversioned.
The existing local snapshot body copy also carries its paired version; no snapshot
schedule, restore target selection, or Recently Deleted tombstone behavior changed.
No body is upgraded by opening or hydrating a Notebook. All current stored bodies
remain on the unchanged legacy branch. A future explicit upgrade/write policy is
still M5.2 work and is not implemented here.

### Version 1 text format

The central `notebookTextCodec.ts` encodes one canonical block per physical line:

- Text blocks: `~nb1:` followed by compact JSON `[kind,text,marks,detail]`.
- Kinds: paragraph, title, section, bullet, ordered, task, quote, step, callout, math.
- Detail: paragraph variant or null; bullet depth; ordered number; task checked
  boolean; callout tone; otherwise null.
- Marks: canonical offset records `{s,e,t,v?}` over the original UTF-16 text.
- Divider: `---`.
- Handwriting: `::hw::<key>::`.
- Image: `::img::<key>::<JSON string alt>::`.

This is canonical Notebook block data, not TipTap/ProseMirror JSON. The existing
anchored asset collectors still recognize actual media references. Literal media
syntax lives inside a text record and cannot be mistaken for a referenced asset.
JSON string escaping preserves quotes, backslashes, CR/LF, tabs, NBSP, surrounding
spaces, mark-envelope literals, and the codec's own prefix without recursive decoding.
No trimming, invisible padding, replacement of user text, or inline-envelope parser
is used on versioned payloads. Empty paragraphs have explicit records, including
consecutive empty paragraphs. The empty string encodes zero canonical blocks;
editable documents require at least one block. Ordered numbers are retained as data.

`parseNotebookBody` and `serializeNotebookBlocks` accept the optional version and
dispatch centrally. Unversioned parsing/serialization stays unchanged, including
its documented legacy ambiguities. Both candidate and legacy editor receive the
exact body's version. The legacy preview uses decoded text and explicit marks,
so literal envelopes are not parsed a second time. Versioned inline math uses the
existing MathRichText renderer and mark offsets.

### Coverage

New fixtures exercise every structural prefix family, alone and with text,
Hebrew/English, whitespace/NBSP, inline math, real formatting marks, literal mark
envelopes, literal codec sequences, and repeated cycles. They run through actual
editable TipTap Editor instances three times, asserting stable body bytes and
canonical block meaning. Existing legacy characterization cases remain unchanged.
Golden fixtures are checked on both the unversioned path and as versioned blocks.
Additional tests cover mixed-page navigation/hydration/dual-write/cloud projection,
reference-key collectors, mounted legacy/candidate readers, no write-on-open,
memory-only candidate status, and snapshot metadata transport with mocked storage.

M5.2 real writes remain disabled. No candidate persistence callback or new feature
flag exists. The candidate retains its default-OFF flag and UNSAVED/memory-only UI.


### Final validation and file inventory

- New tests: 393 codec tests + 5 mixed-page tests + 2 mounted-reader/candidate tests
  + 4 snapshot metadata tests = 404 new tests in this compatibility pass.
- Full notebookTiptap run: 920/920 tests, 19/19 files. Includes the existing 132
  legacy ambiguity characterizations and 58 M5.1 dry-run tests.
- Final practical Notebook/Free Space/mission-control/cache/hooks regression run:
  1469/1469 tests, 77/77 files. This includes all notebookTiptap tests and the final
  added mounted-candidate editing/no-storage assertion. Counts overlap, not additive.
- Production TypeScript: `npx tsc -p tsconfig.build.json --noEmit` passed, exit 0.
- `git diff --check`: clean.
- Warnings: existing localhost diagnostic connection EPERM and Supabase DNS
  ENOTFOUND output. No live test was run or network access enabled.
- No existing Notebook was rewritten/migrated; no real candidate writes enabled.

Files changed in this compatibility pass:

- src/lib/notebookTextCodec.ts (new central codec)
- src/lib/notebookDialect.ts
- src/lib/notebookPages/bodyCodec.ts (new paired projection helpers)
- src/lib/notebookPages/types.ts
- src/lib/notebookPages/hydrate.ts
- src/lib/notebookPages/operations.ts
- src/lib/notebookPages/persist.ts
- src/lib/knowledge/knowledgeTypes.ts
- src/lib/knowledge/notebookSnapshotStore.ts
- src/lib/knowledge/knowledgeRestore.ts (paired snapshot version only)
- src/lib/notebookTiptap/blocksToTiptapDoc.ts
- src/lib/notebookTiptap/tiptapDocToBody.ts
- src/lib/notebookTiptap/candidatePersistenceDryRun.ts (pre-existing untracked M5.1 work, extended)
- src/components/notebook/tiptap/NotebookTiptapCandidateEditor.tsx
- src/components/project-space/ProjectNotebookBlock.tsx
- src/lib/notebookTiptap/versionedCodec.test.ts (new)
- src/lib/notebookTiptap/versionedPages.test.ts (new)
- src/lib/notebookTiptap/versionedReader.test.tsx (new)
- src/lib/notebookTiptap/versionedSnapshot.test.ts (new)
- docs/notebook-tiptap-m5-audit.md (pre-existing untracked audit, extended)

The pre-existing untracked candidatePersistenceDryRun.test.ts and
dialectAmbiguity.test.ts are retained unchanged. Pre-existing .m41-* and
.m4-safety-* artifacts, .cursor/debug-3f83e8.log, and supabase/.temp/cli-latest remain
uncommitted. Existing diagnostic instrumentation appended log entries during tests.
.env.local was not edited. No commit, push, merge, or deployment occurred.

Manual QA: use synthetic versioned fixtures in memory to check literal #, ---,
references, envelopes, Hebrew/English/math, marks and empty blocks; switch between
legacy and versioned page fixtures and verify the expected type/text. The candidate
must still display UNSAVED and lose in-memory edits on reload. Do not enable writes.
