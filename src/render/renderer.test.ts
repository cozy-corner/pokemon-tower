import { describe, expect, it } from "vitest";
import type { Piece } from "../physics/world";
import { cameraTop, INITIAL_CAMERA_TOP } from "./renderer";

const piece = (y: number, asleep = true): Piece => ({
	id: `p${y}`,
	x: 0,
	y,
	angle: 0,
	asleep,
});

describe("cameraTop", () => {
	it("stays at the initial view with no pieces", () => {
		expect(cameraTop([])).toBe(INITIAL_CAMERA_TOP);
	});

	it("rises when an asleep piece is high", () => {
		expect(cameraTop([piece(-30)])).toBeLessThan(INITIAL_CAMERA_TOP);
	});

	it("follows the highest asleep piece", () => {
		expect(cameraTop([piece(-30), piece(-40)])).toBeLessThan(
			cameraTop([piece(-30)]),
		);
	});

	it("ignores awake pieces", () => {
		expect(cameraTop([piece(-50, false)])).toBe(INITIAL_CAMERA_TOP);
	});

	it("never goes below the initial view", () => {
		expect(cameraTop([piece(-1)])).toBe(INITIAL_CAMERA_TOP);
	});
});
