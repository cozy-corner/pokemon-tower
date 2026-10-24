import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import type { OutlineResult, Vec } from "../src/geometry/types";
import {
	computeOutline,
	cross,
	MAX_POLYGON_VERTICES,
	type Mask,
	polygonArea,
} from "./outline";

export type FlagReason = "multi-island" | "low-fill" | "thin";

const LOW_FILL = 0.45;
const DECIMALS = 4;

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

export function buildShapes(
	names: string[],
	loadMask: (name: string) => Mask | null,
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
		const raw = computeOutline(mask);
		const result = roundResult(raw);
		shapes[name] = result;
		if (!result.polygons.every(isValidPiece)) invalid.push(name);
		const reasons = flagReasons(raw);
		if (reasons.length > 0) flagged[name] = reasons;
	}
	return { shapes, skipped, flagged, invalid };
}

async function loadPngMask(name: string): Promise<Mask> {
	const png = PNG.sync.read(await readFile(root(`public/sprites/${name}.png`)));
	const alpha = Uint8Array.from(
		{ length: png.width * png.height },
		(_, i) => png.data[i * 4 + 3],
	);
	return { alpha, w: png.width, h: png.height };
}

async function main(): Promise<void> {
	const started = performance.now();
	const names: string[] = JSON.parse(
		await readFile(root("data/names.json"), "utf8"),
	);
	const masks = new Map<string, Mask>();
	for (const name of names) {
		try {
			masks.set(name, await loadPngMask(name));
		} catch (e) {
			console.error(
				`unreadable: ${name} (${e instanceof Error ? e.message : String(e)})`,
			);
		}
	}
	const { shapes, skipped, flagged, invalid } = buildShapes(
		names,
		(name) => masks.get(name) ?? null,
	);
	await mkdir(root("data"), { recursive: true });
	await writeFile(root("public/shapes.json"), JSON.stringify(shapes));
	await writeFile(
		root("data/flagged.json"),
		`${JSON.stringify(flagged, null, "\t")}\n`,
	);
	// exclusions.json is hand-edited, so it is only created when absent.
	await writeFile(root("data/exclusions.json"), "[]\n", { flag: "wx" }).catch(
		(e) => {
			if (e.code !== "EEXIST") throw e;
		},
	);

	const byReason = (r: FlagReason) =>
		Object.values(flagged).filter((rs) => rs.includes(r)).length;
	const pieces = Object.values(shapes)
		.map((s) => s.polygons.length)
		.sort((a, b) => a - b);
	const at = (q: number) => pieces[Math.floor(q * (pieces.length - 1))];
	console.log(
		`computed: ${Object.keys(shapes).length}, skipped: ${skipped.length}, invalid after rounding: ${invalid.length}`,
	);
	console.log(
		`flagged: ${Object.keys(flagged).length} (multi-island ${byReason("multi-island")}, low-fill ${byReason("low-fill")}, thin ${byReason("thin")})`,
	);
	console.log(
		`pieces per sprite: min ${pieces[0]}, median ${at(0.5)}, p95 ${at(0.95)}, max ${pieces.at(-1)}`,
	);
	console.log(`time: ${((performance.now() - started) / 1000).toFixed(1)}s`);
	if (skipped.length > 0) console.log(`skipped names: ${skipped.join(", ")}`);
	if (invalid.length > 0) {
		console.log(`invalid names: ${invalid.join(", ")}`);
		process.exitCode = 1;
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
