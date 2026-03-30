# Choice Visibility

## Overview

When a CHOICE block is dispatched, `context.choices` always contains **all** choices defined in the blueprint — none are pre-filtered. The engine never removes choices from the array.

If visibility filtering is needed (e.g., hiding choices based on game state or previous selections), the engine provides an **opt-in tagging** system. A filter is installed once, and the engine tags each choice with `visible: true | false` before the `onChoice` handler sees it.

## Setup

Register a choice filter on the engine — once, before starting any scene:

<!--@include: ../_shared/choice-filter-setup.md-->

When installed, the engine evaluates each choice's `visibilityConditions` **before** calling `onChoice`:

- **`choice:` conditions** (referencing previous player selections) are resolved automatically by the engine via its internal choice history — the callback never sees them.
- **Game-state conditions** (everything else) are delegated to the callback.
- Chaining with `&` (AND) and `|` (OR) works correctly across both types.

## Filtering in onChoice

In the handler, filter with one line:

<!--@include: ../_shared/choice-visibility-handler.md-->

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

## Sharing the Evaluator

Most games evaluate conditions in one place — an inventory system, a flag manager, a quest tracker. The **same evaluator function** can be shared between `setChoiceFilter` and `onCondition` so the logic stays in one place:

<!--@include: ../_shared/choice-reusable-filter.md-->

::: tip Why share?
Without this pattern, the same `gameState.check(...)` logic ends up in two places. When the game state API changes, one gets fixed and the other is forgotten. One function, two registrations, zero drift.
:::

## Advanced: Manual Filtering

If a global filter is not desired, `LsdeUtils` provides a low-level utility:

```ts
import { LsdeUtils } from '@lsde/dialog-engine';

const visible = LsdeUtils.filterVisibleChoices(
  block.choices ?? [],
  (cond) => gameState.check(cond.key, cond.operator, cond.value),
  scene, // Optional — when provided, choice: conditions are resolved via choice history
);
```

The `scene` parameter enables automatic `choice:` condition resolution. Without it, all conditions are delegated to the evaluator callback.
