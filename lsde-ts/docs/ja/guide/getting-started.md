# はじめに

## インストール

<!--@include: ../../_shared/install-tabs.md-->

## 基本的な使い方

engine はグラフ走査マシンです — block を handler にディスパッチし、ホストアプリケーション側でそれに意味を与えます。handler がなければ、engine は何も出力しません。

::: tip フォーマット非依存
engine は `BlueprintExport` オブジェクトを受け取ります（ファイルではありません）。JSON、XML、YAML のいずれかを、プラットフォームに適したパーサーで読み込んでください。[解析とインポート](./parsing)を参照してください。
:::

<!--@include: ../../_shared/getting-started-usage.md-->

## Blueprint の検証

`engine.init()` はエラー、警告、統計情報を含む[診断レポート](/api-ref/interfaces/DiagnosticReport)を返します。`check` オプションでゲーム側の機能とのクロスバリデーションが可能です：

<!--@include: ../../_shared/getting-started-validation.md-->

### 25 個の診断

**エラー — payload は拒否され、何も再生されません。** `errors` は空ではなく、`engine.scene()` は何も返せません。

| コード | 何が起きたか |
|---|---|
| `MISSING_DATA` | `init()` に `data` が渡されていません |
| `MISMATCHED_EXPORTS` | 別々のエクスポート由来のファイルが混在しています — `project` か `exportedAt` が一致しません。1 回のエクスポートのファイルだけを渡してください |
| `WRONG_NAMING_CONVENTION` | `snake_case` または `PascalCase` でエクスポートされています。engine が読むのは camelCase です。プロジェクト設定 › エクスポーター › 命名規則 |
| `INVALID_FORMAT` | `format` が `lsde-blueprints` ではありません。C# と C++ は上のケースでもこれを報告します：型付きオブジェクトを検証するため、元のキー名はすでに失われています |
| `UNSUPPORTED_FORMAT_VERSION` | `version` が `1` ではありません。LSDE 1.6 のままのプロジェクトは engine 0.3.x に属します — 二重リーダーはありません |
| `NO_SCENES` | payload に scene が 1 つもありません |
| `DUPLICATE_SCENE` | 2 つの scene が path または安定 id を共有しています |
| `MISSING_SCENE_PATH` | scene に path がありません |
| `DUPLICATE_BLOCK_ID` | **同一** scene の 2 つの block が id を共有しています。scene をまたぐ場合は正当かつ想定どおりです — block は (scene, id) です |
| `INVALID_START_BLOCK` | scene が、自分の block ではないものを開始 block として指しています |
| `BROKEN_LINK` | ワイヤーが scene に存在しない block を指しています。トラバーサルには行き先がありません |

**警告 — 再生はされますが、何かが静かに動きません。** 読んでください。どれもノイズではありません。

| コード | 何を失うか |
|---|---|
| `NO_START_BLOCK` | scene に開始 block がないため、`start()` に始める場所がありません |
| `UNKNOWN_WAIT_BLOCK` | `waitForBlocks` の id が scene の block ではないため、そのトラックは**永久に**停留します。検証はそれ以上進めません：実在する id でも再生されないことはあり得ます |
| `EMPTY_FUNCTION` | action に関数が選ばれていない呼び出しがあります。ゲームは実行できない呼び出しを受け取ります |
| `UNDECLARED_FUNCTION` | action がエクスポートで宣言されていない関数を呼んでいます — たとえばプロジェクトに残った v1 の id。以前は黙って読み込まれ、ゲーム内で失敗していました |
| `UNDECLARED_ARGUMENT` | 呼び出しが、関数の宣言にない引数を渡しています |
| `UNDECLARED_DICTIONARY_KEY` | `dictionaryKey` 引数が、そのパラメーターが指す辞書のエントリではありません |
| `UNDECLARED_DICTIONARY` | condition がエクスポートで宣言されていない辞書をテストしています |
| `UNDECLARED_ENTRY` | condition が、辞書で宣言されていないエントリをテストしています |
| `UNKNOWN_CHOICE_BLOCK` | 予約辞書 `choice` のテストが、この scene の CHOICE ではない block を指しています |
| `UNKNOWN_CHOICE_OPTION` | 予約辞書 `choice` のテストが、その CHOICE にないオプションを指しています |
| `UNKNOWN_FUNCTION` | action が `check.functions` に無い関数 id を呼んでいます |
| `UNKNOWN_DICTIONARY` | condition が `check.dictionaries` に無い辞書 id をテストしています |
| `UNKNOWN_DICTIONARY_ENTRY` | 辞書は既知ですが、エントリキーが未知です |
| `UNKNOWN_CARD` | block が `check.cards` に無いアクターカードの**名前**を指しています |

最後の 4 つは `check` を渡したときにだけ現れます — 渡さなければ engine には比較する相手がありません。
その上の 8 つは常に有効です：block が**使う**ものを、エクスポート自身が**宣言する**ものと比べるため、
`check` は不要です。

scene 内で見つかった診断は `sceneId`（安定 id `sc_…`、`handle.getSceneId()` が返すもの）と `scenePath` を持ち、
block を指すときは `blockId` も持ちます。


