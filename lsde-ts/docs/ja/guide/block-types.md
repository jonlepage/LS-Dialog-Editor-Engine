# Block タイプ

engine は5つの block タイプをサポートしています。それぞれに専用の handler とタイプ固有の context があります。

4つのコンテンツ block handler（`onDialog`、`onChoice`、`onCondition`、`onAction`）は**必須**です — `start()` を呼び出す際に engine がそれらの存在を検証します。

## DIALOG

キャラクターが話すテキストを表示します。キャラクターは `onResolveCharacter` callback によって解決されます。

<!--@include: ../../_shared/block-dialog.md-->

`resolveCharacterPort()` はキャラクターの **UUID を最優先**で照合し、次に**名前**をフォールバックとして使用します。

## CHOICE

プレイヤーに選択肢を提示します。[`setChoiceFilter()`](/ja/guide/choice-visibility) が設定されている場合、各 choice は `visible: true | false` でタグ付けされます。

<!--@include: ../../_shared/block-choice.md-->

完全なオプトイン方式のタグ付けシステムについては [Choice の表示制御](/ja/guide/choice-visibility) を参照してください。

## CONDITION

ロジックを評価してフローを分岐させます。handler は**必ず** `resolve(result)` を呼び出す必要があります — `true` は port index 0 に、`false` は port index 1 に従います。

<!--@include: ../../_shared/block-condition.md-->

::: tip choice: condition について
`choice:` で始まるキーを持つ condition は、以前のプレイヤー選択を参照しています。`scene.evaluateCondition(cond)` を使って解決してください — engine が内部の choice 履歴を自動的にチェックします。
:::

## ACTION

ゲームステートの変更をトリガーします。成功の場合は `resolve()` を、失敗の場合は `reject(error)` を呼び出します。

<!--@include: ../../_shared/block-action.md-->

## NOTE

デザイナー向けのドキュメンテーション block です。実行されることはなく、走査中は自動的にスキップされます。

## 共通プロパティ

すべての block は以下の基本フィールドを共有します：

| フィールド | 型 | 説明 |
|-------|------|-------------|
| `uuid` | `string` | 一意識別子 |
| `type` | `BlockType` | 判別タイプ |
| `label` | `string?` | 人間可読な名前 |
| `properties` | `BlockProperty[]` | キー・バリュープロパティ |
| `userProperties` | `Record?` | 自由形式のユーザープロパティ |
| `nativeProperties` | `NativeProperties?` | 実行プロパティ（async、delay など） |
| `metadata` | `BlockMetadata?` | 表示メタデータ（キャラクター、タグ、カラー） |
| `isStartBlock` | `boolean?` | エントリー block を示す |

### NativeProperties

| フィールド | 型 | 説明 |
|-------|------|-------------|
| `isAsync` | `boolean?` | 並列 async トラックで実行 |
| `delay` | `number?` | 実行前の遅延（`onBeforeBlock` で処理） |
| `timeout` | `number?` | 実行タイムアウト |
| `portPerCharacter` | `boolean?` | metadata 内のキャラクターごとに1つの出力 port |
| `skipIfMissingActor` | `boolean?` | 参照アクターが不在の場合 block をスキップ |
| `debug` | `boolean?` | エディタ用デバッグフラグ |
| `waitForBlocks` | `string[]?` | この block が進行する前に訪問済みでなければならない block UUID |
| `waitInput` | `boolean?` | プレイヤー入力制御用パッシブフラグ |
