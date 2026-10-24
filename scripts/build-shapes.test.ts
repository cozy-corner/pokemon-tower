import { describe, expect, it } from "vitest";
import type { OutlineResult } from "../src/geometry/types";
import {
	buildShapes,
	flagReasons,
	isValidPiece,
	roundResult,
} from "./build-shapes";
import type { Mask } from "./outline";

const result = (stats: Partial<OutlineResult["stats"]>): OutlineResult => ({
	polygons: [],
	stats: { components: 1, fillOverHull: 0.8, thin: false, ...stats },
});

describe("flagReasons", () => {
	it("returns nothing for a healthy sprite", () => {
		expect(flagReasons(result({}))).toEqual([]);
	});

	it("flags multiple islands from 2 components", () => {
		expect(flagReasons(result({ components: 2 }))).toEqual(["multi-island"]);
	});

	it("flags low fill only below 0.45", () => {
		expect(flagReasons(result({ fillOverHull: 0.44 }))).toEqual(["low-fill"]);
		expect(flagReasons(result({ fillOverHull: 0.45 }))).toEqual([]);
	});

	it("flags thin and lists every reason in a fixed order", () => {
		expect(
			flagReasons(result({ components: 3, fillOverHull: 0.1, thin: true })),
		).toEqual(["multi-island", "low-fill", "thin"]);
	});
});

describe("roundResult", () => {
	it("rounds coordinates to 4 decimals and keeps stats", () => {
		const r: OutlineResult = {
			polygons: [[{ x: 0.123456, y: -0.03125 }]],
			stats: { components: 1, fillOverHull: 0.5, thin: false },
		};
		expect(roundResult(r).polygons).toEqual([[{ x: 0.1235, y: -0.0313 }]]);
		expect(roundResult(r).stats).toEqual(r.stats);
	});
});

describe("buildShapes", () => {
	const square = (n: number): Mask => ({
		alpha: new Uint8Array(n * n).fill(255),
		w: n,
		h: n,
	});

	it("computes loadable names, skips null and throwing loaders, and flags", () => {
		const masks: Record<string, Mask | null> = {
			big: square(40),
			missing: null,
		};
		const { shapes, skipped, flagged } = buildShapes(
			["big", "missing", "broken"],
			(name) => {
				if (name === "broken") throw new Error("bad png");
				return masks[name];
			},
		);
		expect(Object.keys(shapes)).toEqual(["big"]);
		expect(shapes.big.polygons).toHaveLength(1);
		expect(skipped).toEqual(["missing", "broken"]);
		expect(flagged).toEqual({});
	});

	it("flags an empty mask as low-fill", () => {
		const empty: Mask = { alpha: new Uint8Array(16), w: 4, h: 4 };
		const { flagged } = buildShapes(["ghost"], () => empty);
		expect(flagged).toEqual({ ghost: ["low-fill"] });
	});

	it("reports names whose rounded pieces are no longer valid", () => {
		const { invalid } = buildShapes(["big"], () => square(40));
		expect(invalid).toEqual([]);
	});
});

describe("isValidPiece", () => {
	const tri = [
		{ x: 0, y: 0 },
		{ x: 1, y: 0 },
		{ x: 0, y: 1 },
	];

	it("accepts a convex positive-area piece", () => {
		expect(isValidPiece(tri)).toBe(true);
	});

	it("rejects a reflex vertex, reversed winding and too many vertices", () => {
		expect(
			isValidPiece([
				{ x: 0, y: 0 },
				{ x: 2, y: 0 },
				{ x: 1, y: 0.5 },
				{ x: 2, y: 2 },
				{ x: 0, y: 2 },
			]),
		).toBe(false);
		expect(isValidPiece([...tri].reverse())).toBe(false);
		const ring = Array.from({ length: 13 }, (_, i) => ({
			x: Math.cos((i / 13) * 2 * Math.PI),
			y: Math.sin((i / 13) * 2 * Math.PI),
		}));
		expect(isValidPiece(ring)).toBe(false);
	});
});
