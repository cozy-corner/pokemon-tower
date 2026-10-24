# ポケモンタワーバトル 第1段階 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5歳が iPad(縦向き)でひとりで遊べる、ポケモンの積み上げゲームを作る。

**Architecture:** スプライトのアルファ値から外側の輪郭を取り、凸多角形に分けて Planck.js の剛体にする。輪郭の計算は事前にスクリプトで全1025種類について行い、`shapes.json` に保存する。ゲームは canvas 2D で描き、ポインター操作で位置と回転を決めて落とす。

**Tech Stack:** TypeScript、bun(パッケージ管理とスクリプト実行。バージョンは `mise.toml` で固定する。Vite は中で Node を使うので、Node も固定する)、mise(ツールのバージョン管理。手元と CI で同じ版にそろえる)、Vite、Vitest、Biome(lint と format)、Planck.js、pngjs(PNG 読み込み)、GitHub Actions(CI)。

**Spec:** `docs/superpowers/specs/2026-10-24-pokemon-tower-design.md`

## Global Constraints

- 第1段階はひとり用のみ。**通信・部屋・対戦のコードは書かない。**
- 素材は HOME の 128px: `https://img.pokemondb.net/sprites/home/normal/1x/{名前}.png`。対象は全1025種類。
- 画像ファイルは **git に commit しない**(`.gitignore` に置き場を書く)。スクリプトと名前一覧は commit する。例外は UI 用の `src/assets/ui/` だけ。判定は `scripts/guard-images.sh` で、commit 時のフックと CI が同じものを使う。フックは `bun install` の `prepare` で設定される。
- ホットリンクしない。画像はローカルに保存して配信する。
- 画面は縦向き。ボタンは大きく、文字より絵やアイコンを使う(5歳は読めない)。
- ひとり用は落ちても終わらない。積めた数と高さを記録する。落とすポケモンはランダム。入れ替えボタンは作らない。
- 「勝手に崩れない」の基準: 何も触らずに30秒置いて動かない。満たせなければ別の物理エンジンを検討する。
- commit は Conventional Commits の件名のみ(本文なし)。タスクごとに1 commit。末尾に `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` を付ける。
- パッケージ管理とスクリプト実行は bun。`npm` は使わない。bun と Node のバージョンは `mise.toml` で固定し、手元も CI も mise で同じ版を入れる。マシンに入っているものに頼らない。commit の前に `bun run check` が通ること。
- 実装を始める前に `branch-workflow` スキルを呼ぶ(`superpowers:using-git-worktrees` ではなく)。

## PR の分け方

| PR | タスク | ブランチ | 区切りの理由 |
|---|---|---|---|
| 1 | Task 1 | `chore/foundation` | 土台(bun、lint、format、テスト、CI、PR テンプレート) |
| 2 | Task 2 | 未定 | 名前一覧と取得スクリプト |
| 3 | Task 3〜4 | 未定 | 輪郭の計算と、輪郭を目で見るプレビュー |
| 4 | Task 5 | 未定 | 物理の安定テスト。通らなければエンジンを見直す |
| 5 | Task 6〜8 | 未定 | 遊べる状態。実機で確認して配り方を決める |

前の PR をマージしてから次に進む。commit は1タスクにつき1つ。土台(PR 1)が入るまで、機能の実装は始めない。

## Review Focus

- 複数の島に分かれるスプライト(Scarlet/Violet のリザードンの炎のような例): 小さなゴミ以外のすべての島が当たり判定に入り、落ちない。(Task 3)
- 簡略化後に3頂点未満、または分解後に Planck の頂点数の上限を超える多角形が出ても、落ちずに除外か分割になる。(Task 3)
- 台座から落ちたポケモンを消しても、ゲームが終わらず、積めた数に数えない。(Task 8)
- 不規則な形を積んで30秒置いても、動かない。(Task 5)
- ドラッグ中に2本目の指が触れても、操作が壊れない。ページが拡大・スクロールしない。(Task 7)
- 画像が404や壊れていても、そのポケモンを飛ばして続ける。(Task 8)

---

### Task 1: 土台

**Files:**
- Create: `package.json`、`bun.lock`、`tsconfig.json`、`vite.config.ts`、`index.html`、`src/main.ts`、`.gitignore`、`biome.json`、`.github/workflows/ci.yml`、`.github/pull_request_template.md`、`mise.toml`
- Modify: `.githooks/pre-commit`

