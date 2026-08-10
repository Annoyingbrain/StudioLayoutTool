// Printable scene report: canvas snapshot, frame grab, reference points and a
// props table with X/Y coordinates. Uses the browser's native print-to-PDF —
// no external PDF library needed, and it works fully offline.
window.App = window.App || {};

App.reportExport = {
  open(setup) {
    const dom = App.dom;
    const view = dom.qs('#report-view');
    dom.clear(view);

    const snapshot = App.canvas.getCanvasElement().toDataURL('image/png');
    const now = new Date();

    const propsRows = setup.props.map(p => `
      <tr>
        <td>${p.name}</td>
        <td>${p.x.toFixed(3)}</td>
        <td>${p.y.toFixed(3)}</td>
        <td>${p.rotationDeg.toFixed(1)}</td>
        <td>${p.widthM.toFixed(2)}</td>
        <td>${p.depthM.toFixed(2)}</td>
        <td>${p.heightM != null ? p.heightM.toFixed(2) : ''}</td>
        <td>${p.positionSource}${p.lastSolve ? ' (' + p.lastSolve.pointCount + 'pt' + (p.lastSolve.fitRms != null ? ', ±' + p.lastSolve.fitRms.toFixed(3) + 'm' : '') + ')' : ''}</td>
        <td>${p.notes || ''}</td>
      </tr>`).join('');

    const refRows = setup.referencePoints.map(rp => `
      <tr><td>${rp.label}</td><td>${rp.x.toFixed(3)}</td><td>${rp.y.toFixed(3)}</td></tr>`).join('');

    const images = [];
    images.push(`<figure><img src="${snapshot}"><figcaption>Top-down layout snapshot</figcaption></figure>`);
    if (setup.frameGrab) {
      images.push(`<figure><img src="${setup.frameGrab.imageDataUrl}"><figcaption>${setup.frameGrab.caption || 'Frame grab reference'}</figcaption></figure>`);
    }

    view.innerHTML = `
      <div class="report-page">
        <button class="report-close">Close</button>
        <button class="report-print">Print / Save as PDF</button>
        <h1>${setup.name}</h1>
        <div class="report-meta">
          Generated ${now.toLocaleString()} &middot; Setup last updated ${new Date(setup.updatedAt).toLocaleString()}
          ${setup.notes ? '<br>' + setup.notes : ''}
        </div>

        <h2>Layout</h2>
        <div class="report-images">${images.join('')}</div>

        <h2>Reference Points</h2>
        <table>
          <thead><tr><th>Point</th><th>X (m)</th><th>Y (m)</th></tr></thead>
          <tbody>${refRows}</tbody>
        </table>

        <h2>Props</h2>
        <table>
          <thead>
            <tr><th>Name</th><th>X (m)</th><th>Y (m)</th><th>Rot (deg)</th>
                <th>L (m)</th><th>W (m)</th><th>H (m)</th><th>Position</th><th>Notes</th></tr>
          </thead>
          <tbody>${propsRows}</tbody>
        </table>
      </div>`;

    view.classList.remove('hidden');
    view.querySelector('.report-close').addEventListener('click', () => view.classList.add('hidden'));
    view.querySelector('.report-print').addEventListener('click', () => window.print());
  }
};
