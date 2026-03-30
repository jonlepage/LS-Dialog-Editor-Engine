::: code-group
```ts [TypeScript]
engine.onChoice(({ block, context, next }) => {
  const { nativeProperties } = block;
  const { choices, selectChoice } = context;

  const visible = choices.filter(c => c.visible !== false);
  const dialog = game.createChoice(visible);

  // when the player picks a choice, select it and advance
  dialog
    .then((selected) => selectChoice(selected))
    .finally(() => next());

  // optional: if the narrative designer set a timeout on this block
  if (nativeProperties?.timeout) {
    const timeout = game.wait(nativeProperties.timeout).then(() => next());
    dialog.finally(() => timeout.cancel());
  }

  return () => dialog.destroy();
});
```
```csharp [C#]
engine.OnChoice(args => {
    var (scene, block, context, next) = args;
    var visible = context.Choices
        .Where(c => c.Visible != false).ToList();

    var dialog = Game.CreateChoice(visible);

    // when the player picks a choice, select it and advance
    dialog.OnSelect(selected => {
        context.SelectChoice(selected);
        next();
    });

    // optional: if the narrative designer set a timeout on this block
    if (block.NativeProperties?.Timeout is { } timeout)
        Game.Wait(timeout).Then(() => next());

    return () => dialog.Destroy();
});
```
```cpp [C++]
engine.onChoice([&game](auto* scene, auto* block, auto* ctx, auto next) -> CleanupFn {
    std::vector<const RuntimeChoiceItem*> visible;
    for (const auto& c : ctx->choices())
        if (!c.visible.has_value() || c.visible.value())
            visible.push_back(&c);

    auto* dialog = game.createChoice(visible);

    // when the player picks a choice, select it and advance
    dialog->onSelect([ctx, next](const auto& selected) {
        ctx->selectChoice(selected);
        next();
    });

    // optional: if the narrative designer set a timeout on this block
    if (block->nativeProperties && block->nativeProperties->timeout) {
        game.wait(*block->nativeProperties->timeout).then([next]() { next(); });
    }

    return [dialog]() { dialog->destroy(); };
});
```
```gdscript [GDScript]
engine.on_choice(func(args):
    var block = args["block"]
    var ctx = args["context"]
    var next_fn = args["next"]

    var visible = []
    for c in ctx.choices:
        if c.get("visible") != false:
            visible.append(c)

    var dialog = game.create_choice(visible)

    # when the player picks a choice, select it and advance
    var selected = await dialog.choice_selected
    ctx.select_choice(selected)
    next_fn.call()

    # optional: if the narrative designer set a timeout on this block
    # use a Timer node or game.wait() to handle timeouts natively

    return func(): dialog.destroy()
)
```
:::
