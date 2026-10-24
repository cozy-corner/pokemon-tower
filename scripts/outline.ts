import { Settings } from "planck";
import {
	type OutlineResult,
	PIXELS_PER_METER,
	type Vec,
} from "../src/geometry/types";

export type Mask = { alpha: Uint8Array; w: number; h: number };

/** Three indices into a polygon's vertex array. */
type Triangle = [number, number, number];

export const SIMPLIFY_TOLERANCE_PX = 1.5;
export const MIN_ISLAND_PX = 20;
export const THIN_THICKNESS_PX = 8;
export const MAX_POLYGON_VERTICES = Settings.maxPolygonVertices;

const ALPHA_THRESHOLD = 127;

/**
 * Polygons are in meters, origin at the image center, +y down. Each polygon
 * has positive shoelace area in those coordinates.
 */
export function computeOutline(mask: Mask): OutlineResult {
	const { w, h } = mask;
	const { kept, components } = keptIslands(mask);
	const area = kept.reduce((n, v) => n + v, 0);
	if (area === 0) {
		return {
			polygons: [],
			stats: { components: 0, fillOverHull: 0, thin: false },
		};
	}

	const solid = kept.slice();
	fillSaddles(solid, w, h);
	fillHoles(solid, w, h);

	const toMeters = (p: Vec): Vec => ({
		x: (p.x - w / 2) / PIXELS_PER_METER,
		y: (p.y - h / 2) / PIXELS_PER_METER,
	});
	const polygons = islandStarts(solid, w, h)
		.flatMap((start) => decomposeContour(traceOuter(solid, w, h, start)))
		.map((piece) => piece.map(toMeters));

	// Stats describe the sprite as drawn (the original kept mask), while the
	// polygons come from the saddle- and hole-filled mask.
	const hull = convexHull(rowExtremeCorners(kept, w, h));
	const thickness = (2 * area) / boundaryLength(kept, w, h);
	return {
		polygons,
		stats: {
			components,
			fillOverHull: area / polygonArea(hull),
			thin: thickness < THIN_THICKNESS_PX,
		},
	};
}

/**
 * Thresholded mask with 8-connected islands smaller than MIN_ISLAND_PX
 * removed, and the number of islands kept. Counted before the fills so an
 * island inside another's hole, or one the saddle fill bridges, still counts.
 */
function keptIslands(mask: Mask): { kept: Uint8Array; components: number } {
	const { alpha, w, h } = mask;
	const out = new Uint8Array(w * h);
	const seen = new Uint8Array(w * h);
	const stack: number[] = [];
	const island: number[] = [];
	let components = 0;
	for (let i = 0; i < w * h; i++) {
		if (seen[i] || alpha[i] <= ALPHA_THRESHOLD) continue;
		island.length = 0;
		seen[i] = 1;
		stack.push(i);
		while (stack.length > 0) {
			const j = stack.pop() as number;
			island.push(j);
			const x = j % w;
			const y = (j - x) / w;
			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					const nx = x + dx;
					const ny = y + dy;
					if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
					const k = ny * w + nx;
					if (seen[k] || alpha[k] <= ALPHA_THRESHOLD) continue;
					seen[k] = 1;
					stack.push(k);
				}
			}
		}
		if (island.length >= MIN_ISLAND_PX) {
			components++;
			for (const j of island) out[j] = 1;
		}
	}
	return { kept: out, components };
}

/**
 * Diagonal-only contacts make the traced outline touch itself at a point,
 * which breaks simplification and ear clipping. Bridging them makes 4- and
 * 8-connectivity agree, so every island's outline is a simple polygon.
 */