**Interfaces:**
- Produces: `bun run dev`、`bun run build`、`bun run preview`、`bun run test`(Vitest)、`bun run lint`(Biome)、`bun run fmt`(Biome で整形)、`bun run check`(Biome の検査、`tsc --noEmit`、Vitest をまとめて実行)。画像の置き場 `public/sprites/`(gitignore 対象)。

- [ ] **Step 0: Planck.js で、1つの剛体に、離れた複数の形(fixture)を持たせられることを、公式ドキュメントと小さな動作確認で確かめる。** 持たせられなければ、Task 3 の方針をユーザーに相談する。(以前の試作で、Planck.js 1.5.1 では持たせられ、`Settings.maxPolygonVertices` は 12 だった。`node_modules` の `planck.d.ts` で再確認する)
- [ ] **Step 1: Vite(TypeScript テンプレート)、Vitest、Planck.js、pngjs を `bun add` で入れる。** `tsx` は入れない(bun が TypeScript を直接実行する)。
- [ ] **Step 2: `.gitignore` に `node_modules`、`dist`、`public/sprites/` を書く。**
- [ ] **Step 3: Biome を入れ、`biome.json` に推奨の lint と format を設定する。** 上のスクリプトを `package.json` に書く。`bun run check` は、Biome の検査(`biome ci .`)、`tsc --noEmit`、`vitest run --passWithNoTests` の順に実行して、1つでも失敗したら失敗にする。
- [ ] **Step 4: `.githooks/pre-commit` に、画像のガードの後、staged のファイルに Biome の検査(`biome check --staged`)をかける。** 画像のガードは `scripts/guard-images.sh` にまとめ(`src/assets/ui/` だけ許可)、CI も同じものを使う。`package.json` の `prepare` で `core.hooksPath` を設定する。
- [ ] **Step 5: `.github/workflows/ci.yml` を書く。** `pull_request` と `main` への `push` で動き、`jdx/mise-action` で `mise.toml` の bun と Node を入れ、`bun install --frozen-lockfile` のあと、`bun run check` と `bun run build` を実行する。使う Action のバージョンは、各 Action の公式 README で確認して固定する。
- [ ] **Step 6: `.github/pull_request_template.md` を書く。** 項目は「概要」と、確認の欄(`bun run check` が通る)の2つだけにする。画像は commit 時のフックが止めるので、項目にしない。
- [ ] **Step 7: 動作を確認する。**
  - `bun run check` と `bun run build` が通る。
  - 意図的に lint エラーを入れたファイルを staged にして commit すると、フックが止める(確認後に元に戻す)。
  - `bun run dev` と、`bun run build` のあとの `bun run preview` の両方を起動し、Mac の LAN アドレスから `curl` で HTTP 200 を確認する。どちらも `--host` で他の端末から開けること。
- [ ] **Step 8: Commit** `chore: set up bun, biome, ci and pr template`

### Task 2: 名前一覧とスプライトの取得スクリプト

**Files:**
- Create: `scripts/fetch-sprites.ts`、`data/names.json`
- Test: `scripts/fetch-sprites.test.ts`

**Interfaces:**
- Produces: `export function parseNames(html: string): string[]` と `export async function fetchSprites(names: string[], outDir: string): Promise<{ok: string[]; failed: string[]}>`。`data/names.json` は名前の配列(commit する)。画像は `public/sprites/{名前}.png`。

- [ ] **Step 1: テストを書く。** `parseNames` は `href="/sprites/pikachu"` を含む HTML から `["pikachu"]` を返す。重複は除き、並びは辞書順。`/sprites/` のあとが `[a-z0-9-]` 以外のリンクは無視する。
- [ ] **Step 2: テストが失敗することを確認する。**
- [ ] **Step 3: `parseNames` を実装する。** 正規表現は `href="/sprites/[a-z0-9-]*"`(調査で1025件取れた)。
- [ ] **Step 4: `fetchSprites` を実装する。** User-Agent を付け、1件ごとに0.1秒待つ。取れなかった名前は `failed` に入れて続ける。すでにある画像は取り直さない(再実行できる)。
- [ ] **Step 5: 実行して `data/names.json` を作る。** `bun run fetch-sprites` を実行する。
  Expected: 1025件が `ok`、`failed` は空。
- [ ] **Step 6: Commit** `feat(scripts): add sprite fetch script`

### Task 3: 輪郭の計算

**Files:**
- Create: `src/geometry/outline.ts`
- Test: `src/geometry/outline.test.ts`

