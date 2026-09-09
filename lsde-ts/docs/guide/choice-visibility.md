# Choice Visibility

## Overview

When a CHOICE block is dispatched, `context.options` always contains **all** choices defined in the blueprint — none are pre-filtered. The engine never removes choices from the array.

If visibility filtering is needed (e.g., hiding choices based on game state or previous selections), the engine provides an **opt-in tagging** system. A condition resolver is installed once, and the engine tags each choice with `visible: true | false` before the `onChoice` handler sees it.

## Setup

Register a condition resolver on the engine — once, before starting any scene:

<!--@include: ../_shared/choice-filter-setup.md-->

When installed, the engine evaluates each choice's `when` **before** calling `onChoice`. The same resolver also pre-evaluates condition block groups — see [Condition blocks](/guide/block-types#condition) for details.

- **`choice:` conditions** (referencing previous player selections) are resolved automatically by the engine via its internal choice history — the callback never sees them.
- **Game-state conditions** (everything else) are delegated to the callback.
- Chaining with `&` (AND) and `|` (OR) works correctly across both types.

## Filtering in onChoice

In the handler, filter with one line:

<!--@include: ../_shared/choice-visibility-handler.md-->

### Why `visible !== false` and not `=== true`?

When **no resolver is installed**, `visible` is `undefined`. Since `undefined !== false` evaluates to `true`, all choices pass — backward compatible by default. When a resolver **is installed**, choices are tagged `true` or `false` explicitly.

| `visible` value | Meaning | `!== false` |
|---|---|---|
| `true` | Resolver installed, choice passes | `true` |
| `false` | Resolver installed, choice hidden | `false` |
| `undefined` | No resolver installed | `true` |

## RuntimeChoiceItem

Every entry of `context.options` is a [`RuntimeChoiceItem`](/api-ref/interfaces/RuntimeChoiceItem) — the blueprint's `Option`, plus the `visible` tag:

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

Without a resolver, choices are still `RuntimeChoiceItem` but `visible` remains `undefined`/`null`/`nullopt`/absent. The `Option` itself carries `id`, `key`, `text` and `when` — and its **`id` is the exit port** (`C1`, `C2`…).

## Examples

### Standard — show visible choices

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

### Timed choice — auto-select on timeout

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

### Hidden choices displayed greyed out

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

### Tutorial — ignore visibility entirely

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

## Sharing the Evaluator

With `onResolveCondition`, a single callback handles **both** choice visibility and condition block pre-evaluation. No more duplicating logic:

<!--@include: ../_shared/choice-reusable-filter.md-->

::: tip Why one callback?
Before `onResolveCondition`, the same `gameState.check(...)` logic had to be registered in both `onResolveCondition` and `onCondition` separately. With the unified resolver, it's one callback — the engine handles both automatically.
:::

## Advanced: tagging them yourself

If a global resolver is not desired, `LsdeUtils.tagOptionVisibility` does the same work on demand.
It takes **two** arguments — the options and the evaluator — and returns the list **whole**, tagged:

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

::: warning `choice:` conditions are NOT resolved for you here
The shortcut that handled them automatically does not exist: with the engine out of the loop, a test
on the reserved `choice` dictionary reaches **your** evaluator. Send it back to the scene, which
keeps the history:

```ts
const evaluator: ConditionEvaluator = t =>
  LsdeUtils.isChoiceCondition(t) ? scene.evaluateCondition(t)
                                 : gameState.check(t.dict, t.entry, t.op, t.value);
```
:::

`tagOptionVisibility` replaces the v1 `filterVisibleChoices`, which **shortened** the list and took
away the ability to show a locked answer.
