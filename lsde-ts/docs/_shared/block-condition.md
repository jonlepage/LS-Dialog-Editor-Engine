::: code-group
```ts [TypeScript]
// Optional once onResolveCondition is installed: the engine has already evaluated every case and
// already knows which port the flow leaves by. This handler is where you log it, or override it.
engine.onCondition(({ block, context, next }) => {
  // Each case carries its own exit port and its pre-evaluated result.
  const matched = context.cases.filter((c) => c.result).map((c) => c.port);
  console.log(`${block.id} matched:`, matched.join(', ') || 'none → default');

  // Override the routing with a PORT NAME: 'out', 'default', or a case port like 'K2'.
  // context.resolve('default');

  next();
});
```
```csharp [C#]
engine.OnCondition(args => {
    var matched = args.Context.Cases
        .Where(c => c.Result == true)
        .Select(c => c.Port)
        .ToList();
    Console.WriteLine($"{args.Block.Id} matched: {string.Join(", ", matched)}");

    // args.Context.Resolve(Ports.Default);   // override with a PORT NAME

    args.Next();
    return null;
});
```
```cpp [C++]
engine.onCondition([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn {
    for (const auto& c : ctx->cases()) {
        std::cout << c.port << "=" << c.result.value_or(false) << " ";
    }

    // ctx->resolve(Ports::Default);   // override with a PORT NAME

    next();
    return {};
});
```
```gdscript [GDScript]
engine.on_condition(func(args):
    var ctx = args["context"]
    var matched = []
    for c in ctx.cases:
        if c["result"]:
            matched.append(c["port"])
    print("%s matched: %s" % [args["block"]["id"], ", ".join(matched)])

    # ctx.resolve(LsdeTypes.PORT_DEFAULT)   # override with a PORT NAME

    args["next"].call()
    return Callable()
)
```
:::

::: tip Two modes, and only two
`portPerCase` absent — every case must hold: the flow leaves by `out` if they all do, `default`
otherwise. `portPerCase: true` — the **first** case that holds takes its own port (`K1`, `K2`…),
`default` when none does.

A case with no `when` is always true, and makes every case below it unreachable.

The **dispatcher mode is gone**. It fired every matching case at once, in parallel, which meant a
writer read three wires leaving a condition as a choice when it was three simultaneous launches.
Use `isAsync` on the target blocks instead — where a reader of the graph can see it.
:::
