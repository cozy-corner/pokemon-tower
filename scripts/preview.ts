import exclusions from "../data/exclusions.json";
import flagged from "../data/flagged.json";
import names from "../data/names.json";
import type { Shape } from "../src/geometry/types";

/** Preview zoom: pixels per world meter. */
const PX_PER_METER = 120;

const el = <T extends HTMLElement>(id: string) =>
	document.getElementById(id) as T;
const canvas = el<HTMLCanvasElement>("view");
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
canvas.width = 4 * PX_PER_METER;
canvas.height = 4 * PX_PER_METER;

const flaggedMap: Record<string, string[]> = flagged;
const excluded = new Set<string>(exclusions);
async function loadShapes(): Promise<Record<string, Shape>> {
	try {
		const res = await fetch("/shapes.json");
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		return await res.json();
	} catch {
		const message = "shapes.json not found: run bun run build-shapes";
		el("name").textContent = message;
		// Throwing stops the rest of the module from wiring up a dead page.
		throw new Error(message);
	}
}
const shapes = await loadShapes();

el("names").replaceChildren(
	...names.map((n) =>
		Object.assign(document.createElement("option"), { value: n }),
	),
);

let list: string[] = names;
let index = 0;

function loadImage(name: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error(`no sprite: ${name}`));
		img.src = `/sprites/${name}.svg`;
	});
}

async function draw(): Promise<void> {
	const name = list[index];
	el("position").textContent = name ? `${index + 1} / ${list.length}` : "0 / 0";
	el("name").textContent = name ?? "(none)";
	el("excluded").hidden = !name || !excluded.has(name);
	if (!name) {
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		return;
	}
	const shape = shapes[name];
	el("stats").textContent = shape
		? `pieces ${shape.polygons.length}, components ${shape.stats.components}, fillOverHull ${shape.stats.fillOverHull}, thin ${shape.stats.thin}`
		: "no shape";
	el("flags").textContent = (flaggedMap[name] ?? []).join(", ");
	try {
		const img = await loadImage(name);
		if (list[index] !== name) return;
		if (shape) {
			canvas.width = Math.round(shape.size.w * PX_PER_METER);
			canvas.height = Math.round(shape.size.h * PX_PER_METER);
		}
		ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
	} catch {
		// Outlines are still drawn when the image is missing.
		ctx.clearRect(0, 0, canvas.width, canvas.height);
	}
	if (list[index] !== name || !shape) return;
	const px = PX_PER_METER;
	shape.polygons.forEach((poly, i) => {
		const hue = (i * 47) % 360;
		ctx.beginPath();
		poly.forEach((p, j) => {
			const x = canvas.width / 2 + p.x * px;
			const y = canvas.height / 2 + p.y * px;
			if (j === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		});
		ctx.closePath();
		ctx.fillStyle = `hsla(${hue} 80% 50% / 0.3)`;
		ctx.strokeStyle = `hsl(${hue} 80% 35%)`;
		ctx.fill();
		ctx.stroke();
	});
}

function setList(next: string[], keep?: string): void {
	list = next;
	index = Math.max(0, keep ? list.indexOf(keep) : 0);
	void draw();
}

const step = (d: number) => {
	if (list.length === 0) return;
	index = (index + d + list.length) % list.length;
	void draw();
};

const search = el<HTMLInputElement>("search");
const flaggedOnly = el<HTMLInputElement>("flaggedOnly");
const applyFilter = (keep?: string) =>
	setList(
		flaggedOnly.checked ? names.filter((n) => n in flaggedMap) : names,
		keep,
	);

el("prev").addEventListener("click", () => step(-1));
el("next").addEventListener("click", () => step(1));
flaggedOnly.addEventListener("change", () => applyFilter(list[index]));
search.addEventListener("input", () => {
	const q = search.value.trim().toLowerCase();
	const hit = list.findIndex((n) => n.startsWith(q));
	const i = hit >= 0 ? hit : list.findIndex((n) => n.includes(q));
	if (q && i >= 0) {
		index = i;
		void draw();
	}
});
window.addEventListener("keydown", (e) => {
	if (e.target === search) return;
	if (e.key === "ArrowLeft") step(-1);
	if (e.key === "ArrowRight") step(1);
});

applyFilter();
