// Corrects tape-measure readings for the fact that reference points and prop
// measurement points aren't actually coplanar, even though the rest of the
// app treats every "distance" as a flat 2D floor-plane distance.
//
// The physical setup (per the user, 2026-08-12): the 5 reference points are
// mounted on the wall at a fixed height above the floor. When measuring to a
// prop, the tape/DISTO is read some height above that prop's own top (its
// heightM), not at floor level. So a raw tape reading is really the 3D slant
// distance between (reference point at REFERENCE_POINT_HEIGHT_M) and (prop
// point at prop.heightM + tapeAboveObjectM) -- these two heights differ by a
// constant-per-prop amount, so treating the slant reading as if it were the
// horizontal distance systematically overstates it (pulling solved positions
// closer to the wall than they really are). This corrects for that via
// straightforward Pythagorean geometry.
//
// tapeAboveObjectM was originally a fixed 15cm estimate (holding the tape by
// hand near the object's top). Since the user mounted the DISTO on a monopod
// (2026-08-13), that height is set directly by the monopod and is precise
// enough to type in per session -- see the input in the measurement panel
// (js/ui/measurement.js), which reads/writes this value.
window.App = window.App || {};

App.heightCorrection = {
  REFERENCE_POINT_HEIGHT_M: 1.687,
  tapeAboveObjectM: 0.15,

  // Height above the floor where the tape is actually read for this prop.
  tapeHeight(prop) {
    return (prop && prop.heightM || 0) + this.tapeAboveObjectM;
  },

  // Vertical gap between a wall reference point and this prop's tape height.
  heightDelta(prop) {
    return this.REFERENCE_POINT_HEIGHT_M - this.tapeHeight(prop);
  },

  // Raw tape (3D slant) distance -> horizontal (floor-plane) distance, for
  // feeding into the existing 2D multilateration solve.
  toHorizontal(slantM, prop) {
    if (slantM == null || isNaN(slantM)) return slantM;
    const dh = this.heightDelta(prop);
    const sq = slantM * slantM - dh * dh;
    return sq > 0 ? Math.sqrt(sq) : 0;
  },

  // Horizontal (floor-plane) distance -> the slant distance a tape/DISTO
  // would actually read in real life, for cross-checking against a physical
  // measurement.
  toSlant(horizontalM, prop) {
    if (horizontalM == null || isNaN(horizontalM)) return horizontalM;
    const dh = this.heightDelta(prop);
    return Math.sqrt(horizontalM * horizontalM + dh * dh);
  }
};
