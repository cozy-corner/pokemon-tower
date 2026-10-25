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
/** Piece has no vertex info, so assume a piece reaches this far above its center (the largest sprite is 1.77). */
const PIECE_TOP_MARGIN = 1.8;
/** Where the tower top sits on screen, as a fraction of the view from the top. */
const TOWER_TOP_FRACTION = 0.2;
const SKY = "#4ddcff";
const GRASS = "#1ee727";
const GRASS_EDGE = "#14a81d";
const ROCK = "#af684c";
const ROCK_SHADE = "#8e5239";
const ROCK_EDGE = "#7d4030";

const BALL_TOP = "rgba(255, 255, 255, 0.2)";
const BALL_BOTTOM = "rgba(255, 255, 255, 0.3)";
const BALL_LINE = "rgba(255, 255, 255, 0.5)";
/** The title art's sky carries faint pale dots; they drift slower than the tower. */
const DOT_PARALLAX = 0.5;
const DOTS = Array.from({ length: 40 }, (_, i) => ({
	x: (((i * 7) % 13) / 13) * VIEW_WIDTH - VIEW_WIDTH / 2,
	y: PEDESTAL_TOP_Y - 1 - i * 1.1,
	r: 0.15 + (i % 4) * 0.1,
}));

/** World y at the top edge of the screen. Never lower than the initial view. */
export function cameraTop(pieces: readonly { y: number }[]): number {
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

	/** A pale Poké Ball: the lower half and the band read a little brighter than the top. */
	const drawBall = (x: number, y: number, r: number) => {
		ctx.fillStyle = BALL_TOP;
		ctx.beginPath();
		ctx.arc(x, y, r, Math.PI, 0);
		ctx.fill();
		ctx.fillStyle = BALL_BOTTOM;
		ctx.beginPath();
		ctx.arc(x, y, r, 0, Math.PI);
		ctx.fill();
		ctx.fillStyle = BALL_LINE;
		// The band stops at the button ring instead of running through it.
		const gap = r * 0.3;
		ctx.fillRect(x - r, y - r * 0.08, r - gap, r * 0.16);
		ctx.fillRect(x + gap, y - r * 0.08, r - gap, r * 0.16);
		ctx.strokeStyle = BALL_LINE;
		ctx.lineWidth = r * 0.12;
		ctx.beginPath();
		ctx.arc(x, y, r * 0.22, 0, Math.PI * 2);
		ctx.stroke();
	};

	/** Traced from the play screen; (u, d) are the pedestal width fractions across and down from the top. */
	const drawPedestal = () => {
		const w = PEDESTAL_HALF_WIDTH * 2;
		const path = (pts: readonly (readonly [number, number])[]) => {
			ctx.beginPath();
			pts.forEach(([u, d], i) => {
				const x = -PEDESTAL_HALF_WIDTH + u * w;
				const y = PEDESTAL_TOP_Y + d * w;
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			});
			ctx.closePath();
		};
		ctx.lineJoin = "round";
		ctx.lineWidth = 0.012;
		ctx.fillStyle = ROCK;
		ctx.strokeStyle = ROCK_EDGE;
		path([
			[0.059, 0.05],
			[0.94, 0.05],
			[0.808, 0.139],
			[0.69, 0.105],
			[0.598, 0.13],
			[0.511, 0.102],
			[0.282, 0.183],
		]);
		ctx.fill();
		ctx.stroke();
		ctx.fillStyle = ROCK_SHADE;
		path([
			[0.22, 0.05],
			[0.3, 0.05],
			[0.282, 0.183],
		]);
		ctx.fill();
		path([
			[0.72, 0.05],
			[0.8, 0.05],
			[0.69, 0.105],
		]);
		ctx.fill();
		ctx.fillStyle = ROCK_SHADE;
		for (const [u, d] of [
			[0.325, 0.07],
			[0.4, 0.09],
			[0.573, 0.108],
			[0.7, 0.082],
			[0.86, 0.075],
		] as const) {
			const [x, y] = [-PEDESTAL_HALF_WIDTH + u * w, PEDESTAL_TOP_Y + d * w];
			ctx.beginPath();
			ctx.arc(x, y, 0.004 * w, 0, Math.PI * 2);
			ctx.fill();
		}
		// Grass slab with blades hanging over the rock.
		ctx.fillStyle = GRASS;
		ctx.strokeStyle = GRASS_EDGE;
		const slab = 0.053;
		const tips: readonly (readonly [number, number])[] = [
			[0.006, 0.081],
			[0.057, 0.087],
			[0.103, 0.072],
			[0.167, 0.084],
			[0.245, 0.06],
			[0.52, 0.068],
			[0.55, 0.1],
			[0.575, 0.062],
			[0.87, 0.093],
			[0.93, 0.059],
			[0.99, 0.071],
		];
		const fringe: [number, number][] = [[0, 0]];
		for (const [u, d] of tips) {
			fringe.push([u - 0.02, slab], [u, d], [u + 0.02, slab]);
		}
		fringe.push([1, 0]);
		path(fringe);
		ctx.fill();
		ctx.stroke();
		path([
			[0, 0],
			[1, 0],
			[1, slab],
			[0, slab],
		]);
		ctx.fill();
		// Blades also stick up from the top edge, in a few tufts.
		const tufts: readonly (readonly [number, number])[] = [
			[0.77, -0.03],
			[0.81, -0.055],
			[0.85, -0.035],
			[0.89, -0.05],
		];
		const at = (u: number, d: number) =>
			[-PEDESTAL_HALF_WIDTH + u * w, PEDESTAL_TOP_Y + d * w] as const;
		ctx.beginPath();
		ctx.moveTo(...at(0.004, 0));
		ctx.lineTo(...at(0.996, 0));
		ctx.stroke();
		for (const [u, d] of tufts) {
			// Fill reaches into the slab to hide the seam; the outline stops at the slab top.
			ctx.beginPath();
			ctx.moveTo(...at(u - 0.018, 0.01));
			ctx.lineTo(...at(u, d));
			ctx.lineTo(...at(u + 0.018, 0.01));
			ctx.fill();
			ctx.beginPath();
			ctx.moveTo(...at(u - 0.018, 0));
			ctx.lineTo(...at(u, d));
			ctx.lineTo(...at(u + 0.018, 0));
			ctx.stroke();
		}
	};

	return {
		draw(pieces, held) {
			ctx.imageSmoothingQuality = "high";
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.fillStyle = SKY;
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			const view = held ? [...pieces, held] : pieces;
			const top = cameraTop(view);
			ctx.setTransform(
				scale,
				0,
				0,
				scale,
				(VIEW_WIDTH / 2) * scale,
				-top * scale,
			);
			for (const d of DOTS) {
				drawBall(
					d.x,
					d.y + (top - INITIAL_CAMERA_TOP) * (1 - DOT_PARALLAX),
					d.r,
				);
			}
			drawPedestal();
			for (const p of pieces) drawPiece(p);
			if (held) drawPiece(held);
		},
	};
}
