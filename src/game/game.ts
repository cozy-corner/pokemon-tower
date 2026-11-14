import type { Vec } from "../geometry/types";
import {
	PEDESTAL_THICKNESS,
	PEDESTAL_TOP_Y,
	type Piece,
	spawnY,
	VIEW_WIDTH,
	type World,
} from "../physics/world";

/** Longest wait for the tower to sleep: the slowest sprite takes 17 to 18 s. */
export const SPAWN_TIMEOUT_S = 20;
/** Below the pedestal's underside; a piece past it can never come back. */
export const KILL_LINE_Y = PEDESTAL_THICKNESS + 5;
const MAX_HOLD_X = VIEW_WIDTH / 2;
export const ROTATE_STEP_DEG = 45;
const TURNS = 360 / ROTATE_STEP_DEG;
const angleOf = (turn: number) => (turn * ROTATE_STEP_DEG * Math.PI) / 180;
/** Pokémon that can take another's form; a dropped piece may become one. */
export const TRANSFORMERS = ["ditto", "mew", "zorua"];
export const TRANSFORM_CHANCE = 0.03;

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
	/** What the held piece becomes when dropped, decided early so its sprite
	 * can be fetched before the drop. */
	readonly transformsInto: string | null;
	/** 1-based order of the held piece, shown as "5. EEVEE". */
	readonly pieceNumber: number;
	readonly stackedCount: number;
	readonly heightM: number;
	pieces(): Piece[];
	step(dt: number): void;
	move(x: number): void;
	/** Shifts the held piece by dx, clamped like `move`. */
	nudge(dx: number): void;
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
	transformers?: string[];
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
	transformers = [],
}: GameDeps): Game {
	const broken = new Set<string>();
	let state: GameState = "HOLDING";
	let stackedCount = 0;
	let dropped = 0;
	let heightM = 0;
	let settleElapsed = 0;
	let x = 0;
	let turn = 0;

	// A world id must be unique, so names already on the tower are skipped.
	const pick = (previous: string | null) => {
		const skip = new Set([...excluded, ...broken]);
		for (const p of world.pieces()) skip.add(p.id);
		return pickNext(names, skip, previous, rand);
	};
	const rollTransform = () => {
		const skip = new Set([...excluded, ...broken, heldName]);
		for (const p of world.pieces()) skip.add(p.id);
		const choices = transformers.filter((n) => !skip.has(n));
		// No roll without a choice, so rand is not consumed for nothing.
		if (choices.length === 0 || rand() >= TRANSFORM_CHANCE) return null;
		return choices[Math.floor(rand() * choices.length)];
	};
	let heldName = pick(null);
	let upcoming = pick(heldName);
	let transformsInto = rollTransform();

	const refreshStats = () => {
		stackedCount = world.pieces().length;
		heightM = PEDESTAL_TOP_Y - world.highestPoint();
	};

	const advance = () => {
		heldName = upcoming;
		upcoming = pick(heldName);
		transformsInto = rollTransform();
	};

	const spawn = () => {
		advance();
		turn = 0;
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
				// Where the body will start, so the drop does not jump.
				y: spawnY(world.highestPoint(), polygonsOf(heldName)),
				angle: angleOf(turn),
			};
		},
		get upcoming() {
			return upcoming;
		},
		get transformsInto() {
			return state === "HOLDING" ? transformsInto : null;
		},
		get pieceNumber() {
			return dropped + 1;
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
			x = Math.max(-MAX_HOLD_X, Math.min(MAX_HOLD_X, nx));
		},
		nudge(dx) {
			this.move(x + dx);
		},
		rotate() {
			if (state !== "HOLDING") return;
			turn = (turn + 1) % TURNS;
		},
		drop() {
			if (state !== "HOLDING") return;
			const id = transformsInto ?? heldName;
			world.addPiece(id, polygonsOf(id), x, angleOf(turn));
			// A world id must be unique, so the next pick cannot be the new form.
			if (upcoming === id) upcoming = pick(heldName);
			dropped++;
			settleElapsed = 0;
			state = "SETTLING";
		},
		reportBroken(name) {
			broken.add(name);
			if (transformsInto === name) transformsInto = null;
			if (state === "HOLDING" && heldName === name) {
				advance();
			} else if (upcoming === name) {
				upcoming = pick(heldName);
			}
		},
	};
}
