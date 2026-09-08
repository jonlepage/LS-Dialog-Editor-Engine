# Blueprint と Scene

## Blueprint の構造

`BlueprintExport` は [LSDE](https://lepasoft.com/ja/software/ls-dialog-editor "Lepasoft Dialog Editor") エディターから出力される JSON ファイルです。engine が必要とするすべてのデータを含んでいます。

<!--@include: ../../_shared/blueprint-export-type.md-->

## Scene

scene は独立した対話シーケンスです — 会話、カットシーン、チュートリアル、ショップのやり取りなど。ゲームでは通常、スクリプトイベントによってトリガーされます：プレイヤーが NPC に話しかける、ゾーンに入る、アイテムを拾うなど。

各 scene は独自のエントリーブロック、独自のフロー、独自の状態を持ちます。複数の scene を並行して実行できます（例：メインダイアログとチュートリアルオーバーレイ）。scene は [`BlueprintScene`](/api-ref/type-aliases/BlueprintScene) インターフェースで定義されます：

<!--@include: ../../_shared/blueprint-scene-type.md-->

## Connection

connection は block 間のワイヤーです — どの block がどの block に繋がるかを定義します。**エクスポートに connection テーブルは存在しません**：各 block が自身の出力ワイヤーを `block.next` に持ち、ワイヤーはどの port から出てどこへ向かうかだけを示します。

ワイヤーが scene の境界を越えたことは、この形式のどのバージョンでも**一度もありません**：`to` は常に同じ scene の block を指します。

[`BlueprintConnection`](/api-ref/type-aliases/BlueprintConnection) はそれらのワイヤーを**フラット化**したビューで、`engine.getSceneConnections(sceneRef)` が返すものです — 出発元の block を付け直したワイヤーです：

<!--@include: ../../_shared/blueprint-connection-type.md-->

通常、これらを検査する必要はありません — engine が内部でルーティングを処理します。`engine.getSceneConnections(sceneRef)` は**グラフ検査**のために公開されています：scene を再生せずに配線を見るデバッグビューです。

## Dictionary

dictionary はゲームのレジスタを記述します — スイッチ、変数、インベントリなど。開発者が [LSDE](https://lepasoft.com/ja/software/ls-dialog-editor "Lepasoft Dialog Editor") エディターで宣言し、ナラティブデザイナーにゲーム内で利用可能な変数を公開します。ランタイムでは、開発者が各 dictionary をゲームの対応するシステムにマッピングします。[`condition`](/api-ref/interfaces/ConditionTest) と [`onResolveCondition`](/api-ref/classes/DialogueEngine#onresolvecondition) がこれらのキーを使ってゲーム状態を評価します。[`DictionaryDefinition`](/api-ref/interfaces/DictionaryDefinition) インターフェースで定義されます：

<!--@include: ../../_shared/blueprint-dictionary-type.md-->

## Function

function はゲームが実行できる処理を記述します — `set_flag`、`play_sound`、`give_item`。開発者が [LSDE](https://lepasoft.com/ja/software/ls-dialog-editor "Lepasoft Dialog Editor") エディターで宣言し、ナラティブデザイナーが型付きパラメーターでシーケンスを構成できるようにします。ランタイムでは、function の `id` を開発者が自分のシステムにマッピングします：ACTION block が `call.fn` でそれを参照し、引数は `call.args` に**名前で**渡されます。[`FunctionDefinition`](/api-ref/interfaces/FunctionDefinition) インターフェースで定義されます：

<!--@include: ../../_shared/blueprint-signature-type.md-->
