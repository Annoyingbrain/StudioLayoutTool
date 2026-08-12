// CSV export for import into Disguise (d3): one row per prop, position in meters,
// Z assumed 0 for a floor-plane 2D layout.
window.App = window.App || {};

App.csvExport = {
  HEADER: ['Name', 'PosX', 'PosY', 'PosZ', 'RotZ', 'WidthM', 'DepthM', 'HeightM', 'Notes'],

  // Disguise's (0,0) -- where its tracked camera always starts -- is the studio
  // floor's near corner, not this app's internal world origin. That corner is
  // mesh vertex (11.969661, -0.102301) in assets/mesh/SA_SCREEN_floor_01.obj,
  // in this app's internal world frame (world x/y map 1:1 to that OBJ's x/z --
  // see js/studioSketch.js). Disguise's axes also run 180 degrees rotated from
  // this app's internal frame (the same rotation the canvas display already
  // applies for screen rendering -- see DISPLAY_ROTATION_DEG in
  // js/utils/geometry.js -- but here it has to be baked into the exported
  // numbers themselves, not just the on-screen transform).
  DISGUISE_ORIGIN: { x: 11.969661, y: -0.102301 },

  // Converts a prop's app-internal x/y/rotationDeg into Disguise's floor-plane
  // coordinate system: origin at DISGUISE_ORIGIN, axes negated (180 degree
  // rotation), so RotZ gets a matching +180 degree offset to stay physically
  // consistent with the rotated axes.
  toDisguiseSpace(prop) {
    const round3 = v => Math.round(v * 1000) / 1000;
    return {
      x: round3(this.DISGUISE_ORIGIN.x - prop.x),
      y: round3(this.DISGUISE_ORIGIN.y - prop.y),
      rotZ: Math.round((((prop.rotationDeg + 180) % 360 + 360) % 360) * 10) / 10
    };
  },

  csvEscape(v) {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  },

  buildCsv(scene) {
    const rows = [this.HEADER.join(',')];
    scene.props.forEach(p => {
      const d = this.toDisguiseSpace(p);
      rows.push([
        p.name, d.x, d.y, 0, d.rotZ,
        p.widthM, p.depthM, p.heightM, p.notes
      ].map(v => this.csvEscape(v)).join(','));
    });
    return rows.join('\r\n') + '\r\n';
  },

  // Exports the given scene's props (not the whole setup) -- each scene is
  // its own shot/layout and gets its own CSV.
  exportSetup(setup, scene) {
    if (!scene.props.length) { App.toast('No props to export yet.', true); return; }
    const csv = this.buildCsv(scene);
    const blob = new Blob([csv], { type: 'text/csv' });
    const safeName = `${setup.name || 'setup'}_Position_${scene.name || '1'}`.replace(/[^a-z0-9_\-]+/gi, '_');
    App.dom.downloadBlob(`${safeName}.csv`, blob);
  }
};
