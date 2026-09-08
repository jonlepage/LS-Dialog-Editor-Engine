# Block タイプ

block は dialogue scene の構成要素です — エディターグラフの各ノードが block です。engine は block から block へフローをルーティングし、各タイプに対応する handler を呼び出します。

タイプは5種類あります：**Dialog**、**Choice**、**Condition**、**Action**、**Note**。最初の4つは専用の handler（`onDialog`、`onChoice`、`onCondition`、`onAction`）を持つコンテンツ block です — 4つとも**必須**で、`start()` 呼び出し時に検証されます。Note block は自動的にスキップされます。

handler は2つのレベルで構成されます：**global handler**（engine に登録）はすべての scene をカバーし、ほとんどのゲームではこれだけで十分です。**scene handler**（[`SceneHandle`](/api-ref/interfaces/SceneHandle) に登録）は、特定の scene で global を補完または上書きできます。詳細は [Handlers](/ja/guide/handlers) を参照してください。

## DIALOG

dialog block はセリフを表します — キャラクターの会話、ナレーター、画面上のテキスト。engine は `onResolveCharacter` callback で話しているキャラクターを解決し、`context.character` として公開します。典型的な dialog handler はゲーム内でテキストインスタンス（テキストボックス、吹き出し、字幕…）を作成し、プレイヤーやアニメーションの完了を待ち、`next()` を呼び出して engine を進めます。オプションの cleanup 関数で、engine が次の block に移る際に副作用をクリーンアップできます。

<!--@include: ../../_shared/block-dialog.md-->

