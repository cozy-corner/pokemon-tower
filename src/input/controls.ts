import { VIEW_WIDTH } from "../physics/world";

const KEY_STEP = VIEW_WIDTH / 40;

export function createControls(
	canvas: HTMLCanvasElement,
	buttons: { rotate: HTMLElement; drop: HTMLElement },
	handlers: {
		onMove(x: number): void;
		onNudge(dx: number): void;
		onRotate(): void;
		onDrop(): void;
	},
	keyTarget: Pick<Window, "addEventListener"> = window,
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
	});
	canvas.addEventListener("pointercancel", (e) => {
		if (e.pointerId !== active) return;
		stop(e);
	});
	// Held keys repeat through the OS key repeat, so no timer is needed.
	keyTarget.addEventListener("keydown", (e) => {
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		switch (e.key) {
			case "h":
			case "ArrowLeft":
				handlers.onNudge(-KEY_STEP);
				break;
			case "l":
			case "ArrowRight":
				handlers.onNudge(KEY_STEP);
				break;
			case "k":
			case "ArrowUp":
				if (!e.repeat) handlers.onRotate();
				break;
			case "j":
			case "ArrowDown":
			case " ":
			case "Enter":
				if (!e.repeat) handlers.onDrop();
				break;
			default:
				return;
		}
		e.preventDefault();
	});
	buttons.rotate.addEventListener("click", () => handlers.onRotate());
	buttons.drop.addEventListener("click", () => handlers.onDrop());
}
