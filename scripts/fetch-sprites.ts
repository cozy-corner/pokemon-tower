import { existsSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const INDEX_URL = "https://pokemondb.net/sprites";
const IMAGE_URL = "https://img.pokemondb.net/sprites/home/normal/1x";
const HEADERS = { "User-Agent": "Mozilla/5.0" };
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const DELAY_MS = 100;

export function parseNames(html: string): string[] {
	const names = new Set<string>();
	for (const m of html.matchAll(/href="\/sprites\/([a-z0-9-]+)"/g)) {
		names.add(m[1]);
	}
	return [...names].sort();
}

export async function fetchSprites(
	names: string[],
	outDir: string,
): Promise<{ ok: string[]; failed: string[] }> {
	await mkdir(outDir, { recursive: true });
	const ok: string[] = [];
	const failed: string[] = [];
	for (const name of names) {
		const path = join(outDir, `${name}.png`);
		if (existsSync(path)) {
			ok.push(name);
			continue;
		}
		try {
			const res = await fetch(`${IMAGE_URL}/${name}.png`, { headers: HEADERS });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			// Rename after a complete write so an interrupted run never leaves a partial .png that the skip check would trust.
			const body = new Uint8Array(await res.arrayBuffer());
			// The CDN can answer 200 with an HTML block page when it dislikes the client.
			if (!PNG_SIGNATURE.every((b, i) => body[i] === b))
				throw new Error("not a PNG");
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
	return { ok, failed };
}

async function main(): Promise<void> {
	const res = await fetch(INDEX_URL, { headers: HEADERS });
	if (!res.ok) throw new Error(`index page: HTTP ${res.status}`);
	const names = parseNames(await res.text());
	await mkdir("data", { recursive: true });
	await writeFile("data/names.json", `${JSON.stringify(names, null, "\t")}\n`);
	const { ok, failed } = await fetchSprites(names, "public/sprites");
	console.log(`ok: ${ok.length}, failed: ${failed.length}`);
	if (failed.length > 0) {
		console.log(`failed names: ${failed.join(", ")}`);
		process.exitCode = 1;
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
