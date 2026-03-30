# Blueprint と Scene

## Blueprint の構造

`BlueprintExport` は [LSDE](https://lepasoft.com/ja/software/ls-dialog-editor "Lepasoft Dialog Editor") エディターから出力される JSON ファイルです。engine が必要とするすべてのデータを含んでいます。

<!--@include: ../../_shared/blueprint-export-type.md-->

## Scene

scene は独立した対話シーケンスです — 会話、カットシーン、チュートリアル、ショップのやり取りなど。ゲームでは通常、スクリプトイベントによってトリガーされます：プレイヤーが NPC に話しかける、ゾーンに入る、アイテムを拾うなど。

各 scene は独自のエントリーブロック、独自のフロー、独自の状態を持ちます。複数の scene を並行して実行できます（例：メインダイアログとチュートリアルオーバーレイ）。scene は [`BlueprintScene`](/api-ref/interfaces/BlueprintScene) インターフェースで定義されます：

<!--@include: ../../_shared/blueprint-scene-type.md-->

## Connection

connection は block 間のワイヤーです — どの block がどの block に繋がるかを定義します。エディター上では視覚的に描画し、エクスポートではソース → ターゲットのフラットなリストになります。[`BlueprintConnection`](/api-ref/interfaces/BlueprintConnection) インターフェースで定義されます：

<!--@include: ../../_shared/blueprint-connection-type.md-->

通常、connection を直接検査する必要はありません — engine が内部でルーティングを処理します。ただし、必要に応じて [`onValidateNextBlock`](/api-ref/classes/DialogueEngine#onvalidatenextblock) で参照できます。

## Dictionary

dictionary はゲームのレジスタを記述します — スイッチ、変数、インベントリなど。開発者が [LSDE](https://lepasoft.com/ja/software/ls-dialog-editor "Lepasoft Dialog Editor") エディターで宣言し、ナラティブデザイナーにゲーム内で利用可能な変数を公開します。ランタイムでは、開発者が各 dictionary をゲームの対応するシステムにマッピングします。[`condition`](/api-ref/interfaces/ExportCondition) と [`setChoiceFilter`](/api-ref/classes/DialogueEngine#setchoicefilter) がこれらのキーを使ってゲーム状態を評価します。[`Dictionary`](/api-ref/interfaces/Dictionary) インターフェースで定義されます：

<!--@include: ../../_shared/blueprint-dictionary-type.md-->

## Action Signature

signature はゲームで利用可能なアクションタイプを記述します — `set_flag`、`play_sound`、`give_item`。開発者が [LSDE](https://lepasoft.com/ja/software/ls-dialog-editor "Lepasoft Dialog Editor") エディターで宣言し、ナラティブデザイナーが型付きパラメーターでアクションシーケンスを構成できるようにします。ランタイムでは、signature の `id` を開発者が自分のシステムにマッピングします。[`ActionSignature`](/api-ref/interfaces/ActionSignature) インターフェースで定義されます：

<!--@include: ../../_shared/blueprint-signature-type.md-->
