export type Vec = { x: number; y: number };
export type OutlineResult = {
	polygons: Vec[][];
	stats: { components: number; fillOverHull: number; thin: boolean };
};

/** A sprite's drawn size, which shapes.json stores because browsers report 150 px high for an SVG that has only a viewBox. */
export type SpriteSize = { w: number; h: number };
export type Shape = OutlineResult & { size: SpriteSize };
