::: code-group
```ts [TypeScript]
import type { RouterContext } from '@lsde/dialog-engine';

// A ROUTER has no handler of its own: the engine evaluates EVERY case, launches the port of each
// true one and picks `then` or `catch` before a handler could speak. To WATCH one, target it by id.
handle.onBlock('ROUTER-001', ({ block, context, next }) => {
  const { cases } = context as RouterContext;
  const launched = cases.filter((c) => c.result).map((c) => c.port);
  console.log(`${block.id} launched:`, launched.join(', ') || 'nothing');

  // Nothing to resolve: the exits are a tally, not a choice.
  next();
});
```
```csharp [C#]
handle.OnBlock("ROUTER-001", args => {
    var cases = ((IRouterContext)args.Context).Cases;
    var launched = cases.Where(c => c.Result == true).Select(c => c.Port).ToList();
    Console.WriteLine($"{args.Block.Id} launched: {string.Join(", ", launched)}");

    // Nothing to resolve: the exits are a tally, not a choice.
    args.Next();
    return null;
});
```
```cpp [C++]
handle->onBlock("ROUTER-001", [](auto*, auto* block, IBaseBlockContext* ctx, auto next) -> CleanupFn {
    auto* router = dynamic_cast<IRouterContext*>(ctx);
    for (const auto& c : router->cases()) {
        if (c.result.value_or(false)) std::cout << block->id << " launched " << c.port << "\n";
    }

    // Nothing to resolve: the exits are a tally, not a choice.
    next();
    return {};
});
```
```gdscript [GDScript]
handle.on_block("ROUTER-001", func(args):
    var ctx = args["context"]  # an LsdeBlockContext.RouterContext
    var launched = []
    for c in ctx.cases:
        if c["result"]:
            launched.append(c["port"])
    print("%s launched: %s" % [args["block"]["id"], ", ".join(launched)])

    # Nothing to resolve: the exits are a tally, not a choice.
    args["next"].call()
    return Callable()
)
```
:::

::: tip A tally, not a choice
A condition asks *which one* and leaves by a single port. A router asks *which ones*: every case
is evaluated — a false one in the middle hides nothing after it — each true case launches its
port, and the flow then continues by `then` when they **all** held, by `catch` when **any** did
not. No case at all is `then`, the way `Promise.all([])` resolves.

The `K*` routes are walked like any other port: an `isAsync` target opens its own track, the others
are this track's, in turn, and the continuation comes **last** — which is what keeps `then`/`catch`
as the main flow when the routes are async. `catch` cancels nothing: the tracks of the true cases
are already running.
:::
