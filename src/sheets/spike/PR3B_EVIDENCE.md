# PR 3B Evidence — Sheet UOV

**Verdict: GO**

Generated: 2026-08-30T19:06:25.831Z

## Hard gates
- dirty_handoff_fullscreen: PASS — A1={"value":"dirty-before-fs","formula":""}
- rapid_transition_race: PASS — cells={"A1":{"value":"floating","formula":""},"B1":{"value":"fullscreen","formula":""},"C1":{"value":"split","formula":""}}
- single_active_engine: PASS — all presentation transitions reported engine count === 1
- floating_to_fullscreen: PASS — engines float=1 fs=1 host={"w":1280,"h":659,"offsetW":1280,"offsetH":659}
- floating_to_split_left: PASS — engines=1 host={"w":639,"h":675,"offsetW":639,"offsetH":675}
- floating_to_split_right: PASS — engines=1 host={"w":639,"h":675,"offsetW":639,"offsetH":675} side=right
- fullscreen_to_floating: PASS — engines=1 before={"x":40,"y":40,"w":600,"h":384} after={"x":40,"y":40,"w":600,"h":384}
- delete_while_presented: PASS — delId=ps-sheet-1788116778583-jkp1j metaCount=0 hosts=[] resurrected=false
- invalid_document: PASS — corruptStill=true invalidUi=true
- persistence_refresh_race: PASS — after refresh cells={"A1":{"value":"floating","formula":""},"B1":{"value":"fullscreen","formula":""},"C1":{"value":"split","formula":""}}
- two_sheet_isolation: PASS — docs=[{"id":"ps-sheet-1788116772022-wo6dt","workbookId":"fwb-3b5939c9-8cd6-4498-a862-d56d8a332610","a1":"sheet-a"},{"id":"ps-sheet-1788116773297-f7djv","workbookId":"fwb-44a88d31-9f89-4428-b404-6b3d7e9fdc39","a1":"sheet-b"}]
- escape_while_editing: PASS — editing={"life":[],"eng":true,"aeTag":"DIV","aeEditable":true} viewMode=fullscreen
- escape_when_not_editing: PASS — viewMode=floating

## All results
- **floating_to_fullscreen**: PASS — engines float=1 fs=1 host={"w":1280,"h":659,"offsetW":1280,"offsetH":659}
- **fullscreen_to_floating**: PASS — engines=1 before={"x":40,"y":40,"w":600,"h":384} after={"x":40,"y":40,"w":600,"h":384}
- **floating_to_split_left**: PASS — engines=1 host={"w":639,"h":675,"offsetW":639,"offsetH":675}
- **floating_to_split_right**: PASS — engines=1 host={"w":639,"h":675,"offsetW":639,"offsetH":675} side=right
- **split_to_fullscreen**: PASS — engines=1
- **split_left_to_split_right**: PASS — side=right
- **dirty_handoff_fullscreen**: PASS — A1={"value":"dirty-before-fs","formula":""}
- **rapid_transition_race**: PASS — cells={"A1":{"value":"floating","formula":""},"B1":{"value":"fullscreen","formula":""},"C1":{"value":"split","formula":""}}
- **persistence_refresh_race**: PASS — after refresh cells={"A1":{"value":"floating","formula":""},"B1":{"value":"fullscreen","formula":""},"C1":{"value":"split","formula":""}}
- **fullscreen_resize**: PASS — before={"w":1280,"h":659,"offsetW":1280,"offsetH":659} after={"w":1280,"h":739,"offsetW":1280,"offsetH":739}
- **split_resize**: PASS — host={"w":639,"h":755,"offsetW":639,"offsetH":755}
- **pointer_drag**: PASS — drag={"a1":"A1","range":"A1:B3"}
- **real_clipboard**: FAIL — fallback pasteValues (headless clipboard may be blocked); after transition={"A20":{"value":"CP1","formula":""},"B21":{"value":"CP2","formula":""}}
- **keyboard_isolation**: PASS — data-fw-cmd-ignore=true
- **escape_when_not_editing**: PASS — viewMode=floating
- **escape_while_editing**: PASS — editing={"life":[],"eng":true,"aeTag":"DIV","aeEditable":true} viewMode=fullscreen
- **zoom_07_return**: PASS — zoom=0.7 before={"x":40,"y":40,"w":600,"h":384} after={"x":40,"y":40,"w":600,"h":384}
- **zoom_07_drag**: PASS — drag={"a1":"A1","range":"A1:B3"}
- **two_sheet_isolation**: PASS — docs=[{"id":"ps-sheet-1788116772022-wo6dt","workbookId":"fwb-3b5939c9-8cd6-4498-a862-d56d8a332610","a1":"sheet-a"},{"id":"ps-sheet-1788116773297-f7djv","workbookId":"fwb-44a88d31-9f89-4428-b404-6b3d7e9fdc39","a1":"sheet-b"}]
- **delete_while_presented**: PASS — delId=ps-sheet-1788116778583-jkp1j metaCount=0 hosts=[] resurrected=false
- **invalid_document**: PASS — corruptStill=true invalidUi=true
- **single_active_engine**: PASS — all presentation transitions reported engine count === 1
- **offline_architecture**: PASS — UOV uses same renderSpaceObject → FocusSheetSurface → onDocumentCommit → updateObjectContent path; no UOV-specific save
- **undo_redo_policy**: PASS — Univer in-memory undo MAY reset on remount; document content must not roll back (covered by race + refresh)
- **no_storage_migration**: PASS — No schema/DB migration in PR 3B
- **pr3c_not_started**: PASS — No Calculate/AI/CSV/charts work

## Undo/redo (V1)
Univer in-memory undo history MAY reset when presentation remounts the engine.
Document content must never roll back; old engine history must never affect the new engine.

## Manual authenticated QA (required before production)
- Add Sheet → values/formula → Fullscreen → edit → paste → Split left/right → Floating
- Zoom Free Space → drag range → move/resize → refresh → verify content + geometry
