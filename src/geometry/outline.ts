export type Mask = { alpha: Uint8Array; w: number; h: number };
export type Vec = { x: number; y: number };
export type OutlineResult = {
	polygons: Vec[][];
	stats: { components: number; fillOverHull: number; thin: boolean };
};

// Pixels used directly as meters make Planck unstable (bodies would be ~128 m).
export const PIXELS_PER_METER = 32;
export const SIMPLIFY_TOLERANCE_PX = 1.5;
export const MIN_ISLAND_PX = 20;
export const THIN_THICKNESS_PX = 8;
// Mirrors planck's Settings.maxPolygonVertices (1.5.1); a test keeps them in sync.
export const MAX_POLYGON_VERTICES = 12;

const ALPHA_THRESHOLD = 127;

type Pt = { x: number; y: number };

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

	const polygons: Vec[][] = [];
	for (const start of islandStarts(solid, w, h)) {
		const contour = traceOuter(solid, w, h, start);
		for (const piece of decomposeContour(contour)) {
			polygons.push(
				piece.map((p) => ({
					x: (p.x - w / 2) / PIXELS_PER_METER,
					y: (p.y - h / 2) / PIXELS_PER_METER,
				})),
			);
		}
	}

	const hull = convexHull(pixelCorners(kept, w, h));
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
function islandStarts(m: Uint8Array, w: number, h: number): Pt[] {
	const seen = new Uint8Array(w * h);
	const starts: Pt[] = [];
	const stack: number[] = [];
	for (let i = 0; i < w * h; i++) {
		if (!m[i] || seen[i]) continue;
		starts.push({ x: i % w, y: Math.floor(i / w) });
		seen[i] = 1;
		stack.push(i);
		while (stack.length > 0) {
			const j = stack.pop() as number;
			const x = j % w;
			const y = (j - x) / w;
			const visit = (k: number) => {
				if (m[k] && !seen[k]) {
					seen[k] = 1;
					stack.push(k);
				}
			};
			if (x > 0) visit(j - 1);
			if (x + 1 < w) visit(j + 1);
			if (y > 0) visit(j - w);
			if (y + 1 < h) visit(j + w);
		}
	}
	return starts;
}

/**
 * Follows pixel edges with the island on the right-hand side (screen
 * orientation), returning the corner points where the direction changes.
 * Assumes no saddles, so the next step is never ambiguous.
 */
