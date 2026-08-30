# Zoom hit-test isolation (PR 3A.1)

## Diagnosis

The original A1→A2 at zoom 0.7 was Playwright `locator.click({ position })` using **visual** bounding-box pixels. At `scale(0.7)` that maps layoutY ≈ 36/0.7 ≈ 51.4 → row 2. Native mouse events produce `offsetX/Y` in untransformed canvas CSS pixels (`offsetΔ = 0`). Univer `InputManager._onPointerDown` → `_getObjectAtPos(evt.offsetX, evt.offsetY)` → `Scene.pick` does not need a CSS-scale conversion.

A12 misses at zoom > 1 are overflow-clip (click lands outside the clipped canvas), not a scale mapping error.

DPR=1 DPR2=2 row0=24 col0=88

## Visual-mapped mouse clicks (C translate+scale, origin 0 0)

- zoom 1: 6/6
- zoom 0.85: 6/6
- zoom 0.7: 6/6
- zoom 0.5: 6/6
- zoom 1.15: 5/6
- zoom 1.3: 5/6
- zoom 1.5: 5/6

translateScale z=1 A1→A1 PASS offsetΔ=(0.0,0.0)
translateScale z=1 C1→C1 PASS offsetΔ=(0.0,0.0)
translateScale z=1 A5→A5 PASS offsetΔ=(0.0,0.0)
translateScale z=1 C5→C5 PASS offsetΔ=(0.0,0.0)
translateScale z=1 A12→A12 PASS offsetΔ=(0.0,0.0)
translateScale z=1 G1→G1 PASS offsetΔ=(0.0,0.0)
translateScale z=0.85 A1→A1 PASS offsetΔ=(0.0,0.0)
translateScale z=0.85 C1→C1 PASS offsetΔ=(0.0,0.0)
translateScale z=0.85 A5→A5 PASS offsetΔ=(0.0,0.0)
translateScale z=0.85 C5→C5 PASS offsetΔ=(0.0,0.0)
translateScale z=0.85 A12→A12 PASS offsetΔ=(0.0,-0.0)
translateScale z=0.85 G1→G1 PASS offsetΔ=(0.0,0.0)
translateScale z=0.7 A1→A1 PASS offsetΔ=(0.0,0.0)
translateScale z=0.7 C1→C1 PASS offsetΔ=(0.0,0.0)
translateScale z=0.7 A5→A5 PASS offsetΔ=(0.0,-0.0)
translateScale z=0.7 C5→C5 PASS offsetΔ=(0.0,-0.0)
translateScale z=0.7 A12→A12 PASS offsetΔ=(0.0,-0.0)
translateScale z=0.7 G1→G1 PASS offsetΔ=(0.0,0.0)
translateScale z=0.5 A1→A1 PASS offsetΔ=(0.0,0.0)
translateScale z=0.5 C1→C1 PASS offsetΔ=(0.0,0.0)
translateScale z=0.5 A5→A5 PASS offsetΔ=(0.0,0.0)
translateScale z=0.5 C5→C5 PASS offsetΔ=(0.0,0.0)
translateScale z=0.5 A12→A12 PASS offsetΔ=(0.0,0.0)
translateScale z=0.5 G1→G1 PASS offsetΔ=(0.0,0.0)
translateScale z=1.15 A1→A1 PASS offsetΔ=(0.0,-0.0)
translateScale z=1.15 C1→C1 PASS offsetΔ=(0.0,-0.0)
translateScale z=1.15 A5→A5 PASS offsetΔ=(0.0,-0.0)
translateScale z=1.15 C5→C5 PASS offsetΔ=(0.0,-0.0)
translateScale z=1.15 A12→C5 FAIL offsetΔ=(101.6,449.5)
translateScale z=1.15 G1→G1 PASS offsetΔ=(0.0,-0.0)
translateScale z=1.3 A1→A1 PASS offsetΔ=(0.0,0.0)
translateScale z=1.3 C1→C1 PASS offsetΔ=(-0.0,0.0)
translateScale z=1.3 A5→A5 PASS offsetΔ=(0.0,0.0)
translateScale z=1.3 C5→C5 PASS offsetΔ=(-0.0,0.0)
translateScale z=1.3 A12→C5 FAIL offsetΔ=(121.3,509.1)
translateScale z=1.3 G1→G1 PASS offsetΔ=(0.0,0.0)
translateScale z=1.5 A1→A1 PASS offsetΔ=(0.0,0.0)
translateScale z=1.5 C1→C1 PASS offsetΔ=(0.0,0.0)
translateScale z=1.5 A5→A5 PASS offsetΔ=(0.0,0.0)
translateScale z=1.5 C5→C5 PASS offsetΔ=(0.0,0.0)
translateScale z=1.5 A12→C5 FAIL offsetΔ=(147.5,588.5)
translateScale z=1.5 G1→G1 PASS offsetΔ=(0.0,0.0)

