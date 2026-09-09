# Choice 可见性

## 概述

当 CHOICE block 被分发时，`context.options` 始终包含 blueprint 中定义的**所有** choice — 不会有任何被预先过滤。engine 永远不会从数组中移除 choice。

如果需要可见性过滤（例如，根据游戏状态或之前的选择来隐藏 choice），engine 提供了一个**可选的标记**系统。安装一次 condition 解析器后，engine 会在 `onChoice` handler 接收数据之前，为每个 choice 标记 `visible: true | false`。

## 设置

在 engine 上注册一个 condition 解析器 — 在启动任何 scene 之前注册一次：

<!--@include: ../../_shared/choice-filter-setup.md-->

安装后，engine 在调用 `onChoice` **之前**评估每个 choice 的 `when`。同一解析器也会预评估 condition block 的组 — 详见 [Condition blocks](/zh/guide/block-types#condition)。

- **`choice:` condition**（引用之前的玩家选择）由 engine 通过其内部选择历史自动解析 — callback 永远不会接收到它们。
- **游戏状态 condition**（其他所有情况）委托给已注册的 callback。
- 使用 `&`（AND）和 `|`（OR）的链式组合在两种类型之间都能正确工作。

## 在 onChoice 中过滤

在 handler 中，用一行代码进行过滤：

<!--@include: ../../_shared/choice-visibility-handler.md-->

### 为什么用 `visible !== false` 而不是 `=== true`？

当**未安装解析器**时，`visible` 是 `undefined`。由于 `undefined !== false` 求值为 `true`，所有 choice 都会通过 — 默认向后兼容。当解析器**已安装**时，choice 会被显式标记为 `true` 或 `false`。

| `visible` 值 | 含义 | `!== false` |
|---|---|---|
| `true` | 已安装解析器，choice 通过 | `true` |
| `false` | 已安装解析器，choice 隐藏 | `false` |
| `undefined` | 未安装解析器 | `true` |

## RuntimeChoiceItem

`context.options` 的每一项都是 [`RuntimeChoiceItem`](/api-ref/interfaces/RuntimeChoiceItem) — blueprint 的 `Option`，加上 `visible` 标记：

::: code-group
```ts [TypeScript]
interface RuntimeChoiceItem extends Option {
  visible?: boolean; // true | false | undefined
}
```
```csharp [C#]
public class RuntimeChoiceItem : Option
{
    public bool? Visible { get; set; } // true | false | null
}
```
```cpp [C++]
struct RuntimeChoiceItem : Option {
    std::optional<bool> visible; // true | false | nullopt
};
```
```gdscript [GDScript]
# RuntimeChoiceItem is a Dictionary with an extra "visible" key:
# { "id": "C1", "key": "...", "text": {...}, "visible": true/false/absent }
```
:::

未安装解析器时，choice 仍然是 `RuntimeChoiceItem`，但 `visible` 保持为 `undefined`/`null`/`nullopt`/absent。`Option` 本身携带 `id`、`key`、`text` 和 `when` — 而它的 **`id` 就是出口 port**（`C1`、`C2`…）。

## 示例

### 标准用法 — 显示可见的 choice

::: code-group
```ts [TypeScript]
engine.onChoice(({ context, next }) => {
  const offered = context.options.filter(c => c.visible !== false);
  ui.showOptions(visible, (optionId) => {
    context.selectChoice(optionId);
    next();
  });
});
```
```csharp [C#]
engine.OnChoice(args => {
    var visible = args.Context.Options
        .Where(c => c.Visible != false).ToList();
    ShowChoicesUI(visible, optionId => {
        args.Context.SelectChoice(optionId);
        args.Next();
    });
    return null;
});
```
```cpp [C++]
engine.onChoice([](auto*, auto*, auto* ctx, auto next) -> CleanupFn {
    std::vector<const RuntimeChoiceItem*> visible;
    for (const auto& c : ctx->options())
        if (!c.visible.has_value() || c.visible.value())
            visible.push_back(&c);
    showOptionsUI(visible, [ctx, next](const auto& optionId) {
        ctx->selectChoice(optionId);
        next();
    });
    return {};
});
```
```gdscript [GDScript]
engine.on_choice(func(args):
    var visible = []
    for c in args["context"].options:
        if c.get("visible") != false:
            visible.append(c)
    show_options_ui(visible, func(option_id):
        args["context"].select_choice(option_id)
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
  const offered = context.options.filter(c => c.visible !== false);
  const timeout = LsdeUtils.getNativeProperties(block)?.timeout;

  const resolve = (choice) => {
    context.selectChoice(choice.id);
    next();
  };

  // `timeout` is MILLISECONDS in v2 — no × 1000 — and on a CHOICE it is counted from
  // the moment the options are readable. It still has to SELECT one: an option id IS the
  // exit port, so a choice left without selectChoice() resolves to no link at all.
  if (timeout) {
    const timer = setTimeout(() => resolve(offered[0]), timeout);
    ui.showOptions(offered, (optionId) => {
      clearTimeout(timer);
      resolve(offered.find(c => c.id === optionId));
    });
  } else {
    ui.showOptions(offered, (optionId) => resolve(offered.find(c => c.id === optionId)));
  }
});
```
```csharp [C#]
engine.OnChoice(args => {
    var (_, block, context, next) = args;
    var visible = context.Options
        .Where(c => c.Visible != false).ToList();
    var timeout = block.NativeProperties?.Timeout;

    void Resolve(RuntimeChoiceItem choice) {
        context.SelectChoice(choice.Id);
        next();
    }

    if (timeout.HasValue)
    {
        // use your engine's timer — cancel on player selection
        var timer = ScheduleTimer((float)timeout.Value, () => Resolve(visible[0]));
        ShowChoicesUI(visible, optionId => {
            timer.Cancel();
            Resolve(visible.First(c => c.Id == optionId));
        });
    }
    else
    {
        ShowChoicesUI(visible, optionId => Resolve(visible.First(c => c.Id == optionId)));
    }
    return null;
});
```
```cpp [C++]
engine.onChoice([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn {
    std::vector<const RuntimeChoiceItem*> visible;
    for (const auto& c : ctx->options())
        if (!c.visible.has_value() || c.visible.value())
            visible.push_back(&c);

    auto timeout = block->props
        ? block->props->timeout : std::nullopt;

    auto resolve = [ctx, next](const std::string& optionId) {
        ctx->selectChoice(optionId);
        next();
    };

    if (timeout.has_value()) {
        // use your engine's timer — cancel on player selection
        auto timer = scheduleDelay(timeout.value(), [&]() { resolve(visible[0]->id); });
        showOptionsUI(visible, [resolve, timer](const auto& optionId) {
            timer->cancel();
            resolve(optionId);
        });
    } else {
        showOptionsUI(visible, resolve);
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
    for c in ctx.options:
        if c.get("visible") != false:
            visible.append(c)

    var timeout_val = block.get("props", {}).get("timeout", 0)

    if timeout_val > 0:
        # use your engine's timer — cancel on player selection
        var timer = get_tree().create_timer(timeout_val)
        timer.timeout.connect(func():
            ctx.select_choice(visible[0]["id"])
            next_fn.call()
        )
        show_options_ui(visible, func(option_id):
            timer.time_left = 0  # cancel
            ctx.select_choice(option_id)
            next_fn.call()
        )
    else:
        show_options_ui(visible, func(option_id):
            ctx.select_choice(option_id)
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
  for (const choice of context.options) {
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
    foreach (var choice in args.Context.Options)
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
    for (const auto& choice : ctx->options()) {
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
    for choice in args["context"].options:
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
  context.selectChoice(context.options[0].id);
  next();
});
```
```csharp [C#]
tutorial.OnChoice(args => {
    // force-select the first choice, no filtering
    args.Context.SelectChoice(args.Context.Options[0].Id);
    args.Next();
    return null;
});
```
```cpp [C++]
tutorial->onChoice([](auto*, auto*, auto* ctx, auto next) -> CleanupFn {
    // force-select the first choice, no filtering
    ctx->selectChoice(ctx->options()[0].id);
    next();
    return {};
});
```
```gdscript [GDScript]
tutorial.on_choice(func(args):
    # force-select the first choice, no filtering
    args["context"].select_choice(args["context"].options[0]["id"])
    args["next"].call()
    return Callable()
)
```
:::

## 共享求值器

使用 `onResolveCondition`，一个 callback 即可处理 choice 可见性和 condition block 预评估**两者**。无需再重复逻辑：

<!--@include: ../../_shared/choice-reusable-filter.md-->

::: tip 为什么用一个 callback？
在 `onResolveCondition` 之前，相同的 `gameState.check(...)` 逻辑需要分别在 `onResolveCondition` 和 `onCondition` 中注册。使用统一解析器后，只需一个 callback — engine 自动处理两者。
:::

## 高级用法：自己打标记

如果不想注册全局解析器，`LsdeUtils.tagOptionVisibility` 会按需完成同样的工作。
它接受**两个**参数 — 选项和求值函数 — 并把列表**完整地**带着标记返回：

::: code-group
```ts [TypeScript]
import { LsdeUtils, type ConditionEvaluator } from '@lsde/dialog-engine';

const evaluator: ConditionEvaluator = t => gameState.check(t.dict, t.entry, t.op, t.value);
const offered = LsdeUtils.tagOptionVisibility(block.options, evaluator);
```
```csharp [C#]
var offered = LsdeUtils.TagOptionVisibility(
    block.Options,
    t => GameState.Check(t.Dict, t.Entry, t.Op, t.Value));
```
```cpp [C++]
lsde::ConditionEvaluatorFn evaluator = [](const lsde::ConditionTest& t) {
    return gameState.check(t.dict, t.entry, t.op, t.value);
};
auto offered = lsde::LsdeUtils::TagOptionVisibility(block->options, &evaluator);
```
```gdscript [GDScript]
var offered = LsdeUtils.tag_option_visibility(
    block.get("options", []),
    func(t): return GameState.check(t["dict"], t["entry"], t["op"], t["value"]))
```
:::

::: warning 这里不会为你解析 `choice:` condition
那个自动处理它们的捷径并不存在：由于 engine 不在回路中，针对保留 `choice` dictionary 的测试会到达
**你的**求值函数。请把它转交给持有历史的 scene：

```ts
const evaluator: ConditionEvaluator = t =>
  LsdeUtils.isChoiceCondition(t) ? scene.evaluateCondition(t)
                                 : gameState.check(t.dict, t.entry, t.op, t.value);
```
:::

`tagOptionVisibility` 取代了 v1 的 `filterVisibleChoices`，后者会**缩短**列表，并夺走了显示一个
被锁定回答的可能。
