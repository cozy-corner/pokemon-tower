import { Settings } from "planck";
import { describe, expect, it } from "vitest";
import {
	computeOutline,
	MAX_POLYGON_VERTICES,
	type Mask,
	MIN_ISLAND_PX,
	PIXELS_PER_METER,
	type Vec,
} from "./outline";

function blankMask(w: number, h: number): Mask {
	return { alpha: new Uint8Array(w * h), w, h };
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

function signedArea(poly: Vec[]): number {
	let s = 0;
	for (let i = 0; i < poly.length; i++) {
		const a = poly[i];
		const b = poly[(i + 1) % poly.length];
		s += a.x * b.y - b.x * a.y;
	}
	return s / 2;
}

function isStrictlyConvex(poly: Vec[]): boolean {
	let sign = 0;
	for (let i = 0; i < poly.length; i++) {
		const a = poly[i];
		const b = poly[(i + 1) % poly.length];
		const c = poly[(i + 2) % poly.length];
		const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
		if (Math.abs(cross) < 1e-12) return false;
		const s = Math.sign(cross);
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
		expect(signedArea(poly)).toBeGreaterThan(0);
	}
}

function totalArea(polygons: Vec[][]): number {
	return polygons.reduce((sum, p) => sum + signedArea(p), 0);
}

const PX2 = PIXELS_PER_METER * PIXELS_PER_METER;

describe("computeOutline", () => {
	it("keeps the vertex cap in sync with Planck", () => {
		expect(MAX_POLYGON_VERTICES).toBe(Settings.maxPolygonVertices);
	});

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
