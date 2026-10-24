import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
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
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const tmp = () => mkdtemp(join(tmpdir(), "sprites-"));

	it("skips names whose image already exists without calling fetch", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const dir = await tmp();
		await writeFile(join(dir, "pikachu.png"), "x");
		expect(await fetchSprites(["pikachu"], dir)).toEqual({
			ok: ["pikachu"],
			failed: [],
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("records non-200 and thrown errors as failed and keeps going", async () => {
		const fetchMock = vi.fn(async (url: string) => {
			if (url.endsWith("/missing.png"))
				return new Response("", { status: 404 });
			if (url.endsWith("/boom.png")) throw new Error("network");
			return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);
		const dir = await tmp();
		const result = await fetchSprites(["missing", "boom", "eevee"], dir);
		expect(result).toEqual({ ok: ["eevee"], failed: ["missing", "boom"] });
		expect(existsSync(join(dir, "eevee.png"))).toBe(true);
		expect(existsSync(join(dir, "missing.png"))).toBe(false);
	});

	it("sends a User-Agent header", async () => {
		const fetchMock = vi.fn(
			async () => new Response(new Uint8Array([1]), { status: 200 }),
		);
		vi.stubGlobal("fetch", fetchMock);
		await fetchSprites(["mew"], await tmp());
		expect(fetchMock).toHaveBeenCalledWith(
			"https://img.pokemondb.net/sprites/home/normal/1x/mew.png",
			{ headers: { "User-Agent": "Mozilla/5.0" } },
		);
	});
});
