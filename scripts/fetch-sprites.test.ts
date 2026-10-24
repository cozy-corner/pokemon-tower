import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	type MockInstance,
	vi,
} from "vitest";
import { assertNotShrinking, fetchSprites, parseNames } from "./fetch-sprites";

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

describe("assertNotShrinking", () => {
	it("throws on an empty list", () => {
		expect(() => assertNotShrinking(["a"], [])).toThrow();
	});

	it("throws when the new list is shorter", () => {
		expect(() => assertNotShrinking(["a", "b"], ["a"])).toThrow();
	});

	it("passes for equal or longer lists", () => {
		expect(() => assertNotShrinking(["a"], ["a"])).not.toThrow();
		expect(() => assertNotShrinking(["a"], ["a", "b"])).not.toThrow();
		expect(() => assertNotShrinking([], ["a"])).not.toThrow();
	});
});

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const pngBody = (...rest: number[]) =>
	new Uint8Array([...PNG_SIGNATURE, ...rest]);

describe("fetchSprites", () => {
	let log: MockInstance;
	beforeEach(() => {
		log = vi.spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
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

	it.each([404, 500])(
		"records HTTP %i as failed, writes no file and logs the status",
		async (status) => {
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => new Response("", { status })),
			);
			const dir = await tmp();
			expect(await fetchSprites(["missing"], dir)).toEqual({
				ok: [],
				failed: ["missing"],
			});
			expect(existsSync(join(dir, "missing.png"))).toBe(false);
			expect(log).toHaveBeenCalledWith(
				expect.stringContaining(`missing (HTTP ${status})`),
			);
		},
	);

	it("records a thrown network error as failed, writes no file and logs the error", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("network");
			}),
		);
		const dir = await tmp();
		expect(await fetchSprites(["boom"], dir)).toEqual({
			ok: [],
			failed: ["boom"],
		});
		expect(existsSync(join(dir, "boom.png"))).toBe(false);
		expect(log).toHaveBeenCalledWith(expect.stringContaining("boom (network)"));
	});

	it("keeps fetching the remaining names after one fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) =>
				url.endsWith("/missing.png")
					? new Response("", { status: 404 })
					: new Response(pngBody(1, 2, 3), { status: 200 }),
			),
		);
		const dir = await tmp();
		expect(await fetchSprites(["missing", "eevee"], dir)).toEqual({
			ok: ["eevee"],
			failed: ["missing"],
		});
		expect(existsSync(join(dir, "eevee.png"))).toBe(true);
	});

	it("sends a User-Agent header", async () => {
		const fetchMock = vi.fn(
			async () => new Response(pngBody(1), { status: 200 }),
		);
		vi.stubGlobal("fetch", fetchMock);
		await fetchSprites(["mew"], await tmp());
		expect(fetchMock).toHaveBeenCalledWith(
			"https://img.pokemondb.net/sprites/home/normal/1x/mew.png",
			{ headers: { "User-Agent": "Mozilla/5.0" } },
		);
	});

	it("writes the full body to the final path and leaves no .part file", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(pngBody(9, 8, 7), { status: 200 })),
		);
		const dir = await tmp();
		await fetchSprites(["mew"], dir);
		expect([...(await readFile(join(dir, "mew.png")))]).toEqual([
			...PNG_SIGNATURE,
			9,
			8,
			7,
		]);
		expect(await readdir(dir)).toEqual(["mew.png"]);
	});

	it("treats a 200 non-PNG body as failed, writes nothing and logs the reason", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("<html>blocked</html>", { status: 200 })),
		);
		const dir = await tmp();
		expect(await fetchSprites(["mew"], dir)).toEqual({
			ok: [],
			failed: ["mew"],
		});
		expect(await readdir(dir)).toEqual([]);
		expect(log).toHaveBeenCalledWith(
			expect.stringContaining("mew (not a PNG)"),
		);
	});
});
