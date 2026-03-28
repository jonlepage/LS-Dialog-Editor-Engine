# Handler 与生命周期

## 必需的 Handler

engine 是一个图遍历机器 — 它遍历节点并将其分发给已注册的 handler。4 个内容 handler 是必需的，因为没有它们 engine 就没有输出：

- `onDialog` — 响应对话文本
- `onChoice` — 向玩家呈现选项
- `onCondition` — 评估 condition 以分支流程
- `onAction` — 执行游戏副作用

调用 `handle.start()` 时，engine 会验证所有 4 个 handler 是否已注册（在 engine 级别或 scene 级别）。如果有缺失，会抛出一个描述性错误，列出缺失的 handler。

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

## 双层 Handler 系统

engine 使用两级 handler 系统：

1. **第 1 层 — 全局（engine 级别）**：通过 `onDialog()`、`onChoice()` 等注册在 `DialogueEngine` 上。
2. **第 2 层 — Scene 级别**：通过 `handle.onDialog()` 等注册在 `SceneHandle` 上。

当一个 block 被分发时：
1. 如果存在 scene handler（第 2 层），则首先调用它。
2. 然后调用全局 handler（第 1 层），**除非** scene handler 调用了 `context.preventGlobalHandler()`。

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

::: info Handler 优先级
当一个 block 被分发时，engine 按以下优先级解析 handler：
1. `handle.onBlock(uuid)` — 按 UUID 指定的 block 级别覆盖
2. `handle.onDialog()` / `handle.onChoice()` / ... — scene 的类型覆盖
3. `engine.onDialog()` / `engine.onChoice()` / ... — 全局 handler

如果存在 scene handler（第 2 层），全局 handler（第 1 层）也会在**之后**被调用，除非调用了 `context.preventGlobalHandler()`。
:::

## 角色解析

engine 会为每个具有 `metadata.characters` 的 block 解析角色。默认返回列表中的第一个角色。

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

解析后的角色可通过所有 handler 中的 `context.character` 获取。

## 选择历史

engine 跟踪玩家在 scene 中做出的每个选择。此历史记录在内部用于 `choice:` condition 评估，同时也可供外部代码使用：

```ts
handle.onExit(({ scene }) => {
  // Map of blockUuid → [choiceUuid, ...]
  const history = scene.getChoiceHistory();

  // Get choices for a specific block
  const picks = scene.getChoice('block-uuid-123'); // string[] | undefined
});
```

## 完整生命周期

### 每个 Block 的执行顺序

1. `onValidateNextBlock` — 执行前的验证
2. **上一个 block 的清理** — *上一个* block 的 handler 返回的清理函数
3. `onBeforeBlock` — 预处理（必须调用 `resolve()` 才能继续）
4. 类型 handler（先第 2 层，再第 1 层）

### Scene 事件

```ts
engine.onSceneEnter(({ scene, context }) => {
  // Called when handle.start() is executed
});

engine.onSceneExit(({ scene, context }) => {
  // Called when the scene ends (naturally or via cancel)
});
```

## onValidateNextBlock

拦截每次 block 转换进行验证：

```ts
engine.onValidateNextBlock(({ nextBlock, fromBlock, port }) => {
  // Return { valid: false, reason: '...' } to block
  return { valid: true };
});

engine.onInvalidateBlock(({ scene, reason }) => {
  console.error('Invalid block:', reason);
  scene.cancel(); // Stop the scene
});
```

## onBeforeBlock

在每个 block 之前调用。**必须调用 `resolve()`** 才能继续：

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

## 清理函数

handler 可以返回一个清理函数，在离开 block 时调用：

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

## Block 覆盖

`SceneHandle` 还可以按 UUID 覆盖特定的 block：

```ts
const handle = engine.scene(sceneId);
handle.onBlock('block-uuid-123', ({ block, context, next }) => {
  // Handler specific to this block only
  next();
});
```

## 错误边界

每个 handler 调用都包裹在 try/catch 中。如果 handler 抛出异常：

- 错误不会破坏 engine 状态
- 对于主轨道：scene 会干净地结束
- 对于异步轨道：只有受影响的轨道被终止 — 其他轨道和主流程继续运行

这是跨语言兼容的（TS、C#、C++、GDScript 中的 try/catch）。

## cancel()

调用 `scene.cancel()` 会触发以下序列：

1. 所有**异步轨道**被取消
2. 当前 block 的**清理函数**被执行
3. `onSceneExit` handler 被调用
4. scene 被标记为已完成