## Playwright bbox-relative click at 0.7 A1

actual `A2` offset=(128.55715942382812, 51.414306640625) layoutFromVisual={"x":128.5571569492524,"y":51.414318554450475}

## Resize / remount / hostSize

- translateScale 0.7 before resize: A1 (PASS)
- after engine.resize(): A1 (PASS)
- scaleOnly 0.7 no extra resize: A1 (PASS)
- scaleOnly after resize: A1 (PASS)
- hostSize 0.7 A1: A1 (PASS)
- remount at 0.7 A1: A1 (PASS)

## Cases A–E (A1, C5, A12, G1) at 1.0 and 0.7

none z=1 A1→A1 PASS offsetΔ=(0.0,0.0)
none z=1 C5→C5 PASS offsetΔ=(0.0,0.0)
none z=1 A12→C5 FAIL offsetΔ=(52.0,-281.6)
none z=1 G1→G1 PASS offsetΔ=(0.0,0.0)
none z=0.7 A1→A1 PASS offsetΔ=(0.0,0.0)
none z=0.7 C5→C5 PASS offsetΔ=(0.0,0.0)
none z=0.7 A12→C5 FAIL offsetΔ=(52.0,-281.6)
none z=0.7 G1→G1 PASS offsetΔ=(0.0,0.0)
scaleOnly z=1 A1→A1 PASS offsetΔ=(0.0,0.0)
scaleOnly z=1 C5→C5 PASS offsetΔ=(0.0,0.0)
scaleOnly z=1 A12→C5 FAIL offsetΔ=(52.0,-281.6)
scaleOnly z=1 G1→G1 PASS offsetΔ=(0.0,0.0)
scaleOnly z=0.7 A1→A1 PASS offsetΔ=(0.0,0.0)
scaleOnly z=0.7 C5→C5 PASS offsetΔ=(0.0,-0.0)
scaleOnly z=0.7 A12→A12 PASS offsetΔ=(0.0,-0.0)
scaleOnly z=0.7 G1→G1 PASS offsetΔ=(0.0,0.0)
translateScale z=1 A1→A1 PASS offsetΔ=(0.0,0.0)
translateScale z=1 C5→C5 PASS offsetΔ=(0.0,0.0)
translateScale z=1 A12→A12 PASS offsetΔ=(0.0,0.0)
translateScale z=1 G1→G1 PASS offsetΔ=(0.0,0.0)
translateScale z=0.7 A1→A1 PASS offsetΔ=(0.0,0.0)
translateScale z=0.7 C5→C5 PASS offsetΔ=(0.0,-0.0)
translateScale z=0.7 A12→A12 PASS offsetΔ=(0.0,-0.0)
translateScale z=0.7 G1→G1 PASS offsetΔ=(0.0,0.0)
originCenter z=1 A1→A1 PASS offsetΔ=(0.0,0.0)
originCenter z=1 C5→C5 PASS offsetΔ=(0.0,0.0)
originCenter z=1 A12→C5 FAIL offsetΔ=(52.0,-281.6)
originCenter z=1 G1→G1 PASS offsetΔ=(0.0,0.0)
originCenter z=0.7 A1→A1 PASS offsetΔ=(0.0,-0.0)
originCenter z=0.7 C5→C5 PASS offsetΔ=(0.0,-0.0)
originCenter z=0.7 A12→A12 PASS offsetΔ=(0.0,0.0)
originCenter z=0.7 G1→G1 PASS offsetΔ=(0.0,-0.0)
hostSize z=1 A1→A1 PASS offsetΔ=(0.0,0.0)
hostSize z=1 C5→C5 PASS offsetΔ=(0.0,0.0)
hostSize z=1 A12→C5 FAIL offsetΔ=(52.0,-281.6)
hostSize z=1 G1→G1 PASS offsetΔ=(0.0,0.0)
hostSize z=0.7 A1→A1 PASS offsetΔ=(0.0,0.0)
hostSize z=0.7 C5→C5 PASS offsetΔ=(0.0,0.0)
hostSize z=0.7 A12→C5 FAIL offsetΔ=(52.0,-281.6)
hostSize z=0.7 G1→C5 FAIL offsetΔ=(41.0,97.0)

