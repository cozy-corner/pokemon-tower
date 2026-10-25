# pokemon-tower

「どうぶつタワーバトル」風の、ポケモンを積み上げるゲーム。**個人・家庭内で遊ぶための非公式ファンプロジェクト**です。任天堂、ゲームフリーク、ポケモン社とは無関係です。

- ポケモンのスプライト画像は、このリポジトリに含めていません。ダウンロード用のスクリプトで、各自のローカルに取得します。
- 画像は PokeAPI の dream-world SVG です。SVG が無い89種類は `data/exclusions.json` に入れて遊びません(取得で作り直されます)。手で外したいものは `data/exclusions-extra.json` に書きます。
- 設計: `docs/superpowers/specs/`
- 実装計画: `docs/superpowers/plans/`
