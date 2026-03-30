::: code-group
```ts [TypeScript]
engine.onCondition(({ scene, block, context, next }) => {
  const { conditions } = block;
  game
    .evaluateGameStateConditions(conditions)
    .then((result) => context.resolve(result))
    .finally(() => next());
});
```
```csharp [C#]
engine.OnCondition(args => {
    var (scene, block, context, next) = args;
    var result = Game.EvaluateGameStateConditions(block.Conditions);
    context.Resolve(result);
    next();
});
```
```cpp [C++]
engine.onCondition([&game](auto* scene, auto* block, auto* ctx, auto next) -> CleanupFn {
    auto* cb = dynamic_cast<const ConditionBlock*>(block);
    auto result = game.evaluateGameStateConditions(cb->conditions);
    ctx->resolve(result);
    next();
    return {};
});
```
```gdscript [GDScript]
engine.on_condition(func(args):
    var block = args["block"]
    var ctx = args["context"]
    var next_fn = args["next"]

    var result = game.evaluate_game_state_conditions(block.get("conditions", []))
    ctx.resolve(result)
    next_fn.call()
)
```
:::
