# Choice 可见性

## 概述

当 CHOICE block 被分发时，`context.choices` 始终包含 blueprint 中定义的**所有** choice — 不会有任何被预先过滤。engine 永远不会从数组中移除 choice。

如果需要可见性过滤（例如，根据游戏状态或之前的选择来隐藏 choice），engine 提供了一个**可选的标记**系统。安装一次 filter 后，engine 会在 `onChoice` handler 接收数据之前，为每个 choice 标记 `visible: true | false`。

## 设置

在 engine 上注册一个 choice filter — 在启动任何 scene 之前注册一次：

::: code-group
```ts [TypeScript]
engine.setChoiceFilter((condition) => {
  // Evaluate game-state conditions only.
  // choice: conditions are handled internally by the engine.
  return gameState.check(condition.key, condition.operator, condition.value);
});
```
```csharp [C#]
engine.SetChoiceFilter(cond => {
    return GameState.Check(cond.Key, cond.Operator, cond.Value);
});
```
```cpp [C++]
engine.setChoiceFilter([](const ExportCondition& cond) {
    return gameState.check(cond.key, cond.op, cond.value);
});
```
```gdscript [GDScript]
engine.set_choice_filter(func(cond):
    return game_state.check(cond)
)
```
:::

安装后，engine 在调用 `onChoice` **之前**评估每个 choice 的 `visibilityConditions`：

- **`choice:` condition**（引用之前的玩家选择）由 engine 通过其内部选择历史自动解析 — callback 永远不会接收到它们。
- **游戏状态 condition**（其他所有情况）委托给已注册的 callback。
- 使用 `&`（AND）和 `|`（OR）的链式组合在两种类型之间都能正确工作。

## 在 onChoice 中过滤

在 handler 中，用一行代码进行过滤：

::: code-group
```ts [TypeScript]
engine.onChoice(({ block, context, next }) => {
  const visible = context.choices.filter(c => c.visible !== false);
  showChoicesUI(visible, (uuid) => {
    context.selectChoice(uuid);
    next();
  });
});
```
```csharp [C#]
engine.OnChoice(args => {
    var visible = args.Context.Choices
        .Where(c => c.Visible != false).ToList();
    ShowChoicesUI(visible, uuid => {
        args.Context.SelectChoice(uuid);
        args.Next();
    });
    return null;
});
```
```cpp [C++]
engine.onChoice([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn {
    std::vector<const RuntimeChoiceItem*> visible;
    for (const auto& c : ctx->choices())
        if (!c.visible.has_value() || c.visible.value())
            visible.push_back(&c);
    showChoicesUI(visible, [ctx, next](auto& uuid) {
        ctx->selectChoice(uuid);
        next();
    });
    return {};
});
```
```gdscript [GDScript]
engine.on_choice(func(args):
    var visible = []
    for c in args["context"].choices:
        if c.get("visible") != false:
            visible.append(c)
    show_choices_ui(visible, func(uuid):
        args["context"].select_choice(uuid)
        args["next"].call()
    )
    return Callable()
)
```
:::

### 为什么用 `visible !== false` 而不是 `=== true`？

当**未安装 filter** 时，`visible` 是 `undefined`。由于 `undefined !== false` 求值为 `true`，所有 choice 都会通过 — 默认向后兼容。当 filter **已安装**时，choice 会被显式标记为 `true` 或 `false`。

| `visible` 值 | 含义 | `!== false` |
|---|---|---|
| `true` | 已安装 filter，choice 通过 | `true` |
| `false` | 已安装 filter，choice 隐藏 | `false` |
| `undefined` | 未安装 filter | `true` |

## RuntimeChoiceItem

安装 filter 后，`context.choices` 中的每个 choice 都是 `RuntimeChoiceItem` — 它是 `ChoiceItem` 的扩展，增加了 `visible` 标记：

```ts
interface RuntimeChoiceItem extends ChoiceItem {
  visible?: boolean; // true | false | undefined
}
```

未安装 filter 时，choice 仍然是 `RuntimeChoiceItem`，但 `visible` 保持为 `undefined`。

## 示例

### 标准用法 — 显示可见的 choice

```ts
engine.onChoice(({ context, next }) => {
  const visible = context.choices.filter(c => c.visible !== false);
  ui.showChoices(visible, (uuid) => {
    context.selectChoice(uuid);
    next();
  });
});
```

### 限时选择 — 超时自动选择

```ts
engine.onChoice(({ block, context, next }) => {
  const visible = context.choices.filter(c => c.visible !== false);
  const timeout = block.nativeProperties?.timeout;

  const resolve = (choice) => {
    context.selectChoice(choice.uuid);
    next();
  };

  if (timeout) {
    const timer = setTimeout(() => resolve(visible[0]), timeout * 1000);
    ui.showChoices(visible, (uuid) => {
      clearTimeout(timer);
      resolve(visible.find(c => c.uuid === uuid));
    });
  } else {
    ui.showChoices(visible, (uuid) => resolve(visible.find(c => c.uuid === uuid)));
  }
});
```

