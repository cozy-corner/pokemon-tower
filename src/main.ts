import type { Vec } from "./geometry/types";
import { createWorld } from "./physics/world";
import { createRenderer } from "./render/renderer";

type Shapes = Record<string, { polygons: Vec[][] }>;

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("#game missing");
const shapes: Shapes = await (await fetch("/shapes.json")).json();

const ids = ["abra", "absol", "abomasnow", "accelgor", "aegislash", "arceus"];
const sprites = new Map<string, HTMLImageElement>();
await Promise.all(
	ids.map(
		(id) =>
			new Promise<void>((resolve) => {
				const img = new Image();
				img.onload = img.onerror = () => resolve();
				img.src = `/sprites/${id}.png`;
				sprites.set(id, img);
			}),
	),
);

const world = createWorld();
for (const [i, id] of ids.entries()) {
	world.addPiece(id, shapes[id].polygons, i % 2 ? 0.4 : -0.4, 0);
}
const renderer = createRenderer(canvas, sprites);
const frame = () => {
	world.step(1 / 60);
	renderer.draw(world.pieces(), null);
	requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