function traceOuter(m: Uint8Array, w: number, h: number, start: Pt): Pt[] {
	const solidAt = (cx: number, cy: number, vx: number, vy: number) => {
		const px = cx + (vx > 0 ? 0 : -1);
		const py = cy + (vy > 0 ? 0 : -1);
		return px >= 0 && py >= 0 && px < w && py < h && m[py * w + px] === 1;
	};
	const out: Pt[] = [];
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
 * ending with the exact pixel outline. Returns [] rather than throwing.
 */
function decomposeContour(contour: Pt[]): Pt[][] {
	for (let tol = SIMPLIFY_TOLERANCE_PX; ; tol /= 2) {
		const exact = tol < 0.25;
		const poly = removeCollinear(
			exact ? contour : simplifyClosed(contour, tol),
		);
		if (poly.length >= 3 && polygonArea(poly) > 0 && isSimple(poly)) {
			const triangles = earClip(poly);
			if (triangles) return mergeConvex(poly, triangles);
		}
		if (exact) return [];
	}
}

function simplifyClosed(pts: Pt[], tol: number): Pt[] {
	if (pts.length <= 3) return pts.slice();
	let far = 1;
	for (let i = 2; i < pts.length; i++) {
		if (dist2(pts[0], pts[i]) > dist2(pts[0], pts[far])) far = i;
	}
	const a = douglasPeucker(pts.slice(0, far + 1), tol);
	const b = douglasPeucker([...pts.slice(far), pts[0]], tol);
	return [...a.slice(0, -1), ...b.slice(0, -1)];
}

function douglasPeucker(pts: Pt[], tol: number): Pt[] {
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

function removeCollinear(pts: Pt[]): Pt[] {
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
function isSimple(poly: Pt[]): boolean {
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
function earClip(poly: Pt[]): [number, number, number][] | null {
	const idx = poly.map((_, i) => i);
	const tris: [number, number, number][] = [];
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
function mergeConvex(poly: Pt[], tris: [number, number, number][]): Pt[][] {
	const pieces: (number[] | null)[] = tris.map((t) => [...t]);
	const owner = new Map<string, number>();
	const key = (a: number, b: number) => `${a},${b}`;
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
				if (!isConvexChain(poly, union)) continue;
				if (cornerCount(poly, union) > MAX_POLYGON_VERTICES) continue;
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

	const out: Pt[][] = [];
	for (const piece of pieces) {
		if (!piece) continue;
		const pts = removeCollinear(piece.map((i) => poly[i]));
		if (pts.length >= 3 && polygonArea(pts) > 0) out.push(pts);
	}
	return out;
}

/** Rotates a cyclic list so it starts at `first` (and therefore ends just before it wraps). */
function rotateToStart(cycle: number[], first: number): number[] {
	const i = cycle.indexOf(first);
	return [...cycle.slice(i), ...cycle.slice(0, i)];
}

function isConvexChain(poly: Pt[], cycle: number[]): boolean {
	const n = cycle.length;
	for (let i = 0; i < n; i++) {
		const turn = cross(
			poly[cycle[(i + n - 1) % n]],
			poly[cycle[i]],
			poly[cycle[(i + 1) % n]],
		);
		if (turn < 0) return false;
	}
	return true;
}

function cornerCount(poly: Pt[], cycle: number[]): number {
	const n = cycle.length;
	let count = 0;
	for (let i = 0; i < n; i++) {
		const turn = cross(
			poly[cycle[(i + n - 1) % n]],
			poly[cycle[i]],
			poly[cycle[(i + 1) % n]],
		);
		if (turn !== 0) count++;
	}
	return count;
}

function pixelCorners(m: Uint8Array, w: number, h: number): Pt[] {
	const pts: Pt[] = [];
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			if (!m[y * w + x]) continue;
			pts.push(
				{ x, y },
				{ x: x + 1, y },
				{ x, y: y + 1 },
				{ x: x + 1, y: y + 1 },
			);
		}
	}
	return pts;
}

/** Monotone chain; returns the hull with positive shoelace area. */
function convexHull(pts: Pt[]): Pt[] {
	const sorted = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
	const build = (list: Pt[]) => {
		const hull: Pt[] = [];
		for (const p of list) {
			while (
				hull.length >= 2 &&
				cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0
			) {
				hull.pop();
			}
			hull.push(p);
		}
		hull.pop();
		return hull;
	};
	return [...build(sorted), ...build(sorted.slice().reverse())];
}

/** Count of pixel edges between the mask and anything outside it (holes included). */
function boundaryLength(m: Uint8Array, w: number, h: number): number {
	const at = (x: number, y: number) =>
		x >= 0 && y >= 0 && x < w && y < h && m[y * w + x] === 1;
	let len = 0;
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			if (!at(x, y)) continue;
			if (!at(x - 1, y)) len++;
			if (!at(x + 1, y)) len++;
			if (!at(x, y - 1)) len++;
			if (!at(x, y + 1)) len++;
		}
	}
	return len;
}

function polygonArea(poly: Pt[]): number {
	let s = 0;
	for (let i = 0; i < poly.length; i++) {
		const a = poly[i];
		const b = poly[(i + 1) % poly.length];
		s += a.x * b.y - b.x * a.y;
	}
	return s / 2;
}

function cross(a: Pt, b: Pt, c: Pt): number {
	return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
}

function dist2(a: Pt, b: Pt): number {
	return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function segmentDist2(p: Pt, a: Pt, b: Pt): number {
	const vx = b.x - a.x;
	const vy = b.y - a.y;
	const len2 = vx * vx + vy * vy;
	const t =
		len2 === 0
			? 0
			: Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2));
	return dist2(p, { x: a.x + t * vx, y: a.y + t * vy });
}

function orient(a: Pt, b: Pt, c: Pt): number {
	return Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
}

function onSegment(p: Pt, a: Pt, b: Pt): boolean {
	return (
		Math.min(a.x, b.x) <= p.x &&
		p.x <= Math.max(a.x, b.x) &&
		Math.min(a.y, b.y) <= p.y &&
		p.y <= Math.max(a.y, b.y)
	);
}

function segmentsTouch(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
	const o1 = orient(a, b, c);
	const o2 = orient(a, b, d);
	const o3 = orient(c, d, a);
	const o4 = orient(c, d, b);
	if (o1 !== o2 && o3 !== o4) return true;
	return (
		(o1 === 0 && onSegment(c, a, b)) ||
		(o2 === 0 && onSegment(d, a, b)) ||
		(o3 === 0 && onSegment(a, c, d)) ||
		(o4 === 0 && onSegment(b, c, d))
	);
}

function inClosedTriangle(p: Pt, a: Pt, b: Pt, c: Pt): boolean {
	return cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
}
