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

## RuntimeOption

When a resolver is installed, each choice in `context.options` is a `RuntimeOption` — an extension of `Option` with the `visible` tag:

::: code-group
```ts [TypeScript]
interface RuntimeOption extends Option {
  visible?: boolean; // true | false | undefined
}
```
```csharp [C#]
public class RuntimeOption : Option
{
    public bool? Visible { get; set; } // true | false | null
}
```
```cpp [C++]
struct RuntimeOption : Option {
    std::optional<bool> visible; // true | false | nullopt
};
```
```gdscript [GDScript]
# RuntimeOption is a Dictionary with an extra "visible" key:
# { "id": "C1", "key": "...", "text": {...}, "visible": true/false/absent }
```
:::

Without a resolver, choices are still `RuntimeOption` but `visible` remains `undefined`/`null`/`nullopt`/absent.

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
    std::vector<const RuntimeOption*> visible;
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

  if (timeout) {
    const timer = setTimeout(() => resolve(visible[0]), timeout * 1000);
    ui.showOptions(visible, (optionId) => {
      clearTimeout(timer);
      resolve(visible.find(c => c.id === optionId));
    });
  } else {
    ui.showOptions(visible, (optionId) => resolve(visible.find(c => c.id === optionId)));
  }
});
```
```csharp [C#]
engine.OnChoice(args => {
    var (_, block, context, next) = args;
    var visible = context.Options
        .Where(c => c.Visible != false).ToList();
    var timeout = block.NativeProperties?.Timeout;

    void Resolve(RuntimeOption choice) {
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
    std::vector<const RuntimeOption*> visible;
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

## Advanced: Manual Filtering

If a global resolver is not desired, `LsdeUtils` provides a low-level utility:

::: code-group
```ts [TypeScript]
import { LsdeUtils } from '@lsde/dialog-engine';

const offered = LsdeUtils.tagOptionVisibility(
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

The `scene` parameter enables automatic `choice:` condition resolution. Without it, all conditions are delegated to the evaluator callback.
