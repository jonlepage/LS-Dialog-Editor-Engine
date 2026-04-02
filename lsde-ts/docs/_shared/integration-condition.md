::: code-group
```ts [TypeScript]
// Install a unified condition resolver — handles both choice visibility
// and condition block pre-evaluation. choice: conditions are internal.
engine.onResolveCondition((cond) =>
  gameState.check(cond.key, cond.operator, cond.value)
);

// onCondition is OPTIONAL when onResolveCondition is installed.
// The engine auto-resolves from pre-evaluated groups.
// Add onCondition only if you need logging, UI, or custom override logic.
engine.onCondition(({ block, context, next }) => {
  const { conditionGroups } = context;
  for (const g of conditionGroups)
    console.log(`  group ${g.portIndex}: ${g.result}`);
  // context.resolve() is optional — engine already set the result
  next();
});
```
```csharp [C# — Unity]
engine.OnResolveCondition(cond =>
    GameState.Instance.Evaluate(cond.Key, cond.Operator, cond.Value));

// Optional — add only for logging or override
engine.OnCondition(args => {
    var groups = args.Context.ConditionGroups!;
    foreach (var g in groups)
        Debug.Log($"  group {g.PortIndex}: {g.Result}");
    args.Next();
    return null;
});
```
```cpp [C++ — Unreal]
engine.onResolveCondition([this](const ExportCondition& cond) {
    return GetGameState()->Evaluate(cond.key, cond.op, cond.value);
});

// Optional — add only for logging or override
engine.onCondition([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn {
    next();
    return {};
});
```
```gdscript [GDScript — Godot]
engine.on_resolve_condition(func(cond):
    return GameState.evaluate(cond.get("key"), cond.get("operator"), cond.get("value"))
)

# Optional — add only for logging or override
engine.on_condition(func(args):
    var groups = args["context"].condition_groups
    for g in groups:
        print("  group %d: %s" % [g.get("port_index", 0), str(g.get("result"))])
    args["next"].call()
    return Callable()
)
```
:::
