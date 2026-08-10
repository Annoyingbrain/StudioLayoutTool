// CSV export for import into Disguise (d3): one row per prop, position in meters,
// Z assumed 0 for a floor-plane 2D layout.
window.App = window.App || {};

App.csvExport = {
  HEADER: ['Name', 'PosX', 'PosY', 'PosZ', 'RotZ', 'WidthM', 'DepthM', 'HeightM', 'Notes'],

  csvEscape(v) {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  },

  buildCsv(setup) {
    const rows = [this.HEADER.join(',')];
    setup.props.forEach(p => {
      rows.push([
        p.name, p.x, p.y, 0, p.rotationDeg,
        p.widthM, p.depthM, p.heightM, p.notes
      ].map(v => this.csvEscape(v)).join(','));
    });
    return rows.join('\r\n') + '\r\n';
  },

  exportSetup(setup) {
    if (!setup.props.length) { App.toast('No props to export yet.', true); return; }
    const csv = this.buildCsv(setup);
    const blob = new Blob([csv], { type: 'text/csv' });
    const safeName = (setup.name || 'setup').replace(/[^a-z0-9_\-]+/gi, '_');
    App.dom.downloadBlob(`${safeName}.csv`, blob);
  }
};
