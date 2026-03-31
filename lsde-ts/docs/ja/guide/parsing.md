# 解析とインポート

## 概要

engine は**フォーマット非依存**です — `engine.init({ data })` はデシリアライズ済みの `BlueprintExport` オブジェクトを受け取ります。ファイルや生の文字列ではありません。engine はファイルを読み取らず、シリアライゼーションライブラリに依存しません。

[LSDE エディター](https://lepasoft.com)は複数のフォーマットでブループリントをエクスポートします：

| フォーマット | 完全なグラフ? | 用途 |
|------------|-------------|------|
| **JSON** | はい | デフォルト — すべてのプラットフォームで最も広くサポート |
| **XML** | はい | XML パイプライン、ローカライゼーションツール (XLIFF)、レガシーシステム |
| **YAML** | はい | 人間が読みやすい編集、git diff に最適、設定ドリブンワークフロー |
| **CSV** | いいえ (フラット) | ローカライゼーション / 翻訳 — Excel や Google Sheets へのエクスポート |

CSV はロケールごとのダイアログテキストのフラットテーブルをエクスポートします。接続、条件、アクションは**含まれません** — engine ランタイムでは使用できません。

## 推奨パーサー

<!--@include: ../../_shared/parsing-table.md-->

## Unity

<!--@include: ../../_shared/parsing-unity.md-->

## Unreal Engine

<!--@include: ../../_shared/parsing-unreal.md-->

## Godot

<!--@include: ../../_shared/parsing-godot.md-->

## TypeScript (TS/JS)

<!--@include: ../../_shared/parsing-typescript.md-->

## CSharp (C#)

<!--@include: ../../_shared/parsing-csharp.md-->

## CPP (C++)

<!--@include: ../../_shared/parsing-cpp.md-->

## ポリモーフィックディスパッチ

`BlueprintScene.blocks` は `BlueprintBlock` の配列です — `type` フィールドで識別される 5 つのサブタイプを持つ**判別共用体**です：

| `type` | サブタイプ | 固有フィールド |
|--------|-----------|--------------|
| `DIALOG` | `DialogBlock` | `dialogueText`, `content`, `structureKey` |
| `CHOICE` | `ChoiceBlock` | `choices` |
| `CONDITION` | `ConditionBlock` | `conditions` |
| `ACTION` | `ActionBlock` | `actions` |
| `NOTE` | `NoteBlock` | *（なし）* |

**動的型付け言語**（TypeScript、GDScript）はこれを自動的に処理します — パースされたオブジェクトにはすべてのフィールドが含まれています。

**静的型付け言語**（C#、C++）は `type` フィールドを読み取り、正しいサブタイプを構築するカスタムコンバーターが必要です。これがないと、`dialogueText` や `choices` などのサブタイプ固有のフィールドが暗黙的に失われます。

<!--@include: ../../_shared/parsing-polymorphic.md-->
