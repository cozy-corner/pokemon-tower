import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const DEX_PATH = "data/dex.json";
const HEIGHTS_PATH = "data/heights.json";
const API_URL = "https://pokeapi.co/api/v2/pokemon";
const DELAY_MS = 100;

async function main(): Promise<void> {
	const dex: Record<string, number> = JSON.parse(
		await readFile(DEX_PATH, "utf8"),
	);
	const heights: Record<string, number> = {};
	for (const [name, num] of Object.entries(dex)) {
		// The dex number returns the default form, which is what the sprite draws.
		const res = await fetch(`${API_URL}/${num}`);
		if (!res.ok) throw new Error(`${name} (#${num}): HTTP ${res.status}`);
		// PokeAPI stores height in decimetres.
		const { height } = (await res.json()) as { height: number };
		heights[name] = height / 10;
		await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
	}
	await writeFile(HEIGHTS_PATH, `${JSON.stringify(heights, null, "\t")}\n`);
	console.log(`heights: ${Object.keys(heights).length}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
