import { Resvg } from "@resvg/resvg-js";

/** Longest side of the raster, so the outline pixel parameters mean the same for every sprite. */
export const RASTER_LONGEST_SIDE_PX = 256;

/**
 * Renders the whole SVG (no cropping), so the raster center is the SVG center,
 * which is where the game draws the sprite's origin. `svgWidth`/`svgHeight`
 * are the intrinsic size the browser also uses.
 */
export function rasterizeSvg(svg: string): {
	png: Uint8Array;
	svgWidth: number;
	svgHeight: number;
} {
	const probe = new Resvg(svg, { font: { loadSystemFonts: false } });
	const { width, height } = probe;
	const resvg = new Resvg(svg, {
		font: { loadSystemFonts: false },
		fitTo:
			width >= height
				? { mode: "width", value: RASTER_LONGEST_SIDE_PX }
				: { mode: "height", value: RASTER_LONGEST_SIDE_PX },
	});
	return { png: resvg.render().asPng(), svgWidth: width, svgHeight: height };
}
