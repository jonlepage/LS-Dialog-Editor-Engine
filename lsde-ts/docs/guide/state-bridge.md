# StateBridge

The `StateBridge` is the bridge between the dialogue engine and your game state. It's the interface you implement to connect blueprint logic to your application.

## Interface

```ts
interface StateBridge {
  evaluateCondition: (condition: ExportCondition) => boolean;
  executeAction: (action: ExportAction, signature?: ActionSignature) => void;
  resolveDictionary: (groupLabel: string, rowKey: string) => string | number | boolean;
}
```

## evaluateCondition

Called automatically by the engine for:
- **CONDITION blocks** — when no `onCondition` handler is registered
- **Visibility conditions** — to filter visible choices in a CHOICE block

```ts
evaluateCondition: (cond) => {
  // cond.key      — condition key (e.g. "has_item")
  // cond.operator — operator (e.g. "==", "!=", ">")
  // cond.value    — value to compare against
  // cond.chain    — '|' (OR) or '&' (AND) with previous condition

  const gameValue = gameState.get(cond.key);
  switch (cond.operator) {
    case '==': return gameValue === cond.value;
    case '!=': return gameValue !== cond.value;
    case '>':  return Number(gameValue) > Number(cond.value);
    default:   return false;
  }
}
```

## executeAction

Called automatically for ACTION blocks without an `onAction` handler. The matching signature is passed if it exists in the blueprint.

```ts
executeAction: (action, signature) => {
  // action.actionId — action identifier (e.g. "set_flag")
  // action.params   — parameters [(string | number | boolean)]
  // signature       — full definition with param labels

  switch (action.actionId) {
    case 'set_flag':
      gameState.set(action.params[0] as string, action.params[1]);
      break;
    case 'play_sound':
      audio.play(action.params[0] as string);
      break;
  }
}
```

## resolveDictionary

Resolves a dictionary value by its group and key. Used by the engine when evaluating conditions and action parameters.

```ts
resolveDictionary: (groupLabel, rowKey) => {
  // Lookup in your game data
  return gameData.dictionaries[groupLabel]?.[rowKey] ?? rowKey;
}
```

## When is StateBridge Used?

| Situation | Method called |
|-----------|---------------|
| CONDITION block without handler | `evaluateCondition()` |
| `visibilityConditions` filtering on a choice | `evaluateCondition()` |
| ACTION block without handler | `executeAction()` |
| Dictionary parameter resolution | `resolveDictionary()` |

::: tip
If you register an `onCondition` or `onAction` handler, **your handler** takes control. The StateBridge is not called automatically in that case — it's up to you to invoke it if needed.
:::

## Condition Chaining

When a CONDITION block or a choice has multiple conditions, the engine evaluates them **left-to-right** with no operator precedence:

```
[cond1]  →  initial result
[cond2, chain='&']  →  result AND cond2
[cond3, chain='|']  →  (previous result) OR cond3
```

Rules:
- **Empty array** → `true` (no conditions = pass)
- **First condition** → its raw result (`chain` field is ignored)
- **`chain = '&'`** or **absent** → AND with accumulated result
- **`chain = '|'`** → OR with accumulated result
- **No precedence** — `A AND B OR C` evaluates as `(A AND B) OR C`
