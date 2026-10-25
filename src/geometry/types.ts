export type Vec = { x: number; y: number };
export type OutlineResult = {
	polygons: Vec[][];
	stats: { components: number; fillOverHull: number; thin: boolean };
};

/**
 * SVG user units per world meter. Sets how big a sprite is against the
 * pedestal, so it is tuned together with VIEW_WIDTH (see world.ts). Pixels
 * used directly as meters would make Planck unstable.
 */
export const SVG_UNITS_PER_METER = 170;
/**
 * Longest side a sprite may have, in SVG units. A few SVGs are drawn far
 * larger than the rest (wailord, terapagos); they are scaled down to this.
 */
export const MAX_SPRITE_SIDE_UNITS = 600;
/**
 * Shortest longest side, in SVG units (0.9 world units, about 13% of the view,
 * the smallest Pokémon measured in the original). Bounsweet is drawn at 0.44.
 */
export const MIN_SPRITE_SIDE_UNITS = 153;

/** A sprite's drawn size, which shapes.json stores because browsers report 150 px high for an SVG that has only a viewBox. */
export type SpriteSize = { w: number; h: number };
export type Shape = OutlineResult & { size: SpriteSize };

/** World size of a sprite from its SVG intrinsic size. */
export function spriteWorldSize(
	svgWidth: number,
	svgHeight: number,
): SpriteSize {
	const side = Math.max(svgWidth, svgHeight);
	const k = Math.max(
		MIN_SPRITE_SIDE_UNITS / side,
		Math.min(1, MAX_SPRITE_SIDE_UNITS / side),
	);
	return {
		w: (svgWidth * k) / SVG_UNITS_PER_METER,
		h: (svgHeight * k) / SVG_UNITS_PER_METER,
	};
}
