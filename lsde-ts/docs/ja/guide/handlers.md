# Handler とライフサイクル

## 必須 Handler

engine はグラフ走査マシンです — ノードを辿り、登録されたコードにディスパッチします。4つのコンテンツ handler は、それなしでは engine が何も出力しないため、必須です：

- `onDialog` — 対話テキストに反応する
- `onChoice` — プレイヤーに選択肢を提示する
- `onCondition` — condition を評価してフローを分岐する
- `onAction` — ゲーム側のエフェクトを実行する

`handle.start()` を呼び出すと、engine は4つすべてが登録されているか（engine レベルまたは scene レベルで）検証します。いずれかが欠けている場合、欠けている handler の一覧を含む記述的なエラーがスローされます。

::: code-group
```ts [TypeScript]
engine.onDialog(handler);
engine.onChoice(handler);
engine.onCondition(handler);
engine.onAction(handler);

const handle = engine.scene(sceneId);
handle.start(); // ✓ All 4 registered — scene starts
```
```csharp [C#]
engine.OnDialog(handler);
engine.OnChoice(handler);
engine.OnCondition(handler);
engine.OnAction(handler);

var handle = engine.Scene(sceneId);
handle.Start(); // ✓ All 4 registered — scene starts
```
```cpp [C++]
engine.onDialog(handler);
engine.onChoice(handler);
engine.onCondition(handler);
engine.onAction(handler);

auto handle = engine.scene(sceneId);
handle->start(); // ✓ All 4 registered — scene starts
```
```gdscript [GDScript]
engine.on_dialog(handler)
engine.on_choice(handler)
engine.on_condition(handler)
engine.on_action(handler)

var handle = engine.scene(scene_id)
handle.start() # ✓ All 4 registered — scene starts
```
:::

## 2階層 Handler システム

engine は2レベルの handler システムを使用します：

1. **Tier 1 — グローバル（engine レベル）**: `DialogueEngine` に `onDialog()`、`onChoice()` などで登録。
2. **Tier 2 — Scene レベル**: `SceneHandle` に `handle.onDialog()` などで登録。

block がディスパッチされると：
1. scene handler（Tier 2）が存在すれば、最初に呼び出されます。
2. 次にグローバル handler（Tier 1）が呼び出されます。**ただし**、scene handler が `context.preventGlobalHandler()` を呼び出した場合を除きます。

::: code-group
```ts [TypeScript]
// Tier 1 — global
engine.onDialog(({ block, context, next }) => {
  console.log('Global dialog handler');
  next();
});

// Tier 2 — scene-specific
const handle = engine.scene(sceneId);
handle.onDialog(({ block, context, next }) => {
  console.log('Scene-specific dialog handler');
  context.preventGlobalHandler();
  next();
});
handle.start();
```
```csharp [C#]
// Tier 1 — global
engine.OnDialog(args => {
    Console.WriteLine("Global dialog handler");
    args.Next();
    return null;
});

// Tier 2 — scene-specific
var handle = engine.Scene(sceneId);
handle.OnDialog(args => {
    Console.WriteLine("Scene-specific dialog handler");
    args.Context.PreventGlobalHandler();
    args.Next();
    return null;
});
handle.Start();
```
```cpp [C++]
// Tier 1 — global
engine.onDialog([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn {
    std::cout << "Global dialog handler\n";
    next();
    return {};
});

// Tier 2 — scene-specific
auto handle = engine.scene(sceneId);
handle->onDialog([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn {
    std::cout << "Scene-specific dialog handler\n";
    ctx->preventGlobalHandler();
    next();
    return {};
});
handle->start();
```
```gdscript [GDScript]
# Tier 1 — global
engine.on_dialog(func(args):
    print("Global dialog handler")
    args["next"].call()
    return Callable()
)

# Tier 2 — scene-specific
var handle = engine.scene(scene_id)
handle.on_dialog(func(args):
    print("Scene-specific dialog handler")
    args["context"].prevent_global_handler()
    args["next"].call()
    return Callable()
)
handle.start()
```
:::

::: info Handler の優先順位
block がディスパッチされると、engine は以下の優先順位で handler を解決します：
1. `handle.onBlock(uuid)` — UUID による block 固有のオーバーライド
2. `handle.onDialog()` / `handle.onChoice()` / ... — scene のタイプオーバーライド
3. `engine.onDialog()` / `engine.onChoice()` / ... — グローバル handler

scene handler（Tier 2）が存在する場合、`context.preventGlobalHandler()` が呼び出されない限り、グローバル handler（Tier 1）も**その後に**呼び出されます。
:::

## キャラクター解決

