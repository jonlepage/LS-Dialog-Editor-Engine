# Choice 可见性

## 概述

当 CHOICE block 被分发时，`context.choices` 始终包含 blueprint 中定义的**所有** choice — 不会有任何被预先过滤。engine 永远不会从数组中移除 choice。

如果需要可见性过滤（例如，根据游戏状态或之前的选择来隐藏 choice），engine 提供了一个**可选的标记**系统。安装一次 filter 后，engine 会在 `onChoice` handler 接收数据之前，为每个 choice 标记 `visible: true | false`。

## 设置

在 engine 上注册一个 choice filter — 在启动任何 scene 之前注册一次：

<!--@include: ../../_shared/choice-filter-setup.md-->

安装后，engine 在调用 `onChoice` **之前**评估每个 choice 的 `visibilityConditions`：

- **`choice:` condition**（引用之前的玩家选择）由 engine 通过其内部选择历史自动解析 — callback 永远不会接收到它们。
- **游戏状态 condition**（其他所有情况）委托给已注册的 callback。
- 使用 `&`（AND）和 `|`（OR）的链式组合在两种类型之间都能正确工作。

## 在 onChoice 中过滤

在 handler 中，用一行代码进行过滤：

<!--@include: ../../_shared/choice-visibility-handler.md-->

### 为什么用 `visible !== false` 而不是 `=== true`？

当**未安装 filter** 时，`visible` 是 `undefined`。由于 `undefined !== false` 求值为 `true`，所有 choice 都会通过 — 默认向后兼容。当 filter **已安装**时，choice 会被显式标记为 `true` 或 `false`。

| `visible` 值 | 含义 | `!== false` |
|---|---|---|
| `true` | 已安装 filter，choice 通过 | `true` |
| `false` | 已安装 filter，choice 隐藏 | `false` |
| `undefined` | 未安装 filter | `true` |

## RuntimeChoiceItem

安装 filter 后，`context.choices` 中的每个 choice 都是 `RuntimeChoiceItem` — 它是 `ChoiceItem` 的扩展，增加了 `visible` 标记：

::: code-group
```ts [TypeScript]
interface RuntimeChoiceItem extends ChoiceItem {
  visible?: boolean; // true | false | undefined
}
```
```csharp [C#]
public class RuntimeChoiceItem : ChoiceItem
{
    public bool? Visible { get; set; } // true | false | null
}
```
```cpp [C++]
struct RuntimeChoiceItem : ChoiceItem {
    std::optional<bool> visible; // true | false | nullopt
};
```
```gdscript [GDScript]
# RuntimeChoiceItem is a Dictionary with an extra "visible" key:
# { "uuid": "...", "dialogueText": {...}, "visible": true/false/absent }
```
:::

未安装 filter 时，choice 仍然是 `RuntimeChoiceItem`，但 `visible` 保持为 `undefined`/`null`/`nullopt`/absent。

## 示例

### 标准用法 — 显示可见的 choice

::: code-group
```ts [TypeScript]
engine.onChoice(({ context, next }) => {
  const visible = context.choices.filter(c => c.visible !== false);
  ui.showChoices(visible, (uuid) => {
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
engine.onChoice([](auto*, auto*, auto* ctx, auto next) -> CleanupFn {
    std::vector<const RuntimeChoiceItem*> visible;
    for (const auto& c : ctx->choices())
        if (!c.visible.has_value() || c.visible.value())
            visible.push_back(&c);
    showChoicesUI(visible, [ctx, next](const auto& uuid) {
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

### 限时选择 — 超时自动选择

::: code-group
```ts [TypeScript]
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
```csharp [C#]
engine.OnChoice(args => {
    var (_, block, context, next) = args;
    var visible = context.Choices
        .Where(c => c.Visible != false).ToList();
    var timeout = block.NativeProperties?.Timeout;

    void Resolve(RuntimeChoiceItem choice) {
        context.SelectChoice(choice.Uuid);
        next();
    }

    if (timeout.HasValue)
    {
        // use your engine's timer — cancel on player selection
        var timer = ScheduleTimer((float)timeout.Value, () => Resolve(visible[0]));
        ShowChoicesUI(visible, uuid => {
            timer.Cancel();
            Resolve(visible.First(c => c.Uuid == uuid));
        });
    }
    else
    {
        ShowChoicesUI(visible, uuid => Resolve(visible.First(c => c.Uuid == uuid)));
    }
    return null;
});
```
```cpp [C++]
engine.onChoice([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn {
    std::vector<const RuntimeChoiceItem*> visible;
    for (const auto& c : ctx->choices())
        if (!c.visible.has_value() || c.visible.value())
            visible.push_back(&c);

    auto timeout = block->nativeProperties
        ? block->nativeProperties->timeout : std::nullopt;

    auto resolve = [ctx, next](const std::string& uuid) {
        ctx->selectChoice(uuid);
        next();
    };

    if (timeout.has_value()) {
        // use your engine's timer — cancel on player selection
        auto timer = scheduleDelay(timeout.value(), [&]() { resolve(visible[0]->uuid); });
        showChoicesUI(visible, [resolve, timer](const auto& uuid) {
            timer->cancel();
            resolve(uuid);
        });
    } else {
        showChoicesUI(visible, resolve);
    }
    return {};
});
```
```gdscript [GDScript]
engine.on_choice(func(args):
    var ctx = args["context"]
    var next_fn = args["next"]
    var block = args["block"]
    var visible = []
    for c in ctx.choices:
        if c.get("visible") != false:
            visible.append(c)

    var timeout_val = block.get("nativeProperties", {}).get("timeout", 0)

    if timeout_val > 0:
        # use your engine's timer — cancel on player selection
        var timer = get_tree().create_timer(timeout_val)
        timer.timeout.connect(func():
            ctx.select_choice(visible[0]["uuid"])
            next_fn.call()
        )
        show_choices_ui(visible, func(uuid):
            timer.time_left = 0  # cancel
            ctx.select_choice(uuid)
            next_fn.call()
        )
    else:
        show_choices_ui(visible, func(uuid):
            ctx.select_choice(uuid)
            next_fn.call()
        )
    return Callable()
)
```
:::

