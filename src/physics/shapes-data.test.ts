import { Polygon, Settings, Vec2 } from "planck";
import { describe, expect, it } from "vitest";
import shapes from "../../public/shapes.json";
import type { OutlineResult, Vec } from "../geometry/types";

/**
 * Problems Planck would hide: it cuts polygons to maxPolygonVertices, drops
 * duplicate, collinear and non-hull points, and swaps a degenerate result
 * for a box, all silently. Returns one message per polygon it would alter.
 */
const problems = (name: string, polygons: Vec[][]): string[] => {
	if (polygons.length === 0) return [`${name}: no polygons`];
	return polygons.flatMap((poly, i) => {
		const where = `${name} polygon ${i}`;
		if (poly.length < 3 || poly.length > Settings.maxPolygonVertices) {
			return [`${where}: ${poly.length} vertices`];
		}
		// Built exactly as addPiece builds it.
		const kept = new Polygon(poly.map((v) => new Vec2(v.x, v.y))).m_vertices;
		const same =
			kept.length === poly.length &&
			kept.every((k) => poly.some((v) => v.x === k.x && v.y === k.y));
		return same ? [] : [`${where}: altered by Planck`];
	});
};

const regular = (n: number): Vec[] =>
	Array.from({ length: n }, (_, i) => ({
		x: Math.cos((i / n) * 2 * Math.PI),
		y: Math.sin((i / n) * 2 * Math.PI),
	}));
const square: Vec[] = [
	{ x: 0, y: 0 },
	{ x: 1, y: 0 },
	{ x: 1, y: 1 },
	{ x: 0, y: 1 },
];
const collinear3: Vec[] = [
	{ x: 0, y: 0 },
	{ x: 1, y: 0 },
	{ x: 2, y: 0 },
];

describe("the shape check itself", () => {
	it("accepts valid convex polygons", () => {
		expect(problems("ok", [square.slice(0, 3), square, regular(12)])).toEqual(
			[],
		);
	});

	it("flags each kind of polygon Planck would change", () => {
		expect(problems("a", [])).toEqual(["a: no polygons"]);
		expect(problems("b", [square.slice(0, 2)])).toEqual([
			"b polygon 0: 2 vertices",
		]);
		expect(problems("c", [regular(13)])).toEqual(["c polygon 0: 13 vertices"]);
		expect(problems("d", [square, collinear3])).toEqual([
			"d polygon 1: altered by Planck",
		]);
		// Planck swaps in a 4-vertex box here, so a count check alone passes it.
		expect(problems("e", [[...collinear3, { x: 3, y: 0 }]])).toEqual([
			"e polygon 0: altered by Planck",
		]);
		expect(problems("f", [[...square, { x: 1, y: 1 }]])).toEqual([
			"f polygon 0: altered by Planck",
		]);
	});
});

describe("public/shapes.json", () => {
	const all = Object.entries(shapes as Record<string, OutlineResult>);

	it("has every sprite", () => {
		expect(all).toHaveLength(1025);
	});

	it("only has polygons Planck keeps exactly as given", () => {
		expect(all.flatMap(([name, s]) => problems(name, s.polygons))).toEqual([]);
	});
});
