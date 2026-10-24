export type Vec = { x: number; y: number };
export type OutlineResult = {
	polygons: Vec[][];
	stats: { components: number; fillOverHull: number; thin: boolean };
};

// Pixels used directly as meters make Planck unstable (bodies would be ~128 m).
export const PIXELS_PER_METER = 32;
