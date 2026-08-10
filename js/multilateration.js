// Solve for an unknown 2D point (x,y) given N known reference points and measured
// (tape-measure) distances from the unknown point to each of them.
//
// With 5 reference points the system is overdetermined (2 unknowns, up to 4
// independent linear equations after linearization), which is intentional: it lets
// small measurement errors get averaged out via least squares, and the residual RMS
// tells you how self-consistent the real-world measurements were.
window.App = window.App || {};

function solve2x2(a, b, c, d, e, f) {
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) return null;
  return {
    x: (e * d - b * f) / det,
    y: (a * f - e * c) / det
  };
}

App.multilateration = {
  MIN_POINTS: 3,

  // points: [{x,y}, ...], distances: [number, ...] (same length, meters). Nulls/NaN are ignored.
  solve(points, distances) {
    const pts = [];
    for (let i = 0; i < points.length; i++) {
      const d = distances[i];
      if (d == null || isNaN(d) || d <= 0) continue;
      pts.push({ x: points[i].x, y: points[i].y, d });
    }

    if (pts.length < this.MIN_POINTS) {
      return { ok: false, reason: `Need at least ${this.MIN_POINTS} measured distances, got ${pts.length}.` };
    }

    const initial = this._linearEstimate(pts);
    if (!initial) {
      return { ok: false, reason: 'Reference points are collinear or too close together — cannot solve.' };
    }

    const refined = this._refine(pts, initial);
    const rms = this._rmsResidual(pts, refined);

    return { ok: true, x: refined.x, y: refined.y, rmsError: rms, usedPoints: pts.length };
  },

  _linearEstimate(pts) {
    const pivot = pts[pts.length - 1];
    const A = [], b = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i];
      A.push([2 * (pivot.x - p.x), 2 * (pivot.y - p.y)]);
      b.push(
        (p.d * p.d - pivot.d * pivot.d) +
        (pivot.x * pivot.x - p.x * p.x) +
        (pivot.y * pivot.y - p.y * p.y)
      );
    }
    // Normal equations: (A^T A) [x,y]^T = A^T b
    let ata00 = 0, ata01 = 0, ata11 = 0, atb0 = 0, atb1 = 0;
    for (let i = 0; i < A.length; i++) {
      const [a0, a1] = A[i];
      ata00 += a0 * a0;
      ata01 += a0 * a1;
      ata11 += a1 * a1;
      atb0 += a0 * b[i];
      atb1 += a1 * b[i];
    }
    return solve2x2(ata00, ata01, ata01, ata11, atb0, atb1);
  },

  // Gauss-Newton refinement against the true (nonlinear) distance equations.
  _refine(pts, initial) {
    let x = initial.x, y = initial.y;
    for (let iter = 0; iter < 12; iter++) {
      let jtj00 = 0, jtj01 = 0, jtj11 = 0, jtr0 = 0, jtr1 = 0;
      for (const p of pts) {
        const dx = x - p.x, dy = y - p.y;
        const dist = Math.hypot(dx, dy) || 1e-6;
        const jx = dx / dist, jy = dy / dist;
        const r = dist - p.d;
        jtj00 += jx * jx; jtj01 += jx * jy; jtj11 += jy * jy;
        jtr0 += jx * r; jtr1 += jy * r;
      }
      const delta = solve2x2(jtj00, jtj01, jtj01, jtj11, -jtr0, -jtr1);
      if (!delta) break;
      x += delta.x; y += delta.y;
      if (Math.hypot(delta.x, delta.y) < 1e-7) break;
    }
    return { x, y };
  },

  _rmsResidual(pts, estimate) {
    let sumSq = 0;
    for (const p of pts) {
      const dist = Math.hypot(estimate.x - p.x, estimate.y - p.y);
      const r = dist - p.d;
      sumSq += r * r;
    }
    return Math.sqrt(sumSq / pts.length);
  }
};