function fillSaddles(m: Uint8Array, w: number, h: number): void {
	let changed = true;
	while (changed) {
		changed = false;
		for (let y = 0; y + 1 < h; y++) {
			for (let x = 0; x + 1 < w; x++) {
				const i = y * w + x;
				const a = m[i];
				const b = m[i + 1];
				const c = m[i + w];
				const d = m[i + w + 1];
				if (a && d && !b && !c) {
					m[i + 1] = 1;
					changed = true;
				} else if (b && c && !a && !d) {
					m[i] = 1;
					changed = true;
				}
			}
		}
	}
}

/** Marks every background pixel not 4-reachable from the image border as solid. */
function fillHoles(m: Uint8Array, w: number, h: number): void {
	const outside = new Uint8Array(w * h);
	const stack: number[] = [];
	const push = (x: number, y: number) => {
		const i = y * w + x;
		if (m[i] || outside[i]) return;
		outside[i] = 1;
		stack.push(i);
	};
	for (let x = 0; x < w; x++) {
		push(x, 0);
		push(x, h - 1);
	}
	for (let y = 0; y < h; y++) {
		push(0, y);
		push(w - 1, y);
	}
	while (stack.length > 0) {
		const i = stack.pop() as number;
		const x = i % w;
		const y = (i - x) / w;
		if (x > 0) push(x - 1, y);
		if (x + 1 < w) push(x + 1, y);
		if (y > 0) push(x, y - 1);
		if (y + 1 < h) push(x, y + 1);
	}
	for (let i = 0; i < w * h; i++) {
		if (!outside[i]) m[i] = 1;
	}
}

/** The first pixel (in scan order) of each 4-connected island. */
function islandStarts(m: Uint8Array, w: number, h: number): Vec[] {
	const seen = new Uint8Array(w * h);
	const starts: Vec[] = [];
	for (let i = 0; i < w * h; i++) {
		if (!m[i] || seen[i]) continue;
		starts.push({ x: i % w, y: Math.floor(i / w) });
		markIsland4(m, w, h, seen, i);
	}
	return starts;
}

/** Marks every solid pixel 4-connected to `start` in `seen`. */
function markIsland4(
	m: Uint8Array,
	w: number,
	h: number,
	seen: Uint8Array,
	start: number,
): void {
	const stack = [start];
	seen[start] = 1;
	const visit = (k: number) => {
		if (m[k] && !seen[k]) {
			seen[k] = 1;
			stack.push(k);
		}
	};
	while (stack.length > 0) {
		const j = stack.pop() as number;
		const x = j % w;
		const y = (j - x) / w;
		if (x > 0) visit(j - 1);
		if (x + 1 < w) visit(j + 1);
		if (y > 0) visit(j - w);
		if (y + 1 < h) visit(j + w);
	}
}

/**
 * Follows pixel edges with the island on the right-hand side (screen
 * orientation), returning the corner points where the direction changes.
 * Assumes no saddles, so the next step is never ambiguous.
 */
function traceOuter(m: Uint8Array, w: number, h: number, start: Vec): Vec[] {
	const solidAt = (cx: number, cy: number, vx: number, vy: number) => {
		const px = cx + (vx > 0 ? 0 : -1);
		const py = cy + (vy > 0 ? 0 : -1);
		return px >= 0 && py >= 0 && px < w && py < h && m[py * w + px] === 1;
	};
	const out: Vec[] = [];
	let cx = start.x;
	let cy = start.y;
	// Start heading east along the top edge of the scan-order-first pixel.
	let dx = 1;
	let dy = 0;
	do {
		cx += dx;
		cy += dy;
		const rx = -dy;
		const ry = dx;
		let ndx = dx;
		let ndy = dy;
		if (!solidAt(cx, cy, dx + rx, dy + ry)) {
			ndx = rx;
			ndy = ry;
		} else if (solidAt(cx, cy, dx - rx, dy - ry)) {
			ndx = -rx;
			ndy = -ry;
		}
		if (ndx !== dx || ndy !== dy) out.push({ x: cx, y: cy });
		dx = ndx;
		dy = ndy;
	} while (cx !== start.x || cy !== start.y || dx !== 1 || dy !== 0);
	return out;
}

