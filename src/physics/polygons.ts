import { Polygon, type PolygonShape, Vec2 } from "planck";
import type { Vec } from "../geometry/types";

/**
 * Builds one Planck polygon per input polygon. Planck cuts polygons to
 * maxPolygonVertices, drops duplicate, collinear and non-hull points, and
 * swaps a degenerate result for a box, all silently. This throws instead
 * when a polygon's Planck vertices are not exactly its own points.
 */
export function toPlanckShapes(id: string, polygons: Vec[][]): PolygonShape[] {
	if (polygons.length === 0) throw new Error(`piece ${id} has no polygons`);
	return polygons.map((poly, i) => {
		const shape = new Polygon(poly.map((v) => new Vec2(v.x, v.y)));
		const kept = shape.m_vertices;
		if (
			kept.length !== poly.length ||
			!kept.every((k) => poly.some((v) => v.x === k.x && v.y === k.y))
		) {
			throw new Error(`piece ${id}: polygon ${i} would be altered by Planck`);
		}
		return shape;
	});
}
