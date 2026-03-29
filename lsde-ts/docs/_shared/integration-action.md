::: code-group
```ts [TypeScript]
engine.onAction(({ block, context, next }) => {
  for (const { actionId, params } of block.actions ?? []) {
    switch (actionId) {
      case 'set_flag':   gameState.setFlag(params[0], params[1]); break;
      case 'play_sound': audio.play(params[0] as string); break;
      case 'give_item':  inventory.add(params[0] as string); break;
    }
  }
  context.resolve();    // success → "then" port
  // context.reject(err); // failure → "catch" port (fallback "then")
  next();
});
```
```csharp [C# — Unity]
engine.OnAction(args => {
    foreach (var action in args.Block.Actions ?? new())
    {
        switch (action.ActionId)
        {
            case "set_flag":   GameState.Instance.SetFlag(action.Params); break;
            case "play_sound": AudioManager.Play(action.Params[0].ToString()); break;
            case "give_item":  Inventory.Add(action.Params[0].ToString()); break;
        }
    }
    args.Context.Resolve();
    args.Next();
    return null;
});
```
```cpp [C++ — Unreal]
engine.onAction([this](auto*, auto* block, auto* ctx, auto next) -> lsde::CleanupFn {
    auto* ab = dynamic_cast<const lsde::ActionBlock*>(block);
    for (const auto& a : ab->actions) {
        if (a.actionId == "set_flag")   GetGameState()->SetFlag(a.params);
        if (a.actionId == "play_sound") GetAudioManager()->Play(a.params);
        if (a.actionId == "give_item")  GetInventory()->Add(a.params);
    }
    ctx->resolve();
    next();
    return {};
});
```
```gdscript [GDScript — Godot]
engine.on_action(func(args):
    for action in args["block"].get("actions", []):
        match action.get("actionId"):
            "set_flag":   GameState.set_flag(action["params"][0], action["params"][1])
            "play_sound": AudioManager.play(action["params"][0])
            "give_item":  Inventory.add(action["params"][0])
    args["context"].resolve()
    args["next"].call()
    return Callable()
)
```
:::
