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

	it("rises when a piece is high", () => {
		expect(cameraTop([piece(-30)])).toBeLessThan(INITIAL_CAMERA_TOP);
	});

	it("follows the highest piece", () => {
		expect(cameraTop([piece(-30), piece(-40)])).toBeLessThan(
			cameraTop([piece(-30)]),
		);
	});

	it("keeps following a tower whose pieces are all awake", () => {
		expect(cameraTop([piece(-30, false), piece(-40, false)])).toBe(
			cameraTop([piece(-30), piece(-40)]),
		);
	});

	it("also frames a held piece that is higher than the tower", () => {
		expect(cameraTop([piece(-30), { y: -45 }])).toBeLessThan(
			cameraTop([piece(-30)]),
		);
	});

	it("never goes below the initial view", () => {
		expect(cameraTop([piece(-1)])).toBe(INITIAL_CAMERA_TOP);
	});
});
