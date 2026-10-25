import type { Vec } from "../geometry/types";
import { ROTATE_STEP_DEG } from "../input/controls";
import {
	PEDESTAL_THICKNESS,
	PEDESTAL_TOP_Y,
	type Piece,
	VIEW_WIDTH,
	type World,
} from "../physics/world";

/** Longest wait for the tower to sleep: the slowest sprite takes 17 to 18 s. */
export const SPAWN_TIMEOUT_S = 20;
/** Below the pedestal's underside; a piece past it can never come back. */
export const KILL_LINE_Y = PEDESTAL_THICKNESS + 5;
/** Held piece center height above the tower top, clear of the highest piece. */
const HOLD_HEIGHT = 3;
const MAX_HOLD_X = VIEW_WIDTH / 2 - 1;
const TURNS = 360 / ROTATE_STEP_DEG;
const angleOf = (turn: number) => (turn * ROTATE_STEP_DEG * Math.PI) / 180;

export type HeldPiece = {
	readonly id: string;
	readonly x: number;
	readonly y: number;
	readonly angle: number;
};

export type GameState = "HOLDING" | "SETTLING";

export type Game = {
	readonly state: GameState;
	readonly held: HeldPiece | null;
	/** The pick after the held one, so its sprite can be fetched early. */
	readonly upcoming: string;
	readonly stackedCount: number;
	readonly heightM: number;
	pieces(): Piece[];
	step(dt: number): void;
	move(x: number): void;
	rotate(): void;
	drop(): void;
	reportBroken(name: string): void;
};

export type GameDeps = {
	world: World;
	names: string[];
	excluded: Set<string>;
	polygonsOf(name: string): Vec[][];
	rand: () => number;
};

export function pickNext(
	names: string[],
	excluded: Set<string>,
	previous: string | null,
	rand: () => number,
): string {
	const choices = names.filter((n) => !excluded.has(n) && n !== previous);
	if (choices.length === 0) throw new Error("no piece left to pick");
	return choices[Math.floor(rand() * choices.length)];
}

export function createGame({
	world,
	names,
	excluded,
	polygonsOf,
	rand,
}: GameDeps): Game {
	const broken = new Set<string>();
	let state: GameState = "HOLDING";
	let stackedCount = 0;
	let heightM = 0;
	let settleElapsed = 0;
	let x = 0;
	let turn = 0;
	// A finger already down while the last piece settled must not drop the next one.
	let touched = false;

	// A world id must be unique, so names already on the tower are skipped.
	const pick = (previous: string | null) => {
		const skip = new Set([...excluded, ...broken]);
		for (const p of world.pieces()) skip.add(p.id);
		return pickNext(names, skip, previous, rand);
	};
	let heldName = pick(null);
	let upcoming = pick(heldName);
	let heldY = world.highestPoint() - HOLD_HEIGHT;

	const refreshStats = () => {
		stackedCount = world.pieces().length;
		heightM = PEDESTAL_TOP_Y - world.highestPoint();
	};

	const spawn = () => {
		heldName = upcoming;
		upcoming = pick(heldName);
		turn = 0;
		touched = false;
		heldY = world.highestPoint() - HOLD_HEIGHT;
		state = "HOLDING";
	};

	return {
		get state() {
			return state;
		},
		get held() {
			if (state !== "HOLDING") return null;
			return {
				id: heldName,
				x,
				y: heldY,
				angle: angleOf(turn),
			};
		},
		get upcoming() {
			return upcoming;
		},
		get stackedCount() {
			return stackedCount;
		},
		get heightM() {
			return heightM;
		},
		pieces: () => world.pieces(),
		step(dt) {
			world.step(dt);
			const fallen = world.pieces().filter((p) => p.y > KILL_LINE_Y);
			for (const p of fallen) world.remove(p);
			if (fallen.length > 0) refreshStats();
			if (state !== "SETTLING") return;
			settleElapsed += dt;
			const asleep = world.pieces().every((p) => p.asleep);
			if (asleep || settleElapsed >= SPAWN_TIMEOUT_S) {
				refreshStats();
				spawn();
			}
		},
		move(nx) {
			if (state !== "HOLDING") return;
			touched = true;
			x = Math.max(-MAX_HOLD_X, Math.min(MAX_HOLD_X, nx));
		},
		rotate() {
			if (state !== "HOLDING") return;
			turn = (turn + 1) % TURNS;
		},
		drop() {
			if (state !== "HOLDING" || !touched) return;
			world.addPiece(heldName, polygonsOf(heldName), x, angleOf(turn));
			settleElapsed = 0;
			state = "SETTLING";
		},
		reportBroken(name) {
			broken.add(name);
			if (state === "HOLDING" && heldName === name) {
				heldName = upcoming;
				upcoming = pick(heldName);
			} else if (upcoming === name) {
				upcoming = pick(heldName);
			}
		},
	};
}
