ざっくり言うと：

> **AGENTS.md / AGENT.md は「エージェント用 README」**で、
> 「どんなテストを走らせるか」「どんなルールでコードを書き、何を絶対にしてはいけないか」を
> Codex に“機械が読める形”でまとめるファイルです。([agents.md][1])

以下、「2025年12月時点」での **OpenAI公式ドキュメント＋日本語コミュニティ記事＋AGENT.md標準**を踏まえたベストプラクティスをまとめます。

---

## 1. 前提整理：Codex × AGENTS.md / AGENT.md

* Codex は作業を始める前に、**AGENTS.md 系ファイルを読み込んで「指示チェーン」を組み立てる**。
  読み込み順は大きく：

  1. `~/.codex/AGENTS(.override).md`（グローバル）
  2. リポジトリ root から現在ディレクトリまでの `AGENTS(.override).md`
  3. 設定した fallback ファイル名（例: `.agents.md`, `TEAM_GUIDE.md`）([OpenAI Developers][2])
* 後ろで見つかったファイルほど**優先度が高く、手前の指示を上書き**します。([OpenAI Developers][2])
* AGENT.md（単数形）は GitHub 上の標準仕様として定義されており、
  AGENTS.md との互換運用として **`AGENT.md` → `AGENTS.md` の symlink を張る**パターンが紹介されています。([agents.md][3])

> 結論：**Codex 向けは基本 `AGENTS.md` を使い、他ツールも意識するなら `AGENT.md` へのシンボリックリンク（または fallback 名）を用意**するのが「今どき」の運用です。

---

## 2. 設計の大原則（ここだけ覚えれば OK という5箇条）

1. **人間向け README と切り分ける**

   * README.md はプロダクト説明・クイックスタート中心。
   * AGENTS.md は「ビルド/テスト手順・規約・ガードレールなど、エージェントが実行に使う具体手順」に専念。([agents.md][1])

2. **実行可能な指示だけを書く（命令形・コマンド中心）**

   * ×「テストはちゃんと走らせてください」
   * ○「PR 作成前に `pnpm lint && pnpm test` を実行し、失敗したら修正すること」

3. **要件本文は別ファイルに逃がす**

   * AGENTS.md には「どの要件 doc をどう読む／どう満たすか」だけを書く。
   * 本文は `docs/requirements/*.md` などに分割する。([Qiita][4])

4. **階層で役割分担する（近い AGENTS が勝つ）**

   * root: プロジェクト全体のルール
   * `services/foo/AGENTS.md` or `AGENTS.override.md`: Foo サービス専用ルール
   * Codex CLI では「より近いディレクトリの AGENTS が優先される」ことが検証されています。([Qiita][5])

5. **テスト・リンタ・禁止事項を最優先で明文化する**

   * Codex は AGENTS.md に列挙された「プログラム的チェック（テスト等）」を実行し、
     それを通すことを目標に動作する設計になっています。([Qiita][4])

---

## 3. ファイルレベルのベストプラクティス

### 3-1. グローバル：`~/.codex/AGENTS.md`

**目的**：あなた個人 or チーム全体に共通する「働き方の原則」を定義。

例（イメージ）：

```md
# ~/.codex/AGENTS.md

## Working agreements
- 変更を加えた言語のテストは必ず最後に一度実行する。
- 新しい本番依存パッケージを追加する前に、代替案がないかコメントで検討する。
- README を見てもわからない場合は、必ず質問を提案してから大きな変更を始める。
```

ポイント：

* プロジェクト固有のコマンドはここでは書かず、**プロジェクト側 AGENTS.md に任せる**。
* 一時的に違う方針を試したいときは `AGENTS.override.md` を使う。([OpenAI Developers][2])

---

### 3-2. リポジトリ root：`AGENTS.md`

**役割**：プロジェクト全体の「オンボーディング＋共通ルール」。

構成のおすすめ：

1. **プロジェクト概要（1〜3行）**

   * このリポジトリの役割・主要ディレクトリ・メイン技術スタック。

2. **セットアップ / ビルド / テスト**

   * 依存インストール
   * Lint / typecheck
   * 単体テスト・E2E テスト
   * 「PR 前に通っているべきコマンド」

3. **コーディング規約（要点のみ）**

   * 使用言語別の基本方針（例：TypeScript は strict / nullable をどう扱うか）
   * 命名規則・ディレクトリ構成の原則
   * ログ・エラー処理の原則

4. **ガードレール / 禁止事項**

   * 「絶対にやってはいけないこと」
     （例：`prod` DB に対する destructive migration、秘密情報の追加 など）

5. **要件・受入基準の参照**

   * どの doc を読み、どうやって受入条件を満たしたと判断するか。([Qiita][4])

6. **PR / コードレビューのルール**

   * PR タイトル、説明に含めるべき項目（変更理由、影響範囲、テスト結果など）。

---

### 3-3. サブディレクトリ：`AGENTS.override.md` or `AGENTS.md`

**目的**：モノレポやマイクロサービスで、部分ごとにルールを変えたいとき。

