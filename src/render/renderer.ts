import type { HeldPiece } from "../game/game";
import { PIXELS_PER_METER } from "../geometry/types";
import {
	PEDESTAL_HALF_WIDTH,
	PEDESTAL_THICKNESS,
	PEDESTAL_TOP_Y,
	type Piece,
	VIEW_WIDTH,
} from "../physics/world";

export type Renderer = {
	draw(pieces: readonly Piece[], held: HeldPiece | null): void;
};

export const VIEW_HEIGHT = (VIEW_WIDTH * 16) / 9;
/** World y at the screen bottom: the pedestal plus a little ground below it. */
const VIEW_BOTTOM_Y = PEDESTAL_THICKNESS + 1;
export const INITIAL_CAMERA_TOP = VIEW_BOTTOM_Y - VIEW_HEIGHT;
/** Piece has no vertex info, so assume a piece reaches this far above its center. */
const PIECE_TOP_MARGIN = 2.5;
/** Where the tower top sits on screen, as a fraction of the view from the top. */
const TOWER_TOP_FRACTION = 0.3;
/** CSS-pixel width of the backing store; the height follows the 9:16 aspect. */
const BACKING_WIDTH = 360;
const SPRITE_SIZE = 128 / PIXELS_PER_METER;

/** World y at the top edge of the screen. Never lower than the initial view. */
export function cameraTop(pieces: readonly Piece[]): number {
	let towerTop = Number.POSITIVE_INFINITY;
	for (const p of pieces) {
		if (p.asleep) towerTop = Math.min(towerTop, p.y - PIECE_TOP_MARGIN);
	}
	return Math.min(
		INITIAL_CAMERA_TOP,
		towerTop - TOWER_TOP_FRACTION * VIEW_HEIGHT,
	);
}

export function createRenderer(
	canvas: HTMLCanvasElement,
	sprites: Map<string, HTMLImageElement>,
): Renderer {
	const dpr = window.devicePixelRatio || 1;
	// Backing store is sized once; CSS scales it to the window.
	canvas.width = Math.round(BACKING_WIDTH * dpr);
	canvas.height = Math.round((canvas.width * VIEW_HEIGHT) / VIEW_WIDTH);
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("2d context unavailable");
	const scale = canvas.width / VIEW_WIDTH;

	const drawPiece = (p: HeldPiece) => {
		const img = sprites.get(p.id);
		if (!img?.complete || img.naturalWidth === 0) return;
		ctx.save();
		ctx.translate(p.x, p.y);
		ctx.rotate(p.angle);
		ctx.drawImage(
			img,
			-SPRITE_SIZE / 2,
			-SPRITE_SIZE / 2,
			SPRITE_SIZE,
			SPRITE_SIZE,
		);
		ctx.restore();
	};

	return {
		draw(pieces, held) {
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.fillStyle = "#cfe8f5";
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.setTransform(
				scale,
				0,
				0,
				scale,
				(VIEW_WIDTH / 2) * scale,
				-cameraTop(pieces) * scale,
			);
			ctx.fillStyle = "#8a6a4a";
			ctx.fillRect(
				-PEDESTAL_HALF_WIDTH,
				PEDESTAL_TOP_Y,
				PEDESTAL_HALF_WIDTH * 2,
				PEDESTAL_THICKNESS,
			);
			for (const p of pieces) drawPiece(p);
			if (held) drawPiece(held);
		},
	};
}