## Drag A1→C5

- zoom 1.0 range=`A1` a1=`A1`
- zoom 0.7 range=`A1` a1=`A1`

## Type at 0.7 A1

{"A1":{"value":"zoom07","formula":""}}

## Scrollbar (right-edge click at 0.7)

{"offsetX":712,"offsetY":176.99996948242188,"targetId":"univer-sheet-main-canvas_fwb-1af347a6-8b10-40a1-95a6-9793d9f10444","canvasW":718,"nearRightEdge":true}

## Headers

{
  "1": {
    "colHeaderActual": "A1",
    "colHeaderRange": "A1:A100",
    "colPointerTarget": "univer-sheet-main-canvas_fwb-1af347a6-8b10-40a1-95a6-9793d9f10444",
    "rowHeaderActual": "A1",
    "rowHeaderRange": "A1:A100",
    "rowPointerTarget": "univer-sheet-main-canvas_fwb-1af347a6-8b10-40a1-95a6-9793d9f10444"
  },
  "0.7": {
    "colHeaderActual": "A1",
    "colHeaderRange": "A1:A100",
    "colPointerTarget": "univer-sheet-main-canvas_fwb-1af347a6-8b10-40a1-95a6-9793d9f10444",
    "rowHeaderActual": "A1",
    "rowHeaderRange": "A1:A100",
    "rowPointerTarget": "univer-sheet-main-canvas_fwb-1af347a6-8b10-40a1-95a6-9793d9f10444"
  },
  "1.3": {
    "colHeaderActual": "A1",
    "colHeaderRange": "A1:A100",
    "colPointerTarget": "univer-sheet-main-canvas_fwb-1af347a6-8b10-40a1-95a6-9793d9f10444",
    "rowHeaderActual": "A1",
    "rowHeaderRange": "A1:A100",
    "rowPointerTarget": "univer-sheet-main-canvas_fwb-1af347a6-8b10-40a1-95a6-9793d9f10444"
  }
}

## Real FreeformCanvas

- z1 A1: A1 (PASS) offsetΔ=(-0.0,-0.0)
- z0.7 A1: A1 (PASS) offsetΔ=(0.0,-0.0)
- z0.7 C5: C5 (PASS)
- z1.3 A1: A1 (PASS)
- move before={"x":160.29798889160156,"y":408.6319885253906,"w":937.404052734375,"h":624.9359130859375} after={"x":264.2637939453125,"y":475.9366455078125,"w":937.6348876953125,"h":625.1590576171875}
- resize after={"x":274.697998046875,"y":491.83197021484375,"w":937.404052734375,"h":624.9359741210938}
- A1 after move/resize: A1 (PASS)

## DPR 2

- z1 A1: A1 (PASS)
- z0.7 A1: A1 (PASS)
- z0.7 C5: C5 (PASS)