/**
 * Simplifies the contour and splits it into convex pieces. If simplification
 * self-intersects or triangulation fails, retries with a smaller tolerance,
 * ending with the exact pixel outline. Throws if even that fails, so an island never vanishes silently.
 */
function decomposeContour(contour: Vec[]): Vec[][] {
	// null = the exact pixel outline, which is always simple.
	const ladder = [
		SIMPLIFY_TOLERANCE_PX,
		SIMPLIFY_TOLERANCE_PX / 2,
		SIMPLIFY_TOLERANCE_PX / 4,
		null,
	];
	for (const tol of ladder) {
		const poly = removeCollinear(
			tol === null ? contour : simplifyClosed(contour, tol),
		);
		if (poly.length >= 3 && polygonArea(poly) > 0 && isSimple(poly)) {
			const triangles = earClip(poly);
			if (triangles) return mergeConvex(poly, triangles);
		}
	}
	throw new Error("could not decompose contour");
}

function simplifyClosed(pts: Vec[], tol: number): Vec[] {
	if (pts.length <= 3) return pts.slice();
	let far = 1;
	for (let i = 2; i < pts.length; i++) {
		if (dist2(pts[0], pts[i]) > dist2(pts[0], pts[far])) far = i;
	}
	const a = douglasPeucker(pts.slice(0, far + 1), tol);
	const b = douglasPeucker([...pts.slice(far), pts[0]], tol);
	return [...a.slice(0, -1), ...b.slice(0, -1)];
}

function douglasPeucker(pts: Vec[], tol: number): Vec[] {
	const keep = new Uint8Array(pts.length);
	keep[0] = 1;
	keep[pts.length - 1] = 1;
	const stack: [number, number][] = [[0, pts.length - 1]];
	while (stack.length > 0) {
		const [s, e] = stack.pop() as [number, number];
		let best = -1;
		let bestD = tol * tol;
		for (let i = s + 1; i < e; i++) {
			const d = segmentDist2(pts[i], pts[s], pts[e]);
			if (d > bestD) {
				bestD = d;
				best = i;
			}
		}
		if (best >= 0) {
			keep[best] = 1;
			stack.push([s, best], [best, e]);
		}
	}
	return pts.filter((_, i) => keep[i]);
}

function removeCollinear(pts: Vec[]): Vec[] {
	const out = pts.slice();
	let i = 0;
	let stable = 0;
	while (out.length >= 3 && stable < out.length) {
		const n = out.length;
		const a = out[(i + n - 1) % n];
		const b = out[i % n];
		const c = out[(i + 1) % n];
		if (cross(a, b, c) === 0) {
			out.splice(i % n, 1);
			stable = 0;
		} else {
			i = (i + 1) % n;
			stable++;
		}
	}
	return out;
}

/** Collinear vertices (including zero-width spikes) must already be removed. */
function isSimple(poly: Vec[]): boolean {
	const n = poly.length;
	for (let i = 0; i < n; i++) {
		for (let j = i + 2; j < n; j++) {
			if (i === 0 && j === n - 1) continue;
			if (segmentsTouch(poly[i], poly[i + 1], poly[j], poly[(j + 1) % n])) {
				return false;
			}
		}
	}
	return true;
}

