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
import {
	assertNotShrinking,
	fetchSprites,
	isSvg,
	parseDex,
	parseNames,
} from "./fetch-sprites";

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

describe("parseDex", () => {
	it("reads the number and name from each card, first card wins", () => {
		const card = (n: string, name: string) =>
			`<span class="infocard-lg-data"><small>#${n}</small><br> <a class="ent-name" href="/pokedex/${name}">X</a><br></span>`;
		expect(
			parseDex(
				card("0025", "pikachu") +
					card("0122", "mr-mime") +
					card("0999", "pikachu"),
			),
		).toEqual({ pikachu: 25, "mr-mime": 122 });
	});
});

describe("isSvg", () => {
	const bytes = (t: string) => new TextEncoder().encode(t);
	it("accepts svg and xml prologs", () => {
		expect(isSvg(bytes('<svg xmlns="x"></svg>'))).toBe(true);
		expect(isSvg(bytes('\n<?xml version="1.0"?><svg/>'))).toBe(true);
	});
	it("rejects HTML", () => {
		expect(isSvg(bytes("<html>blocked</html>"))).toBe(false);
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

const svgBody = (extra = "") =>
	new TextEncoder().encode(`<svg xmlns="x">${extra}</svg>`);
const item = (name: string) => ({ name, url: `https://host/${name}.svg` });

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
		await writeFile(join(dir, "pikachu.svg"), "x");
		expect(await fetchSprites([item("pikachu")], dir)).toEqual({
			ok: ["pikachu"],
			missing: [],
			failed: [],
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("records a 404 as missing without logging or writing a file", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("", { status: 404 })),
		);
		const dir = await tmp();
		expect(await fetchSprites([item("gone")], dir)).toEqual({
			ok: [],
			missing: ["gone"],
			failed: [],
		});
		expect(await readdir(dir)).toEqual([]);
		expect(log).not.toHaveBeenCalled();
	});

	it("records HTTP 500 as failed, writes no file and logs the status", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("", { status: 500 })),
		);
		const dir = await tmp();
		expect(await fetchSprites([item("bad")], dir)).toEqual({
			ok: [],
			missing: [],
			failed: ["bad"],
		});
		expect(existsSync(join(dir, "bad.svg"))).toBe(false);
		expect(log).toHaveBeenCalledWith(expect.stringContaining("bad (HTTP 500)"));
	});

	it("records a thrown network error as failed, writes no file and logs the error", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("network");
			}),
		);
		const dir = await tmp();
		expect(await fetchSprites([item("boom")], dir)).toEqual({
			ok: [],
			missing: [],
			failed: ["boom"],
		});
		expect(existsSync(join(dir, "boom.svg"))).toBe(false);
		expect(log).toHaveBeenCalledWith(expect.stringContaining("boom (network)"));
	});

	it("keeps fetching the remaining names after one fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) =>
				url.endsWith("/bad.svg")
					? new Response("", { status: 500 })
					: new Response(svgBody(), { status: 200 }),
			),
		);
		const dir = await tmp();
		expect(await fetchSprites([item("bad"), item("eevee")], dir)).toEqual({
			ok: ["eevee"],
			missing: [],
			failed: ["bad"],
		});
		expect(existsSync(join(dir, "eevee.svg"))).toBe(true);
	});

	it("fetches the given url with a User-Agent header", async () => {
		const fetchMock = vi.fn(
			async () => new Response(svgBody(), { status: 200 }),
		);
		vi.stubGlobal("fetch", fetchMock);
		await fetchSprites([item("mew")], await tmp());
		expect(fetchMock).toHaveBeenCalledWith("https://host/mew.svg", {
			headers: { "User-Agent": "Mozilla/5.0" },
		});
	});

	it("writes the full body to the final path and leaves no .part file", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(svgBody("<g/>"), { status: 200 })),
		);
		const dir = await tmp();
		await fetchSprites([item("mew")], dir);
		expect(await readFile(join(dir, "mew.svg"), "utf8")).toBe(
			'<svg xmlns="x"><g/></svg>',
		);
		expect(await readdir(dir)).toEqual(["mew.svg"]);
	});

	it("treats a 200 non-SVG body as failed, writes nothing and logs the reason", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("<html>blocked</html>", { status: 200 })),
		);
		const dir = await tmp();
		expect(await fetchSprites([item("mew")], dir)).toEqual({
			ok: [],
			missing: [],
			failed: ["mew"],
		});
		expect(await readdir(dir)).toEqual([]);
		expect(log).toHaveBeenCalledWith(
			expect.stringContaining("mew (not an SVG)"),
		);
	});
});