### 隐藏的 choice 显示为灰色

```ts
engine.onChoice(({ context, next }) => {
  for (const choice of context.choices) {
    if (choice.visible === false) {
      ui.addGreyed(choice);   // Show but disabled
    } else {
      ui.addNormal(choice);   // Selectable
    }
  }
  // Wait for player selection...
});
```

### 教程模式 — 完全忽略可见性

```ts
tutorial.onChoice(({ context, next }) => {
  // Force-select the first choice, no filtering
  context.selectChoice(context.choices[0].uuid);
  next();
});
```

## 共享求值器

宿主应用程序可能在一个地方评估 condition — 背包系统、标记管理器、任务追踪器。可以在 `setChoiceFilter` 和 `onCondition` 之间共享**同一个求值函数**，使逻辑集中在一处：

::: code-group
```ts [TypeScript]
// Define once, use everywhere
const evaluateGameCondition = (cond: ExportCondition) =>
  gameState.check(cond.key, cond.operator, cond.value);

// Choice visibility — uses your evaluator for game-state conditions
engine.setChoiceFilter(evaluateGameCondition);

// Condition blocks — same evaluator, plus choice: handling
engine.onCondition(({ scene, block, context, next }) => {
  const result = LsdeUtils.evaluateConditionChain(
    block.conditions ?? [],
    (cond) => LsdeUtils.isChoiceCondition(cond)
      ? scene.evaluateCondition(cond)  // engine handles choice history
      : evaluateGameCondition(cond),   // your shared function
  );
  context.resolve(result);
  next();
});
```
```csharp [C# — Unity]
// One evaluator to rule them all
Func<ExportCondition, bool> evalGameCond = cond =>
    GameState.Instance.Evaluate(cond.Key, cond.Operator, cond.Value);

engine.SetChoiceFilter(evalGameCond);

engine.OnCondition(args => {
    var result = LsdeUtils.EvaluateConditionChain(
        args.Block.Conditions ?? new(),
        cond => LsdeUtils.IsChoiceCondition(cond)
            ? args.Scene.EvaluateCondition(cond)
            : evalGameCond(cond));
    args.Context.Resolve(result);
    args.Next();
    return null;
});
```
```cpp [C++ — Unreal]
// Shared lambda — capture your game state once
auto evalGameCond = [this](const ExportCondition& cond) {
    return GetGameState()->Evaluate(cond.key, cond.op, cond.value);
};

engine.setChoiceFilter(evalGameCond);

engine.onCondition([this, evalGameCond](auto* scene, auto* block, auto* ctx, auto next) -> CleanupFn {
    auto* cb = dynamic_cast<const ConditionBlock*>(block);
    auto result = LsdeUtils::EvaluateConditionChain(cb->conditions,
        [scene, &evalGameCond](const auto& cond) {
            return isChoiceCondition(cond) ? scene->evaluateCondition(cond) : evalGameCond(cond);
        });
    ctx->resolve(result);
    next();
    return {};
});
```
```gdscript [GDScript — Godot]
# One function, two uses
var eval_game_cond = func(cond):
    return GameState.evaluate(cond.get("key"), cond.get("operator"), cond.get("value"))

engine.set_choice_filter(eval_game_cond)

engine.on_condition(func(args):
    var result = LsdeUtils.evaluate_condition_chain(
        args["block"].get("conditions", []),
        func(cond):
            if LsdeUtils.is_choice_condition(cond):
                return args["scene"].evaluate_condition(cond)
            return eval_game_cond.call(cond)
    )
    args["context"].resolve(result)
    args["next"].call()
    return Callable()
)
```
:::

::: tip 为什么要共享？
如果不使用此模式，最终会在两个地方编写相同的 `gameState.check(...)` 逻辑。当游戏状态 API 发生变化时，容易修复一处而遗漏另一处。一个函数，两次注册，零偏差。
:::

## 高级用法：手动过滤

如果不需要安装全局 filter，`LsdeUtils` 提供了一个底层工具函数：

```ts
import { LsdeUtils } from '@lsde/dialog-engine';

const visible = LsdeUtils.filterVisibleChoices(
  block.choices ?? [],
  (cond) => gameState.check(cond.key, cond.operator, cond.value),
  scene, // Optional — when provided, choice: conditions are resolved via choice history
);
```

`scene` 参数启用自动的 `choice:` condition 解析。如果不提供，所有 condition 都将委托给求值器 callback。
