import { describe, expect, it } from "vitest";
import { polygonArea } from "../src/geometry/polygon";
import type { Vec } from "../src/geometry/types";
import {
	computeOutline,
	cross,
	MAX_POLYGON_VERTICES,
	type Mask,
	MIN_ISLAND_PX,
	THIN_THICKNESS_PX,
} from "./outline";

const PIXELS_PER_METER = 32;

function blankMask(w: number, h: number): Mask {
	return {
		alpha: new Uint8Array(w * h),
		w,
		h,
		metersPerPx: 1 / PIXELS_PER_METER,
	};
}

function fillRect(
	mask: Mask,
	x0: number,
	y0: number,
	rw: number,
	rh: number,
	alpha = 255,
): void {
	for (let y = y0; y < y0 + rh; y++) {
		for (let x = x0; x < x0 + rw; x++) {
			mask.alpha[y * mask.w + x] = alpha;
		}
	}
}

function isStrictlyConvex(poly: Vec[]): boolean {
	let sign = 0;
	for (let i = 0; i < poly.length; i++) {
		const turn = cross(
			poly[i],
			poly[(i + 1) % poly.length],
			poly[(i + 2) % poly.length],
		);
		if (Math.abs(turn) < 1e-12) return false;
		const s = Math.sign(turn);
		if (sign === 0) sign = s;
		else if (s !== sign) return false;
	}
	return true;
}

function expectValidPolygons(polygons: Vec[][]): void {
	for (const poly of polygons) {
		expect(poly.length).toBeGreaterThanOrEqual(3);
		expect(poly.length).toBeLessThanOrEqual(MAX_POLYGON_VERTICES);
		expect(isStrictlyConvex(poly)).toBe(true);
		expect(polygonArea(poly)).toBeGreaterThan(0);
	}
}

/** Assumes `poly` is convex with positive area, as computeOutline guarantees. */
function containsPoint(poly: Vec[], p: Vec): boolean {
	return poly.every((a, i) => {
		const b = poly[(i + 1) % poly.length];
		return cross(a, b, p) >= 0;
	});
}

function totalArea(polygons: Vec[][]): number {
	return polygons.reduce((sum, p) => sum + polygonArea(p), 0);
}

const PX2 = PIXELS_PER_METER * PIXELS_PER_METER;

