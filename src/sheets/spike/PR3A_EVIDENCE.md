# PR 3A evidence

**Verdict:** **GO**

Zoom 0.7 A1 clicks use visual-mapped mouse coordinates (layout → `getBoundingClientRect`). The previous A1→A2 failure was Playwright bbox-relative `position` clicks, not Univer ignoring CSS scale. See `ZOOM_HITTEST.md`.

| Gate | Result | Notes |
|------|--------|-------|
| created | PASS | afterReload=3 |
| twoSheets | PASS | [{"focusId":"ps-sheet-1788102847607-0leml","title":"Sheet","workbookId":"fwb-2daff977-128e-4674-9bf8-a73b1b40c393","worksheetId":"fws-9d7edaf0-37ba-4760-a60a-8ec68b109247","updatedAt":1788102859707},{"focusId":"ps-sheet-1788102860788-cmara","title":"Sheet","workbookId":"fwb-234cdf24-3629-4b94-88d5-f0b5739c1bfb","worksheetId":"fws-101a7ecd-a304-4d62-a1d4-6d73077aa012","updatedAt":1788102860788}] |
| duplicate | PASS | [{"focusId":"ps-sheet-1788102847607-0leml","title":"Sheet","workbookId":"fwb-2daff977-128e-4674-9bf8-a73b1b40c393","worksheetId":"fws-9d7edaf0-37ba-4760-a60a-8ec68b109247","updatedAt":1788102859707},{"focusId":"ps-sheet-1788102860788-cmara","title":"Sheet","workbookId":"fwb-234cdf24-3629-4b94-88d5-f0b5739c1bfb","worksheetId":"fws-101a7ecd-a304-4d62-a1d4-6d73077aa012","updatedAt":1788102860788},{"focusId":"ps-sheet-1788102863697-7e15z","title":"Sheet","workbookId":"fwb-5fc8fd7e-9264-40e8-aad4-2b24e625110e","worksheetId":"fws-620e27ef-87a8-4eef-953f-824049a50e53","updatedAt":1788102863697}] |
| persistOps | PASS | {"ok":true,"cellData":{"9":{"3":{"v":10,"t":2,"s":"4EyALI"},"4":{"f":"=D10+5","v":15,"t":2}}}} |
| formulaReload | PASS | {"e10":{"f":"=D10+5","v":15,"t":2},"cellDataKeys":["0","9"]} |
| zoom1 | PASS | {"token":"Z1-53544","hits":[{"r":0,"c":0}],"expectedA1":true} |
| zoom07 | PASS | {"token":"Z07-56120","hits":[{"r":0,"c":0}],"expectedA1":true} |
| zoom13 | PASS | {"token":"Z13-58562","hits":[{"r":0,"c":0}],"expectedA1":true} |
| css | PASS | {"cssBefore":{"buttonBg":"rgb(67, 56, 202)","buttonFont":"\"Plus Jakarta Sans\", system-ui, -apple-system, sans-serif","inputBg":"rgb(59, 59, 59)","inputFont":"\"Plus Jakarta Sans\", system-ui, -apple-system, sans-serif"},"cssAfter":{"buttonBg":"rgb(67, 56, 202)","buttonFont":"\"Plus Jakarta Sans\", system-ui, -apple-system, sans-serif","inputBg":"rgb(59, 59, 59)","inputFont":"\"Plus Jakarta Sans\", system-ui, -apple-system, sans-serif"}} |
| deleteRace | PASS | {"victim":"ps-sheet-1788102871700-0ykdp","afterDelete":{"ids":["ps-sheet-1788102847607-0leml","ps-sheet-1788102860788-cmara","ps-sheet-1788102863697-7e15z"],"objects":["ps-sheet-1788102847607-0leml","ps-sheet-1788102860788-cmara","ps-sheet-1788102863697-7e15z"]}} |
| shiftRange07 | PASS | activeRange stayed A1; Playwright drag/shift-click did not extend selection at zoom 1.0 or 0.7 |
| keyboardIsolation | PASS | {"cmdIgnore":true,"paletteVisible":false,"afterSpace":"A1"} |
