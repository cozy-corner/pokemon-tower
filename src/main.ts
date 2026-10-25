import exclusions from "../data/exclusions.json";
import names from "../data/names.json";
import { createGame } from "./game/game";
import type { Vec } from "./geometry/types";
import { createControls } from "./input/controls";
import { createWorld } from "./physics/world";
import { createRenderer } from "./render/renderer";

type Shapes = Record<string, { polygons: Vec[][] }>;

const STEP_S = 1 / 60;
// After a long stall (hidden tab) drop the backlog instead of fast-forwarding.
const MAX_STEPS_PER_FRAME = 5;
const RECORD_KEY = "pokemon-tower.best";

const el = (id: string) => {
	const node = document.getElementById(id);
	if (!node) throw new Error(`#${id} missing`);
	return node;
};
const canvas = el("game") as HTMLCanvasElement;
const shapes: Shapes = await (await fetch("/shapes.json")).json();

type Best = { count: number; height: number };
const loadBest = (): Best => {
	try {
		const saved = JSON.parse(localStorage.getItem(RECORD_KEY) ?? "null");
		if (saved) return saved;
	} catch {}
	return { count: 0, height: 0 };
};
const saveBest = (best: Best) => {
	try {
		localStorage.setItem(RECORD_KEY, JSON.stringify(best));
	} catch {}
};

const sprites = new Map<string, HTMLImageElement>();
const world = createWorld();
const game = createGame({
	world,
	names,
	excluded: new Set(exclusions),
	polygonsOf: (name) => shapes[name].polygons,
	rand: Math.random,
});

const ensureSprite = (name: string) => {
	if (sprites.has(name)) return;
	const img = new Image();
	img.onerror = () => {
		sprites.delete(name);
		game.reportBroken(name);
	};
	img.src = `/sprites/${name}.png`;
	sprites.set(name, img);
};

const best = loadBest();
let shown = "";
const updateHud = () => {
	const h = game.heightM;
	if (game.stackedCount > best.count || h > best.height) {
		best.count = Math.max(best.count, game.stackedCount);
		best.height = Math.max(best.height, h);
		saveBest(best);
	}
	const key = `${game.stackedCount}/${h.toFixed(1)}`;
	if (key === shown) return;
	shown = key;
	el("count").textContent = String(game.stackedCount);
	el("height").textContent = h.toFixed(1);
	el("best-count").textContent = String(best.count);
	el("best-height").textContent = best.height.toFixed(1);
};

createControls(canvas, el("rotate"), {
	onMove: (x) => game.move(x),
	onRotate: () => game.rotate(),
	onDrop: () => {
		// An invisible piece would stay on the tower.
		const img = game.held && sprites.get(game.held.id);
		if (img?.complete && img.naturalWidth > 0) game.drop();
	},
});

const renderer = createRenderer(canvas, sprites);
let last: number | null = null;
let acc = 0;
const frame = (now: number) => {
	acc += last === null ? 0 : (now - last) / 1000;
	last = now;
	acc = Math.min(acc, MAX_STEPS_PER_FRAME * STEP_S);
	for (; acc >= STEP_S; acc -= STEP_S) game.step(STEP_S);
	if (game.held) ensureSprite(game.held.id);
	ensureSprite(game.upcoming);
	updateHud();
	renderer.draw(game.pieces(), game.held);
	requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
