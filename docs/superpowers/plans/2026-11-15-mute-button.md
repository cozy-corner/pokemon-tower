# Mute Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 右上のボタンで BGM をミュート / 解除でき、その状態を次回も引き継ぐ。

**Architecture:** `startBgmOnFirstGesture` が初期のミュート状態を受け取り、`setMuted` を返す。`index.html` に HTML ボタンを置き、`main.ts` がクリックで切り替えて localStorage に保存する。

**Tech Stack:** TypeScript, Vite, Vitest(DOM 環境なし。既存テストは手製のフェイクを使う), Biome

**Spec:** `docs/superpowers/specs/2026-11-15-mute-button-design.md`

## Global Constraints

- 切り替えは `audio.muted` で行う(`audio.volume` は使わない)。
- 置き場所は右上、HUD の下で名前ラベル(`#label`, `top: 14%`)と同じ高さの右端。
- localStorage のキーは `pokemon-tower.muted`(`pokemon-tower.best` に倣う)。読み書きは既存の `loadBest` / `saveBest` と同じく try/catch で包む。
- キーボードショートカットは足さない。
- 開発サーバーは 5173 のみ(AGENTS.md)。

## Review Focus

- localStorage が使えない / 値が壊れている → ミュートなしで始まり、例外を出さない。
- ミュートにしてから最初のジェスチャーで再生が始まる → 無音のまま(Task 1 のテスト)。
- 曲が切り替わる(`ended` / `error` で `src` が変わる) → ミュートは維持される(`muted` は要素の属性なので `src` 変更で戻らない。Task 1 のテストで確認)。
- ミュートボタンのクリックが canvas の pointerdown に届いてピースが動く → 動かない(ボタンは canvas の上に重なる別要素なので届かないはず。Task 2 のブラウザ確認で見る)。
- ボタンにフォーカスがある状態で Space / Enter → ボタンが押される(controls.ts が BUTTON 上の Space/Enter を無視する既存の挙動。回転・落下ボタンと同じ扱いで可)。

---

### Task 1: BGM のミュート切り替え

**Files:**
- Modify: `src/audio/bgm.ts:19-49`
- Test: `src/audio/bgm.test.ts`

**Interfaces:**
- Produces: `startBgmOnFirstGesture(rand: () => number, muted: boolean): { setMuted(muted: boolean): void }`

- [ ] **Step 1: Write the failing tests**

`vi.stubGlobal("Audio", FakeAudio)` と `vi.stubGlobal("window", fakeWindow)` で差し替える。`FakeAudio` は `muted` / `volume` / `src` プロパティ、`play()`(resolved Promise を返す)、`addEventListener` / `dispatch` を持つ。`fakeWindow` は `addEventListener` / `removeEventListener` を持つ。作られた FakeAudio は配列に記録して取り出す。

```ts
describe("startBgmOnFirstGesture", () => {
	it("starts muted when asked", () => {
		startBgmOnFirstGesture(() => 0, true);
		expect(lastAudio().muted).toBe(true);
	});
	it("toggles mute", () => {
		const bgm = startBgmOnFirstGesture(() => 0, false);
		expect(lastAudio().muted).toBe(false);
		bgm.setMuted(true);
		expect(lastAudio().muted).toBe(true);
		bgm.setMuted(false);
		expect(lastAudio().muted).toBe(false);
	});
	it("stays muted across a track change", () => {
		const bgm = startBgmOnFirstGesture(() => 0, false);
		bgm.setMuted(true);
		lastAudio().dispatch("ended");
		expect(lastAudio().muted).toBe(true);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/audio/bgm.test.ts`
Expected: FAIL(`setMuted` が無い / `muted` が undefined)

- [ ] **Step 3: Implement**

`audio.muted = muted` を初期化時に入れ、`{ setMuted: (m) => { audio.muted = m; } }` を返す。

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/audio/bgm.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/audio/bgm.ts src/audio/bgm.test.ts
git commit -m "feat(audio): let bgm be muted"
```

### Task 2: 右上のミュートボタン

**Files:**
- Modify: `index.html`(`#stage` 内に `<button id="mute">`、スタイル追加)
- Modify: `src/main.ts`(状態の読み書き、クリックで切り替え、`startBgmOnFirstGesture` 呼び出し)

**Interfaces:**
- Consumes: Task 1 の `startBgmOnFirstGesture(rand, muted)` と `setMuted`

- [ ] **Step 1: ボタンを置く**

`<button id="mute" type="button" aria-label="Mute" aria-pressed="false">` に、スピーカーの SVG を2つ(音あり: 音波付き / ミュート: ×付き)入れ、`aria-pressed` に応じて片方だけ表示する(CSS `#mute[aria-pressed="true"] .on { display: none }` など)。位置は `position: absolute; top: 14%; right: 0;`。見た目は `#label` を左右反転した形(右端に付いた半丸、`rgba(20, 90, 140, 0.45)` 背景、白アイコン)にそろえる。`user-select: none; -webkit-tap-highlight-color: transparent; touch-action: manipulation;` は既存ボタンに倣う。

- [ ] **Step 2: main.ts で配線する**

`MUTE_KEY = "pokemon-tower.muted"`。`loadMuted(): boolean` は `localStorage.getItem(MUTE_KEY) === "1"`(try/catch で false)、`saveMuted(m: boolean)` は `"1"` / `"0"` を書く(try/catch)。`const bgm = startBgmOnFirstGesture(Math.random, muted)`。ボタンの `aria-pressed` を初期値で合わせ、クリックで `muted` を反転して `bgm.setMuted`、`aria-pressed` 更新、`saveMuted`。

- [ ] **Step 3: 全体チェック**

Run: `bun run check`
Expected: biome / tsc / vitest がすべて通る

- [ ] **Step 4: ブラウザで確認**

5173 のサーバーがこの worktree を配信しているか確かめてから(違えばポートは変えずに立て直す)、次を確認する:
- ボタンが名前ラベルと同じ高さの右端に出て、HUD と重ならない
- 押すと BGM が止まり / 戻り、アイコンが切り替わる(`document.querySelector("audio")` は無いので、`aria-pressed` とアイコン表示で確認し、音は実機で聞く)
- ボタンを押してもピースが動かない
- リロード後もミュート状態が残る

- [ ] **Step 5: Commit**

```bash
git add index.html src/main.ts
git commit -m "feat(ui): add mute button"
```
