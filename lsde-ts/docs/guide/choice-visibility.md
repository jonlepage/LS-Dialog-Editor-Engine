# Choice Visibility

## Overview

When a CHOICE block is dispatched, `context.choices` always contains **all** choices defined in the blueprint — none are pre-filtered. The engine never removes choices from the array.

If you need visibility filtering (e.g., hide choices based on game state or previous selections), the engine provides an **opt-in tagging** system. You install a filter once, and the engine tags each choice with `visible: true | false` before your `onChoice` handler sees it.

## Setup

Register a choice filter on the engine — once, before starting any scene:

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

When installed, the engine evaluates each choice's `visibilityConditions` **before** calling `onChoice`:

- **`choice:` conditions** (referencing previous player selections) are resolved automatically by the engine via its internal choice history — your callback never sees them.
- **Game-state conditions** (everything else) are delegated to your callback.
- Chaining with `&` (AND) and `|` (OR) works correctly across both types.

## Filtering in onChoice

In your handler, filter with one line:

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

### Why `visible !== false` and not `=== true`?

When **no filter is installed**, `visible` is `undefined`. Since `undefined !== false` evaluates to `true`, all choices pass — backward compatible by default. When a filter **is installed**, choices are tagged `true` or `false` explicitly.

| `visible` value | Meaning | `!== false` |
|---|---|---|
| `true` | Filter installed, choice passes | `true` |
| `false` | Filter installed, choice hidden | `false` |
| `undefined` | No filter installed | `true` |

## RuntimeChoiceItem

When a filter is installed, each choice in `context.choices` is a `RuntimeChoiceItem` — an extension of `ChoiceItem` with the `visible` tag:

```ts
interface RuntimeChoiceItem extends ChoiceItem {
  visible?: boolean; // true | false | undefined
}
```

Without a filter, choices are still `RuntimeChoiceItem` but `visible` remains `undefined`.

## Examples

### Standard — show visible choices

```ts
engine.onChoice(({ context, next }) => {
  const visible = context.choices.filter(c => c.visible !== false);
  ui.showChoices(visible, (uuid) => {
    context.selectChoice(uuid);
    next();
  });
});
```

### Timed choice — auto-select on timeout

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

### Hidden choices displayed greyed out

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

### Tutorial — ignore visibility entirely

```ts
tutorial.onChoice(({ context, next }) => {
  // Force-select the first choice, no filtering
  context.selectChoice(context.choices[0].uuid);
  next();
});
```

## Sharing Your Evaluator

Your game probably evaluates conditions in one place — an inventory system, a flag manager, a quest tracker. You can share the **same evaluator function** between `setChoiceFilter` and `onCondition` so the logic stays in one place:

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

::: tip Why share?
Without this pattern, you'll end up writing the same `gameState.check(...)` logic in two places. When your game state API changes, you'll fix one and forget the other. One function, two registrations, zero drift.
:::

## Advanced: Manual Filtering

If you prefer not to install a global filter, `LsdeUtils` provides a low-level utility:

```ts
import { LsdeUtils } from '@lsde/dialog-engine';

const visible = LsdeUtils.filterVisibleChoices(
  block.choices ?? [],
  (cond) => gameState.check(cond.key, cond.operator, cond.value),
  scene, // Optional — when provided, choice: conditions are resolved via choice history
);
```

The `scene` parameter enables automatic `choice:` condition resolution. Without it, all conditions are delegated to your evaluator callback.