**Interfaces:**
- Produces:
  - `type Mask = { alpha: Uint8Array; w: number; h: number }`
  - `type Vec = { x: number; y: number }`
  - `type OutlineResult = { polygons: Vec[][]; stats: { components: number; fillOverHull: number; thin: boolean } }`
  - `export const PIXELS_PER_METER = 32`(ピクセルをメートルにする倍率。ピクセルをそのままメートルにすると物理が不安定になる)
  - `export const SIMPLIFY_TOLERANCE_PX = 1.5`(初期値。Task 4 のプレビューを見て調整)
  - `export const MIN_ISLAND_PX = 20`(これより小さい島はゴミとして無視する。調査で「小さい」とした画素数)
  - `export function computeOutline(mask: Mask): OutlineResult`(多角形の座標はメートルで、中心を原点にする)

- [ ] **Step 1: 合成マスクでテストを書く。** (a) 8×8の塗りつぶし正方形 → 多角形1つ、頂点4、`components` は1。(b) L字 → 凸多角形に分かれ、各多角形の頂点数は上限以下。(c) 離れた2つの島(どちらも `MIN_ISLAND_PX` 以上) → `components` は2で、両方の島の多角形が返る。(c2) 大きな島と、`MIN_ISLAND_PX` 未満の島 → 大きな島の多角形だけが返る。(d) 中に穴のある四角 → 穴は無視されて外側だけ。(e) アルファが127以下の画素は無視する。
- [ ] **Step 2: テストが失敗することを確認する。**
- [ ] **Step 3: `computeOutline` を実装する。** 手順は、アルファ127超でマスク化、`MIN_ISLAND_PX` 未満の連結成分を捨てる、残った島ごとに外側の輪郭をたどる、Douglas-Peucker で簡略化、凸多角形へ分解、Planck の頂点数の上限(Task 1 で確認した値)を超えたものを分ける。分解は `poly-decomp` などのライブラリを使ってよい。
- [ ] **Step 4: テストが通ることを確認する。**
- [ ] **Step 5: Commit** `feat(geometry): compute convex outline from sprite alpha`

### Task 4: 全種類の形の事前計算とプレビュー

**Files:**
- Create: `scripts/build-shapes.ts`、`data/exclusions.json`、`preview.html`、`src/preview.ts`
- Generate: `public/shapes.json`(commit する。画像ではない)

**Interfaces:**
- Consumes: `computeOutline`(Task 3)、`data/names.json`
- Produces: `public/shapes.json` = `Record<string, OutlineResult>`。`data/exclusions.json` = 除外する名前の配列(手で編集できる)。スクリプトは、`components` が2以上、`fillOverHull` が0.45未満(調査で出た X/Y のリザードンが0.41)、`thin` のいずれかのものを `data/flagged.json` に出す。

- [ ] **Step 1: `scripts/build-shapes.ts` を書く。** `pngjs` で PNG を読み、`computeOutline` を全1025種類に実行して `shapes.json` と `flagged.json` を作る。画像が読めない名前は飛ばして記録する。
- [ ] **Step 2: 実行して、`flagged.json` の件数を確認する。**
  Expected: 完了し、飛ばした件数も一緒に出る。
- [ ] **Step 3: `preview.html` を作る。** スプライトの上に多角形を重ねて、1匹ずつ送れる(前へ・次へ、名前で検索)。`flagged.json` のものだけを見るボタンも付ける。
- [ ] **Step 4: ユーザーがプレビューを開き、変なものを `data/exclusions.json` に入れる。** 輪郭が崩れている種類が多ければ、`SIMPLIFY_TOLERANCE_PX` を直して Step 2 をやり直す。
- [ ] **Step 5: Commit** `feat(scripts): precompute shapes for all sprites`

### Task 5: 物理の世界

**Files:**
- Create: `src/physics/world.ts`
- Test: `src/physics/world.test.ts`

**Interfaces:**
- Consumes: `OutlineResult`(Task 3)。`polygons` の全部が、1つの剛体の fixture になる。
- Produces: `export function createWorld(): World`、`World` は `{ addPiece(id: string, polygons: Vec[][], x: number, angle: number): Piece; step(dt: number): void; pieces(): Piece[]; remove(piece: Piece): void }`。`Piece` は `{ id: string; x: number; y: number; angle: number; asleep: boolean }`。台座は世界に固定で入っている。

