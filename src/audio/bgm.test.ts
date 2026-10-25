import { describe, expect, it } from "vitest";
import { pickTrack, TRACKS } from "./bgm";

describe("pickTrack", () => {
	it("picks by the random value", () => {
		expect(pickTrack(() => 0)).toBe(TRACKS[0]);
		expect(pickTrack(() => 0.999)).toBe(TRACKS[6]);
	});
	it("never repeats the previous track", () => {
		for (const t of TRACKS) {
			for (const r of [0, 0.3, 0.6, 0.999]) {
				expect(pickTrack(() => r, t)).not.toBe(t);
			}
		}
	});
	it("falls back to the only track", () => {
		expect(pickTrack(() => 0, "a", ["a"])).toBe("a");
	});
});