/** Ear clipping for a simple polygon with positive area. Null on failure. */
function earClip(poly: Vec[]): Triangle[] | null {
	const idx = poly.map((_, i) => i);
	const tris: Triangle[] = [];
	while (idx.length > 3) {
		const n = idx.length;
		let clipped = false;
		for (let k = 0; k < n; k++) {
			const ia = idx[(k + n - 1) % n];
			const ib = idx[k];
			const ic = idx[(k + 1) % n];
			const turn = cross(poly[ia], poly[ib], poly[ic]);
			if (turn === 0) {
				idx.splice(k, 1);
				clipped = true;
				break;
			}
			if (turn < 0) continue;
			let blocked = false;
			for (const j of idx) {
				if (j === ia || j === ib || j === ic) continue;
				if (inClosedTriangle(poly[j], poly[ia], poly[ib], poly[ic])) {
					blocked = true;
					break;
				}
			}
			if (blocked) continue;
			tris.push([ia, ib, ic]);
			idx.splice(k, 1);
			clipped = true;
			break;
		}
		if (!clipped) return null;
	}
	if (cross(poly[idx[0]], poly[idx[1]], poly[idx[2]]) > 0) {
		tris.push([idx[0], idx[1], idx[2]]);
	}
	return tris;
}

/**
 * Hertel–Mehlhorn: drop diagonals whose removal keeps the piece convex.
 * Merges that would exceed MAX_POLYGON_VERTICES are refused, so no piece
 * ever needs splitting afterwards.
 */
function mergeConvex(poly: Vec[], tris: Triangle[]): Vec[][] {
	const pieces: (number[] | null)[] = tris.map((t) => [...t]);
	const owner = new Map<string, number>();
	const key = (from: number, to: number) => `${from},${to}`;
	const register = (p: number) => {
		const piece = pieces[p] as number[];
		for (let i = 0; i < piece.length; i++) {
			owner.set(key(piece[i], piece[(i + 1) % piece.length]), p);
		}
	};
	pieces.forEach((_, p) => {
		register(p);
	});

	let merged = true;
	while (merged) {
		merged = false;
		for (let p = 0; p < pieces.length && !merged; p++) {
			const piece = pieces[p];
			if (!piece) continue;
			for (let i = 0; i < piece.length; i++) {
				const a = piece[i];
				const b = piece[(i + 1) % piece.length];
				const q = owner.get(key(b, a));
				if (q === undefined || q === p) continue;
				const other = pieces[q] as number[];
				const union = [
					...rotateToStart(piece, b),
					...rotateToStart(other, a).slice(1, -1),
				];
				const unionTurns = turns(poly, union);
				if (unionTurns.some((t) => t < 0)) continue;
				const corners = unionTurns.filter((t) => t !== 0).length;
				if (corners > MAX_POLYGON_VERTICES) continue;
				for (const piece2 of [piece, other]) {
					for (let j = 0; j < piece2.length; j++) {
						owner.delete(key(piece2[j], piece2[(j + 1) % piece2.length]));
					}
				}
				pieces[p] = union;
				pieces[q] = null;
				register(p);
				merged = true;
				break;
			}
		}
	}

	return pieces
		.filter((piece) => piece !== null)
		.map((piece) => removeCollinear(piece.map((i) => poly[i])))
		.filter((pts) => pts.length >= 3 && polygonArea(pts) > 0);
}

/** Rotates a cyclic list so it starts at `first` (and therefore ends just before it wraps). */
function rotateToStart(cycle: number[], first: number): number[] {
	const i = cycle.indexOf(first);
	return [...cycle.slice(i), ...cycle.slice(0, i)];
}

/** Turn at each vertex of a cyclic index list (see `cross`). */
function turns(poly: Vec[], cycle: number[]): number[] {
	const n = cycle.length;
	return cycle.map((v, i) =>
		cross(poly[cycle[(i + n - 1) % n]], poly[v], poly[cycle[(i + 1) % n]]),
	);
}

/**
 * Corners of the leftmost and rightmost solid pixel in each row: the convex
 * hull of a union of pixel squares depends only on these.
 */
function rowExtremeCorners(m: Uint8Array, w: number, h: number): Vec[] {
	return Array.from({ length: h }, (_, y) => y).flatMap((y) => {
		const row = m.subarray(y * w, (y + 1) * w);
		const left = row.indexOf(1);
		if (left < 0) return [];
		const right = row.lastIndexOf(1) + 1;
		return [
			{ x: left, y },
			{ x: left, y: y + 1 },
			{ x: right, y },
			{ x: right, y: y + 1 },
		];
	});
}

