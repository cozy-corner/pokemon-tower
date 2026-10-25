import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { RASTER_LONGEST_SIDE_PX, rasterizeSvg } from "./rasterize";

const svg = (attrs: string) =>
	`<svg xmlns="http://www.w3.org/2000/svg" ${attrs}><rect width="100%" height="100%" fill="red"/></svg>`;

describe("rasterizeSvg", () => {
	it("scales the longest side to the raster size and reports the intrinsic size", () => {
		const r = rasterizeSvg(svg('width="20" height="10"'));
		const png = PNG.sync.read(Buffer.from(r.png));
		expect([png.width, png.height]).toEqual([RASTER_LONGEST_SIDE_PX, 128]);
		expect([r.svgWidth, r.svgHeight]).toEqual([20, 10]);
	});

	it("takes the size from the viewBox when width and height are missing", () => {
		const r = rasterizeSvg(svg('viewBox="0 0 10 40"'));
		const png = PNG.sync.read(Buffer.from(r.png));
		expect([png.width, png.height]).toEqual([64, RASTER_LONGEST_SIDE_PX]);
		expect([r.svgWidth, r.svgHeight]).toEqual([10, 40]);
	});

	it("keeps transparency outside the drawing", () => {
		const r = rasterizeSvg(
			'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="5" height="10"/></svg>',
		);
		const png = PNG.sync.read(Buffer.from(r.png));
		expect(png.data[3]).toBe(255);
		expect(png.data[(png.width - 1) * 4 + 3]).toBe(0);
	});
});
