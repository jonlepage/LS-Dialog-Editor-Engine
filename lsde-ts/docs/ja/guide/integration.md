# ゲームエンジン統合

LSDE はエンジン非依存です — ゲームエンジン、UIフレームワーク、オーディオシステムへの依存はありません。グラフを走査し、登録された handler を呼び出します。このページでは、主要なゲームエンジンへの組み込み方法を示します。

handler の詳細な実装については、[Block Types](./block-types) と [Handlers](./handlers) を参照してください。

## 完全な統合例

以下の例は、各エンジンに LSDE を統合する一つの方法を示しています。必須の 4 つの handler — dialog、choice、condition、action — を一つのクラスにまとめた、出発点となるコードです。

ゲームごとにニーズは異なります。構造、レイアウト、UI をプロジェクトに合わせて調整してください。

<!--@include: ../../_shared/integration-complete.md-->

## 4つの Handler

各 handler は block データと `next()` コールバックを受け取ります。開発者がエンジン内でデータを処理し、block の処理が完了したら `next()` を呼び出します。その呼び出しのタイミングはゲーム側に委ねられています。

- **Dialog** — テキスト、キャラクター、ネイティブプロパティ。UI にダイアログを表示し、プレイヤーの入力またはディレイを待ってから `next()` を呼び出します。engine が次の block に移る際に UI を非表示にするクリーンアップ関数を返します。

- **Choice** — `onResolveCondition()` が設定されている場合、`visible` タグ付きの選択肢リスト。engine は**すべて**の選択肢をタグ付きで渡します。`visible !== false` でフィルターしてください。対応する UI 要素を作成します — ボタン、リスト、ラジアルメニュー。プレイヤーが選択したら、`selectChoice(optionId)` で分岐先を engine に伝え、`next()` でフローを進めます。

- **Condition** — block に定義された case。`onResolveCondition()` を一度登録すれば engine が事前評価するため、`onCondition` は任意になります。ルーティングを上書きする場合、`context.resolve(port)` は**ポート名**を取ります — `"out"`、`"default"`、または case のポート（`"K1"`）。

- **Action** — block の呼び出しは `context.calls` にあります：`fn` と、**名前で**渡される `args`。エンジンで実行します — サウンド再生、アイテム付与、シネマティックのトリガー。`context.resolve()` は `then` から、`context.reject()` は `catch` から出ます — `catch` が配線されていない場合は `then` にフォールバックします。

## Tips

- **`next()` はリモコンです。** 高速ダイアログのために即座に呼び出すか、アニメーションが完了するまで保持します。engine は待機します — 時間の概念を持ちません。
- **クリーンアップ関数が後片付けします。** どの handler からでも関数を返せば、engine が次の block に移る時に呼び出します。UI の非表示、オーディオの停止、ノードの解放に最適です。
- **`onBeforeBlock` が delay を処理します。** engine は `props.delay` を強制しません — `onBeforeBlock` がそれを読み取り、タイマー後に `resolve()` を呼び出します。完全な制御権があります。
- **async track は並列フローです。** カットシーンでダイアログとカメラ移動を同時に行う場合、エディタで `isAsync` マークされた block は独立した track で実行されます。
