// Red/Green town themes, saved locally as public/bgm/bgm-N.wav.
// The files are not in git (rights); a missing file just means no music.
export const TRACKS = Array.from(
	{ length: 7 },
	(_, i) => `${import.meta.env.BASE_URL}bgm/bgm-${i + 1}.wav`,
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

/** Browsers block audio until a user gesture, so playback starts on the first one that is allowed to play. */
export function startBgmOnFirstGesture(rand: () => number): void {
	const audio = new Audio();
	audio.volume = 0.4;
	let current: string | undefined;
	let failures = 0;
	const next = () => {
		current = pickTrack(rand, current);
		audio.src = current;
		return audio.play();
	};
	audio.addEventListener("ended", () => {
		failures = 0;
		next().catch(() => {});
	});
	// A missing file skips to another track; give up once every track has failed in a row.
	audio.addEventListener("error", () => {
		if (++failures < TRACKS.length) next().catch(() => {});
	});
	const events = ["pointerdown", "keydown"] as const;
	const start = () => {
		// Not every gesture (e.g. Escape) may start audio; keep listening until play() is accepted.
		next().then(
			() => {
				for (const e of events) window.removeEventListener(e, start);
			},
			() => {},
		);
	};
	for (const e of events) window.addEventListener(e, start);
}
