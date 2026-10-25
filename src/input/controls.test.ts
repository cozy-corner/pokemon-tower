import { describe, expect, it, vi } from "vitest";
import { VIEW_WIDTH } from "../physics/world";
import { createControls } from "./controls";

type Listener = (e: unknown) => void;

class FakeElement {
	listeners = new Map<string, Listener[]>();
	captured = new Set<number>();
	addEventListener(type: string, fn: Listener) {
		this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
	}
	dispatch(type: string, e: object = {}) {
		for (const fn of this.listeners.get(type) ?? []) fn(e);
	}
	getBoundingClientRect() {
		return { left: 100, width: 200 };
	}
	setPointerCapture(id: number) {
		this.captured.add(id);
	}
	hasPointerCapture(id: number) {
		return this.captured.has(id);
	}
	releasePointerCapture(id: number) {
		this.captured.delete(id);
	}
}

function setup() {
	const canvas = new FakeElement();
	const button = new FakeElement();
	const handlers = { onMove: vi.fn(), onRotate: vi.fn(), onDrop: vi.fn() };
	createControls(
		canvas as unknown as HTMLCanvasElement,
		button as unknown as HTMLElement,
		handlers,
	);
	return { canvas, button, handlers };
}

const ptr = (pointerId: number, clientX: number, pointerType = "touch") => ({
	pointerId,
	clientX,
	pointerType,
	button: 0,
});

describe("controls", () => {
	it("passes world x on down and move", () => {
		const { canvas, handlers } = setup();
		canvas.dispatch("pointerdown", ptr(1, 200));
		canvas.dispatch("pointermove", ptr(1, 300));
		expect(handlers.onMove).toHaveBeenNthCalledWith(1, 0);
		expect(handlers.onMove).toHaveBeenNthCalledWith(2, VIEW_WIDTH / 2);
		expect(canvas.captured.has(1)).toBe(true);
	});

	it("ignores moves without a pressed pointer", () => {
		const { canvas, handlers } = setup();
		canvas.dispatch("pointermove", ptr(1, 200));
		expect(handlers.onMove).not.toHaveBeenCalled();
	});

	it("rotates on button click", () => {
		const { button, handlers } = setup();
		button.dispatch("click");
		expect(handlers.onRotate).toHaveBeenCalledTimes(1);
	});

	it("drops once on release", () => {
		const { canvas, handlers } = setup();
		canvas.dispatch("pointerdown", ptr(1, 200));
		canvas.dispatch("pointerup", ptr(1, 200));
		canvas.dispatch("pointerup", ptr(1, 200));
		expect(handlers.onDrop).toHaveBeenCalledTimes(1);
		expect(canvas.captured.size).toBe(0);
	});

	it("keeps following the first pointer when a second touches", () => {
		const { canvas, handlers } = setup();
		canvas.dispatch("pointerdown", ptr(1, 200));
		canvas.dispatch("pointerdown", ptr(2, 100));
		canvas.dispatch("pointermove", ptr(2, 100));
		canvas.dispatch("pointerup", ptr(2, 100));
		expect(handlers.onDrop).not.toHaveBeenCalled();
		expect(handlers.onMove).toHaveBeenCalledTimes(1);
		canvas.dispatch("pointermove", ptr(1, 250));
		expect(handlers.onMove).toHaveBeenLastCalledWith(VIEW_WIDTH / 4);
		canvas.dispatch("pointerup", ptr(1, 250));
		expect(handlers.onDrop).toHaveBeenCalledTimes(1);
	});

	it("behaves the same for the mouse", () => {
		const { canvas, handlers } = setup();
		canvas.dispatch("pointerdown", ptr(7, 100, "mouse"));
		canvas.dispatch("pointermove", ptr(7, 200, "mouse"));
		canvas.dispatch("pointerup", ptr(7, 200, "mouse"));
		expect(handlers.onMove).toHaveBeenNthCalledWith(1, -VIEW_WIDTH / 2);
		expect(handlers.onMove).toHaveBeenNthCalledWith(2, 0);
		expect(handlers.onDrop).toHaveBeenCalledTimes(1);
	});

	it("ignores non-primary mouse buttons", () => {
		const { canvas, handlers } = setup();
		canvas.dispatch("pointerdown", { ...ptr(7, 100, "mouse"), button: 2 });
		canvas.dispatch("pointerup", ptr(7, 100, "mouse"));
		expect(handlers.onMove).not.toHaveBeenCalled();
		expect(handlers.onDrop).not.toHaveBeenCalled();
	});

	it("does not drop on pointercancel and can start over", () => {
		const { canvas, handlers } = setup();
		canvas.dispatch("pointerdown", ptr(1, 200));
		canvas.dispatch("pointercancel", ptr(1, 200));
		canvas.dispatch("pointermove", ptr(1, 250));
		canvas.dispatch("pointerup", ptr(1, 250));
		expect(handlers.onDrop).not.toHaveBeenCalled();
		expect(handlers.onMove).toHaveBeenCalledTimes(1);
		canvas.dispatch("pointerdown", ptr(2, 200));
		expect(handlers.onMove).toHaveBeenCalledTimes(2);
	});
});
