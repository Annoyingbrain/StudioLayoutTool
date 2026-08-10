// Coordinate transforms + rotation/hit-testing helpers.
// World space = real studio meters (X right, Y "up" on the plan). Screen space = canvas pixels.
window.App = window.App || {};

const DEG2RAD = Math.PI / 180;

// Fixed display rotation: 180° so the curved back wall renders across the
// top of the canvas (arcing down over the room) instead of the bottom.
// Purely a view/rendering convention: world data (mesh, reference points,
// saved prop positions) is untouched, so this doesn't affect measurement math.
// (A ~0.5° rotational skew in the source mesh export -- the wall/floor not
// being quite axis-aligned -- is corrected in the data itself, in
// js/studioSketch.js, not here: a uniform rotation added to this shared
// screen transform would rotate the procedurally-drawn grid by the same
// amount, which cancels out and fixes nothing -- the grid and the mesh have
// to be corrected relative to EACH OTHER, not both spun together.)
const DISPLAY_ROTATION_DEG = 180;
const DISPLAY_COS = Math.cos(DISPLAY_ROTATION_DEG * DEG2RAD);
const DISPLAY_SIN = Math.sin(DISPLAY_ROTATION_DEG * DEG2RAD);

App.geometry = {
  worldToScreen(view, x, y) {
    const rx = x * DISPLAY_COS - y * DISPLAY_SIN;
    const ry = x * DISPLAY_SIN + y * DISPLAY_COS;
    return {
      x: view.originX + rx * view.scale,
      y: view.originY - ry * view.scale
    };
  },

  screenToWorld(view, sx, sy) {
    const rx = (sx - view.originX) / view.scale;
    const ry = (view.originY - sy) / view.scale;
    // Inverse of the display rotation (rotation matrices are orthogonal, so
    // the inverse is just the transpose -- rotate by -DISPLAY_ROTATION_DEG).
    return {
      x: rx * DISPLAY_COS + ry * DISPLAY_SIN,
      y: -rx * DISPLAY_SIN + ry * DISPLAY_COS
    };
  },

  rotatePoint(px, py, cx, cy, angleDeg) {
    const a = angleDeg * DEG2RAD;
    const cos = Math.cos(a), sin = Math.sin(a);
    const dx = px - cx, dy = py - cy;
    return {
      x: cx + dx * cos - dy * sin,
      y: cy + dx * sin + dy * cos
    };
  },

  // Local (unrotated, center-relative) offsets of a prop's 4 corners, in corner0..corner3 order.
  localCornerOffsets(prop) {
    const hw = prop.widthM / 2, hd = prop.depthM / 2;
    return [
      { x: -hw, y: -hd }, { x: hw, y: -hd }, { x: hw, y: hd }, { x: -hw, y: hd }
    ];
  },

  // World-space corners of a prop's rectangle (before screen projection), rotated about its center.
  propCorners(prop) {
    return this.localCornerOffsets(prop).map(p =>
      this.rotatePoint(prop.x + p.x, prop.y + p.y, prop.x, prop.y, prop.rotationDeg));
  },

  // Local (unrotated, center-relative) offset for a named measurement point: 'center' or 'corner0'..'corner3'.
  pointLocalOffset(prop, pointKey) {
    if (pointKey === 'center') return { x: 0, y: 0 };
    const idx = parseInt(pointKey.replace('corner', ''), 10);
    return this.localCornerOffsets(prop)[idx];
  },

  // Current world-space position of a named measurement point given the prop's present x/y/rotation.
  pointWorldPosition(prop, pointKey) {
    if (pointKey === 'center') return { x: prop.x, y: prop.y };
    const idx = parseInt(pointKey.replace('corner', ''), 10);
    return this.propCorners(prop)[idx];
  },

  // Is world point (px,py) inside prop's rotated rectangle?
  pointInProp(px, py, prop) {
    const inv = this.rotatePoint(px, py, prop.x, prop.y, -prop.rotationDeg);
    const dx = inv.x - prop.x, dy = inv.y - prop.y;
    return Math.abs(dx) <= prop.widthM / 2 && Math.abs(dy) <= prop.depthM / 2;
  },

  distance(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
  },

  // World-space position of the rotation handle (above the prop's top edge).
  rotationHandlePos(prop) {
    const handleOffsetM = prop.depthM / 2 + 0.5;
    return this.rotatePoint(prop.x, prop.y + handleOffsetM, prop.x, prop.y, prop.rotationDeg);
  }
};