engine は `metadata.characters` を持つすべての block に対してキャラクターを解決します。デフォルトではリスト内の最初のキャラクターを返します。

::: code-group
```ts [TypeScript]
// Engine-level — applies to all scenes
engine.onResolveCharacter((characters) => {
  return party.getActiveLeader(characters);
});

// Scene-level override
const handle = engine.scene(sceneId);
handle.onResolveCharacter((characters) => {
  return battle.getActiveUnit(characters);
});
```
```csharp [C#]
engine.OnResolveCharacter(chars => party.GetActiveLeader(chars));

var handle = engine.Scene(sceneId);
handle.OnResolveCharacter(chars => battle.GetActiveUnit(chars));
```
```cpp [C++]
engine.onResolveCharacter([](const auto& chars) {
    return party.getActiveLeader(chars);
});

auto handle = engine.scene(sceneId);
handle->onResolveCharacter([](const auto& chars) {
    return battle.getActiveUnit(chars);
});
```
```gdscript [GDScript]
engine.on_resolve_character(func(chars):
    return party.get_active_leader(chars)
)

var handle = engine.scene(scene_id)
handle.on_resolve_character(func(chars):
    return battle.get_active_unit(chars)
)
```
:::

解決されたキャラクターは、すべての block handler 内で `context.character` として、また [`onValidateNextBlock`](#onvalidatenextblock) では `nextContext.character` / `fromContext.character` として利用できます。

## Choice 履歴

engine は scene 中のプレイヤーのすべての choice を追跡します。この履歴は `choice:` condition の評価に内部的に使用され、ホストアプリケーション側のコードからもアクセスできます：

```ts
handle.onExit(({ scene }) => {
  // Map of blockUuid → [choiceUuid, ...]
  const history = scene.getChoiceHistory();

  // Get choices for a specific block
  const picks = scene.getChoice('block-uuid-123'); // string[] | undefined
});
```

## 完全なライフサイクル

### 各 Block の実行順序

1. `onValidateNextBlock` — 実行前の検証
2. **前の block のクリーンアップ** — *前の* block の handler が返したクリーンアップ関数
3. `onBeforeBlock` — 前処理（続行するには `resolve()` を呼び出す必要あり）
4. タイプ handler（Tier 2、次に Tier 1）

### Scene イベント

```ts
engine.onSceneEnter(({ scene, context }) => {
  // Called when handle.start() is executed
});

engine.onSceneExit(({ scene, context }) => {
  // Called when the scene ends (naturally or via cancel)
});
```

## onValidateNextBlock

各 block 遷移をインターセプトして検証します。handler は次の block (`nextContext`) と前の block (`fromContext`) の**解決されたキャラクター**を受け取ります：

```ts
engine.onValidateNextBlock(({ nextBlock, fromBlock, nextContext, fromContext }) => {
  return { valid: true };
});

engine.onInvalidateBlock(({ scene, reason }) => {
  console.error('Invalid block:', reason);
  scene.cancel();
});
```

### Character Gating

`nextContext.character` を使用して、ゲームの状態に基づいて block の実行を制御します：

```ts
engine.onValidateNextBlock(({ nextContext }) => {
  const { character } = nextContext;
  if (!character) return { valid: false, reason: 'no_character' };
  if (game.characterHasStatus(character, 'stunned'))
    return { valid: false, reason: 'character_stunned' };
  return { valid: true };
});
```

`fromContext.character` を使用してキャラクター間の遷移を検証できます（例：関係チェック、クールダウン）。`fromContext` はシーンの最初の block では `null` です。

## onBeforeBlock

各 block の前に呼び出されます。続行するには**必ず `resolve()` を呼び出す**必要があります：

```ts
engine.onBeforeBlock(({ block, resolve }) => {
  const delay = block.nativeProperties?.delay;
  if (delay) {
    setTimeout(resolve, delay * 1000);
  } else {
    resolve();
  }
});
```

## クリーンアップ関数

handler はクリーンアップ関数を返すことができ、block から離れる際に呼び出されます：

```ts
engine.onDialog(({ block, next }) => {
  const element = showDialogUI(block);
  next();

  return () => {
    // Called when the next block takes over
    element.remove();
  };
});
```

## Block オーバーライド

`SceneHandle` は UUID で特定の block をオーバーライドすることもできます：

```ts
const handle = engine.scene(sceneId);
handle.onBlock('block-uuid-123', ({ block, context, next }) => {
  // Handler specific to this block only
  next();
});
```

## エラー境界

すべての handler 呼び出しは try/catch でラップされています。handler がスローした場合：

- エラーは engine のステートを破壊しません
- メイントラックの場合：scene はクリーンに終了します
- async トラックの場合：影響を受けたトラックのみが終了し、他のトラックとメインフローは継続します

これはクロス言語互換です（TS、C#、C++、GDScript の try/catch）。

## cancel()

`scene.cancel()` を呼び出すと、以下のシーケンスがトリガーされます：

1. すべての **async トラック** がキャンセルされます
2. 現在の block の**クリーンアップ関数**が実行されます
3. `onSceneExit` handler が呼び出されます
4. scene が完了としてマークされます

```ts
engine.onInvalidateBlock(({ scene, reason }) => {
  console.error('Validation failed:', reason);
  scene.cancel(); // Cleanup + onSceneExit are called
});
```

## Async トラック

block に `nativeProperties.isAsync = true` が設定されている場合、engine はメインフローとは独立して動作する**並列トラック**を作成します。

### トラックの作成方法

port 解決中に複数の送出 connection が存在する場合：
- **最初の非 async connection** が現在のフローの継続となります
- **その他の connection**（`isAsync` を持つ block へ）が新しい並列トラックになります

これはメイントラック**と** async トラックの両方に適用されます — async トラックは独自の async connection からサブトラックを spawn でき、並列実行の階層を作成できます。

### トラックのライフサイクル

- `onBeforeBlock` は**すべての block** で呼び出されます（メインおよび async トラック）
- async トラックはメイントラックと同様に、送出 connection をメイン vs async に分離します
- トラックは scene 終了時または `cancel()` 呼び出し時に自動的にキャンセルされます
- トラックが自然に終了した場合（connection がなくなった）、サブトラックは**独立して存続**します
- トラックが明示的にキャンセルされた場合（`cancel()`）、キャンセルはすべての子トラックに**カスケード**します

### waitForBlocks — トラック同期

`nativeProperties.waitForBlocks` を使用して並列トラックを同期します。block が進行する前に訪問済みでなければならない block UUID の配列を受け入れます：

- **開始 block の場合**：トラック全体が実行開始前に待機します。必要な block がすべて訪問されるまで `onBeforeBlock` は呼び出されません。
- **その他の block の場合**：handler が `next()` を呼び出すと、条件が満たされるまで進行が延期されます。

`delay` と `waitForBlocks` を使用した完全な実行シーケンス：

```
spawn → waitForBlocks ゲート → onBeforeBlock (delay) → handler → next()
```

### waitInput — プレイヤー入力フラグ

`nativeProperties.waitInput` は**パッシブフラグ**です — engine はそれを公開しますが解釈しません。ゲーム handler がそれを読み取り、明示的なプレイヤー入力を待つかどうかを決定します。

### TrackInfo API — 可観測性

`scene.getTrackInfos()` を使用して実行中の async トラックを検査します。各トラックの状態の読み取り専用スナップショットを返します：

```ts
const tracks = scene.getTrackInfos();
for (const track of tracks) {
  console.log(`Track ${track.id} (parent: ${track.parentTrackId}) at block ${track.currentBlockUuid}`);
}
```

各 `TrackInfo` には `id`、`parentTrackId`、`startBlockUuid`、`currentBlockUuid`、`running` が含まれます。

### Async トラックで動作するもの（と動作しないもの）

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
async トラック内の CHOICE block は、プレイヤーがメインの対話に既に参加している間に選択を行うべきことを意味します。有効なシナリオは AI 駆動の「choice」（例：仲間の NPC がパーソナリティに基づいて自動選択する）のみです。async トラックが自動選択する scene レベル handler なしで CHOICE block に到達した場合、フローは停止するか無言で終了します。
:::

### 複数の Scene の並列実行

engine は複数の scene の同時実行をサポートしています。各 `SceneHandle` は独自のステート、訪問済み block、async トラックを持ちます。グローバル handler（Tier 1）は共有されます — どの scene が呼び出しているかは `scene` 引数で判別できます：

```ts
engine.onDialog(({ scene, block, context, next }) => {
  // scene tells you WHO is calling
  if (scene === mainDialogue) {
    showMainUI(block);
  } else if (scene === tutorialOverlay) {
    showTutorialBubble(block);
  }
  next();
});

// Start two scenes at once
const mainDialogue = engine.scene('main-quest');
const tutorialOverlay = engine.scene('tutorial-hints');
mainDialogue.start();
tutorialOverlay.start();
```

::: tip Scene ごとのルーティング
並行する scene が多い場合は、グローバル handler 内でルーティングする代わりに、各ハンドルに scene レベル（Tier 2）の handler を登録することを検討してください。よりクリーンな分離が実現でき、`if/else` チェーンが不要になります。
:::
