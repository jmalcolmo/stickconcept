// =============================================================
//  MATH / GEOMETRY HELPERS
// =============================================================

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Convert a per-60fps-frame multiplier into a dt-correct factor. */
export function damp(perFrame: number, dt: number): number {
  return Math.pow(perFrame, dt * 60);
}

/** Closest point on segment A->B to point P (used to collide circles with capsules). */
export function closestPointOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { x: number; y: number } {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  const t = len2 > 0 ? clamp(((px - ax) * abx + (py - ay) * aby) / len2, 0, 1) : 0;
  return { x: ax + t * abx, y: ay + t * aby };
}

export function hypot(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}
