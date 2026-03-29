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
