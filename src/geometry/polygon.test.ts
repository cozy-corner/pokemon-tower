import { describe, expect, it } from "vitest";
import { polygonArea } from "./polygon";
import type { Vec } from "./types";

const square: Vec[] = [
	{ x: 0, y: 0 },
	{ x: 1, y: 0 },
	{ x: 1, y: 1 },
	{ x: 0, y: 1 },
];

describe("polygonArea", () => {
	it("is +1 for the unit square counter-clockwise in y-up axes (clockwise on a y-down screen)", () => {
		expect(polygonArea(square)).toBe(1);
	});

	it("is -1 for the unit square in the opposite order", () => {
		expect(polygonArea([...square].reverse())).toBe(-1);
	});

	it("is +6 for a 3-4-5 right triangle in the same positive order", () => {
		const triangle = [
			{ x: 0, y: 0 },
			{ x: 3, y: 0 },
			{ x: 0, y: 4 },
		];
		expect(polygonArea(triangle)).toBe(6);
	});

	it("is 0 for fewer than 3 points", () => {
		expect(polygonArea([])).toBe(0);
		expect(polygonArea([{ x: 2, y: 3 }])).toBe(0);
		expect(
			polygonArea([
				{ x: 0, y: 0 },
				{ x: 1, y: 5 },
			]),
		).toBe(0);
	});

	it("does not change when the polygon is translated", () => {
		const moved = square.map((v) => ({ x: v.x + 5, y: v.y - 3 }));
		expect(polygonArea(moved)).toBe(1);
	});
});