- [ ] **Step 1: 30秒の安定テストを書く。** 実際の形に近い不規則な多角形(L字などの合成形)10個を台座に積み、60Hz で30秒進める。5秒時点と30秒時点で、全部の位置の差が 0.01m 未満。
- [ ] **Step 2: テストが失敗することを確認する。**
- [ ] **Step 3: `createWorld` を実装する。** 重力と台座を作る。多角形は `PIXELS_PER_METER` を使い、Planck の頂点数の上限を守る。
- [ ] **Step 4: テストが通ることを確認する。** 通らなければ、設計書の方針どおり、ここで別の物理エンジンに切り替えるか判断してユーザーに知らせる。
- [ ] **Step 5: Commit** `feat(physics): add planck world with stability test`

### Task 6: 描画

**Files:**
- Create: `src/render/renderer.ts`
- Modify: `src/main.ts`、`index.html`

**Interfaces:**
- Consumes: `World`(Task 5)
- Produces: `export function createRenderer(canvas: HTMLCanvasElement, sprites: Map<string, HTMLImageElement>): Renderer`、`Renderer` は `{ draw(pieces: Piece[], held: Piece | null): void }`。カメラは、静止している剛体のうち一番高い位置を追って上へ動く。

- [ ] **Step 1: 画面の縦横比を縦向き固定で `canvas` に設定し、画面の大きさが変わっても作り直さないようにする。**
- [ ] **Step 2: `draw` を実装する。** スプライトを剛体の位置・角度で描く。台座も描く。
- [ ] **Step 3: 手でページを開き、積んだポケモンが画像どおりの見た目で表示されることを確認する。**
- [ ] **Step 4: Commit** `feat(render): draw pieces and follow tower height`

### Task 7: 操作

**Files:**
- Create: `src/input/controls.ts`
- Test: `src/input/controls.test.ts`
- Modify: `index.html`

**Interfaces:**
- Produces: `export const ROTATE_STEP_DEG = 45`、`export function createControls(canvas: HTMLCanvasElement, handlers: { onMove(x: number): void; onRotate(): void; onDrop(): void }): void`。

- [ ] **Step 1: テストを書く。** (a) ドラッグで `onMove` に横位置が渡る。(b) 回転ボタンで `onRotate` が呼ばれる。(c) 指を離すと `onDrop` が1回呼ばれる。(d) ドラッグ中に2本目の指が触れても、`onDrop` が余分に呼ばれず、最初の指が離れるまで続く。(e) ポインターの種類がマウスでも、(a)〜(c) と同じように動く。
- [ ] **Step 2: テストが失敗することを確認する。**
- [ ] **Step 3: `createControls` を実装する。** Pointer Events を使い、最初の指だけを追う。canvas に `touch-action: none`、`index.html` に `user-scalable=no` を付ける。回転ボタンは大きく、アイコンだけにする。
- [ ] **Step 4: テストが通ることを確認する。**
- [ ] **Step 5: Commit** `feat(input): add drag drop and rotate controls`

### Task 8: ゲームの進行と記録

**Files:**
- Create: `src/game/game.ts`
- Test: `src/game/game.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `World`(Task 5)、`createControls`(Task 7)、`createRenderer`(Task 6)、`public/shapes.json`、`data/exclusions.json`
- Produces: `export const SPAWN_TIMEOUT_S = 3`、`export const KILL_LINE_Y`(台座より下の位置)、`export function pickNext(names: string[], excluded: Set<string>, previous: string | null, rand: () => number): string`、`export function createGame(deps): Game`。`Game` は `{ stackedCount: number; heightM: number }` を持つ。

- [ ] **Step 1: テストを書く。** (a) `pickNext` は除外リストに入っている名前を返さず、直前と同じ名前も返さない。(b) 台座から落ちて `KILL_LINE_Y` を下回った剛体は消えて、ゲームは続き、`stackedCount` に数えない。(c) 次のポケモンは「全部の剛体が静止した」または「`SPAWN_TIMEOUT_S` 秒が過ぎた」のどちらか早いほうで出る。(d) `heightM` は台座の上面から、静止している剛体の一番高い点までの高さ。(e) 画像が読めないポケモンは飛ばして、別のものを選ぶ。
- [ ] **Step 2: テストが失敗することを確認する。**
- [ ] **Step 3: `pickNext` と `createGame` を実装する。**
- [ ] **Step 4: テストが通ることを確認する。**
- [ ] **Step 5: ユーザーが iPad の Safari で、`vite --host` と、`vite build` のあとの `vite preview --host` の両方を開いて遊び、どちらが安定するか、操作しやすさ、勝手に崩れないことを教える。** 配り方の結果を設計書の60行目に書き込む。気づいたことは設計書の「提案」の項目に書く。
- [ ] **Step 6: Commit** `feat(game): add random pieces, scoring and kill line`
