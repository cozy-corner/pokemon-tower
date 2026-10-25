export type Vec = { x: number; y: number };
export type OutlineResult = {
	polygons: Vec[][];
	stats: { components: number; fillOverHull: number; thin: boolean };
};

/**
 * Longest side a sprite may have, in world units. The shortest Pokémon gets the
 * minimum (0.9, about 13% of the view, the smallest measured in the original)
 * and the tallest the maximum, so VIEW_WIDTH (see world.ts) is tuned against these.
 */
export const MIN_SPRITE_SIDE = 0.9;
export const MAX_SPRITE_SIDE = 3.5;
/** Real heights in metres that map to the two ends (sinistea and wailord). */
export const MIN_HEIGHT_M = 0.1;
export const MAX_HEIGHT_M = 14.5;

/** A sprite's drawn size, which shapes.json stores because browsers report 150 px high for an SVG that has only a viewBox. */
export type SpriteSize = { w: number; h: number };
export type Shape = OutlineResult & { size: SpriteSize };

/**
 * World size of a sprite. The longest side follows the real height on a log
 * scale, because heights span 145x and linear sizes would not fit on screen.
 * The SVG supplies only the aspect ratio: its canvas size varies by artist.
 */
export function spriteWorldSize(
	svgWidth: number,
	svgHeight: number,
	heightM: number,
): SpriteSize {
	const t =
		Math.log(
			Math.min(Math.max(heightM, MIN_HEIGHT_M), MAX_HEIGHT_M) / MIN_HEIGHT_M,
		) / Math.log(MAX_HEIGHT_M / MIN_HEIGHT_M);
	const side = MIN_SPRITE_SIDE + t * (MAX_SPRITE_SIDE - MIN_SPRITE_SIDE);
	const k = side / Math.max(svgWidth, svgHeight);
	return { w: svgWidth * k, h: svgHeight * k };
}
