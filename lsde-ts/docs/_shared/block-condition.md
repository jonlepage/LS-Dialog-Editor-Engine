::: code-group
```ts [TypeScript]
engine.onCondition(({ scene, block, context, next }) => {
  const result = LsdeUtils.evaluateConditionChain(
    block.conditions ?? [],
    (cond) => LsdeUtils.isChoiceCondition(cond)
      ? scene.evaluateCondition(cond)
      : gameState.check(cond.key, cond.operator, cond.value),
  );
  context.resolve(result);
  next();
});
```
```csharp [C#]
engine.OnCondition(args => {
    var result = LsdeUtils.EvaluateConditionChain(
        args.Block.Conditions ?? new(),
        cond => LsdeUtils.IsChoiceCondition(cond)
            ? args.Scene.EvaluateCondition(cond)
            : GameState.Check(cond.Key, cond.Operator, cond.Value)
    );
    args.Context.Resolve(result);
    args.Next();
    return null;
});
```
```cpp [C++]
engine.onCondition([](auto* scene, auto* block, auto* ctx, auto next) -> CleanupFn {
    auto* cb = dynamic_cast<const ConditionBlock*>(block);
    auto result = LsdeUtils::EvaluateConditionChain(
        cb->conditions,
        [scene](const auto& cond) {
            return isChoiceCondition(cond)
                ? scene->evaluateCondition(cond)
                : gameState.check(cond.key, cond.op, cond.value);
        });
    ctx->resolve(result);
    next();
    return {};
});
```
```gdscript [GDScript]
engine.on_condition(func(args):
    var result = LsdeUtils.evaluate_condition_chain(
        args["block"].get("conditions", []),
        func(cond):
            if LsdeUtils.is_choice_condition(cond):
                return args["scene"].evaluate_condition(cond)
            return game_state.check(cond)
    )
    args["context"].resolve(result)
    args["next"].call()
    return Callable()
)
```
:::