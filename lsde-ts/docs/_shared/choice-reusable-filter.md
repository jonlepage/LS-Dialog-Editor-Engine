::: code-group
```ts [TypeScript]
// Define once, use everywhere
const evaluateGameCondition = (cond: ExportCondition) =>
  gameState.check(cond.key, cond.operator, cond.value);

// Choice visibility — uses your evaluator for game-state conditions
engine.setChoiceFilter(evaluateGameCondition);

// Condition blocks — same evaluator, plus choice: handling
engine.onCondition(({ scene, block, context, next }) => {
  const result = LsdeUtils.evaluateConditionChain(
    block.conditions ?? [],
    (cond) => LsdeUtils.isChoiceCondition(cond)
      ? scene.evaluateCondition(cond)  // engine handles choice history
      : evaluateGameCondition(cond),   // your shared function
  );
  context.resolve(result);
  next();
});
```
```csharp [C# — Unity]
// One evaluator to rule them all
Func<ExportCondition, bool> evalGameCond = cond =>
    GameState.Instance.Evaluate(cond.Key, cond.Operator, cond.Value);

engine.SetChoiceFilter(evalGameCond);

engine.OnCondition(args => {
    var result = LsdeUtils.EvaluateConditionChain(
        args.Block.Conditions ?? new(),
        cond => LsdeUtils.IsChoiceCondition(cond)
            ? args.Scene.EvaluateCondition(cond)
            : evalGameCond(cond));
    args.Context.Resolve(result);
    args.Next();
    return null;
});
```
```cpp [C++ — Unreal]
// Shared lambda — capture your game state once
auto evalGameCond = [this](const ExportCondition& cond) {
    return GetGameState()->Evaluate(cond.key, cond.op, cond.value);
};

engine.setChoiceFilter(evalGameCond);

engine.onCondition([this, evalGameCond](auto* scene, auto* block, auto* ctx, auto next) -> CleanupFn {
    auto* cb = dynamic_cast<const ConditionBlock*>(block);
    auto result = LsdeUtils::EvaluateConditionChain(cb->conditions,
        [scene, &evalGameCond](const auto& cond) {
            return isChoiceCondition(cond) ? scene->evaluateCondition(cond) : evalGameCond(cond);
        });
    ctx->resolve(result);
    next();
    return {};
});
```
```gdscript [GDScript — Godot]
# One function, two uses
var eval_game_cond = func(cond):
    return GameState.evaluate(cond.get("key"), cond.get("operator"), cond.get("value"))

engine.set_choice_filter(eval_game_cond)

engine.on_condition(func(args):
    var result = LsdeUtils.evaluate_condition_chain(
        args["block"].get("conditions", []),
        func(cond):
            if LsdeUtils.is_choice_condition(cond):
                return args["scene"].evaluate_condition(cond)
            return eval_game_cond.call(cond)
    )
    args["context"].resolve(result)
    args["next"].call()
    return Callable()
)
```
:::
