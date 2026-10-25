import { describe, expect, it } from "vitest";
import type { Vec } from "../geometry/types";
import {
	createWorld,
	PEDESTAL_TOP_Y,
	type Piece,
	VIEW_WIDTH,
	type World,
} from "../physics/world";
import { createGame, KILL_LINE_Y, pickNext, SPAWN_TIMEOUT_S } from "./game";

const DT = 1 / 60;
const NAMES = "abcdefghijkl".split("");

const box = (hw: number, hh: number, cx = 0): Vec[] => [
	{ x: cx - hw, y: -hh },
	{ x: cx + hw, y: -hh },
	{ x: cx + hw, y: hh },
	{ x: cx - hw, y: hh },
];

// Cycles through fixed values so picks are predictable.
const seq = (...values: number[]) => {
	let i = 0;
	return () => values[i++ % values.length];
};

const setup = (
	opts: {
		world?: World;
		excluded?: string[];
		polygons?: Vec[][];
		rand?: () => number;
	} = {},
) => {
	const world = opts.world ?? createWorld();
	const game = createGame({
		world,
		names: NAMES,
		excluded: new Set(opts.excluded ?? []),
		polygonsOf: () => opts.polygons ?? [box(0.5, 0.5)],
		rand: opts.rand ?? seq(0, 0.3, 0.6, 0.9),
	});
	return { world, game };
};

const settle = (game: ReturnType<typeof setup>["game"]) => {
	game.move(game.held?.x ?? 0);
	game.drop();
	for (let i = 0; i < SPAWN_TIMEOUT_S / DT && game.state === "SETTLING"; i++) {
		game.step(DT);
	}
};

describe("pickNext", () => {
	it("skips excluded names and the previous one", () => {
		const excluded = new Set(["a", "b"]);
		for (const r of [0, 0.34, 0.67, 0.99]) {
			const name = pickNext(NAMES, excluded, "c", () => r);
			expect(name).not.toMatch(/[abc]/);
		}
	});
});

describe("createGame", () => {
	it("starts holding a piece above the empty pedestal", () => {
		const { game } = setup();
		expect(game.state).toBe("HOLDING");
		expect(game.held?.y).toBeLessThan(PEDESTAL_TOP_Y);
		expect(game.stackedCount).toBe(0);
		expect(game.heightM).toBe(0);
	});

	it("clamps the held piece inside the view", () => {
		const { game } = setup();
		game.move(100);
		expect(game.held?.x).toBe(VIEW_WIDTH / 2 - 1);
		game.move(-100);
		expect(game.held?.x).toBe(-(VIEW_WIDTH / 2 - 1));
	});

	it("returns to the same angle after eight rotations", () => {
		const { game } = setup();
		game.rotate();
		expect(game.held?.angle).toBeCloseTo(Math.PI / 4);
		for (let i = 0; i < 7; i++) game.rotate();
		expect(game.held?.angle).toBe(0);
	});

	it("does not offer the dropped piece or an excluded one next", () => {
		const { game } = setup({ excluded: ["b"], rand: () => 0 });
		const seen: string[] = [];
		for (let i = 0; i < 3; i++) {
			seen.push(game.held?.id ?? "");
			settle(game);
		}
		expect(seen).not.toContain("b");
		expect(new Set(seen).size).toBe(3);
	});

	it("waits for every piece to sleep before the next one appears (c)", () => {
		const { game, world } = setup();
		game.drop();
		expect(game.state).toBe("SETTLING");
		expect(game.held).toBeNull();
		let steps = 0;
		while (game.state === "SETTLING" && steps < SPAWN_TIMEOUT_S / DT) {
			game.step(DT);
			steps++;
			if (game.state === "SETTLING") {
				expect(world.pieces().every((p) => p.asleep)).toBe(false);
			}
		}
		expect(game.state).toBe("HOLDING");
		expect(world.pieces().every((p) => p.asleep)).toBe(true);
		expect(steps * DT).toBeLessThan(SPAWN_TIMEOUT_S);
	});

	it("ignores controls while settling", () => {
		const { game, world } = setup();
		game.move(2);
		game.drop();
		game.move(-3);
		game.rotate();
		game.drop();
		expect(world.pieces()).toHaveLength(1);
		expect(world.pieces()[0].x).toBeCloseTo(2, 1);
		expect(world.pieces()[0].angle).toBe(0);
	});

	it("spawns after the timeout even if something never sleeps (c)", () => {
		const awake: Piece = { id: "a", x: 0, y: 0, angle: 0, asleep: false };
		const stub: World = {
			addPiece: () => awake,
			step: () => {},
			pieces: () => [awake],
			remove: () => {},
			highestPoint: () => -1,
			inspect: () => ({ fixtures: 1, mass: 1 }),
		};
		const { game } = setup({ world: stub });
		game.drop();
		for (let i = 0; i < 39; i++) game.step(0.5);
		expect(game.state).toBe("SETTLING");
		game.step(0.5);
		expect(game.state).toBe("HOLDING");
	});

	it("removes a piece below the kill line without ending or counting it (b)", () => {
		// The polygon sits far right of its origin, so it tips off the pedestal.
		const { game, world } = setup({ polygons: [box(1, 1, 3)] });
		game.move(100);
		game.drop();
		let fell = false;
		for (let i = 0; i < 30 / DT && game.state === "SETTLING"; i++) {
			game.step(DT);
			if (world.pieces().some((p) => p.y > PEDESTAL_TOP_Y + 1)) fell = true;
		}
		expect(fell).toBe(true);
		expect(world.pieces().filter((p) => p.y > KILL_LINE_Y)).toHaveLength(0);
		expect(world.pieces()).toHaveLength(0);
		expect(game.stackedCount).toBe(0);
		expect(game.state).toBe("HOLDING");
	});

	it("numbers the held piece from 1 and counts each drop, falls included", () => {
		const { game } = setup({ polygons: [box(0.5, 1)] });
		expect(game.pieceNumber).toBe(1);
		settle(game);
		expect(game.pieceNumber).toBe(2);
	});

	it("measures height from the pedestal top to the highest point (d)", () => {
		const { game, world } = setup({ polygons: [box(0.5, 1)] });
		settle(game);
		expect(game.stackedCount).toBe(1);
		expect(game.heightM).toBeCloseTo(2, 1);
		expect(game.heightM).toBeCloseTo(PEDESTAL_TOP_Y - world.highestPoint(), 5);
		settle(game);
		expect(game.stackedCount).toBe(2);
		expect(game.heightM).toBeGreaterThan(3.5);
	});

	it("skips a piece whose image is broken (e)", () => {
		const { game } = setup({ rand: () => 0 });
		const first = game.held?.id as string;
		const second = game.upcoming;
		game.reportBroken(first);
		expect(game.held?.id).toBe(second);
		expect(game.upcoming).not.toBe(first);
		expect(game.upcoming).not.toBe(second);
		game.reportBroken(game.upcoming);
		for (let i = 0; i < 6; i++) {
			expect(game.held?.id).not.toBe(first);
			settle(game);
		}
	});
});