describe("computeOutline", () => {
	it("turns a filled square into one quad centered on the image", () => {
		const mask = blankMask(16, 16);
		fillRect(mask, 4, 4, 8, 8);
		const { polygons, stats } = computeOutline(mask);
		expect(polygons).toHaveLength(1);
		expect(polygons[0]).toHaveLength(4);
		const h = 4 / PIXELS_PER_METER;
		for (const v of polygons[0]) {
			expect(Math.abs(v.x)).toBeCloseTo(h);
			expect(Math.abs(v.y)).toBeCloseTo(h);
		}
		expect(stats.components).toBe(1);
		expect(stats.fillOverHull).toBeCloseTo(1);
		expectValidPolygons(polygons);
	});

	it("uses +y down with the origin at the image center", () => {
		const mask = blankMask(32, 32);
		fillRect(mask, 16, 24, 8, 8);
		const [poly] = computeOutline(mask).polygons;
		const xs = poly.map((v) => v.x * PIXELS_PER_METER);
		const ys = poly.map((v) => v.y * PIXELS_PER_METER);
		expect(Math.min(...xs)).toBeCloseTo(0);
		expect(Math.max(...xs)).toBeCloseTo(8);
		expect(Math.min(...ys)).toBeCloseTo(8);
		expect(Math.max(...ys)).toBeCloseTo(16);
	});

	it("splits an L shape into convex pieces covering its area", () => {
		const mask = blankMask(32, 32);
		fillRect(mask, 4, 4, 8, 24);
		fillRect(mask, 12, 20, 16, 8);
		const { polygons, stats } = computeOutline(mask);
		expect(polygons.length).toBeGreaterThanOrEqual(2);
		expectValidPolygons(polygons);
		expect(totalArea(polygons) * PX2).toBeCloseTo(8 * 24 + 16 * 8);
		expect(stats.components).toBe(1);
		expect(stats.fillOverHull).toBeLessThan(1);
	});

	it("caps vertices per polygon on a round blob", () => {
		const mask = blankMask(80, 80);
		for (let y = 0; y < 80; y++) {
			for (let x = 0; x < 80; x++) {
				if ((x + 0.5 - 40) ** 2 + (y + 0.5 - 40) ** 2 <= 30 * 30) {
					mask.alpha[y * 80 + x] = 255;
				}
			}
		}
		const { polygons, stats } = computeOutline(mask);
		expect(polygons.length).toBeGreaterThanOrEqual(2);
		expectValidPolygons(polygons);
		const ratio = (totalArea(polygons) * PX2) / (Math.PI * 900);
		expect(ratio).toBeGreaterThan(0.95);
		expect(ratio).toBeLessThan(1.05);
		expect(stats.thin).toBe(false);
	});

	it("returns polygons for every island at least MIN_ISLAND_PX", () => {
		const mask = blankMask(32, 32);
		fillRect(mask, 2, 2, 5, 4);
		fillRect(mask, 20, 20, 8, 8);
		const { polygons, stats } = computeOutline(mask);
		expect(5 * 4).toBeGreaterThanOrEqual(MIN_ISLAND_PX);
		expect(stats.components).toBe(2);
		expectValidPolygons(polygons);
		expect(totalArea(polygons) * PX2).toBeCloseTo(5 * 4 + 8 * 8);
		const left = polygons.filter((p) => p.every((v) => v.x < 0));
		const right = polygons.filter((p) => p.every((v) => v.x > 0));
		expect(left.length).toBeGreaterThan(0);
		expect(right.length).toBeGreaterThan(0);
	});

	it("drops islands smaller than MIN_ISLAND_PX", () => {
		const mask = blankMask(32, 32);
		fillRect(mask, 2, 2, 19, 1);
		fillRect(mask, 20, 20, 8, 8);
		const { polygons, stats } = computeOutline(mask);
		expect(19).toBeLessThan(MIN_ISLAND_PX);
		expect(stats.components).toBe(1);
		expect(polygons.every((p) => p.every((v) => v.x > 0 && v.y > 0))).toBe(
			true,
		);
		expect(totalArea(polygons) * PX2).toBeCloseTo(64);
	});

	it("treats islands touching only at a corner as one island", () => {
		const mask = blankMask(32, 32);
		fillRect(mask, 4, 4, 6, 6);
		fillRect(mask, 10, 10, 6, 6);
		const { polygons, stats } = computeOutline(mask);
		expect(stats.components).toBe(1);
		expectValidPolygons(polygons);
		expect(totalArea(polygons) * PX2).toBeGreaterThanOrEqual(72);
	});

	it("ignores holes and keeps only the outer boundary", () => {
		const mask = blankMask(32, 32);
		fillRect(mask, 4, 4, 20, 20);
		fillRect(mask, 9, 9, 10, 10, 0);
		const { polygons, stats } = computeOutline(mask);
		expect(polygons).toHaveLength(1);
		expect(polygons[0]).toHaveLength(4);
		expect(totalArea(polygons) * PX2).toBeCloseTo(400);
		expect(stats.components).toBe(1);
		expect(stats.fillOverHull).toBeCloseTo(300 / 400);
	});

	it("ignores pixels with alpha 127 or less", () => {
		const mask = blankMask(32, 32);
		fillRect(mask, 2, 2, 8, 8, 127);
		fillRect(mask, 20, 20, 8, 8, 128);
		const { polygons, stats } = computeOutline(mask);
		expect(stats.components).toBe(1);
		expect(totalArea(polygons) * PX2).toBeCloseTo(64);
		expect(polygons[0].every((v) => v.x > 0)).toBe(true);
	});

	it("flags thin shapes by mean thickness", () => {
		const bar = blankMask(64, 64);
		fillRect(bar, 2, 30, 60, 2);
		expect(computeOutline(bar).stats.thin).toBe(true);
		const block = blankMask(64, 64);
		fillRect(block, 10, 10, 30, 30);
		expect(computeOutline(block).stats.thin).toBe(false);
	});

	it("puts the thin threshold at mean thickness THIN_THICKNESS_PX", () => {
		expect(THIN_THICKNESS_PX).toBe(8);
		// A 9×L bar has t = 2A/P = 9L / (9 + L).
		const under = blankMask(80, 20);
		fillRect(under, 2, 5, 71, 9); // t = 639/80 = 7.9875
		expect(computeOutline(under).stats.thin).toBe(true);
		const at = blankMask(80, 20);
		fillRect(at, 2, 5, 72, 9); // t = 648/81 = 8
		expect(computeOutline(at).stats.thin).toBe(false);
	});

	it("counts an island inside another island's hole as its own component", () => {
		const mask = blankMask(40, 40);
		fillRect(mask, 2, 2, 30, 30);
		fillRect(mask, 7, 7, 20, 20, 0);
		fillRect(mask, 11, 11, 12, 12);
		const { polygons, stats } = computeOutline(mask);
		expect(stats.components).toBe(2);
		expectValidPolygons(polygons);
		expect(totalArea(polygons) * PX2).toBeCloseTo(900);
	});

	it("counts separate diagonal lines as separate components", () => {
		const w = 40;
		const mask = blankMask(w, 40);
		const pixels: Vec[] = Array.from({ length: 30 }, (_, i) => [
			{ x: i + 2, y: i + 2 },
			{ x: i + 5, y: i + 2 },
		]).flat();
		for (const p of pixels) mask.alpha[p.y * w + p.x] = 255;
		const { polygons, stats } = computeOutline(mask);
		expect(stats.components).toBe(2);
		expectValidPolygons(polygons);
		const uncovered = pixels.filter((p) => {
			const c = {
				x: (p.x + 0.5 - w / 2) / PIXELS_PER_METER,
				y: (p.y + 0.5 - 20) / PIXELS_PER_METER,
			};
			return !polygons.some((poly) => containsPoint(poly, c));
		});
		// Simplification clips the outer corner of the first line's top pixel.
		expect(uncovered).toEqual([{ x: 2, y: 2 }]);
		// Known, accepted approximation: cascading saddle fills bridge the gap
		// between the lines, so the outline covers 143 px for a 60 px mask.
		expect(totalArea(polygons) * PX2).toBeCloseTo(143);
	});

	it("returns an empty result when nothing is kept", () => {
		const empty = {
			polygons: [],
			stats: { components: 0, fillOverHull: 0, thin: false },
		};
		expect(computeOutline(blankMask(16, 16))).toEqual(empty);
		const speck = blankMask(16, 16);
		fillRect(speck, 3, 3, 2, 2);
		expect(computeOutline(speck)).toEqual(empty);
	});
});
