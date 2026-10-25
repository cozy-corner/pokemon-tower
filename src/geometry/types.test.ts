import { describe, expect, it } from "vitest";
import {
	MAX_SPRITE_SIDE_UNITS,
	MIN_SPRITE_SIDE_UNITS,
	SVG_UNITS_PER_METER,
	spriteWorldSize,
} from "./types";

describe("spriteWorldSize", () => {
	it("keeps a mid-sized sprite as drawn", () => {
		const s = spriteWorldSize(340, 170);
		expect(s.w).toBeCloseTo(2, 5);
		expect(s.h).toBeCloseTo(1, 5);
	});

	it("scales a huge sprite down to the maximum side", () => {
		const s = spriteWorldSize(2400, 1200);
		expect(s.w).toBeCloseTo(MAX_SPRITE_SIDE_UNITS / SVG_UNITS_PER_METER, 5);
		expect(s.h / s.w).toBeCloseTo(0.5, 5);
	});

	it("scales a tiny sprite up to the minimum side", () => {
		const s = spriteWorldSize(60, 75);
		expect(s.h).toBeCloseTo(MIN_SPRITE_SIDE_UNITS / SVG_UNITS_PER_METER, 5);
		expect(s.w / s.h).toBeCloseTo(0.8, 5);
	});
});