ナラティブデザイナーがキャラクターごとに専用の出力を割り当てた場合（[`portPerCharacter`](/api-ref/interfaces/NativeProperties#portpercharacter)）、handler は `resolveCharacterPort()` を呼び出して `next()` 時にどのパスを辿るかを engine に伝える必要があります。

## CHOICE

choice block はプレイヤーが選択する分岐点です — ダイアログメニュー、選択肢リスト。`context.options` に全ての選択肢が含まれます。[`onResolveCondition()`](/ja/guide/choice-visibility) が設定されている場合、各選択肢は `visible: true | false` でタグ付けされ、handler が表示する選択肢をフィルタリングします。プレイヤーの操作後、`selectChoice(optionId)` で engine にどのパスを辿るかを伝え — **option の id がそのまま出口 port です**（`C1`、`C2`…）— `next()` でフローを進めます。

<!--@include: ../../_shared/block-choice.md-->

完全なオプトイン方式のタグ付けシステムについては [Choice の表示制御](/ja/guide/choice-visibility) を参照してください。

## CONDITION

condition block は不可視の分岐器です — ゲーム状態を参照し、プレイヤーに見えないままフローを送り出します。

**engine 自身は何も比較しません。** dictionary を読まず、`credits` の中身を知らず、`greaterOrEqual` を
実装してもいません。各テストを [`onResolveCondition()`](/ja/guide/choice-visibility) に渡し、答えを
組み立てるだけです。各テストが尋ねられるのは、モードに関わらず**一度だけ**です。

resolver が登録されていれば、engine は handler を呼ぶ前から出口 port を知っています：`onCondition` は
**任意**になり、ログ出力や上書きのためのフックになります。handler は `context.cases` を受け取り、各 case
は自身の `port` と評価済みの `result` を持ちます。上書きするには、`context.resolve(port)` に**ポート名**を
渡します — `"out"`、`"default"`、あるいは case のポート（`"K1"`）。

モードは**二つ、それだけ**です：

- **`portPerCase` なし** — すべての case が成立する必要があります。成立すればフローは `out` から、
  そうでなければ `default` から出ます。
- **`portPerCase: true`** — **最初に**成立した case が**自身の port**（`K1`、`K2`…）から出ます。
  どれも成立しなければ `default`。

`when` を持たない case は常に真であり、`portPerCase` モードではそれより下の case を到達不能にします。
これは writer が描いた図であって、報告すべき誤りではありません。case が一つもない block は `out` から
出ます：何も尋ねられていないので、何も失敗していません。

`default` は「どの case も成立しなかった」を意味します — 「選ばれた出口に線がない」では**ありません**。
線のない port はフローを終わらせますが、それは正当な終わり方です。

dictionary が予約語 **`choice`** であるテストは、プレイヤーがすでに出した答えを問い合わせます：
`{ dict: "choice", entry: "CHOICE-001", value: "C1" }`。engine は scene の履歴から**自分で**答えるため、
この問いがゲームに届くことはありません。`scene.getChoice(blockId)` と `scene.evaluateCondition(test)` も
参照してください。

<!--@include: ../../_shared/block-condition.md-->

## ACTION

action block はゲーム内で副作用を発動します — アイテムの付与、サウンドの再生、フラグの設定。
`context.calls` が呼び出しを保持します：それぞれが宣言済みの [function](/ja/guide/blueprints#function) の
`fn` を参照し、その `args` は位置ではなく**名前で**渡されます。handler はそれらを実行してから
`context.resolve()` で `then` port を、`context.reject()` で `catch` port を辿ります — designer が `catch` を
一本も配線していない場合、プレイヤーを置き去りにするのではなく `then` からフローが続きます。

<!--@include: ../../_shared/block-action.md-->

## NOTE

note block はナラティブデザイナーのためのメモです — コメント、リマインダー、コンテキスト。走査中は自動的にスキップされます。[`onBeforeBlock`](/ja/guide/lifecycle) で note block をインターセプトすることは技術的に可能ですが、推奨されません — action block がすべての副作用のニーズをカバーできます。

## 共通プロパティ

すべての block は以下の基本フィールドを共有します（[`BlueprintBlockBase`](/api-ref/type-aliases/BlueprintBlock)）：

| フィールド | 型 | 説明 |
|-------|------|-------------|
| `id` | `string` | **その scene に対する**識別子 — `DIALOG-002`。id は scene をまたいで繰り返されます。 |
| `key` | `string` | ローカライズファイルが持つ完全な i18n キー |
| `type` | `BlockType` | `dialog`、`choice`、`condition`、`action`、`note` |
| `label` | `string?` | writer が付けた場合の可読名 |
| `parentLabels` | `string[]?` | エディター内の親フォルダー階層 |
| `note` | `string?` | writer のメモ |
| `actors` | `string[]?` | block が参照する **card の id**、ファイル順 |
| `emotion` | `string?` | 感情の card id — 各 actor ではなく **block** に属します |
| `intensity` | `number?` | その感情の強さ |
| `text` | `TextByLocale?` | inline 出力の場合のロケール別テキスト |
| `props` | `PropertyBag?` | **ひとつの袋**：native と writer 自身のプロパティが、素の id で同居します |
| `options` | `Option[]?` | CHOICE のみ |
| `cases` | `ConditionCase[]?` | CONDITION のみ |
| `calls` | `ActionCall[]?` | ACTION のみ |
| `next` | `Link[]?` | **block の出力ワイヤー。** v2 に connection テーブルはありません |

エントリー block は block 側には印されていません：それを指名するのは **scene** で、`scene.start` に
書かれます。したがって、ひとつの scene がエントリーを二つ宣言することはできません。

### NativeProperties

**engine** が `props` から読み取る九つのプロパティです。id が衝突することはありません — LSDE は
native と同じ名前のプロジェクトプロパティを拒否します — したがって見分けるのは単なる検索です。

| フィールド | 型 | 説明 |
|-------|------|-------------|
| `isAsync` | `boolean?` | 現在のトラックを続ける代わりに、この block で**並列トラックを開きます** |
| `waitForBlocks` | `string[]?` | **この scene の** block id。それらがすべて訪問されるまで、block は**ディスパッチされる前に**保持されます — handler は呼ばれません |
| `delay` | `number?` | block が再生されるまでの**ミリ秒**。`onBeforeBlock` が適用し、engine は決して適用しません |
| `timeout` | `number?` | **ミリ秒**。そのまま渡されます — engine は何も強制しません |
| `waitInput` | `boolean?` | プレイヤー入力を待つ。そのまま渡され、解釈されません |
| `debug` | `boolean?` | エディタ用デバッグフラグ。そのまま渡されます |
| `portPerCharacter` | `boolean?` | block は `out` ではなく、actor の **card id で名付けられた port** から出ます |
| `skipIfMissingActor` | `boolean?` | そのまま渡されます — 判断はゲーム側です |
| `portPerCase` | `boolean?` | CONDITION：各 case が `out` を共有せず、**自身の port**（`K1`…）から出ます |

::: warning `delay` と `timeout` は v2 では**ミリ秒**です
v1 では秒でした。そして**実行時にそれを知らせるものは何もありません**：移行したプロジェクトでは
3 秒の間が 3 ミリ秒になります。
:::

これら九つのうち、走査を変えるのは**二つ**だけです：`isAsync` と `waitForBlocks`。残りの七つは
そのままゲームに渡され、どう扱うかはゲームが決めます。
