import {
	type Body,
	Box,
	World as PlanckWorld,
	Polygon,
	type PolygonShape,
	Rot,
	Settings,
	Vec2,
} from "planck";
import type { Vec } from "../geometry/types";

// Meters, +y down (same as the sprite images), so gravity is positive y.
export const GRAVITY = 10;
export const PEDESTAL_TOP_Y = 0;
export const PEDESTAL_HALF_WIDTH = 3;
export const PEDESTAL_THICKNESS = 1;
/** Gap between a new piece's lowest point and the highest point already in
 * the world (the pedestal top when empty). Kept small so the drop impact is
 * gentle (about 3 m/s). */
export const SPAWN_CLEARANCE = 0.5;
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
	/** Diagnostics for tests and tuning; the game does not need it. */
	inspect(piece: Piece): { fixtures: number; mass: number };
};

const polygonVertices = (body: Body): Vec2[] => {
	const points: Vec2[] = [];
	for (let f = body.getFixtureList(); f; f = f.getNext()) {
		for (const v of (f.getShape() as PolygonShape).m_vertices) {
			points.push(body.getWorldPoint(v));
		}
	}
	return points;
};

export function createWorld(): World {
	const world = new PlanckWorld({ gravity: new Vec2(0, GRAVITY) });
	const pedestal = world.createBody({ type: "static" });
	pedestal.createFixture({
		shape: new Box(
			PEDESTAL_HALF_WIDTH,
			PEDESTAL_THICKNESS / 2,
			new Vec2(0, PEDESTAL_TOP_Y + PEDESTAL_THICKNESS / 2),
		),
		friction: FRICTION,
		restitution: RESTITUTION,
	});

	const bodies = new Map<Piece, Body>();
	const bodyOf = (piece: Piece) => {
		const body = bodies.get(piece);
		if (!body) throw new Error(`piece ${piece.id} is not in this world`);
		return body;
	};

	const highestY = () =>
		Math.min(
			PEDESTAL_TOP_Y,
			...[...bodies.values()].flatMap((b) =>
				polygonVertices(b).map((p) => p.y),
			),
		);

	const addPiece = (
		id: string,
		polygons: Vec[][],
		x: number,
		angle: number,
	): Piece => {
		if ([...bodies.keys()].some((p) => p.id === id)) {
			throw new Error(`duplicate piece id ${id}`);
		}
		// Planck silently truncates longer polygons and swaps degenerate ones
		// for a 2 m box, so refuse them instead.
		if (
			polygons.length === 0 ||
			polygons.some(
				(p) => p.length < 3 || p.length > Settings.maxPolygonVertices,
			)
		) {
			throw new Error(`piece ${id} has an unusable polygon`);
		}
		const rot = new Rot(angle);
		const lowest = Math.max(
			...polygons.flat().map((v) => Rot.mulVec2(rot, new Vec2(v.x, v.y)).y),
		);
		const body = world.createBody({
			type: "dynamic",
			position: new Vec2(x, highestY() - SPAWN_CLEARANCE - lowest),
			angle,
		});
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
		bodies.set(piece, body);
		return piece;
	};

	return {
		addPiece,
		step: (dt) => world.step(dt),
		pieces: () => [...bodies.keys()],
		remove: (piece) => {
			world.destroyBody(bodyOf(piece));
			bodies.delete(piece);
		},
		inspect: (piece) => {
			const body = bodyOf(piece);
			let fixtures = 0;
			for (let f = body.getFixtureList(); f; f = f.getNext()) fixtures++;
			return { fixtures, mass: body.getMass() };
		},
	};
}
