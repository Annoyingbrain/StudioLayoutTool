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

  // A scene is one prop layout within a setup -- e.g. different camera
  // angles or shots filmed in the same physical studio configuration.
  // Reference points live on the setup itself (shared across all its
  // scenes); props, frame grab, and view are per-scene.
  newScene(name) {
    const now = new Date().toISOString();
    return {
      id: App.makeId('scene'),
      name: name || 'Scene 1',
      createdAt: now,
      updatedAt: now,
      props: [],
      frameGrab: null,    // { imageDataUrl, caption }
      view: { scale: 40, originX: 400, originY: 400 }
    };
  },

  newSetup(name, referencePoints) {
    const now = new Date().toISOString();
    const scene = App.factories.newScene('Scene 1');
    return {
      id: App.makeId('setup'),
      name: name || 'Untitled Setup',
      createdAt: now,
      updatedAt: now,
      notes: '',
      referencePoints: referencePoints || App.factories.defaultReferencePoints(),
      scenes: [scene],
      activeSceneId: scene.id
    };
  }
};

App.Store = (function () {
  let setup = App.factories.newSetup('Untitled Setup');
  let selectedPropId = null;
  let tool = 'select';
  const listeners = [];

  function emit() { listeners.forEach(fn => fn(setup)); }
  function currentScene() { return setup.scenes.find(s => s.id === setup.activeSceneId) || setup.scenes[0]; }

  return {
    subscribe(fn) { listeners.push(fn); return () => listeners.splice(listeners.indexOf(fn), 1); },

    getSetup() { return setup; },
    setSetup(newSetup) { setup = newSetup; selectedPropId = null; emit(); },
    touch() { setup.updatedAt = new Date().toISOString(); emit(); },

    getScene() { return currentScene(); },
    getScenes() { return setup.scenes; },
    getActiveSceneId() { return setup.activeSceneId; },
    selectScene(id) {
      if (!setup.scenes.some(s => s.id === id) || id === setup.activeSceneId) return;
      setup.activeSceneId = id;
      selectedPropId = null;
      emit();
    },
    addScene(name) {
      const scene = App.factories.newScene(name);
      setup.scenes.push(scene);
      setup.activeSceneId = scene.id;
      selectedPropId = null;
      this.touch();
      return scene;
    },
    renameScene(id, name) {
      const s = setup.scenes.find(s => s.id === id);
      if (!s) return;
      s.name = name;
      this.touch();
    },
    removeScene(id) {
      if (setup.scenes.length <= 1) return; // a setup always keeps at least 1 scene
      const idx = setup.scenes.findIndex(s => s.id === id);
      if (idx === -1) return;
      setup.scenes.splice(idx, 1);
      if (setup.activeSceneId === id) setup.activeSceneId = setup.scenes[Math.max(0, idx - 1)].id;
      selectedPropId = null;
      this.touch();
    },

    getSelectedPropId() { return selectedPropId; },
    selectProp(id) { selectedPropId = id; emit(); },
    getSelectedProp() { return currentScene().props.find(p => p.id === selectedPropId) || null; },

    getTool() { return tool; },
    setTool(t) { tool = t; emit(); },

    addProp(prop) { currentScene().props.push(prop); selectedPropId = prop.id; this.touch(); },
    removeProp(id) {
      const scene = currentScene();
      scene.props = scene.props.filter(p => p.id !== id);
      if (selectedPropId === id) selectedPropId = null;
      this.touch();
    },
    updateProp(id, patch) {
      const p = currentScene().props.find(p => p.id === id);
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

    setFrameGrab(fg) { currentScene().frameGrab = fg; this.touch(); },
    setView(patch) { Object.assign(currentScene().view, patch); emit(); },

    updateMeasuredPoint(propId, pointKey, patch) {
      const p = currentScene().props.find(p => p.id === propId);
      if (!p) return;
      if (!p.measuredPoints[pointKey]) p.measuredPoints[pointKey] = { distances: [null, null, null, null, null], solved: null };
      Object.assign(p.measuredPoints[pointKey], patch);
      this.touch();
    },
    clearMeasuredPoint(propId, pointKey) {
      const p = currentScene().props.find(p => p.id === propId);
      if (!p) return;
      p.measuredPoints[pointKey] = null;
      this.touch();
    },

    // Recomputes the prop's x/y/rotationDeg from whichever of its 5 points have a
    // solved (multilaterated) world position. 1 solved point -> translate only
    // (keeps current rotation). 2+ -> least-squares rotation + translation fit.
    solvePropTransform(propId) {
      const p = currentScene().props.find(p => p.id === propId);
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
