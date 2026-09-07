::: code-group
```ts [TypeScript]
engine.onChoice(({ block, context, next }) => {
  const natives = LsdeUtils.getNativeProperties(block);
  const { options, selectChoice } = context;

  // EVERY option is handed over, tagged. Filtering is your call — keeping the hidden ones lets
  // you grey them out or show "[locked]" instead of making them vanish.
  const offered = options.filter((o) => o.visible !== false);
  const dialog = game.createChoice(offered);

  // The option id IS its exit port (C1, C2…), so hand it straight back.
  dialog
    .then((selected) => selectChoice(selected))
    .finally(() => next());

  // Optional: if the writer set a timeout on this block. MILLISECONDS in v2.
  if (natives.timeout) {
    const timeout = game.wait(natives.timeout).then(() => next());
    dialog.finally(() => timeout.cancel());
  }

  return () => dialog.destroy();
});
```
```csharp [C#]
engine.OnChoice(args => {
    var natives = LsdeUtils.GetNativeProperties(args.Block);
    var offered = args.Context.Options
        .Where(o => o.Visible != false).ToList();

    var dialog = Game.CreateChoice(offered);

    // The option id IS its exit port (C1, C2…), so hand it straight back.
    dialog.OnSelect(selected => {
        args.Context.SelectChoice(selected);
        args.Next();
    });

    // Optional: if the writer set a timeout on this block. MILLISECONDS in v2.
    if (natives.Timeout is { } timeout)
        Game.Wait(timeout).Then(() => args.Next());

    return () => dialog.Destroy();
});
```
```cpp [C++]
engine.onChoice([&game](auto*, auto* block, auto* ctx, auto next) -> CleanupFn {
    std::vector<const lsde::RuntimeChoiceItem*> offered;
    for (const auto& option : ctx->options())
        if (option.visible.value_or(true))
            offered.push_back(&option);

    auto* dialog = game.createChoice(offered);

    // The option id IS its exit port (C1, C2…), so hand it straight back.
    dialog->onSelect([ctx, next](const std::string& selected) {
        ctx->selectChoice(selected);
        next();
    });

    // Optional: if the writer set a timeout on this block. MILLISECONDS in v2.
    auto natives = lsde::getNativeProperties(*block);
    if (natives.timeout) game.wait(*natives.timeout).then([next]() { next(); });

    return [dialog]() { dialog->destroy(); };
});
```
```gdscript [GDScript]
engine.on_choice(func(args):
    var ctx = args["context"]
    var natives = LsdeUtils.get_native_properties(args["block"])

    var offered = []
    for option in ctx.options:
        if option.get("visible") != false:
            offered.append(option)

    var dialog = game.create_choice(offered)

    # The option id IS its exit port (C1, C2…), so hand it straight back.
    var selected = await dialog.choice_selected
    ctx.select_choice(selected)
    args["next"].call()

    # Optional: natives.get("timeout") is in MILLISECONDS. Use a Timer node.

    return func(): dialog.destroy()
)
```
:::

::: tip visible is a tag, not a filter
With `engine.onResolveCondition()` installed, each option carries `visible: true | false`. Without
one it is **undefined** — *unknown*, not *hidden*.

That distinction matters: saying "hidden" about a question nobody could answer would take an answer
away from the player. Filter on `visible !== false`, never on `visible === true`.
:::
