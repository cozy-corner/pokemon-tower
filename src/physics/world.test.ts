import { describe, expect, it } from "vitest";
import shapes from "../../public/shapes.json";
import type { OutlineResult, Vec } from "../geometry/types";
import {
	createWorld,
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

const box = (hw: number, hh: number, cx = 0, cy = 0): Vec[] => [
	{ x: cx - hw, y: cy - hh },
	{ x: cx + hw, y: cy - hh },
	{ x: cx + hw, y: cy + hh },
	{ x: cx - hw, y: cy + hh },
];

const area = (poly: Vec[]) =>
	Math.abs(
		poly.reduce((sum, a, i) => {
			const b = poly[(i + 1) % poly.length];
			return sum + a.x * b.y - b.x * a.y;
		}, 0) / 2,
	);

const run = (world: World, seconds: number, until?: () => boolean) => {
	const steps = Math.round(seconds / DT);
	for (let i = 0; i < steps && !until?.(); i++) world.step(DT);
};

type Snapshot = Map<Piece, { x: number; y: number; angle: number }>;
const snapshot = (pieces: Piece[]): Snapshot =>
	new Map(pieces.map((p) => [p, { x: p.x, y: p.y, angle: p.angle }]));

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
	const before = snapshot(standing);
	run(world, OBSERVE_S);
	const moved = standing
		.map((p) => {
			const b = before.get(p);
			if (!b) throw new Error("missing snapshot");
			return {
				id: p.id,
				drift: Math.hypot(p.x - b.x, p.y - b.y),
				turn: Math.abs(p.angle - b.angle),
				asleep: p.asleep,
			};
		})
		.filter(
			(m) => m.drift >= MAX_DRIFT_M || m.turn >= MAX_TURN_RAD || !m.asleep,
		);
	return { world, standing, moved };
};

describe("createWorld", () => {
	it("has no pieces at first", () => {
		expect(createWorld().pieces()).toEqual([]);
	});

	it("drops a piece onto the pedestal and lets it sleep", () => {
		const world = createWorld();
		const piece = world.addPiece("a", [box(0.5, 0.5)], 0, 0);
		expect(piece.y).toBeLessThan(PEDESTAL_TOP_Y - 0.5 - SPAWN_CLEARANCE + 1e-9);
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
			low.y - 0.5 - SPAWN_CLEARANCE + 1e-6,
		);
	});

	it("puts every polygon of a piece on one body", () => {
		const world = createWorld();
		const { polygons } = (shapes as Record<string, OutlineResult>).abomasnow;
		const piece = world.addPiece("abomasnow", polygons, 0, 0);
		const info = world.inspect(piece);
		expect(info.fixtures).toBe(polygons.length);
		// Density 1, so mass equals the summed area.
		const total = polygons.reduce((s, p) => s + area(p), 0);
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

	it("keeps a tower of real sprites still for 30 seconds", () => {
		// Placements found offline by a greedy search over x and quarter turns,
		// standing in for a player who aims; a careless drop topples this tower.
		// bulbasaur goes over the edge on purpose to exercise the fall-off rule.
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
		const all = shapes as Record<string, OutlineResult>;
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
});
