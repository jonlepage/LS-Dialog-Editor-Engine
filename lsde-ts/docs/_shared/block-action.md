::: code-group
```ts [TypeScript]
engine.onAction(({ block, context, next }) => {
  for (const action of block.actions ?? []) {
    gameState.execute(action.actionId, action.params);
  }
  context.resolve();   // → "then" port
  // or context.reject(err); → "catch" port (fallback "then" if no catch exists)
  next();
});
```
```csharp [C#]
engine.OnAction(args => {
    foreach (var action in args.Block.Actions ?? new())
        GameState.Execute(action.ActionId, action.Params);
    args.Context.Resolve();
    args.Next();
    return null;
});
```
```cpp [C++]
engine.onAction([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn {
    auto* ab = dynamic_cast<const ActionBlock*>(block);
    for (const auto& a : ab->actions)
        gameState.execute(a.actionId, a.params);
    ctx->resolve();
    next();
    return {};
});
```
```gdscript [GDScript]
engine.on_action(func(args):
    for action in args["block"].get("actions", []):
        game_state.execute(action)
    args["context"].resolve()
    args["next"].call()
    return Callable()
)
```
:::