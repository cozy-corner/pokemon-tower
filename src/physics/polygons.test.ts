import { describe, expect, it } from "vitest";
import type { Vec } from "../geometry/types";
import { toPlanckShapes } from "./polygons";

const regular = (n: number): Vec[] =>
	Array.from({ length: n }, (_, i) => ({
		x: Math.cos((i / n) * 2 * Math.PI),
		y: Math.sin((i / n) * 2 * Math.PI),
	}));

const triangle: Vec[] = [
	{ x: 0, y: 0 },
	{ x: 1, y: 0 },
	{ x: 0, y: 1 },
];
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

const altered = (id: string, i: number) =>
	`piece ${id}: polygon ${i} would be altered by Planck`;

describe("toPlanckShapes", () => {
	it("rejects an empty polygon list", () => {
		expect(() => toPlanckShapes("p", [])).toThrow("piece p has no polygons");
	});

	it("rejects a 2-vertex polygon", () => {
		expect(() => toPlanckShapes("p", [triangle.slice(0, 2)])).toThrow(
			altered("p", 0),
		);
	});

	it("rejects a 13-vertex polygon, which Planck would cut to 12", () => {
		expect(() => toPlanckShapes("p", [regular(13)])).toThrow(altered("p", 0));
	});

	it("rejects 3 collinear points", () => {
		expect(() => toPlanckShapes("p", [collinear3])).toThrow(altered("p", 0));
	});

	// Planck swaps in a 4-vertex box, so a count check alone would pass it.
	it("rejects 4 collinear points", () => {
		const collinear4 = [...collinear3, { x: 3, y: 0 }];
		expect(() => toPlanckShapes("p", [collinear4])).toThrow(altered("p", 0));
	});

	it("rejects a duplicated vertex", () => {
		expect(() => toPlanckShapes("p", [[...square, { x: 1, y: 1 }]])).toThrow(
			altered("p", 0),
		);
	});

	it("names the piece and the index of the bad polygon", () => {
		expect(() => toPlanckShapes("pikachu", [square, collinear3])).toThrow(
			altered("pikachu", 1),
		);
	});

	it("keeps every vertex of valid convex polygons", () => {
		const shapes = toPlanckShapes("p", [triangle, square, regular(12)]);
		expect(shapes.map((s) => s.m_vertices.length)).toEqual([3, 4, 12]);
	});
});
