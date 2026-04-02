::: code-group
```ts [TypeScript]
// One callback handles both choice visibility AND condition block pre-evaluation.
// choice: conditions are resolved internally — you only evaluate game-state conditions.
engine.onResolveCondition((cond) =>
  gameState.check(cond.key, cond.operator, cond.value)
);

// onCondition receives pre-evaluated conditionGroups — just route the result.
// onCondition is optional when onResolveCondition is installed.
engine.onCondition(({ block, context, next }) => {
  const { conditionGroups } = context;
  const isDispatcher = !!block.nativeProperties?.enableDispatcher;

  const matched = conditionGroups
    .filter((g) => g.result)
    .map((g) => g.portIndex);

  const result = isDispatcher ? matched : (matched[0] ?? -1);
  context.resolve(result);
  next();
});
```
```csharp [C# — Unity]
// One callback handles both choice visibility AND condition block pre-evaluation.
engine.OnResolveCondition(cond =>
    GameState.Instance.Evaluate(cond.Key, cond.Operator, cond.Value));

// onCondition receives pre-evaluated ConditionGroups — just route the result.
engine.OnCondition(args => {
    var groups = args.Context.ConditionGroups!;
    var isDispatcher = args.Block.NativeProperties?.EnableDispatcher == true;

    var matched = groups.Where(g => g.Result == true).Select(g => g.PortIndex).ToList();
    object result = isDispatcher ? (object)matched : (object)(matched.Count > 0 ? matched[0] : -1);
    args.Context.Resolve(result);
    args.Next();
    return null;
});
```
```cpp [C++ — Unreal]
// One callback handles both choice visibility AND condition block pre-evaluation.
engine.onResolveCondition([this](const ExportCondition& cond) {
    return GetGameState()->Evaluate(cond.key, cond.op, cond.value);
});

// onCondition receives auto-resolved result — just call next().
// The engine pre-evaluates and routes automatically.
engine.onCondition([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn {
    // Result is already pre-resolved by the engine.
    next();
    return {};
});
```
```gdscript [GDScript — Godot]
# One callback handles both choice visibility AND condition block pre-evaluation.
engine.on_resolve_condition(func(cond):
    return GameState.evaluate(cond.get("key"), cond.get("operator"), cond.get("value"))
)

# on_condition receives pre-evaluated condition_groups — just route the result.
engine.on_condition(func(args):
    var ctx = args["context"]
    var groups = ctx.condition_groups
    var np = args["block"].get("nativeProperties")
    var is_dispatcher = np is Dictionary and np.get("enableDispatcher", false)

    var matched = []
    for g in groups:
        if g.get("result", false):
            matched.append(g.get("port_index", 0))

    var result = matched if is_dispatcher else (matched[0] if matched.size() > 0 else -1)
    ctx.resolve(result)
    args["next"].call()
    return Callable()
)
```
:::
