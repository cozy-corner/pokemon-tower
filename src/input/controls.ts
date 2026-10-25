import { VIEW_WIDTH } from "../physics/world";

export function createControls(
	canvas: HTMLCanvasElement,
	rotateButton: HTMLElement,
	handlers: { onMove(x: number): void; onRotate(): void; onDrop(): void },
): void {
	let active: number | null = null;

	const toWorldX = (clientX: number) => {
		const rect = canvas.getBoundingClientRect();
		return ((clientX - rect.left) / rect.width) * VIEW_WIDTH - VIEW_WIDTH / 2;
	};

	const stop = (e: PointerEvent) => {
		if (canvas.hasPointerCapture(e.pointerId)) {
			canvas.releasePointerCapture(e.pointerId);
		}
		active = null;
	};

	canvas.addEventListener("pointerdown", (e) => {
		if (active !== null || e.button !== 0) return;
		active = e.pointerId;
		canvas.setPointerCapture(e.pointerId);
		handlers.onMove(toWorldX(e.clientX));
	});
	canvas.addEventListener("pointermove", (e) => {
		if (e.pointerId !== active) return;
		handlers.onMove(toWorldX(e.clientX));
	});
	canvas.addEventListener("pointerup", (e) => {
		if (e.pointerId !== active) return;
		stop(e);
		handlers.onDrop();
	});
	// A cancelled gesture (e.g. system takeover) is not a deliberate release.
	canvas.addEventListener("pointercancel", (e) => {
		if (e.pointerId !== active) return;
		stop(e);
	});
	rotateButton.addEventListener("click", () => handlers.onRotate());
}