/** Monotone chain; returns the hull with positive shoelace area. */
function convexHull(pts: Vec[]): Vec[] {
	const sorted = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
	const build = (list: Vec[]) => {
		const hull: Vec[] = [];
		const turnsLeftTo = (p: Vec) => {
			const prev = hull.at(-2);
			const last = hull.at(-1);
			return !prev || !last || cross(prev, last, p) > 0;
		};
		for (const p of list) {
			while (!turnsLeftTo(p)) hull.pop();
			hull.push(p);
		}
		hull.pop();
		return hull;
	};
	return [...build(sorted), ...build(sorted.slice().reverse())];
}

/** Count of pixel edges between the mask and anything outside it (holes included). */
function boundaryLength(m: Uint8Array, w: number, h: number): number {
	let len = 0;
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			if (isSolidPixel(m, w, h, x, y)) len += exposedSides(m, w, h, x, y);
		}
	}
	return len;
}

/** Out-of-image pixels count as empty. */
function isSolidPixel(
	m: Uint8Array,
	w: number,
	h: number,
	x: number,
	y: number,
): boolean {
	return x >= 0 && y >= 0 && x < w && y < h && m[y * w + x] === 1;
}

/** How many of the pixel's 4 neighbours are empty. */
function exposedSides(
	m: Uint8Array,
	w: number,
	h: number,
	x: number,
	y: number,
): number {
	return (
		Number(!isSolidPixel(m, w, h, x - 1, y)) +
		Number(!isSolidPixel(m, w, h, x + 1, y)) +
		Number(!isSolidPixel(m, w, h, x, y - 1)) +
		Number(!isSolidPixel(m, w, h, x, y + 1))
	);
}

export function polygonArea(poly: Vec[]): number {
	const twice = poly.reduce((s, a, i) => {
		const b = poly[(i + 1) % poly.length];
		return s + a.x * b.y - b.x * a.y;
	}, 0);
	return twice / 2;
}

/** Turn at b along a→b→c: positive for a left turn in positive-area winding. */
export function cross(a: Vec, b: Vec, c: Vec): number {
	return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
}

function dist2(a: Vec, b: Vec): number {
	return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function segmentDist2(p: Vec, a: Vec, b: Vec): number {
	const vx = b.x - a.x;
	const vy = b.y - a.y;
	const len2 = vx * vx + vy * vy;
	const t =
		len2 === 0
			? 0
			: Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2));
	return dist2(p, { x: a.x + t * vx, y: a.y + t * vy });
}

function orient(a: Vec, b: Vec, c: Vec): number {
	return Math.sign(cross(a, b, c));
}

function onSegment(p: Vec, a: Vec, b: Vec): boolean {
	return (
		Math.min(a.x, b.x) <= p.x &&
		p.x <= Math.max(a.x, b.x) &&
		Math.min(a.y, b.y) <= p.y &&
		p.y <= Math.max(a.y, b.y)
	);
}

/** Whether segment p1–p2 and segment q1–q2 intersect or touch. */
function segmentsTouch(p1: Vec, p2: Vec, q1: Vec, q2: Vec): boolean {
	const o1 = orient(p1, p2, q1);
	const o2 = orient(p1, p2, q2);
	const o3 = orient(q1, q2, p1);
	const o4 = orient(q1, q2, p2);
	if (o1 !== o2 && o3 !== o4) return true;
	return (
		(o1 === 0 && onSegment(q1, p1, p2)) ||
		(o2 === 0 && onSegment(q2, p1, p2)) ||
		(o3 === 0 && onSegment(p1, q1, q2)) ||
		(o4 === 0 && onSegment(p2, q1, q2))
	);
}

function inClosedTriangle(p: Vec, a: Vec, b: Vec, c: Vec): boolean {
	return cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
}
