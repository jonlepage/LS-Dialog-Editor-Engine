::: code-group
```ts [TypeScript]
engine.onChoice(({ context, next }) => {
  // `visible` is undefined when no resolver is installed: unknown, not hidden.
  const offered = context.options.filter(o => o.visible !== false);
  showOptionsUI(offered, (optionId) => {
    context.selectChoice(optionId);   // the option id IS the exit port (C1, C2…)
    next();
  });
});
```
```csharp [C#]
engine.OnChoice(args => {
    var offered = args.Context.Options
        .Where(o => o.Visible != false).ToList();
    ShowChoicesUI(offered, optionId => {
        args.Context.SelectChoice(optionId);
        args.Next();
    });
    return null;
});
```
```cpp [C++]
engine.onChoice([](auto*, auto*, auto* ctx, auto next) -> lsde::CleanupFn {
    std::vector<const lsde::RuntimeChoiceItem*> offered;
    for (const auto& o : ctx->options())
        if (!o.visible.has_value() || *o.visible)
            offered.push_back(&o);
    showOptionsUI(offered, [ctx, next](const std::string& optionId) {
        ctx->selectChoice(optionId);
        next();
    });
    return {};
});
```
```gdscript [GDScript]
engine.on_choice(func(args):
    var offered = []
    for o in args["context"].options:
        if o.get("visible") != false:
            offered.append(o)
    show_options_ui(offered, func(option_id):
        args["context"].select_choice(option_id)
        args["next"].call()
    )
    return Callable()
)
```
:::
