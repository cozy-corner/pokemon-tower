import {
	type Body,
	Box,
	World as PlanckWorld,
	Polygon,
	type PolygonShape,
	Vec2,
} from "planck";
import type { Vec } from "../geometry/types";

// Meters, +y down (same as the sprite images), so gravity is positive y.
export const GRAVITY = 8;
export const PEDESTAL_TOP_Y = 0;
/** World units across the screen. Measured by eye from Pokémon Tower Battle
 * play screenshots: on its 9:16 screens the pedestal is 87 to 93% of the width
 * and about 3.9 times the median Pokémon (about 23% of the width); on 0.67
 * aspect screens it is 70%, so sizes follow the screen height. Tuned together
 * with SVG_UNITS_PER_METER so the median sprite is about a quarter of the
 * width; `bun run build-shapes` prints the bounding-box widths to check it. */
export const VIEW_WIDTH = 7;
/** Pedestal widths as fractions of VIEW_WIDTH. `large` is from the play
 * screenshots above. `small` and `medium` are from the animal game, unchecked. */
export const PEDESTAL_WIDTH_RATIO = { small: 0.55, medium: 0.64, large: 0.9 };
export const PEDESTAL_HALF_WIDTHS = {
	small: (PEDESTAL_WIDTH_RATIO.small * VIEW_WIDTH) / 2,
	medium: (PEDESTAL_WIDTH_RATIO.medium * VIEW_WIDTH) / 2,
	large: (PEDESTAL_WIDTH_RATIO.large * VIEW_WIDTH) / 2,
};
/** The default pedestal's half-width. */
export const PEDESTAL_HALF_WIDTH = PEDESTAL_HALF_WIDTHS.large;
/** Estimated from screenshots of the original game, like the widths. */
export const PEDESTAL_THICKNESS_RATIO = 0.08;
export const PEDESTAL_THICKNESS = PEDESTAL_THICKNESS_RATIO * VIEW_WIDTH;
/** Gap between a new piece's lowest point and the highest point already in
 * the world (the pedestal top when empty). Kept small so the drop impact is
 * gentle (about 3 m/s). */
export const SPAWN_CLEARANCE = 0.5;
/** Center y where a piece starts. Uses the farthest vertex from the origin so
 * the height is the same at every rotation (the held piece must not bob when
 * rotated); its lowest vertex sits at least SPAWN_CLEARANCE above `top`. */
export function spawnY(top: number, polygons: Vec[][]): number {
	let reach = 0;
	for (const poly of polygons) {
		for (const v of poly) reach = Math.max(reach, Math.hypot(v.x, v.y));
	}
	return top - SPAWN_CLEARANCE - reach;
}
export const FRICTION = 0.6;
export const RESTITUTION = 0;
export const DENSITY = 1;

export type Piece = {
	readonly id: string;
	readonly x: number;
	readonly y: number;
	readonly angle: number;
	readonly asleep: boolean;
};

export type World = {
	addPiece(id: string, polygons: Vec[][], x: number, angle: number): Piece;
	step(dt: number): void;
	pieces(): Piece[];
	remove(piece: Piece): void;
	/** Smallest world y over all piece vertices; the pedestal top when empty. */
	highestPoint(): number;
	/** Diagnostics for tests and tuning; the game does not need it. */
	inspect(piece: Piece): { fixtures: number; mass: number };
};

export type WorldOptions = {
	pedestalHalfWidth?: number;
	pedestalThickness?: number;
};

type Entries = Map<string, { piece: Piece; body: Body }>;

function addPiece(
	world: PlanckWorld,
	entries: Entries,
	highestPoint: () => number,
	id: string,
	polygons: Vec[][],
	x: number,
	angle: number,
): Piece {
	if (entries.has(id)) {
		throw new Error(`duplicate piece id ${id}`);
	}
	const body = world.createBody({
		type: "dynamic",
		position: new Vec2(x, spawnY(highestPoint(), polygons)),
		angle,
	});
	// shapes.json is checked against Planck by shapes-data.test.ts.
	for (const poly of polygons) {
		body.createFixture({
			shape: new Polygon(poly.map((v) => new Vec2(v.x, v.y))),
			density: DENSITY,
			friction: FRICTION,
			restitution: RESTITUTION,
		});
	}
	const piece: Piece = {
		id,
		get x() {
			return body.getPosition().x;
		},
		get y() {
			return body.getPosition().y;
		},
		get angle() {
			return body.getAngle();
		},
		get asleep() {
			return !body.isAwake();
		},
	};
	entries.set(id, { piece, body });
	return piece;
}

export function createWorld({
	pedestalHalfWidth = PEDESTAL_HALF_WIDTH,
	pedestalThickness = PEDESTAL_THICKNESS,
}: WorldOptions = {}): World {
	const world = new PlanckWorld({ gravity: new Vec2(0, GRAVITY) });
	const pedestal = world.createBody({ type: "static" });
	pedestal.createFixture({
		shape: new Box(
			pedestalHalfWidth,
			pedestalThickness / 2,
			new Vec2(0, PEDESTAL_TOP_Y + pedestalThickness / 2),
		),
		friction: FRICTION,
		restitution: RESTITUTION,
	});

	const entries: Entries = new Map();
	const bodyOf = (piece: Piece) => {
		const entry = entries.get(piece.id);
		if (entry?.piece !== piece) {
			throw new Error(`piece ${piece.id} is not in this world`);
		}
		return entry.body;
	};

	const highestPoint = () => {
		let top = PEDESTAL_TOP_Y;
		for (const { body } of entries.values()) {
			for (let f = body.getFixtureList(); f; f = f.getNext()) {
				for (const v of (f.getShape() as PolygonShape).m_vertices) {
					top = Math.min(top, body.getWorldPoint(v).y);
				}
			}
		}
		return top;
	};

	return {
		addPiece: (id, polygons, x, angle) =>
			addPiece(world, entries, highestPoint, id, polygons, x, angle),
		highestPoint,
		step: (dt) => world.step(dt),
		pieces: () => [...entries.values()].map((e) => e.piece),
		remove: (piece) => {
			world.destroyBody(bodyOf(piece));
			entries.delete(piece.id);
		},
		inspect: (piece) => {
			const body = bodyOf(piece);
			let fixtures = 0;
			for (let f = body.getFixtureList(); f; f = f.getNext()) fixtures++;
			return { fixtures, mass: body.getMass() };
		},
	};
}
