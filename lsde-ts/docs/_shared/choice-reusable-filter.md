::: code-group
```ts [TypeScript]
// ONE evaluator answers everything about game state: option visibility AND condition cases.
// A test on the reserved `choice` dictionary never reaches it — the engine answers those from the
// history it kept during the scene.
engine.onResolveCondition((test) => game.evaluate(test.dict, test.entry, test.op, test.value));

// onCondition is now optional: the engine already knows which port to take.
// Keep it to log what matched, or to override with a PORT NAME.
engine.onCondition(({ block, context, next }) => {
  const matched = context.cases.filter((c) => c.result).map((c) => c.port);
  game.log(`${block.id} → ${matched[0] ?? 'default'}`);
  next();
});
```
```csharp [C#]
engine.OnResolveCondition(test => Game.Evaluate(test.Dict, test.Entry, test.Op, test.Value));

engine.OnCondition(args => {
    var matched = args.Context.Cases
        .Where(c => c.Result == true)
        .Select(c => c.Port)
        .FirstOrDefault() ?? Ports.Default;
    Game.Log($"{args.Block.Id} → {matched}");
    args.Next();
    return null;
});
```
```cpp [C++]
engine.onResolveCondition([&game](const lsde::ConditionTest& test) {
    return game.evaluate(test.dict, test.entry, test.op, test.value);
});

engine.onCondition([&game](auto*, auto* block, auto* ctx, auto next) -> lsde::CleanupFn {
    for (const auto& c : ctx->cases()) {
        if (c.result.value_or(false)) { game.log(block->id + " -> " + c.port); break; }
    }
    next();
    return {};
});
```
```gdscript [GDScript]
engine.on_resolve_condition(func(test: Dictionary) -> bool:
    return game.evaluate(test["dict"], test["entry"], test["op"], test["value"]))

engine.on_condition(func(args):
    for c in args["context"].cases:
        if c["result"]:
            game.log("%s -> %s" % [args["block"]["id"], c["port"]])
            break
    args["next"].call()
    return Callable()
)
```
:::

::: warning One resolver, two jobs — but not one answer
The same callback feeds option visibility and condition routing, so you write your game-state
lookup once.

Inside, the engine keeps them apart on purpose. Routing has to pick a branch, so a question it
cannot answer becomes `false` and the flow takes `default`. An option has no such obligation:
saying `false` about a question nobody could answer would **hide an answer from the player**, so
`visible` stays `undefined` instead.
:::
