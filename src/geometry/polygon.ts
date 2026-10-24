import type { Vec } from "./types";

/**
 * Signed area: positive for counter-clockwise order in y-up axes (clockwise
 * on a y-down screen), negative for the reverse, 0 for fewer than 3 points.
 * Callers such as scripts/outline.ts rely on the sign, e.g. `> 0` to keep
 * only polygons wound the expected way.
 */
export function polygonArea(poly: Vec[]): number {
	const twice = poly.reduce((s, a, i) => {
		const b = poly[(i + 1) % poly.length];
		return s + a.x * b.y - b.x * a.y;
	}, 0);
	return twice / 2;
}