```ts
engine.onInvalidateBlock(({ scene, reason }) => {
  console.error('Validation failed:', reason);
  scene.cancel(); // Cleanup + onSceneExit are called
});
```

## 异步轨道

当 block 设置了 `nativeProperties.isAsync = true` 时，engine 会创建一个独立于主流程运行的**并行轨道**。

### 轨道的创建方式

在端口解析过程中，如果存在多个输出连接：
- **第一个非 async 连接**成为当前流程的延续
- **其他连接**（指向具有 `isAsync` 的 block）成为新的并行轨道

这适用于主轨道**和** async 轨道 — async 轨道可以从自己的 async 连接中 spawn 子轨道，创建并行执行的层次结构。

### 轨道生命周期

- `onBeforeBlock` 会为**所有 block** 调用（主轨道和 async 轨道）
- async 轨道像主轨道一样将输出连接分为 main 和 async
- 轨道在 scene 结束或调用 `cancel()` 时自动取消
- 当轨道自然结束时（没有更多连接），其子轨道**继续独立存在**
- 当轨道被显式取消时（`cancel()`），取消会**级联**到所有子轨道

### waitForBlocks — 轨道同步

使用 `nativeProperties.waitForBlocks` 来同步并行轨道。它接受一个 block UUID 数组，这些 block 必须在当前 block 可以继续之前被访问：

- **在起始 block 上**：整个轨道在开始执行之前等待。在所有必需的 block 被访问之前，不会调用 `onBeforeBlock`。
- **在其他 block 上**：当 handler 调用 `next()` 时，推进会被延迟直到条件满足。

使用 `delay` 和 `waitForBlocks` 的完整执行序列：

```
spawn → waitForBlocks 门控 → onBeforeBlock (delay) → handler → next()
```

### waitInput — 玩家输入标志

`nativeProperties.waitInput` 是一个**被动标志** — engine 公开它但不解释它。您的游戏 handler 读取它来决定是否等待明确的玩家输入。

### TrackInfo API — 可观测性

使用 `scene.getTrackInfos()` 来检查运行中的 async 轨道。返回每个轨道状态的只读快照：

```ts
const tracks = scene.getTrackInfos();
for (const track of tracks) {
  console.log(`Track ${track.id} (parent: ${track.parentTrackId}) at block ${track.currentBlockUuid}`);
}
```

每个 `TrackInfo` 包含：`id`、`parentTrackId`、`startBlockUuid`、`currentBlockUuid`、`running`。

### async 轨道中的适用与不适用

async 轨道非常适合与主对话*并行*发生的事物 — 环境效果、并行动画、同伴反应。但有一些限制。

**推荐 — 并行内容：**
| 用例 | 适用原因 |
|---|---|
| NPC 环境对话（"barks"） | async 轨道上的 dialog block — NPC 在主对话进行时评论、反应或闲聊 |
| 与事件同步的角色反应 | 使用 `waitForBlocks` 在到达特定 block 时触发反应 |
| 播放环境音效或音乐 | action block，无需玩家交互 |
| 触发摄像机移动 | action block，并行运行 |
| 精确计时的效果 | 结合 `waitForBlocks` + `delay` 实现精确计时 |

**不推荐 — 玩家交互或游戏逻辑分支：**
| 用例 | 问题原因 |
|---|---|
| async 轨道中的 CHOICE block | 玩家已经在与主轨道交互 — 谁来响应 async 的 choice？ |
| 关键游戏状态变更 | 如果 async 轨道被取消（scene 结束），action 永远不会执行 |

::: warning async 轨道中的 choice
async 轨道中的 CHOICE block 意味着玩家应该在已经参与主对话的同时进行选择。唯一有效的场景是 AI 驱动的"choice"（例如：同伴 NPC 基于个性自动选择）。如果 async 轨道在没有自动选择的 scene 级 handler 的情况下到达 CHOICE block，流程将停滞或静默结束。
:::

### 多个 Scene 并行运行

engine 支持同时运行多个 scene。每个 `SceneHandle` 拥有自己的状态、已访问的 block 和异步轨道。全局 handler（第 1 层）是共享的 — 使用 `scene` 参数来判断是哪个 scene 在调用：

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

::: tip 按 scene 路由
如果有多个并发 scene，建议在每个 handle 上注册 scene 级（第 2 层）handler，而不是在全局 handler 中进行路由。更清晰的分离，没有 `if/else` 链。
:::
