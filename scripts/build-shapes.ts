import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { polygonArea } from "../src/geometry/polygon";
import { spriteWorldSize } from "../src/geometry/sprite-size";
import type {
	OutlineResult,
	Shape,
	SpriteSize,
	Vec,
} from "../src/geometry/types";
import {
	computeOutline,
	cross,
	MAX_POLYGON_VERTICES,
	type Mask,
} from "./outline";
import { rasterizeSvg } from "./rasterize";

export type FlagReason = "multi-island" | "low-fill" | "thin";

const LOW_FILL = 0.45;
const DECIMALS = 5;

const root = (path: string) => new URL(`../${path}`, import.meta.url);

export function flagReasons(result: OutlineResult): FlagReason[] {
	const { components, fillOverHull, thin } = result.stats;
	return [
		components >= 2 ? ("multi-island" as const) : null,
		fillOverHull < LOW_FILL ? ("low-fill" as const) : null,
		thin ? ("thin" as const) : null,
	].filter((r) => r !== null);
}

const round = (n: number) => Number(n.toFixed(DECIMALS));

export function roundResult(result: OutlineResult): OutlineResult {
	return {
		polygons: result.polygons.map((poly) =>
			poly.map((p) => ({ x: round(p.x), y: round(p.y) })),
		),
		stats: {
			...result.stats,
			fillOverHull: round(result.stats.fillOverHull),
		},
	};
}

export function isValidPiece(poly: Vec[]): boolean {
	return (
		poly.length >= 3 &&
		poly.length <= MAX_POLYGON_VERTICES &&
		polygonArea(poly) > 0 &&
		poly.every(
			(a, i) =>
				cross(a, poly[(i + 1) % poly.length], poly[(i + 2) % poly.length]) >= 0,
		)
	);
}

export function exitCode(run: {
	skipped: string[];
	invalid: string[];
}): number {
	return run.skipped.length > 0 || run.invalid.length > 0 ? 1 : 0;
}

export function buildShapes(
	names: string[],
	loadMask: (name: string) => Mask | null,
	compute: (mask: Mask) => OutlineResult = computeOutline,
): {
	shapes: Record<string, OutlineResult>;
	skipped: string[];
	flagged: Record<string, FlagReason[]>;
	invalid: string[];
} {
	const shapes: Record<string, OutlineResult> = {};
	const skipped: string[] = [];
	const flagged: Record<string, FlagReason[]> = {};
	const invalid: string[] = [];
	for (const name of names) {
		let mask: Mask | null;
		try {
			mask = loadMask(name);
		} catch {
			mask = null;
		}
		if (!mask) {
			skipped.push(name);
			continue;
		}
		// Flags use the exact stats; only the stored copy is rounded.
		let raw: OutlineResult;
		try {
			raw = compute(mask);
		} catch {
			invalid.push(name);
			continue;
		}
		const result = roundResult(raw);
		if (result.polygons.length === 0 || !result.polygons.every(isValidPiece)) {
			invalid.push(name);
		} else {
			shapes[name] = result;
		}
		const reasons = flagReasons(raw);
		if (reasons.length > 0) flagged[name] = reasons;
	}
	return { shapes, skipped, flagged, invalid };
}

/** Rasterized copies are kept (gitignored) for looking at what the outlines were computed from. */
const CACHE_DIR = ".cache/sprites-png";

async function loadSvgMask(
	name: string,
	heightM: number,
): Promise<{ mask: Mask; size: SpriteSize }> {
	const svg = await readFile(root(`public/sprites/${name}.svg`), "utf8");
	const { png: bytes, svgWidth, svgHeight } = rasterizeSvg(svg);
	await writeFile(root(`${CACHE_DIR}/${name}.png`), bytes);
	const png = PNG.sync.read(Buffer.from(bytes));
	const alpha = Uint8Array.from(
		{ length: png.width * png.height },
		(_, i) => png.data[i * 4 + 3],
	);
	const size = spriteWorldSize(svgWidth, svgHeight, heightM);
	return {
		mask: {
			alpha,
			w: png.width,
			h: png.height,
			metersPerPx: size.w / png.width,
		},
		size,
	};
}

/** Nearest-rank quantile of an ascending array. */
const quantile = (sorted: number[], q: number) =>
	sorted[Math.floor(q * (sorted.length - 1))];

async function main(): Promise<void> {
	const started = performance.now();
	const excluded = new Set<string>(
		JSON.parse(await readFile(root("data/exclusions.json"), "utf8")),
	);
	const names: string[] = JSON.parse(
		await readFile(root("data/names.json"), "utf8"),
	).filter((n: string) => !excluded.has(n));
	const heights: Record<string, number> = JSON.parse(
		await readFile(root("data/heights.json"), "utf8"),
	);
	await mkdir(root(CACHE_DIR), { recursive: true });
	const loaded = new Map<string, { mask: Mask; size: SpriteSize }>();
	for (const name of names) {
		try {
			loaded.set(name, await loadSvgMask(name, heights[name]));
		} catch (e) {
			console.error(
				`unreadable: ${name} (${e instanceof Error ? e.message : String(e)})`,
			);
		}
	}
	const { shapes, skipped, flagged, invalid } = buildShapes(
		names,
		(name) => loaded.get(name)?.mask ?? null,
	);
	const stored: Record<string, Shape> = {};
	for (const [name, shape] of Object.entries(shapes)) {
		const size = (loaded.get(name) as { size: SpriteSize }).size;
		stored[name] = { ...shape, size: { w: round(size.w), h: round(size.h) } };
	}
	await mkdir(root("data"), { recursive: true });
	await writeFile(root("public/shapes.json"), JSON.stringify(stored));
	await writeFile(
		root("data/flagged.json"),
		`${JSON.stringify(flagged, null, "\t")}\n`,
	);
	const byReason = (r: FlagReason) =>
		Object.values(flagged).filter((rs) => rs.includes(r)).length;
	const pieces = Object.values(shapes)
		.map((s) => s.polygons.length)
		.sort((a, b) => a - b);
	const at = (q: number) => quantile(pieces, q);
	console.log(
		`computed: ${Object.keys(shapes).length}, skipped: ${skipped.length}, invalid after rounding: ${invalid.length}`,
	);
	console.log(
		`flagged: ${Object.keys(flagged).length} (multi-island ${byReason("multi-island")}, low-fill ${byReason("low-fill")}, thin ${byReason("thin")})`,
	);
	console.log(
		`pieces per sprite: min ${pieces[0]}, median ${at(0.5)}, p95 ${at(0.95)}, max ${pieces.at(-1)}`,
	);
	const widths = Object.values(shapes)
		.map((s) => {
			const xs = s.polygons.flat().map((p) => p.x);
			return Math.max(...xs) - Math.min(...xs);
		})
		.sort((a, b) => a - b);
	const wq = (q: number) => quantile(widths, q);
	console.log(
		`bbox width (world units): min ${wq(0)}, p10 ${wq(0.1)}, median ${wq(0.5)}, p90 ${wq(0.9)}, max ${wq(1)}`,
	);
	console.log(`time: ${((performance.now() - started) / 1000).toFixed(1)}s`);
	if (skipped.length > 0) console.log(`skipped names: ${skipped.join(", ")}`);
	if (invalid.length > 0) console.log(`invalid names: ${invalid.join(", ")}`);
	process.exitCode = exitCode({ skipped, invalid });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
