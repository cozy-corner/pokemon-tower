import type { HeldPiece } from "../game/game";
import type { SpriteSize } from "../geometry/types";
import {
	PEDESTAL_HALF_WIDTH,
	PEDESTAL_THICKNESS,
	PEDESTAL_TOP_Y,
	type Piece,
	VIEW_WIDTH,
} from "../physics/world";

/** A broken image is `complete` with no width. */
export const isReady = (img: HTMLImageElement) =>
	img.complete && img.naturalWidth > 0;

export type Renderer = {
	draw(pieces: readonly Piece[], held: HeldPiece | null): void;
};

export const VIEW_HEIGHT = (VIEW_WIDTH * 16) / 9;
/** Room under the pedestal for the buttons, which sit in the page, not the canvas. */
const BUTTON_BAND = 0.18 * VIEW_HEIGHT;
/** World y at the screen bottom. */
const VIEW_BOTTOM_Y = PEDESTAL_THICKNESS + BUTTON_BAND;
export const INITIAL_CAMERA_TOP = VIEW_BOTTOM_Y - VIEW_HEIGHT;
/** Piece has no vertex info, so assume a piece reaches this far above its center. */
const PIECE_TOP_MARGIN = 2.5;
/** Where the tower top sits on screen, as a fraction of the view from the top. */
const TOWER_TOP_FRACTION = 0.3;
const GRASS_THICKNESS = 0.3;

/** World y at the top edge of the screen. Never lower than the initial view. */
export function cameraTop(pieces: readonly Piece[]): number {
	let towerTop = Number.POSITIVE_INFINITY;
	for (const p of pieces) {
		towerTop = Math.min(towerTop, p.y - PIECE_TOP_MARGIN);
	}
	return Math.min(
		INITIAL_CAMERA_TOP,
		towerTop - TOWER_TOP_FRACTION * VIEW_HEIGHT,
	);
}

export function createRenderer(
	canvas: HTMLCanvasElement,
	sprites: Map<string, HTMLImageElement>,
	sizeOf: (id: string) => SpriteSize,
): Renderer {
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("2d context unavailable");
	let scale = 1;
	// One backing pixel per device pixel; a mismatch resamples the sprites twice.
	const resize = () => {
		canvas.width = Math.round(
			canvas.clientWidth * (window.devicePixelRatio || 1),
		);
		canvas.height = Math.round((canvas.width * VIEW_HEIGHT) / VIEW_WIDTH);
		scale = canvas.width / VIEW_WIDTH;
	};
	resize();
	new ResizeObserver(resize).observe(canvas);

	const drawPiece = (p: HeldPiece) => {
		const img = sprites.get(p.id);
		if (!img || !isReady(img)) return;
		ctx.save();
		ctx.translate(p.x, p.y);
		ctx.rotate(p.angle);
		// Shapes put the origin at the SVG center, so draw around it.
		const { w, h } = sizeOf(p.id);
		ctx.drawImage(img, -w / 2, -h / 2, w, h);
		ctx.restore();
	};

	return {
		draw(pieces, held) {
			ctx.imageSmoothingQuality = "high";
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.fillStyle = "#4ddcff";
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.setTransform(
				scale,
				0,
				0,
				scale,
				(VIEW_WIDTH / 2) * scale,
				-cameraTop(pieces) * scale,
			);
			ctx.fillStyle = "#a8654a";
			ctx.fillRect(
				-PEDESTAL_HALF_WIDTH,
				PEDESTAL_TOP_Y,
				PEDESTAL_HALF_WIDTH * 2,
				PEDESTAL_THICKNESS,
			);
			ctx.fillStyle = "#2edc2e";
			ctx.fillRect(
				-PEDESTAL_HALF_WIDTH,
				PEDESTAL_TOP_Y,
				PEDESTAL_HALF_WIDTH * 2,
				GRASS_THICKNESS,
			);
			for (const p of pieces) drawPiece(p);
			if (held) drawPiece(held);
		},
	};
}
