::: code-group
```ts [TypeScript]
engine.onResolveCondition((condition) => {
  // Evaluate game-state conditions only.
  // choice: conditions are handled internally by the engine.
  return gameState.check(condition.key, condition.operator, condition.value);
});
```
```csharp [C#]
engine.OnResolveCondition(cond => {
    return GameState.Check(cond.Key, cond.Operator, cond.Value);
});
```
```cpp [C++]
engine.onResolveCondition([](const ExportCondition& cond) {
    return gameState.check(cond.key, cond.op, cond.value);
});
```
```gdscript [GDScript]
engine.on_resolve_condition(func(cond):
    return game_state.check(cond)
)
```
:::
