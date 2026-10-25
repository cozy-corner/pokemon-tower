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
	const dropButton = new FakeElement();
	const win = new FakeElement();
	const handlers = {
		onMove: vi.fn(),
		onNudge: vi.fn(),
		onRotate: vi.fn(),
		onDrop: vi.fn(),
	};
	createControls(
		canvas as unknown as HTMLCanvasElement,
		{
			rotate: button as unknown as HTMLElement,
			drop: dropButton as unknown as HTMLElement,
		},
		handlers,
		win,
	);
	return { canvas, button, dropButton, handlers, win };
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

	it("drops on the drop button, not on release", () => {
		const { canvas, dropButton, handlers } = setup();
		canvas.dispatch("pointerdown", ptr(1, 200));
		canvas.dispatch("pointerup", ptr(1, 200));
		expect(handlers.onDrop).not.toHaveBeenCalled();
		expect(canvas.captured.size).toBe(0);
		dropButton.dispatch("click");
		expect(handlers.onDrop).toHaveBeenCalledTimes(1);
	});

	it("keeps following the first pointer when a second touches", () => {
		const { canvas, handlers } = setup();
		canvas.dispatch("pointerdown", ptr(1, 200));
		canvas.dispatch("pointerdown", ptr(2, 100));
		canvas.dispatch("pointermove", ptr(2, 100));
		canvas.dispatch("pointerup", ptr(2, 100));
		expect(handlers.onMove).toHaveBeenCalledTimes(1);
		canvas.dispatch("pointermove", ptr(1, 250));
		expect(handlers.onMove).toHaveBeenLastCalledWith(VIEW_WIDTH / 4);
	});

	it("behaves the same for the mouse", () => {
		const { canvas, handlers } = setup();
		canvas.dispatch("pointerdown", ptr(7, 100, "mouse"));
		canvas.dispatch("pointermove", ptr(7, 200, "mouse"));
		canvas.dispatch("pointerup", ptr(7, 200, "mouse"));
		expect(handlers.onMove).toHaveBeenNthCalledWith(1, -VIEW_WIDTH / 2);
		expect(handlers.onMove).toHaveBeenNthCalledWith(2, 0);
		expect(canvas.captured.size).toBe(0);
	});

	it("ignores non-primary mouse buttons", () => {
		const { canvas, handlers } = setup();
		canvas.dispatch("pointerdown", { ...ptr(7, 100, "mouse"), button: 2 });
		canvas.dispatch("pointerup", ptr(7, 100, "mouse"));
		expect(handlers.onMove).not.toHaveBeenCalled();
	});

	it("can start over after pointercancel", () => {
		const { canvas, handlers } = setup();
		canvas.dispatch("pointerdown", ptr(1, 200));
		canvas.dispatch("pointercancel", ptr(1, 200));
		canvas.dispatch("pointermove", ptr(1, 250));
		canvas.dispatch("pointerup", ptr(1, 250));
		expect(handlers.onMove).toHaveBeenCalledTimes(1);
		canvas.dispatch("pointerdown", ptr(2, 200));
		expect(handlers.onMove).toHaveBeenCalledTimes(2);
	});

	describe("keyboard", () => {
		const key = (k: string, extra: object = {}) => ({
			code: k,
			preventDefault: vi.fn(),
			...extra,
		});

		it.each([
			["KeyH", -1],
			["ArrowLeft", -1],
			["KeyL", 1],
			["ArrowRight", 1],
		])("nudges on %s, including repeats", (k, sign) => {
			const { win, handlers } = setup();
			win.dispatch("keydown", key(k));
			win.dispatch("keydown", key(k, { repeat: true }));
			expect(handlers.onNudge).toHaveBeenCalledTimes(2);
			expect(Math.sign(handlers.onNudge.mock.calls[0][0])).toBe(sign);
		});

		it.each(["KeyK", "ArrowUp"])("rotates once on %s", (k) => {
			const { win, handlers } = setup();
			win.dispatch("keydown", key(k));
			win.dispatch("keydown", key(k, { repeat: true }));
			expect(handlers.onRotate).toHaveBeenCalledTimes(1);
		});

		it.each(["KeyJ", "ArrowDown", "Space", "Enter", "NumpadEnter"])(
			"drops once on %s",
			(k) => {
				const { win, handlers } = setup();
				win.dispatch("keydown", key(k));
				win.dispatch("keydown", key(k, { repeat: true }));
				expect(handlers.onDrop).toHaveBeenCalledTimes(1);
			},
		);

		it("ignores the typed character, so Caps Lock and an IME do not matter", () => {
			const { win, handlers } = setup();
			win.dispatch("keydown", key("KeyL", { key: "Process" }));
			win.dispatch("keydown", key("KeyL", { key: "L" }));
			expect(handlers.onNudge).toHaveBeenCalledTimes(2);
		});

		it.each(["Space", "Enter"])(
			"leaves %s to a focused button instead of dropping twice",
			(k) => {
				const { win, handlers } = setup();
				const e = key(k, { target: { tagName: "BUTTON" } });
				win.dispatch("keydown", e);
				expect(handlers.onDrop).not.toHaveBeenCalled();
				expect(e.preventDefault).not.toHaveBeenCalled();
			},
		);

		it("leaves browser shortcuts and other keys alone", () => {
			const { win, handlers } = setup();
			const e = key("KeyL", { metaKey: true });
			win.dispatch("keydown", e);
			win.dispatch("keydown", key("KeyX"));
			expect(handlers.onNudge).not.toHaveBeenCalled();
			expect(e.preventDefault).not.toHaveBeenCalled();
		});
	});
});
