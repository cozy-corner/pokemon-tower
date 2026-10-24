import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fetchSprites, parseNames } from "./fetch-sprites";

describe("parseNames", () => {
	it("extracts a name from a sprite link", () => {
		expect(parseNames('<a href="/sprites/pikachu">Pikachu</a>')).toEqual([
			"pikachu",
		]);
	});

	it("dedupes, sorts, and ignores the bare and non-matching links", () => {
		const html = [
			'<a href="/sprites/">All</a>',
			'<a href="/sprites/mr-mime">a</a>',
			'<a href="/sprites/bulbasaur">b</a>',
			'<a href="/sprites/bulbasaur">b again</a>',
			'<a href="/sprites/Bad_Name">x</a>',
			'<a href="/sprites/type/fire">y</a>',
		].join("");
		expect(parseNames(html)).toEqual(["bulbasaur", "mr-mime"]);
	});
});

describe("fetchSprites", () => {
	it("skips names whose image already exists", async () => {
		const dir = await mkdtemp(join(tmpdir(), "sprites-"));
		await writeFile(join(dir, "pikachu.png"), "x");
		expect(await fetchSprites(["pikachu"], dir)).toEqual({
			ok: ["pikachu"],
			failed: [],
		});
	});
});
