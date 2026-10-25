import exclusions from "../data/exclusions.json";
import names from "../data/names.json";
import { createGame } from "./game/game";
import type { Shape } from "./geometry/types";
import { createControls } from "./input/controls";
import { createWorld } from "./physics/world";
import { createRenderer, isReady } from "./render/renderer";

type Shapes = Record<string, Shape>;

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
		// localStorage is user-editable; a bad shape would put NaN on the HUD every frame.
		if (Number.isFinite(saved?.count) && Number.isFinite(saved?.height)) {
			return { count: saved.count, height: saved.height };
		}
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
	img.src = `/sprites/${name}.svg`;
	sprites.set(name, img);
};

const best = loadBest();
let shown = "";
let shownPiece = "";
const updateLabel = () => {
	const held = game.held;
	if (!held) return;
	const key = `${game.pieceNumber}.${held.id}`;
	if (key === shownPiece) return;
	shownPiece = key;
	el("piece-no").textContent = String(game.pieceNumber);
	el("piece-name").textContent = held.id.replaceAll("-", " ");
};
const updateHud = () => {
	updateLabel();
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

createControls(
	canvas,
	{ rotate: el("rotate"), drop: el("drop") },
	{
		onMove: (x) => game.move(x),
		onNudge: (dx) => game.move((game.held?.x ?? 0) + dx),
		onRotate: () => game.rotate(),
		onDrop: () => {
			// An invisible piece would stay on the tower.
			const img = game.held && sprites.get(game.held.id);
			if (img && isReady(img)) game.drop();
		},
	},
);

const renderer = createRenderer(canvas, sprites, (name) => shapes[name].size);
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
