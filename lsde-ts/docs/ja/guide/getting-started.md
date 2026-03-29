# はじめに

## インストール

<!--@include: ../../_shared/install-tabs.md-->

## 基本的な使い方

engine はグラフ走査マシンです — block を handler にディスパッチし、ホストアプリケーション側でそれに意味を与えます。handler がなければ、engine は何も出力しません。

<!--@include: ../../_shared/getting-started-usage.md-->

::: tip なぜ4つの handler が必須なのか？
engine は純粋なグラフ走査マシンです — ノードを辿りながら登録されたコードを呼び出します。handler がなければ、block は出力なしで無言のまま処理されます。`start()` の検証がこれを早期にキャッチするため、実行しても何も起きない scene を防げます。
:::

## Blueprint の検証

`engine.init()` は以下を含む診断レポートを返します：

| フィールド | 型 | 説明 |
|-------|------|-------------|
| `errors` | `DiagnosticEntry[]` | ブロッキングエラー — engine は初期化されません |
| `warnings` | `DiagnosticEntry[]` | ノンブロッキング警告 |
| `stats` | `DiagnosticStats` | カウント: scene、block、connection |

ゲーム側の機能とのクロスバリデーションのために `check` を指定することもできます：

<!--@include: ../../_shared/getting-started-validation.md-->

## 次のステップ

- [Block タイプ](/ja/guide/block-types) — 各 block タイプと handler の詳細リファレンス
- [Choice の表示制御](/ja/guide/choice-visibility) — オプトイン方式のタグ付けとフィルタリング
- [Handler とライフサイクル](/ja/guide/handlers) — 2階層システム、クリーンアップ、非同期トラック