* Codex は root から現在ディレクトリまでの AGENTS 系ファイルを順に読み、**後ろほど優先**します。([OpenAI Developers][2])
* あるディレクトリで **完全に差し替えたい**なら `AGENTS.override.md`、
  「少しだけ追加したい」なら通常の `AGENTS.md` をおすすめ。

例：

```md
# services/payments/AGENTS.override.md

## Payments service rules
- 決済サービス内のテストは `make test-payments` を実行する。
- 本番のシークレット値を変更するコミットは作成しない。
- 新しいエンドポイントを追加する場合は `docs/payments-api.md` に追記し、対応テストを追加する。
```

---

## 4. 中身の書き方ベストプラクティス（項目別）

### 4-1. プロジェクト概要

* 目的：**エージェントに「このリポジトリで何をしているか」を一瞬で把握させる**。
* 例：

  * 「このリポジトリは◯◯のバックエンド API を提供する。主要スタックは FastAPI + PostgreSQL。」
  * 「`apps/` はユーザー向けアプリ、`packages/` は共通ライブラリ。」
* 長々と歴史を書くのではなく、**現状の責務と境界だけ**を書く。

### 4-2. セットアップ / ビルド / テスト

公式・コミュニティともに、ここが **最重要セクション** という扱いです。([Qiita][4])

* コマンドは**コピペで動く単体コマンド**にする（`npm test` ではなく、必要なら `docker compose` も含めて明記）。
* 可能なら **`make` / `just` / `package.json` scripts** にラップし、
  AGENTS.md からはそのスクリプトだけを呼ぶようにする（変更に強くなる）。
* テストの粒度ごとに分ける：

  * Lint / typecheck
  * unit / integration / e2e
* 「PR 前に必須なもの」「ローカルでは任意だけど CI では必須なもの」を分けて書く。

Codex 側は AGENTS.md に書かれたチェックを積極的に実行しようとする設計なので、
**ここが曖昧だと変なコマンドを打たれるリスク**が上がります。([Qiita][4])

---

### 4-3. コーディング規約・設計ルール

* すべてを書き切るのではなく、「エージェントが迷いそうなポイント」に絞る：

  * 例：

    * 「React コンポーネントは基本 function component + hooks。class は使わない。」
    * 「ドメイン層からインフラ層への依存は OK だが、その逆はしない。」
* **OK / NG 例を 1〜2個だけ**書くと、モデルがパターンを学習しやすくなる。
* 詳細は `docs/style-guide.md` 等に逃してリンクする。

---

### 4-4. 要件・受入条件の扱い

日本語記事でほぼ一致しているベストプラクティスは：

* 要件本文は **別ディレクトリ（例: `docs/requirements/`）に3層で分割**：

  1. 全体・非機能要件
  2. 機能（エピック）ごとの要件
  3. ストーリー／タスクの受入条件([Qiita][4])
* AGENTS.md には：

  * 「実装前に何を読むか」
  * 「受入条件を満たしたことをどう確認するか（どのテストを足すか）」
    だけを書く。

例：

```md
## Requirements
- 作業前に `docs/requirements/README.md` を開き、対象機能の要件ページを確認する。
- ストーリーごとの受入条件は、該当ページの「Acceptance Criteria」節にある。
- 受入条件に紐づくテストを必ず追加 or 更新し、`pnpm test` が成功する状態で PR を作成する。
```

---

### 4-5. ガードレール（禁止事項・安全対策）

Codex はテスト・コマンドを自律実行できる分、**安全側のルールを AGENTS.md に書いておくことが非常に重要**です。([Qiita][5])

書いておきたい典型例：

* データ・インフラ系

  * 「migration は `dev` / `staging` のみに対して実行し、本番は人間が対応する」
  * 「S3 バケットの削除・パージ系操作は禁止」
* セキュリティ

  * 「秘密情報・個人情報を新たにログに出さない」
  * 「API キーやパスワードを平文でコミットしない」
* プロセス

  * 「API の互換性を壊す変更は ADR を追加してから実施」
  * 「外部公開 API 変更は `docs/openapi.yaml` を更新してから PR」

---

### 4-6. CI/CD との連携

* AGENTS.md に書かれたチェックと、CI のジョブ構成を**できるだけ一致させる**。

  * 例：AGENTS.md に「PR 前に `pnpm lint && pnpm test`」とあるなら、CI でもこのシーケンスをそのまま採用。
* 将来的に、CI 側で「AGENTS.md のルール遵守チェック」スクリプトを走らせる構成もよく提案されています。([Zenn][6])

---

### 4-7. マルチエージェント互換性（AGENT.md / AGENTS.md）

* 今は **AGENTS.md（複数形）が事実上のデファクト**ですが、
  AGENT.md 標準も GitHub で策定されているため、**両対応**しておくと長期的に安心です。([GitHub][7])
* 典型的な運用：

  * ルートに `AGENTS.md` を置く（Codex・Copilot・Cursor 等向け）。([note（ノート）][8])
  * `AGENT.md` を `AGENTS.md` に symlink する（AGENT.md を期待するツール向け）。

