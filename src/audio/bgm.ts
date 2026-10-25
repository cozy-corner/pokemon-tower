// Red/Green town themes (playlist/town/1-7.mp3), saved locally as public/bgm/bgm-N.mp3.
// The files are not in git (rights); a missing file just means no music.
export const TRACKS = Array.from(
	{ length: 7 },
	(_, i) => `/bgm/bgm-${i + 1}.mp3`,
);

/** A random track, avoiding `previous` so the same theme never plays twice in a row. */
export function pickTrack(
	rand: () => number,
	previous?: string,
	tracks: string[] = TRACKS,
): string {
	const pool = tracks.filter((t) => t !== previous);
	const from = pool.length > 0 ? pool : tracks;
	return from[Math.floor(rand() * from.length)];
}

/** Browsers block audio until a user gesture, so playback starts on the first one. */
export function startBgmOnFirstGesture(rand: () => number): void {
	const audio = new Audio();
	audio.volume = 0.4;
	let current: string | undefined;
	const next = () => {
		current = pickTrack(rand, current);
		audio.src = current;
		audio.play().catch(() => {});
	};
	audio.addEventListener("ended", next);
	// Missing or undecodable file: stay silent rather than loop on errors.
	audio.addEventListener("error", () =>
		audio.removeEventListener("ended", next),
	);
	const events = ["pointerdown", "keydown"] as const;
	const start = () => {
		for (const e of events) window.removeEventListener(e, start);
		next();
	};
	for (const e of events) window.addEventListener(e, start);
}
