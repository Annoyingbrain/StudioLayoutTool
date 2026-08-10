// Central app state store: a plain object plus a tiny pub/sub so UI modules can
// re-render when relevant parts of the setup change, without a framework.
window.App = window.App || {};

// The 5 points on a rectangular prop that can be individually measured against
// the 5 studio reference points: its center, and each of its 4 corners
// (indices match App.geometry.propCorners() / the on-canvas resize handles).
App.PROP_POINTS = [
  { key: 'center', label: 'Center' },
  { key: 'corner0', label: 'Corner 1' },
  { key: 'corner1', label: 'Corner 2' },
  { key: 'corner2', label: 'Corner 3' },
  { key: 'corner3', label: 'Corner 4' }
];

App.factories = {
  defaultReferencePoints() {
    // Pre-seeded along the back curved LED wall from the studio's baked mesh sketch
    // (js/studioSketch.js) -- placeholder positions until the real surveyed values
    // are measured and typed into the Reference Points panel.
    const suggested = window.App.studioSketch && window.App.studioSketch.suggestedReferencePoints;
    const defs = suggested && suggested.length === 5
      ? suggested
      : [
          { label: 'P1', x: 0, y: 0 },
          { label: 'P2', x: 10, y: 0 },
          { label: 'P3', x: 10, y: 8 },
          { label: 'P4', x: 0, y: 8 },
          { label: 'P5', x: 5, y: 4 }
        ];
    return defs.map(d => ({ id: App.makeId('rp'), label: d.label, x: d.x, y: d.y }));
  },

  PROP_COLORS: ['#4da6ff', '#7fd08c', '#e0b95a', '#c98bdb', '#ff8a65', '#5ac8fa'],

  newProp(x, y, colorIndex) {
    return {
      id: App.makeId('prop'),
      name: 'Prop',
      widthM: 1,
      depthM: 0.6,
      heightM: 1,
      x, y,
      rotationDeg: 0,
      color: App.factories.PROP_COLORS[(colorIndex || 0) % App.factories.PROP_COLORS.length],
      notes: '',
      positionSource: 'manual', // 'manual' | 'measured'
      measuredPoints: { center: null, corner0: null, corner1: null, corner2: null, corner3: null },
      lastSolve: null // { rotationDeg, pointCount, fitRms } from the last successful solve
    };
  },

  newSetup(name, referencePoints) {
    const now = new Date().toISOString();
    return {
      id: App.makeId('setup'),
      name: name || 'Untitled Setup',
      createdAt: now,
      updatedAt: now,
      notes: '',
      referencePoints: referencePoints || App.factories.defaultReferencePoints(),
      props: [],
      background: null,   // { imageDataUrl, pxWidth, pxHeight, pxPerMeter, originPx: {x,y} }
      frameGrab: null,    // { imageDataUrl, caption }
      view: { scale: 40, originX: 400, originY: 400 }
    };
  }
};

App.Store = (function () {
  let setup = App.factories.newSetup('Untitled Setup');
  let selectedPropId = null;
  let tool = 'select';
  const listeners = [];

  function emit() { listeners.forEach(fn => fn(setup)); }

  return {
    subscribe(fn) { listeners.push(fn); return () => listeners.splice(listeners.indexOf(fn), 1); },

    getSetup() { return setup; },
    setSetup(newSetup) { setup = newSetup; selectedPropId = null; emit(); },
    touch() { setup.updatedAt = new Date().toISOString(); emit(); },

    getSelectedPropId() { return selectedPropId; },
    selectProp(id) { selectedPropId = id; emit(); },
    getSelectedProp() { return setup.props.find(p => p.id === selectedPropId) || null; },

    getTool() { return tool; },
    setTool(t) { tool = t; emit(); },

    addProp(prop) { setup.props.push(prop); selectedPropId = prop.id; this.touch(); },
    removeProp(id) {
      setup.props = setup.props.filter(p => p.id !== id);
      if (selectedPropId === id) selectedPropId = null;
      this.touch();
    },
    updateProp(id, patch) {
      const p = setup.props.find(p => p.id === id);
      if (!p) return;
      Object.assign(p, patch);
      this.touch();
    },

    updateReferencePoint(id, patch) {
      const rp = setup.referencePoints.find(r => r.id === id);
      if (!rp) return;
      Object.assign(rp, patch);
      this.touch();
    },

    setBackground(bg) { setup.background = bg; this.touch(); },
    setFrameGrab(fg) { setup.frameGrab = fg; this.touch(); },
    setView(patch) { Object.assign(setup.view, patch); emit(); },

    updateMeasuredPoint(propId, pointKey, patch) {
      const p = setup.props.find(p => p.id === propId);
      if (!p) return;
      if (!p.measuredPoints[pointKey]) p.measuredPoints[pointKey] = { distances: [null, null, null, null, null], solved: null };
      Object.assign(p.measuredPoints[pointKey], patch);
      this.touch();
    },
    clearMeasuredPoint(propId, pointKey) {
      const p = setup.props.find(p => p.id === propId);
      if (!p) return;
      p.measuredPoints[pointKey] = null;
      this.touch();
    },

    // Recomputes the prop's x/y/rotationDeg from whichever of its 5 points have a
    // solved (multilaterated) world position. 1 solved point -> translate only
    // (keeps current rotation). 2+ -> least-squares rotation + translation fit.
    solvePropTransform(propId) {
      const p = setup.props.find(p => p.id === propId);
      if (!p) return null;
      const correspondences = [];
      App.PROP_POINTS.forEach(({ key }) => {
        const mp = p.measuredPoints[key];
        if (mp && mp.solved) {
          correspondences.push({ local: App.geometry.pointLocalOffset(p, key), world: { x: mp.solved.x, y: mp.solved.y } });
        }
      });
      const result = App.rigidFit.solve(correspondences, p.rotationDeg);
      if (!result) return null;
      p.x = Math.round(result.x * 1000) / 1000;
      p.y = Math.round(result.y * 1000) / 1000;
      p.rotationDeg = Math.round(result.rotationDeg * 10) / 10;
      p.positionSource = 'measured';
      p.lastSolve = result;
      this.touch();
      return result;
    }
  };
})();
