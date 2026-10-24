import { describe, expect, it } from "vitest";
import shapes from "../../public/shapes.json";
import { polygonArea } from "../geometry/polygon";
import type { OutlineResult, Vec } from "../geometry/types";
import {
	createWorld,
	PEDESTAL_HALF_WIDTH,
	PEDESTAL_TOP_Y,
	type Piece,
	SPAWN_CLEARANCE,
	type World,
} from "./world";

const DT = 1 / 60;
// Matches the game's planned spawn timeout: the next piece comes when the
// tower sleeps or after this long, whichever is first.
const DROP_TIMEOUT_S = 3;
const SETTLE_S = 5;
const OBSERVE_S = 25;
const MAX_DRIFT_M = 0.01;
const MAX_TURN_RAD = 0.01;
// Slack for float error in the spawn-height checks.
const EPS = 1e-6;

const all = shapes as Record<string, OutlineResult>;

const box = (hw: number, hh: number, cx = 0, cy = 0): Vec[] => [
	{ x: cx - hw, y: cy - hh },
	{ x: cx + hw, y: cy - hh },
	{ x: cx + hw, y: cy + hh },
	{ x: cx - hw, y: cy + hh },
];

const run = (world: World, seconds: number, until?: () => boolean) => {
	const steps = Math.round(seconds / DT);
	for (let i = 0; i < steps && !until?.(); i++) world.step(DT);
};

type Pose = { x: number; y: number; angle: number };
const pose = (p: Piece): Pose => ({ x: p.x, y: p.y, angle: p.angle });

const movement = (p: Piece, before: Pose) => {
	const drift = Math.hypot(p.x - before.x, p.y - before.y);
	const turn = Math.abs(p.angle - before.angle);
	return { drift, turn, still: drift < MAX_DRIFT_M && turn < MAX_TURN_RAD };
};

const onPedestal = (p: Piece) => p.y < PEDESTAL_TOP_Y;

/** Drops each piece once the previous one sleeps (or times out), then checks
 * that nothing on the pedestal moves between t = 5 s and t = 30 s. */
type Drop = { id: string; polygons: Vec[][]; x: number; angle?: number };
const dropAndWatch = (drops: Drop[]) => {
	const world = createWorld();
	for (const d of drops) {
		const piece = world.addPiece(d.id, d.polygons, d.x, d.angle ?? 0);
		run(world, DROP_TIMEOUT_S, () => piece.asleep);
	}
	run(world, SETTLE_S);
	const standing = world.pieces().filter(onPedestal);
	const before = standing.map(pose);
	run(world, OBSERVE_S);
	const moved = standing
		.map((p, i) => ({ id: p.id, asleep: p.asleep, ...movement(p, before[i]) }))
		.filter((m) => !m.still || !m.asleep);
	return { world, standing, moved };
};