---

## 5. Codex 固有の Tips

公式ガイドで明示されている Codex 独自のポイントをまとめると：([OpenAI Developers][2])

1. **指示チェーンの確認コマンドを覚えておく**

   * 例：
     `codex --ask-for-approval never "Summarize the current instructions."`
     → 今読み込まれている AGENTS 系ファイルの内容を要約してくれる。
   * サブディレクトリで：
     `codex --cd services/payments --ask-for-approval never "Show which instruction files are active."`

2. **`AGENTS.override.md` の使い方**

   * あるディレクトリで AGENTS.md を**完全に上書きしたい**ときに使う。
   * override があると、同階層の AGENTS.md は無視される。

3. **fallback ファイル名の活用**

   * `~/.codex/config.toml` の
     `project_doc_fallback_filenames = ["TEAM_GUIDE.md", ".agents.md"]`
     のように設定すると、そのファイルも指示ファイルとして読まれる。

4. **バイト数上限への注意**

   * デフォルトで 32KiB まで。
   * 大型プロジェクトなら `project_doc_max_bytes` を増やすか、ディレクトリごとに分割する。([OpenAI Developers][2])

5. **CLI 検証記事からの知見**

   * AGENTS.md は「自動でそれっぽく全部やってくれる」のではなく、
     **タスク定義が曖昧だと意図しないコマンドを選ばれることがある**
     → タスクやチェックはできるだけ具体的に書く。([Qiita][5])

---

## 6. すぐ使える最小テンプレ（Codex 前提）

最後に、TypeScript/Next.js っぽいプロジェクトを想定した最小例を置いておきます。
（必要に応じて日本語コメントを足してください）

```md
# AGENTS.md

## Project overview
- このリポジトリは Web アプリケーションと API を提供するフルスタック TypeScript プロジェクトです。
- 主なディレクトリ:
  - `apps/web`: Next.js フロントエンド
  - `apps/api`: API サーバー
  - `packages/*`: 共有ライブラリ

## Setup / build / test
- 依存解決: `pnpm install`
- 静的チェック: `pnpm lint && pnpm typecheck`
- 単体テスト: `pnpm test`
- E2E テスト（必要な場合のみ）: `pnpm test:e2e`

**Pull Request を作成する前に、上記すべてのチェックが通っていることを確認してください。**

## Coding conventions
- 言語: TypeScript (strict モード前提)
- 新しいコードは必ず型を付ける。`any` を使う場合は理由をコメントに残す。
- React コンポーネントは関数コンポーネント＋ hooks を使用する。

## Guardrails
- API キーやシークレット値をソースコードに直書きしない。
- 破壊的な DB migration はこのリポジトリから直接実行しない。
- ログに個人情報を新たに追加しない。

## Requirements
- 実装前に `docs/requirements/README.md` を開き、対象機能の要件ページを確認する。
- 要件に記載された Acceptance Criteria を満たすテストを追加または更新する。

## Pull request rules
- PR タイトルは `[scope] 簡潔な説明` の形式にする（例: `[api] add user search endpoint`）。
- PR 本文に以下を含める:
  - 変更理由
  - 影響範囲
  - 実行したテストと結果
```

---

## 7. 「ここからどう進めるか」のおすすめ

1. まずは **root に上のような最小 AGENTS.md を置く**。
2. Codex から
   `codex --ask-for-approval never "Summarize the current instructions."`
   を実行して、ちゃんと読まれているか確認。([OpenAI Developers][2])
3. 実際に Codex にタスクを投げてみて、

   * 間違えられたところ
   * 迷っていそうなところ
     を「AGENTS.md への追記事項」として育てていく。

もし「今の自分のリポジトリの AGENTS.md をレビューしてほしい」「モノレポ構成用の具体例が欲しい」などあれば、貼ってくれればリファクタ案を書きます。

[1]: https://agents.md/?ref=producthunt&utm_source=chatgpt.com "AGENTS.md"
[2]: https://developers.openai.com/codex/guides/agents-md "Custom instructions with AGENTS.md"
[3]: https://agents.md/?utm_source=chatgpt.com "AGENTS.md"
[4]: https://qiita.com/jtths474/items/4dbaeb37847fea67a502?utm_source=chatgpt.com "Codexで使うAGENTS.mdの役割と実務 #要件定義 - Qiita"
[5]: https://qiita.com/ootakazuhiko/items/0079a420010e4322bc1c?utm_source=chatgpt.com "Codex CLI 0.31で AGENTS.md を使ってみた：階層適用の ..."
[6]: https://zenn.dev/unikoukokun/articles/333be4765ec62a?utm_source=chatgpt.com "# CodexのAGENTS.md超徹底解説 ―― AIエージェントを ..."
[7]: https://github.com/agentmd/agent.md?utm_source=chatgpt.com "GitHub - agentmd/agent.md: This repository defines AGENT ..."
[8]: https://note.com/npaka/n/nd1258df2853c?utm_source=chatgpt.com "AGENTS.md の概要｜npaka - note（ノート）"
