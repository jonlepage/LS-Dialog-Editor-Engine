# Handler 与生命周期

## 必需的 Handler

engine 是一个图遍历机器 — 它遍历节点并将其分发给你的代码。4 个内容 handler 是必需的，因为没有它们 engine 就没有输出：

- `onDialog` — 响应对话文本
- `onChoice` — 向玩家呈现选项
- `onCondition` — 评估 condition 以分支流程
- `onAction` — 执行游戏副作用

当你调用 `handle.start()` 时，engine 会验证所有 4 个 handler 是否已注册（在 engine 级别或 scene 级别）。如果有缺失，会抛出一个描述性错误，列出缺失的 handler。

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

engine 跟踪玩家在 scene 中做出的每个选择。此历史记录在内部用于 `choice:` condition 评估，同时也可供你的代码使用：

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

当一个 block 的 `nativeProperties.isAsync = true` 时，engine 会创建一个与主流程独立运行的**并行轨道**。

### 轨道的创建方式

在 port 解析过程中，如果存在多个传出 connection：
- **第一个非异步 connection** 成为主流程的延续
- **其他 connection**（指向 `isAsync` block 的）成为并行轨道

### 与主流程的区别

- 异步轨道**跳过** `onBeforeBlock` — 直接调用类型 handler
- 每个异步轨道只跟随**一个 connection**（不支持多路径分支）
- scene 结束时轨道会自动取消

### followNarrative

当异步 block 上的 `followNarrative = true` 时：
- 异步轨道**等待**主流程前进
- 如果 handler 中已经调用了 `next()`，挂起的前进会执行
- 如果 `next()` **未被**调用，block 会被**强制前进**（跳过）

### 异步轨道的适用场景（以及不适用的场景）

异步轨道非常适合与主对话*同时*发生的事情 — 环境效果、并行动画、同伴反应。但它们有局限性。

**适合 — 即发即忘的副作用：**
| 用例 | 为什么可行 |
|---|---|
| NPC 环境对话（"插嘴"） | 异步轨道上的 dialog block — NPC 在主对话继续时发表评论、做出反应或闲聊。非常适合让世界更有生气。 |
| NPC 同伴反应 | 队友对玩家刚说的话做出反应 — 使用 followNarrative 同步的异步 dialog |
| 播放环境音效或音乐 | Action block，不需要玩家交互 |
| 触发镜头移动 | Action block，并行运行 |
| 并行动画 | followNarrative 与主轨道节奏同步 |

**不适合 — 玩家交互或游戏逻辑分支：**
| 用例 | 为什么会出问题 |
|---|---|
| 异步轨道中的 CHOICE block | 玩家已经在与主轨道交互 — 谁来回答异步的选择？ |
| followNarrative 中的 CONDITION block | 如果被强制前进，condition 以 `null` 解析 → port 解析器返回空 → 轨道静默结束 |
| 关键的游戏状态变更 | 如果异步轨道被取消（scene 结束），你的 action 永远不会执行 |

::: warning 异步轨道中的 Choice
异步轨道中的 CHOICE block 意味着玩家需要在已经参与主对话的同时做出选择。唯一合理的场景是 AI 驱动的"选择"（例如，同伴 NPC 根据性格自动选择）。如果你的异步轨道遇到一个 CHOICE block 而没有自动选择的 scene 级 handler，流程将停滞或静默结束。
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
如果你有多个并发 scene，考虑在每个 handle 上注册 scene 级（第 2 层）handler，而不是在全局 handler 中进行路由。更清晰的分离，没有 `if/else` 链。
:::
