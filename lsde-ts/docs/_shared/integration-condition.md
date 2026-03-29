::: code-group
```ts [TypeScript]
engine.onCondition(({ scene, block, context, next }) => {
  const result = LsdeUtils.evaluateConditionChain(
    block.conditions ?? [],
    (cond) => LsdeUtils.isChoiceCondition(cond)
      ? scene.evaluateCondition(cond) // choice history — engine handles it
      : gameState.check(cond.key, cond.operator, cond.value), // your logic
  );
  context.resolve(result); // true → port 0, false → port 1
  next();
});
```
```csharp [C# — Unity]
engine.OnCondition(args => {
    var result = LsdeUtils.EvaluateConditionChain(
        args.Block.Conditions ?? new(),
        cond => LsdeUtils.IsChoiceCondition(cond)
            ? args.Scene.EvaluateCondition(cond)
            : GameState.Instance.Evaluate(cond.Key, cond.Operator, cond.Value));
    args.Context.Resolve(result);
    args.Next();
    return null;
});
```
```cpp [C++ — Unreal]
engine.onCondition([this](auto* scene, auto* block, auto* ctx, auto next) -> lsde::CleanupFn {
    auto* cb = dynamic_cast<const lsde::ConditionBlock*>(block);
    auto result = lsde::LsdeUtils::EvaluateConditionChain(
        cb->conditions,
        [scene, this](const auto& cond) {
            return lsde::isChoiceCondition(cond)
                ? scene->evaluateCondition(cond)
                : GetGameState()->Evaluate(cond);
        });
    ctx->resolve(result);
    next();
    return {};
});
```
```gdscript [GDScript — Godot]
engine.on_condition(func(args):
    var result = LsdeUtils.evaluate_condition_chain(
        args["block"].get("conditions", []),
        func(cond):
            if LsdeUtils.is_choice_condition(cond):
                return args["scene"].evaluate_condition(cond)
            return GameState.evaluate(cond)
    )
    args["context"].resolve(result)
    args["next"].call()
    return Callable()
)
```
:::
