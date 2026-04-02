::: code-group
```ts [TypeScript]
engine.onCondition(({ block, context, next }) => {
  const { conditionGroups } = context;
  const isDispatcher = !!block.nativeProperties?.enableDispatcher;

  // conditionGroups are pre-evaluated when onResolveCondition is installed.
  // Each group has: conditions, portIndex, result (true/false/undefined).
  const matched = conditionGroups
    .filter((g) => g.result)
    .map((g) => g.portIndex);

  // switch mode: first match index or -1 (default port)
  // dispatcher mode: all matched indices (each fires an async track)
  const result = isDispatcher ? matched : (matched[0] ?? -1);
  context.resolve(result);
  next();
});
```
```csharp [C#]
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
```cpp [C++]
engine.onCondition([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn {
    // Result is auto-resolved by the engine when onResolveCondition is installed.
    // Override with ctx->resolve(result) if needed.
    next();
    return {};
});
```
```gdscript [GDScript]
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
