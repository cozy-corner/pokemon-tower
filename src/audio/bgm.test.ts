import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pickTrack, startBgmOnFirstGesture, TRACKS } from "./bgm";

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

type Listener = () => void;

class FakeTarget {
	listeners = new Map<string, Listener[]>();
	addEventListener(type: string, fn: Listener) {
		this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
	}
	removeEventListener(type: string, fn: Listener) {
		this.listeners.set(
			type,
			(this.listeners.get(type) ?? []).filter((f) => f !== fn),
		);
	}
	dispatch(type: string) {
		for (const fn of this.listeners.get(type) ?? []) fn();
	}
}

class FakeAudio extends FakeTarget {
	static last: FakeAudio;
	muted = false;
	volume = 1;
	src = "";
	constructor() {
		super();
		FakeAudio.last = this;
	}
	play() {
		return Promise.resolve();
	}
}

describe("startBgmOnFirstGesture", () => {
	beforeEach(() => {
		vi.stubGlobal("Audio", FakeAudio);
		vi.stubGlobal("window", new FakeTarget());
	});
	afterEach(() => vi.unstubAllGlobals());

	it("starts muted when asked", () => {
		startBgmOnFirstGesture(() => 0, true);
		expect(FakeAudio.last.muted).toBe(true);
	});
	it("toggles mute", () => {
		const bgm = startBgmOnFirstGesture(() => 0, false);
		expect(FakeAudio.last.muted).toBe(false);
		bgm.setMuted(true);
		expect(FakeAudio.last.muted).toBe(true);
		bgm.setMuted(false);
		expect(FakeAudio.last.muted).toBe(false);
	});
	it("stays muted across a track change", () => {
		const bgm = startBgmOnFirstGesture(() => 0, false);
		bgm.setMuted(true);
		FakeAudio.last.dispatch("ended");
		expect(FakeAudio.last.muted).toBe(true);
	});
});
