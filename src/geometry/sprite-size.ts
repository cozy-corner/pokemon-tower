import type { SpriteSize } from "./types";

/**
 * Longest side of the shortest and tallest Pokémon, in world units. Tuned so
 * the median sprite is about 1.5 wide, a quarter of the pedestal, as in the
 * original's screenshots (which only show 0.3 to 1.5 m Pokémon, so the ends
 * are not measured).
 */
export const MIN_SPRITE_SIDE = 0.7;
export const MAX_SPRITE_SIDE = 3.0;
/** Real heights in metres that map to the two ends (sinistea and wailord). */
export const MIN_HEIGHT_M = 0.1;
export const MAX_HEIGHT_M = 14.5;
const LOG_RANGE = Math.log(MAX_HEIGHT_M / MIN_HEIGHT_M);

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
	const h = Math.min(Math.max(heightM, MIN_HEIGHT_M), MAX_HEIGHT_M);
	const t = Math.log(h / MIN_HEIGHT_M) / LOG_RANGE;
	const side = MIN_SPRITE_SIDE + t * (MAX_SPRITE_SIDE - MIN_SPRITE_SIDE);
	const k = side / Math.max(svgWidth, svgHeight);
	return { w: svgWidth * k, h: svgHeight * k };
}
