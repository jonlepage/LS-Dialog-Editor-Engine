# Block タイプ

block は dialogue scene の構成要素です — エディターグラフの各ノードが block です。engine は block から block へフローをルーティングし、各タイプに対応する handler を呼び出します。

タイプは5種類あります：**Dialog**、**Choice**、**Condition**、**Action**、**Note**。最初の4つは専用の handler（`onDialog`、`onChoice`、`onCondition`、`onAction`）を持つコンテンツ block です — 4つとも**必須**で、`start()` 呼び出し時に検証されます。Note block は自動的にスキップされます。

handler は2つのレベルで構成されます：**global handler**（engine に登録）はすべての scene をカバーし、ほとんどのゲームではこれだけで十分です。**scene handler**（[`SceneHandle`](/ja/api-ref/classes/SceneHandle) に登録）は、特定の scene で global を補完または上書きできます。詳細は [Handlers](/ja/guide/handlers) を参照してください。

## DIALOG

dialog block はセリフを表します — キャラクターの会話、ナレーター、画面上のテキスト。engine は `onResolveCharacter` callback で話しているキャラクターを解決し、`context.character` として公開します。典型的な dialog handler はゲーム内でテキストインスタンス（テキストボックス、吹き出し、字幕…）を作成し、プレイヤーやアニメーションの完了を待ち、`next()` を呼び出して engine を進めます。オプションの cleanup 関数で、engine が次の block に移る際に副作用をクリーンアップできます。

<!--@include: ../../_shared/block-dialog.md-->

ナラティブデザイナーがキャラクターごとに専用の出力を割り当てた場合（[`portPerCharacter`](/api-ref/interfaces/NativeProperties#portpercharacter)）、handler は `resolveCharacterPort()` を呼び出して `next()` 時にどのパスを辿るかを engine に伝える必要があります。

## CHOICE

choice block はプレイヤーが選択する分岐点です — ダイアログメニュー、選択肢リスト。`context.choices` に全ての選択肢が含まれます。[`setChoiceFilter()`](/ja/guide/choice-visibility) が設定されている場合、各選択肢は `visible: true | false` でタグ付けされ、handler が表示する選択肢をフィルタリングします。プレイヤーの操作後、`selectChoice(uuid)` で engine にどのパスを辿るかを伝え、`next()` でフローを進めます。

<!--@include: ../../_shared/block-choice.md-->

完全なオプトイン方式のタグ付けシステムについては [Choice の表示制御](/ja/guide/choice-visibility) を参照してください。

## CONDITION

condition block は不可視のスイッチです — ゲーム状態を評価し、プレイヤーに見えることなくフローを2つのパスのどちらかに送ります。handler は block の条件（変数、フラグ、インベントリ…）を評価し、`context.resolve(result)` を呼び出します — `true` は port 0 に、`false` は port 1 に従います。`choice:` で始まるキーの条件はプレイヤーの過去の選択を参照しており、`scene.evaluateCondition(cond)` が内部の履歴から自動的に解決します。

<!--@include: ../../_shared/block-condition.md-->

## ACTION

action block はゲーム内で副作用を発動します — アイテムの付与、サウンドの再生、フラグの設定。各アクションは開発者が自身のシステムにマッピングする `actionId` を参照します。handler はアクションリストを実行し、`context.resolve()` で "then" port を、`context.reject(error)` で "catch" port を辿ります（"catch" 接続がない場合は "then" にフォールバック）。

<!--@include: ../../_shared/block-action.md-->

## NOTE

note block はナラティブデザイナーのためのメモです — コメント、リマインダー、コンテキスト。走査中は自動的にスキップされます。[`onBeforeBlock`](/ja/guide/lifecycle) で note block をインターセプトすることは技術的に可能ですが、推奨されません — action block がすべての副作用のニーズをカバーできます。

## 共通プロパティ

すべての block は以下の基本フィールドを共有します（[`BlueprintBlockBase`](/api-ref/interfaces/BlueprintBlockBase)）：

| フィールド | 型 | 説明 |
|-------|------|-------------|
| [`uuid`](/api-ref/interfaces/BlueprintBlockBase#uuid) | `string` | 一意識別子 |
| [`type`](/api-ref/interfaces/BlueprintBlockBase#type) | `BlockType` | 判別タイプ |
| [`label`](/api-ref/interfaces/BlueprintBlockBase#label) | `string?` | 人間可読な名前 |
| [`parentLabels`](/api-ref/interfaces/BlueprintBlockBase#parentlabels) | `string[]?` | エディター内の親フォルダー階層 |
| [`properties`](/api-ref/interfaces/BlueprintBlockBase#properties) | `BlockProperty[]` | キー・バリュープロパティ |
| [`userProperties`](/api-ref/interfaces/BlueprintBlockBase#userproperties) | `Record?` | 自由形式のユーザープロパティ |
| [`nativeProperties`](/api-ref/interfaces/BlueprintBlockBase#nativeproperties) | `NativeProperties?` | 実行プロパティ |
| [`metadata`](/api-ref/interfaces/BlueprintBlockBase#metadata) | `BlockMetadata?` | 表示メタデータ（キャラクター、タグ、カラー） |
| [`isStartBlock`](/api-ref/interfaces/BlueprintBlockBase#isstartblock) | `boolean?` | エントリー block を示す |

### NativeProperties

| フィールド | 型 | 説明 |
|-------|------|-------------|
| [`isAsync`](/api-ref/interfaces/NativeProperties#isasync) | `boolean?` | 並列 async トラックで実行 |
| [`delay`](/api-ref/interfaces/NativeProperties#delay) | `number?` | 実行前の遅延（`onBeforeBlock` で処理） |
| [`timeout`](/api-ref/interfaces/NativeProperties#timeout) | `number?` | 実行タイムアウト |
| [`portPerCharacter`](/api-ref/interfaces/NativeProperties#portpercharacter) | `boolean?` | metadata 内のキャラクターごとに1つの出力 port |
| [`skipIfMissingActor`](/api-ref/interfaces/NativeProperties#skipifmissingactor) | `boolean?` | 参照アクターが不在の場合 block をスキップ |
| [`debug`](/api-ref/interfaces/NativeProperties#debug) | `boolean?` | エディタ用デバッグフラグ |
| [`waitForBlocks`](/api-ref/interfaces/NativeProperties#waitforblocks) | `string[]?` | この block が進行する前に訪問済みでなければならない block UUID |
| [`waitInput`](/api-ref/interfaces/NativeProperties#waitinput) | `boolean?` | プレイヤー入力制御用パッシブフラグ |
