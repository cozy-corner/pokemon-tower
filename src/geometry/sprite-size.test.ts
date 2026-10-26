import { describe, expect, it } from "vitest";
import {
	MAX_HEIGHT_M,
	MAX_SPRITE_SIDE,
	MIN_HEIGHT_M,
	MIN_SPRITE_SIDE,
	spriteWorldSize,
} from "./sprite-size";

describe("spriteWorldSize", () => {
	it("gives the shortest Pokémon the minimum side and the tallest the maximum", () => {
		const small = spriteWorldSize(100, 50, MIN_HEIGHT_M);
		expect(small.w).toBeCloseTo(MIN_SPRITE_SIDE, 5);
		const big = spriteWorldSize(100, 50, MAX_HEIGHT_M);
		expect(big.w).toBeCloseTo(MAX_SPRITE_SIDE, 5);
	});

	it("ignores the SVG's own scale, so only the height decides the size", () => {
		const a = spriteWorldSize(100, 200, 1);
		const b = spriteWorldSize(1000, 2000, 1);
		expect(a.w).toBeCloseTo(b.w, 5);
		expect(a.h).toBeCloseTo(b.h, 5);
	});

	it("keeps the SVG's aspect ratio", () => {
		const s = spriteWorldSize(60, 75, 1);
		expect(s.w / s.h).toBeCloseTo(0.8, 5);
	});

	it("is logarithmic: each doubling of height adds the same amount", () => {
		const side = (m: number) => {
			const s = spriteWorldSize(100, 100, m);
			return Math.max(s.w, s.h);
		};
		expect(side(2) - side(1)).toBeCloseTo(side(4) - side(2), 5);
	});

	it("clamps heights outside the known range", () => {
		const low = spriteWorldSize(100, 100, MIN_HEIGHT_M / 10);
		const high = spriteWorldSize(100, 100, MAX_HEIGHT_M * 10);
		expect(low.w).toBeCloseTo(MIN_SPRITE_SIDE, 5);
		expect(high.w).toBeCloseTo(MAX_SPRITE_SIDE, 5);
	});
});
