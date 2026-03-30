# 非同期トラック

block に `nativeProperties.isAsync = true` が設定されている場合、engine はメインフローとは独立して動作する**並列トラック**を作成します。

## トラックの作成方法

port 解決中に複数の送出 connection が存在する場合：
- **最初の非 async connection** が現在のフローの継続となります
- **その他の connection**（`isAsync` を持つ block へ）が新しい並列トラックになります

これはメイントラック**と** async トラックの両方に適用されます — async トラックは独自の async connection からサブトラックを spawn でき、並列実行の階層を作成できます。

## トラックのライフサイクル

- `onBeforeBlock` は**すべての block** で呼び出されます（メインおよび async トラック） — `resolve()` の詳細は [Lifecycle](./lifecycle) を参照
- async トラックはメイントラックと同様に、送出 connection をメイン vs async に分離します
- トラックは scene 終了時または `cancel()` 呼び出し時に自動的にキャンセルされます
- トラックが自然に終了した場合（connection がなくなった）、サブトラックは**独立して存続**します
- トラックが明示的にキャンセルされた場合（`cancel()`）、キャンセルはすべての子トラックに**カスケード**します

## waitForBlocks — トラック同期

`nativeProperties.waitForBlocks` を使用して並列トラックを同期します。block が進行する前に訪問済みでなければならない block UUID の配列を受け入れます：

- **開始 block の場合**：トラック全体が実行開始前に待機します。必要な block がすべて訪問されるまで `onBeforeBlock` は呼び出されません。
- **その他の block の場合**：handler が `next()` を呼び出すと、条件が満たされるまで進行が延期されます。

`delay` と `waitForBlocks` を使用した完全な実行シーケンス：

```
spawn → waitForBlocks ゲート → onBeforeBlock (delay) → handler → next()
```

## waitInput — プレイヤー入力フラグ

`nativeProperties.waitInput` は**パッシブフラグ**です — engine はそれを公開しますが解釈しません。ゲーム handler がそれを読み取り、明示的なプレイヤー入力を待つかどうかを決定します。

## TrackInfo API — 可観測性

`scene.getTrackInfos()` を使用して実行中の async トラックを検査します。各トラックの状態の読み取り専用スナップショットを返します：

::: code-group
```ts [TypeScript]
const tracks = scene.getTrackInfos();
for (const track of tracks) {
  console.log(`Track ${track.id} (parent: ${track.parentTrackId}) at block ${track.currentBlockUuid}`);
}
```
```csharp [C#]
var tracks = scene.GetTrackInfos();
foreach (var track in tracks)
{
    Console.WriteLine($"Track {track.Id} (parent: {track.ParentTrackId}) at block {track.CurrentBlockUuid}");
}
```
```cpp [C++]
auto tracks = scene->getTrackInfos();
for (const auto& track : tracks) {
    std::cout << "Track " << track.id
              << " (parent: " << track.parentTrackId << ")"
              << " at block " << track.currentBlockUuid << "\n";
}
```
```gdscript [GDScript]
var tracks = scene.get_track_infos()
for track in tracks:
    print("Track %d (parent: %s) at block %s" % [
        track["id"], str(track["parentTrackId"]), track["currentBlockUuid"]])
```
:::

各 `TrackInfo` には `id`、`parentTrackId`、`startBlockUuid`、`currentBlockUuid`、`running` が含まれます。デバッグオーバーレイ、プレイモードレンダラー、検証に使用します。

## Async トラックで動作するもの（と動作しないもの）

async トラックは、メインの会話と*並行して*起こること — 環境エフェクト、並列アニメーション、仲間の反応 — に最適です。ただし制限があります。

**推奨 — 並列コンテンツ：**
| ユースケース | 動作する理由 |
|---|---|
| NPC の環境セリフ（「バーク」） | async トラック上の dialog block — NPC がメインの会話の進行中にコメント、反応、掛け合いを行います |
| イベントに同期したキャラクター反応 | `waitForBlocks` を使用して特定の block に到達したときに反応をトリガー |
| 環境音やBGMの再生 | action block、プレイヤーのインタラクション不要 |
| カメラ移動のトリガー | action block、並列実行 |
| 精密なタイミングのエフェクト | `waitForBlocks` + `delay` を組み合わせて精密なタイミングを実現 |

**非推奨 — プレイヤーインタラクションやゲームロジック分岐：**
| ユースケース | 問題となる理由 |
|---|---|
| async トラック内の CHOICE block | プレイヤーは既にメイントラックとインタラクション中 — 誰が async の choice に応答するのか？ |
| 重要なゲームステート変更 | async トラックがキャンセルされた場合（scene 終了）、action は実行されません |

::: warning async トラック内の choice
async トラック内の CHOICE block は、プレイヤーがメインの対話に既に参加している間に選択を行うべきことを意味します。最も一般的なシナリオは AI 駆動の「choice」（例：仲間の NPC がパーソナリティに基づいて自動選択する）です。async トラックが自動選択する scene レベル handler なしで CHOICE block に到達した場合、フローは停止するか無言で終了します。
:::

## 複数の Scene の並列実行

engine は複数の scene の同時実行をサポートしています。各 `SceneHandle` は独自のステート、訪問済み block、async トラックを持ちます。グローバル handler（Tier 1）は共有されます — どの scene が呼び出しているかは `scene` 引数で判別できます：

<!--@include: ../../_shared/async-dialog-track.md-->

::: tip Scene ごとのルーティング
並行する scene が多い場合は、グローバル handler 内でルーティングする代わりに、各ハンドルに scene レベル（Tier 2）の handler を登録することを検討してください。よりクリーンな分離が実現でき、`if/else` チェーンが不要になります。
:::

## Visual Reference

```mermaid
flowchart LR
    A["[A]"] --> B["[B]"]
    B --> C["[C]"]
    A -- async --> D["[D]"]
    D --> E["[E]"]
    D -- async --> F["[F]"]

    style A fill:#4a9,stroke:#333
    style B fill:#4a9,stroke:#333
    style C fill:#4a9,stroke:#333
    style D fill:#69b,stroke:#333
    style E fill:#69b,stroke:#333
    style F fill:#c7a,stroke:#333
```

- Main track: A &rarr; B &rarr; C
- Track 1 (parallel): D &rarr; E
- Track 2 (sub-track of D): F
- Scene cancel &rarr; all tracks cancelled
- Track D ends naturally &rarr; F continues
