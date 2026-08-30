# PR 3C Evidence — Focus Sheet Toolbar

**Verdict: GO**

Generated: 2026-08-30T19:34:50.072Z

## Hard gates
- toolbar_present: PASS — density=full
- selection_only_no_commit: PASS — before=0 after=0
- biu_align_colors: PASS — style={"bold":true,"italic":true,"underline":true,"horizontalAlign":"center","fontColor":"#dc2626","fillColor":"#bfdbfe","numberFormat":"general","numberPattern":""}
- number_formats: PASS — {"B1":{"bold":false,"italic":false,"underline":false,"horizontalAlign":null,"fontColor":null,"fillColor":"#fff","numberFormat":"number","numberPattern":"#,##0.00"},"C1":{"bold":false,"italic":false,"underline":false,"horizontalAlign":null,"fontColor":null,"fillColor":"#fff","numberFormat":"currency_eur","numberPattern":"\"€\"#,##0.00"},"D1":{"bold":false,"italic":false,"underline":false,"horizontalAlign":null,"fontColor":null,"fillColor":"#fff","numberFormat":"percent","numberPattern":"0%"},"E1":{"bold":false,"italic":false,"underline":false,"horizontalAlign":null,"fontColor":null,"fillColor":"#fff","numberFormat":"currency_usd","numberPattern":"\"$\"#,##0.00"},"F1":{"bold":false,"italic":false,"underline":false,"horizontalAlign":null,"fontColor":null,"fillColor":"#fff","numberFormat":"currency_gbp","numberPattern":"\"£\"#,##0.00"}}
- percent_value_integrity: PASS — {"v":0.5,"t":2,"s":"OdVgI2","display":{"D1":{"value":"50%","formula":""}}}
- formula_survives_format: PASS — C2={"value":"€30.00","formula":"=A2+B2"}
- undo_redo_format: PASS — on=true off=false redo=true
- persist_refresh: PASS — {"a1":{"bold":true,"italic":true,"underline":true,"horizontalAlign":"center","fontColor":"#dc2626","fillColor":"#bfdbfe","numberFormat":"general","numberPattern":""},"c1":{"bold":false,"italic":false,"underline":false,"horizontalAlign":null,"fontColor":null,"fillColor":"#fff","numberFormat":"currency_eur","numberPattern":"\"€\"#,##0.00"},"d1":{"bold":false,"italic":false,"underline":false,"horizontalAlign":null,"fontColor":null,"fillColor":"#fff","numberFormat":"percent","numberPattern":"0%"},"c2":{"C2":{"value":"€30.00","formula":"=A2+B2"}}}
- uov_format_persist: PASS — {"bold":true,"italic":false,"underline":false,"horizontalAlign":null,"fontColor":null,"fillColor":"#bbf7d0","numberFormat":"general","numberPattern":""}
- floating_vertical_space: PASS — {"block":{"w":598,"h":382},"tbH":33,"hostH":294,"density":"full","surfaceH":328}

## All results
- **toolbar_present**: PASS — density=full
- **selection_only_no_commit**: PASS — before=0 after=0
- **biu_align_colors**: PASS — style={"bold":true,"italic":true,"underline":true,"horizontalAlign":"center","fontColor":"#dc2626","fillColor":"#bfdbfe","numberFormat":"general","numberPattern":""}
- **number_formats**: PASS — {"B1":{"bold":false,"italic":false,"underline":false,"horizontalAlign":null,"fontColor":null,"fillColor":"#fff","numberFormat":"number","numberPattern":"#,##0.00"},"C1":{"bold":false,"italic":false,"underline":false,"horizontalAlign":null,"fontColor":null,"fillColor":"#fff","numberFormat":"currency_eur","numberPattern":"\"€\"#,##0.00"},"D1":{"bold":false,"italic":false,"underline":false,"horizontalAlign":null,"fontColor":null,"fillColor":"#fff","numberFormat":"percent","numberPattern":"0%"},"E1":{"bold":false,"italic":false,"underline":false,"horizontalAlign":null,"fontColor":null,"fillColor":"#fff","numberFormat":"currency_usd","numberPattern":"\"$\"#,##0.00"},"F1":{"bold":false,"italic":false,"underline":false,"horizontalAlign":null,"fontColor":null,"fillColor":"#fff","numberFormat":"currency_gbp","numberPattern":"\"£\"#,##0.00"}}
- **percent_value_integrity**: PASS — {"v":0.5,"t":2,"s":"OdVgI2","display":{"D1":{"value":"50%","formula":""}}}
- **decimal_adjust**: PASS — pattern=#,##0.0
- **formula_survives_format**: PASS — C2={"value":"€30.00","formula":"=A2+B2"}
- **undo_redo_format**: PASS — on=true off=false redo=true
- **persist_refresh**: PASS — {"a1":{"bold":true,"italic":true,"underline":true,"horizontalAlign":"center","fontColor":"#dc2626","fillColor":"#bfdbfe","numberFormat":"general","numberPattern":""},"c1":{"bold":false,"italic":false,"underline":false,"horizontalAlign":null,"fontColor":null,"fillColor":"#fff","numberFormat":"currency_eur","numberPattern":"\"€\"#,##0.00"},"d1":{"bold":false,"italic":false,"underline":false,"horizontalAlign":null,"fontColor":null,"fillColor":"#fff","numberFormat":"percent","numberPattern":"0%"},"c2":{"C2":{"value":"€30.00","formula":"=A2+B2"}}}
- **uov_format_persist**: PASS — {"bold":true,"italic":false,"underline":false,"horizontalAlign":null,"fontColor":null,"fillColor":"#bbf7d0","numberFormat":"general","numberPattern":""}
- **split_toolbar**: PASS — toolbars=1
- **floating_vertical_space**: PASS — {"block":{"w":598,"h":382},"tbH":33,"hostH":294,"density":"full","surfaceH":328}
- **keyboard_cmd_ignore**: PASS — cmdIgnore=true
- **native_row_insert_api**: PASS — insertRows API callable; header context menus require manual QA
- **no_pro_packages**: PASS — No @univerjs-pro deps added in PR 3C
- **no_schema_migration**: PASS — Formatting stays in FocusSheetDocument.workbook
- **pr3d_not_started**: PASS — Sort/filter not implemented
- **mixed_selection_decision**: PASS — Active-cell style only (range mixed-style deferred; no fragile traversal)

## Mixed selection
Active-cell style only for toolbar pressed states. Range mixed-style deferred.

## Manual authenticated SectionPage QA
1. Add Sheet
2. Apply Bold / Italic / Underline / Align / Text / Fill
3. Number, €, $, £, %, decimal +/-
4. Format a formula cell — formula unchanged
5. Undo / Redo formatting
6. Real clipboard paste values
7. Row/col header: resize, right-click insert/delete
8. Fullscreen / Split left / Split right / Floating
9. Refresh — formatting survives
