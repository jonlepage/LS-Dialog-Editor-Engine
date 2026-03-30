::: code-group
```ts [TypeScript]
engine.onAction(({ block, context, next }) => {
  const { actions } = block;
  game
    .executeActionsList(actions)
    .then(() => context.resolve())
    .catch((err) => context.reject(err))
    .finally(() => next());
});
```
```csharp [C#]
engine.OnAction(args => {
    var (scene, block, context, next) = args;
    Game.ExecuteActionsList(block.Actions, onComplete: () => {
        context.Resolve();
        next();
    }, onError: err => {
        context.Reject(err);
        next();
    });
    return null;
});
```
```cpp [C++]
engine.onAction([&game](auto* scene, auto* block, auto* ctx, auto next) -> CleanupFn {
    auto* ab = dynamic_cast<const ActionBlock*>(block);
    game.executeActionsList(ab->actions, [ctx, next]() {
        ctx->resolve();
        next();
    }, [ctx, next](const auto& err) {
        ctx->reject(err);
        next();
    });
    return {};
});
```
```gdscript [GDScript]
engine.on_action(func(args):
    var block = args["block"]
    var ctx = args["context"]
    var next_fn = args["next"]

    await game.execute_actions_list(block.get("actions", []))
    ctx.resolve()
    next_fn.call()
)
```
:::
