import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const INDEX_URL = "https://pokemondb.net/sprites";
const DEX_URL = "https://pokemondb.net/pokedex/national";
const IMAGE_URL =
	"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/dream-world";
const HEADERS = { "User-Agent": "Mozilla/5.0" };
const NAMES_PATH = "data/names.json";
const DEX_PATH = "data/dex.json";
const EXCLUSIONS_PATH = "data/exclusions.json";
/** Hand-edited names to leave out as well; fetching never overwrites it. */
const EXTRA_EXCLUSIONS_PATH = "data/exclusions-extra.json";
const DELAY_MS = 100;

export function parseNames(html: string): string[] {
	const names = new Set<string>();
	for (const m of html.matchAll(/href="\/sprites\/([a-z0-9-]+)"/g)) {
		names.add(m[1]);
	}
	return [...names].sort();
}

/** National dex numbers by name, from the `<small>#0025</small> ... href="/pokedex/pikachu"` cards. */
export function parseDex(html: string): Record<string, number> {
	const dex: Record<string, number> = {};
	for (const m of html.matchAll(
		/<small>#(\d+)<\/small>\s*<br>\s*<a class="ent-name" href="\/pokedex\/([a-z0-9-]+)"/g,
	)) {
		dex[m[2]] ??= Number(m[1]);
	}
	return dex;
}

export const isSvg = (body: Uint8Array): boolean =>
	/^(\uFEFF)?\s*<(svg|\?xml)\b/.test(
		new TextDecoder().decode(body.slice(0, 256)),
	);

// Pokemon lists only grow; a shorter or empty result means the page layout changed or the fetch was bad.
export function assertNotShrinking(existing: string[], next: string[]): void {
	if (next.length === 0 || next.length < existing.length) {
		throw new Error(
			`refusing to overwrite names: ${existing.length} -> ${next.length}`,
		);
	}
}

export type Download = { name: string; url: string };

/** `missing` are names the host answers 404 for: no image exists, which is not a failure. */
export async function fetchSprites(
	items: Download[],
	outDir: string,
): Promise<{ ok: string[]; missing: string[]; failed: string[] }> {
	await mkdir(outDir, { recursive: true });
	const ok: string[] = [];
	const missing: string[] = [];
	const failed: string[] = [];
	for (const { name, url } of items) {
		const path = join(outDir, `${name}.svg`);
		if (existsSync(path)) {
			ok.push(name);
			continue;
		}
		try {
			const res = await fetch(url, { headers: HEADERS });
			if (res.status === 404) {
				missing.push(name);
				continue;
			}
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			// Rename after a complete write so an interrupted run never leaves a partial .svg that the skip check would trust.
			const body = new Uint8Array(await res.arrayBuffer());
			// A host can answer 200 with an HTML error page.
			if (!isSvg(body)) throw new Error("not an SVG");
			const tmpPath = `${path}.part`;
			await writeFile(tmpPath, body);
			await rename(tmpPath, path);
			ok.push(name);
		} catch (e) {
			console.error(
				`failed: ${name} (${e instanceof Error ? e.message : String(e)})`,
			);
			failed.push(name);
		}
		await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
	}
	return { ok, missing, failed };
}

async function main(): Promise<void> {
	const res = await fetch(INDEX_URL, { headers: HEADERS });
	if (!res.ok) throw new Error(`index page: HTTP ${res.status}`);
	const names = parseNames(await res.text());
	if (existsSync(NAMES_PATH)) {
		assertNotShrinking(JSON.parse(await readFile(NAMES_PATH, "utf8")), names);
	}
	await mkdir("data", { recursive: true });
	await writeFile(NAMES_PATH, `${JSON.stringify(names, null, "\t")}\n`);
	const dexRes = await fetch(DEX_URL, { headers: HEADERS });
	if (!dexRes.ok) throw new Error(`national dex page: HTTP ${dexRes.status}`);
	const dex = parseDex(await dexRes.text());
	const noDex = names.filter((n) => !(n in dex));
	if (noDex.length > 0)
		throw new Error(`no dex number for: ${noDex.join(", ")}`);
	await writeFile(
		DEX_PATH,
		`${JSON.stringify(Object.fromEntries(names.map((n) => [n, dex[n]])), null, "\t")}\n`,
	);
	const items = names.map((name) => ({
		name,
		url: `${IMAGE_URL}/${dex[name]}.svg`,
	}));
	const { ok, missing, failed } = await fetchSprites(items, "public/sprites");
	// exclusions.json is derived: names without an image plus the hand-edited extras.
	const extra: string[] = existsSync(EXTRA_EXCLUSIONS_PATH)
		? JSON.parse(await readFile(EXTRA_EXCLUSIONS_PATH, "utf8"))
		: [];
	const excluded = [...new Set([...missing, ...extra])].sort((a, b) =>
		a < b ? -1 : a > b ? 1 : 0,
	);
	await writeFile(EXCLUSIONS_PATH, `${JSON.stringify(excluded, null, "\t")}\n`);
	console.log(
		`ok: ${ok.length}, excluded: ${excluded.length} (missing ${missing.length}), failed: ${failed.length}`,
	);
	if (failed.length > 0) {
		console.log(`failed names: ${failed.join(", ")}`);
		process.exitCode = 1;
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