describe("createWorld", () => {
	it("has no pieces at first", () => {
		expect(createWorld().pieces()).toEqual([]);
	});

	it("drops a piece onto the pedestal and lets it sleep", () => {
		const world = createWorld();
		const piece = world.addPiece("a", [box(0.5, 0.5)], 0, 0);
		expect(piece.y).toBeLessThanOrEqual(
			PEDESTAL_TOP_Y - 0.5 - SPAWN_CLEARANCE + EPS,
		);
		run(world, 5);
		expect(piece.asleep).toBe(true);
		expect(piece.y).toBeCloseTo(PEDESTAL_TOP_Y - 0.5, 1);
		expect(piece.x).toBeCloseTo(0, 3);
	});

	it("spawns above the highest piece", () => {
		const world = createWorld();
		const low = world.addPiece("low", [box(0.5, 0.5)], 0, 0);
		run(world, 5);
		const high = world.addPiece("high", [box(0.5, 0.5)], 0, 0);
		expect(high.y + 0.5).toBeLessThanOrEqual(
			low.y - 0.5 - SPAWN_CLEARANCE + EPS,
		);
	});

	it("puts every polygon of a piece on one body", () => {
		const world = createWorld();
		const { polygons } = all.abomasnow;
		const piece = world.addPiece("abomasnow", polygons, 0, 0);
		const info = world.inspect(piece);
		expect(info.fixtures).toBe(polygons.length);
		// Density 1, so mass equals the summed area.
		const total = polygons.reduce((s, p) => s + Math.abs(polygonArea(p)), 0);
		expect(info.mass).toBeGreaterThan(0);
		expect(info.mass).toBeCloseTo(total, 6);
	});

	it("gives the same mass for either winding", () => {
		const world = createWorld();
		const cw = world.addPiece("cw", [box(1, 0.5)], 0, 0);
		const ccw = world.addPiece("ccw", [box(1, 0.5).reverse()], 0, 0);
		expect(world.inspect(cw).mass).toBeCloseTo(2, 9);
		expect(world.inspect(ccw).mass).toBeCloseTo(2, 9);
	});

	it("rejects polygons Planck would silently replace", () => {
		const world = createWorld();
		const line = [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
		];
		const many = Array.from({ length: 13 }, (_, i) => ({
			x: Math.cos((i / 13) * 2 * Math.PI),
			y: Math.sin((i / 13) * 2 * Math.PI),
		}));
		expect(() => world.addPiece("none", [], 0, 0)).toThrow();
		expect(() => world.addPiece("line", [line], 0, 0)).toThrow();
		expect(() => world.addPiece("many", [many], 0, 0)).toThrow();
		expect(world.pieces()).toEqual([]);
	});

	it("removes pieces and rejects duplicate ids", () => {
		const world = createWorld();
		const a = world.addPiece("a", [box(0.5, 0.5)], 0, 0);
		const b = world.addPiece("b", [box(0.5, 0.5)], 0, 0);
		expect(() => world.addPiece("a", [box(0.5, 0.5)], 0, 0)).toThrow();
		world.remove(a);
		expect(world.pieces()).toEqual([b]);
		expect(() => world.inspect(a)).toThrow();
	});

	it("keeps a stack of blocks still for 30 seconds", () => {
		const drops = [
			{ id: "wide", polygons: [box(1.5, 0.4)], x: 0 },
			{
				id: "l",
				polygons: [box(1, 0.25, 0, 0.5), box(0.25, 0.5, -0.75, 0)],
				x: 0,
			},
			// As tall as the L's upright, so "flat" bridges them level.
			{ id: "post", polygons: [box(0.3, 0.375)], x: 0.5 },
			{ id: "flat", polygons: [box(1.2, 0.2)], x: 0 },
			{ id: "tall", polygons: [box(0.4, 1)], x: 0 },
		];
		const { standing, moved } = dropAndWatch(drops);
		expect(standing).toHaveLength(drops.length);
		expect(moved).toEqual([]);
	});

	// Regression pin, pinned to FRICTION 0.6, SPAWN_CLEARANCE 0.5, the 6x1 m
	// pedestal and Planck 1.5.1: any change topples it; regenerate the pin.
	// Found by an offline greedy search: per piece, in this order, try angles
	// (multiples of PI/4) then x in 0.25 m steps up to ±1.25, replaying all
	// drops in a fresh world; keep the first where everything stays on the
	// pedestal and sleeps. bulbasaur was prepended by hand to fall off.
	it("pins a 9-high tower of real sprites for the current tuning", () => {
		const placements: [string, number, number][] = [
			["bulbasaur", -2.5, 0],
			["snorlax", 0, 0],
			["abomasnow", 0, 0],
			["amoonguss", 0.5, 0],
			["ambipom", 0.5, 0],
			["arbok", 0.75, Math.PI],
			["charizard", 0.25, 0],
			["pikachu", 0.75, Math.PI / 2],
			["klefki", 0.25, -Math.PI / 2],
			["dragonite", 0.5, 0],
		];
		const drops = placements.map(([id, x, angle]) => ({
			id,
			polygons: all[id].polygons,
			x,
			angle,
		}));
		const { standing, moved } = dropAndWatch(drops);
		expect(standing.map((p) => p.id)).toEqual(
			placements.slice(1).map(([id]) => id),
		);
		expect(moved).toEqual([]);
	}, 30_000);

	describe("a real sprite dropped alone", () => {
		const sorted = Object.keys(all).sort();
		const mostPieces = [...sorted]
			.sort((a, b) => all[b].polygons.length - all[a].polygons.length)
			.slice(0, 6);
		const sample = [
			"pikachu",
			"abomasnow",
			"ambipom",
			"arbok",
			"amoonguss",
			"snorlax",
			"charizard",
			"klefki",
			...mostPieces,
			...sorted.filter((_, i) => i % 40 === 0),
		]
			// ferroseed is a polygonal ball: alone on a flat pedestal it rolls
			// off, which is geometry, not instability.
			.filter((name, i, names) => names.indexOf(name) === i)
			.filter((name) => name !== "ferroseed");
		// The slowest of all 1025 sprites took 17.5 s to sleep (it rocks first).
		const SLEEP_WITHIN_S = 20;

		it.each(sample)("%s comes to rest on the pedestal and stays", (name) => {
			const world = createWorld();
			const piece = world.addPiece(name, all[name].polygons, 0, 0);
			run(world, SLEEP_WITHIN_S, () => piece.asleep);
			expect(piece.asleep).toBe(true);
			const rest = pose(piece);
			run(world, OBSERVE_S);
			expect(movement(piece, rest)).toMatchObject({ still: true });
			expect(piece.asleep).toBe(true);
			expect(onPedestal(piece)).toBe(true);
			expect(Math.abs(piece.x)).toBeLessThan(PEDESTAL_HALF_WIDTH);
		});
	});
});
