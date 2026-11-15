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
	/** Positive moves the view down, toward the pedestal. */
	scroll(dy: number): void;
	/** Plays the wave on piece `id`, which shows as `from` until the midpoint. */
	transform(id: string, from: string): void;
};

export const TRANSFORM_S = 0.6;
/** Peak sideways shift of a strip, as a fraction of the sprite width. */
const WAVE_AMPLITUDE = 0.12;
const WAVE_CYCLES = 3;
const WAVE_STRIPS = 32;

/** The wave grows on the old sprite, then settles on the new one. */
export function transformFrame(elapsedS: number): {
	showFrom: boolean;
	amplitude: number;
} {
	const t = Math.min(Math.max(elapsedS / TRANSFORM_S, 0), 1);
	return { showFrom: t < 0.5, amplitude: 1 - Math.abs(2 * t - 1) };
}

/** Pokémon that can turn clear or vanish; they show faint until they land. */
export const INVISIBLES = new Set([
	"dragapult",
	"latias",
	"latios",
	"kecleon",
	"duskull",
	"vaporeon",
	"mew",
]);
/** Not 0, so the player can still aim. */
export const INVISIBLE_ALPHA = 0.2;
export const REAPPEAR_S = 1;

/** `sinceLandedS` is null while the piece has not landed yet. */
export function invisibleAlpha(sinceLandedS: number | null): number {
	if (sinceLandedS === null) return INVISIBLE_ALPHA;
	const t = Math.min(Math.max(sinceLandedS / REAPPEAR_S, 0), 1);
	return INVISIBLE_ALPHA + (1 - INVISIBLE_ALPHA) * t;
}

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

/** How far below the followed view the camera sits: never above it, never below the initial view. */
export function clampScroll(offset: number, followedTop: number): number {
	return Math.min(Math.max(offset, 0), INITIAL_CAMERA_TOP - followedTop);
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
	let scrollOffset = 0;
	let followedTop = INITIAL_CAMERA_TOP;
	const transforms = new Map<string, { from: string; start: number }>();
	const landings = new Map<string, number>();
	const rasters = new Map<string, HTMLCanvasElement>();
	// Strips cut from the SVG itself come out garbled, so cut them from a bitmap.
	const rasterOf = (
		id: string,
		img: HTMLImageElement,
		w: number,
		h: number,
	) => {
		const pw = Math.ceil(w * scale);
		const ph = Math.ceil(h * scale);
		let raster = rasters.get(id);
		if (raster?.width !== pw || raster.height !== ph) {
			raster = document.createElement("canvas");
			raster.width = pw;
			raster.height = ph;
			raster.getContext("2d")?.drawImage(img, 0, 0, pw, ph);
			rasters.set(id, raster);
		}
		return raster;
	};

	const drawPiece = (p: HeldPiece, alpha = 1) => {
		let id = p.id;
		let amplitude = 0;
		let phase = 0;
		const tf = transforms.get(p.id);
		if (tf) {
			const elapsed = (performance.now() - tf.start) / 1000;
			if (elapsed >= TRANSFORM_S) {
				transforms.delete(p.id);
				rasters.delete(p.id);
				rasters.delete(tf.from);
			}
			const frame = transformFrame(elapsed);
			if (frame.showFrom) id = tf.from;
			amplitude = frame.amplitude;
			phase = (elapsed / TRANSFORM_S) * 4 * Math.PI;
		}
		const img = sprites.get(id);
		if (!img || !isReady(img)) return;
		ctx.save();
		ctx.globalAlpha = alpha;
		ctx.translate(p.x, p.y);
		ctx.rotate(p.angle);
		// Shapes put the origin at the SVG center, so draw around it.
		const { w, h } = sizeOf(id);
		if (amplitude === 0) {
			ctx.drawImage(img, -w / 2, -h / 2, w, h);
		} else {
			// Horizontal strips, each shifted sideways along a sine.
			const raster = rasterOf(id, img, w, h);
			const sh = raster.height / WAVE_STRIPS;
			for (let i = 0; i < WAVE_STRIPS; i++) {
				const shift =
					amplitude *
					WAVE_AMPLITUDE *
					w *
					Math.sin((i / WAVE_STRIPS) * WAVE_CYCLES * 2 * Math.PI + phase);
				ctx.drawImage(
					raster,
					0,
					i * sh,
					raster.width,
					sh,
					-w / 2 + shift,
					-h / 2 + (i * h) / WAVE_STRIPS,
					w,
					// A hair taller than a strip so seams do not show.
					h / WAVE_STRIPS + 0.01,
				);
			}
		}
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
		scroll(dy) {
			// Clamp now, so scrolling past an end does not have to be undone.
			scrollOffset = clampScroll(scrollOffset + dy, followedTop);
		},
		transform(id, from) {
			transforms.set(id, { from, start: performance.now() });
		},
		draw(pieces, held) {
			ctx.imageSmoothingQuality = "high";
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.fillStyle = SKY;
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			const view = held ? [...pieces, held] : pieces;
			followedTop = cameraTop(view);
			scrollOffset = clampScroll(scrollOffset, followedTop);
			const top = followedTop + scrollOffset;
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
			const now = performance.now();
			// A removed piece may be picked again, and must start faint then.
			for (const id of landings.keys()) {
				if (!pieces.some((p) => p.id === id)) landings.delete(id);
			}
			for (const p of pieces) {
				if (!INVISIBLES.has(p.id)) {
					drawPiece(p);
					continue;
				}
				if (p.landed && !landings.has(p.id)) landings.set(p.id, now);
				const since = landings.get(p.id);
				drawPiece(
					p,
					invisibleAlpha(since === undefined ? null : (now - since) / 1000),
				);
			}
			if (held) drawPiece(held, INVISIBLES.has(held.id) ? INVISIBLE_ALPHA : 1);
		},
	};
}