### 隐藏的 choice 显示为灰色

::: code-group
```ts [TypeScript]
engine.onChoice(({ context, next }) => {
  for (const choice of context.choices) {
    if (choice.visible === false) {
      ui.addGreyed(choice);   // show but disabled
    } else {
      ui.addNormal(choice);   // selectable
    }
  }
  // wait for player selection...
});
```
```csharp [C#]
engine.OnChoice(args => {
    foreach (var choice in args.Context.Choices)
    {
        if (choice.Visible == false)
            AddGreyed(choice);   // show but disabled
        else
            AddNormal(choice);   // selectable
    }
    // wait for player selection...
    return null;
});
```
```cpp [C++]
engine.onChoice([](auto*, auto*, auto* ctx, auto next) -> CleanupFn {
    for (const auto& choice : ctx->choices()) {
        if (choice.visible.has_value() && !choice.visible.value())
            addGreyed(choice);   // show but disabled
        else
            addNormal(choice);   // selectable
    }
    // wait for player selection...
    return {};
});
```
```gdscript [GDScript]
engine.on_choice(func(args):
    for choice in args["context"].choices:
        if choice.get("visible") == false:
            add_greyed(choice)   # show but disabled
        else:
            add_normal(choice)   # selectable
    # wait for player selection...
    return Callable()
)
```
:::

### 教程模式 — 完全忽略可见性

::: code-group
```ts [TypeScript]
tutorial.onChoice(({ context, next }) => {
  // force-select the first choice, no filtering
  context.selectChoice(context.choices[0].uuid);
  next();
});
```
```csharp [C#]
tutorial.OnChoice(args => {
    // force-select the first choice, no filtering
    args.Context.SelectChoice(args.Context.Choices[0].Uuid);
    args.Next();
    return null;
});
```
```cpp [C++]
tutorial->onChoice([](auto*, auto*, auto* ctx, auto next) -> CleanupFn {
    // force-select the first choice, no filtering
    ctx->selectChoice(ctx->choices()[0].uuid);
    next();
    return {};
});
```
```gdscript [GDScript]
tutorial.on_choice(func(args):
    # force-select the first choice, no filtering
    args["context"].select_choice(args["context"].choices[0]["uuid"])
    args["next"].call()
    return Callable()
)
```
:::

## 共享求值器

宿主应用程序可能在一个地方评估 condition — 背包系统、标记管理器、任务追踪器。可以在 `setChoiceFilter` 和 `onCondition` 之间共享**同一个求值函数**，使逻辑集中在一处：

<!--@include: ../../_shared/choice-reusable-filter.md-->

::: tip 为什么要共享？
如果不使用此模式，最终会在两个地方编写相同的 `gameState.check(...)` 逻辑。当游戏状态 API 发生变化时，容易修复一处而遗漏另一处。一个函数，两次注册，零偏差。
:::

## 高级用法：手动过滤

如果不需要安装全局 filter，`LsdeUtils` 提供了一个底层工具函数：

::: code-group
```ts [TypeScript]
import { LsdeUtils } from '@lsde/dialog-engine';

const visible = LsdeUtils.filterVisibleChoices(
  block.choices ?? [],
  (cond) => gameState.check(cond.key, cond.operator, cond.value),
  scene, // optional — enables choice: condition resolution via history
);
```
```csharp [C#]
var visible = LsdeUtils.FilterVisibleChoices(
    block.Choices ?? new(),
    cond => GameState.Check(cond.Key, cond.Operator, cond.Value),
    scene // optional — enables choice: condition resolution via history
);
```
```cpp [C++]
auto visible = lsde::LsdeUtils::FilterVisibleChoices(
    block->choices,
    [](const auto& cond) { return gameState.check(cond.key, cond.op, cond.value); },
    scene // optional — enables choice: condition resolution via history
);
```
```gdscript [GDScript]
var visible = LsdeUtils.filter_visible_choices(
    block.get("choices", []),
    func(cond): return game_state.check(cond),
    scene # optional — enables choice: condition resolution via history
)
```
:::

`scene` 参数启用自动的 `choice:` condition 解析。如果不提供，所有 condition 都将委托给求值器 callback。
