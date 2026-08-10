# Studio Layout Tool

A 2D top-down layout editor for planning virtual production studio setups: place
rectangular props, position/rotate them from real-world tape-measure
distances taken on set, and export reports and a Disguise-ready CSV per scene.

No build step, no dependencies, no Node/npm required — it's plain HTML/CSS/JS.

## Running it

Browsers block ES module/file loading over `file://`, so serve the folder instead
of double-clicking `index.html`. You already have Python installed for
FocusScaleMaker, so from this folder:

```
python -m http.server 8000
```

Then open http://localhost:8000 in Chrome or Edge.

## Workflow

1. **Studio floor-plan sketch** — a fixed top-down wireframe (room shell +
   curved LED wall + LED floor) is always drawn on the canvas as a background
   reference. It's baked into `js/studioSketch.js`, generated once from the
   studio's `.obj` mesh export — there's no in-app upload/import step for it.
   See "Studio mesh" below if the source mesh ever changes.
2. **Reference Points** (right sidebar) — 5 points, pre-seeded along the back
   curved wall from the mesh sketch as placeholders. Once you measure their
   real surveyed X/Y (meters) in the studio, type the exact values in here and
   click "Save as studio default" so every new setup starts pre-filled with
   them.
3. **Background / Studio Reference** (left sidebar, optional) — import a
   top-down photo or render, click "Calibrate scale", click two points on it,
   and enter the real-world distance between them to scale it to the meter
   grid. This is layered on top of the fixed studio sketch.
4. **Add props** — every prop is a rectangle with a name, length and width
   (meters or cm) you type into the Prop Inspector — size is fixed by those
   values, not by dragging. Click "+ Add Prop" in the left sidebar, then
   click on the canvas to place one. Drag to move, drag the top handle to
   rotate, click a corner handle to select it as the point you're measuring.
5. **Measure a prop's real position and rotation** — select the prop, and in
   "Measure Selected Prop" pick which physical point you're measuring from:
   **Center** or one of its 4 **corners** (the pink ring on the canvas shows
   which one). Enter that point's tape-measure distance to each of the 5
   reference points and click "Compute This Point" — this solves that single
   point's world X/Y via least-squares multilateration (overdetermined by the
   5th reference point on purpose, so it reports a residual error as a
   sanity check on the measurements). Repeat for a second point (another
   corner, or the center) — the point list below shows which of the 5 are
   solved. Click **"Solve Object Position & Rotation"**: with 1 solved point
   the prop is translated only (rotation stays as-is); with 2+ solved points
   both rotation and position are fit (least-squares if more than 2), so the
   whole rectangle lands where it really is in the studio.
6. **Frame grab reference** (left sidebar) — attach a reference photo/frame grab
   and caption to the current setup; it shows up in the report.
7. **Save / Load setups** — "Save" stores the current setup in this browser
   (quick recall via the "Load setup…" dropdown). "Export .json" downloads a
   portable file — this is the authoritative save format; keep these per scene
   so nothing is lost if browser storage is cleared. "Import .json" reloads one.
8. **Export CSV (Disguise)** — one row per prop: `Name, PosX, PosY, PosZ, RotZ,
   WidthM, DepthM, HeightM, Notes`, in meters, Z fixed at 0 for this
   floor-plane layout. Adjust `js/csvExport.js` if Disguise's importer expects
   different column names/order once you test the import.
9. **Report / Print** — builds a printable report (layout snapshot, frame grab,
   reference points, props table) and opens the browser print dialog — choose
   "Save as PDF" as the destination.

## File format

Setup files are plain JSON (`js/state.js` → `App.factories.newSetup` shows the
shape). Images (background, frame grab) are embedded as base64 data URLs so a
single `.json` file is fully self-contained and portable between machines.

## Studio mesh

There's no in-app mesh upload — the studio's `.obj` files in `assets/mesh/`
(room shell, curved LED wall, LED floor) were used once, outside the app, to
generate `js/studioSketch.js`: each file's floor-level edges (or, for flat
panels, a convex hull) were projected top-down (X/Z, dropping the Y/up axis)
into plain line segments in real-world meters, and baked in as a fixed
reference layer that's always drawn on the canvas. It's not editable from the
UI by design.

The 5 default reference points in a new setup are also seeded from that same
pass — 5 points spaced along the curved wall's traced edge — purely as
placeholders until the real surveyed coordinates are measured and entered.

If the studio mesh changes (re-export, different geometry, a different
studio), the sketch needs to be regenerated from the new `.obj` file(s) the
same way — ask and it can be redone; it's a short one-off script, not a code
change.

## Project layout

```
index.html
css/style.css
js/
  utils/dom.js         DOM helpers, file reading, blob download
  utils/id.js           id generator
  utils/geometry.js     world<->screen transforms, rotation, hit-testing
  multilateration.js    least-squares position solve from 5 distances (per point)
  rigidFit.js             2D rotation+translation fit from 2+ solved points (Procrustes)
  studioSketch.js          baked top-down studio wireframe (generated, not hand-edited)
  state.js                 central store + data model factories
  persistence.js           localStorage save/load + JSON file export/import
  canvas.js                 2D renderer + pointer interaction (pan/zoom/drag/rotate/resize)
  csvExport.js              Disguise CSV export
  reportExport.js            printable report view
  ui/sidebar.js              prop list + inspector
  ui/refpoints.js            reference point panel
  ui/measurement.js          per-point distance entry, multilateration + rigid-fit UI
  ui/calibration.js          background image import + scale calibration
  ui/toolbar.js               top toolbar wiring
  main.js                     bootstrap
```
