::: code-group
```ts [TypeScript]
engine.onAction(({ context, next }) => {
  // `args` is a bag BY NAME, as the function declares its params — never a positional array.
  for (const { fn, args } of context.calls) {
    switch (fn) {
      case 'set_switch': gameState.setFlag(args.flag as string, args.value as boolean); break;
      case 'add_item':   inventory.add(args.item as string, args.count as number); break;
      case 'play_sound': audio.play(args.id as string); break;
    }
  }
  context.resolve();      // success → `then` port
  // context.reject();    // failure → `catch` port, falling back to `then` when none is wired
  next();
});
```
```csharp [C# — Unity]
engine.OnAction(args => {
    foreach (var call in args.Context.Calls)
    {
        switch (call.Fn)
        {
            case "set_switch": GameState.Instance.SetFlag((string)call.Args["flag"], (bool)call.Args["value"]); break;
            case "add_item":   Inventory.Add((string)call.Args["item"], (int)(double)call.Args["count"]); break;
            case "play_sound": AudioManager.Play((string)call.Args["id"]); break;
        }
    }
    args.Context.Resolve();
    args.Next();
    return null;
});
```
```cpp [C++ — Unreal]
// PropertyValue is a std::variant<std::string, double, bool, std::vector<std::string>>:
// the engine hands the value over as the payload wrote it and never converts it for you.
template <typename T>
static T Arg(const lsde::PropertyBag& args, const char* name, T fallback = {}) {
    auto it = args.find(name);
    if (it == args.end()) return fallback;
    const T* v = std::get_if<T>(&it->second);
    return v ? *v : fallback;
}

engine.onAction([this](auto*, auto*, auto* ctx, auto next) -> lsde::CleanupFn {
    for (const auto& call : ctx->calls()) {
        if (call.fn == "set_switch")
            GetGameState()->SetFlag(Arg<std::string>(call.args, "flag"),
                                    Arg<bool>(call.args, "value"));
        else if (call.fn == "add_item")
            GetInventory()->Add(Arg<std::string>(call.args, "item"),
                                static_cast<int>(Arg<double>(call.args, "count")));
        else if (call.fn == "play_sound")
            GetAudioManager()->Play(Arg<std::string>(call.args, "id"));
    }
    ctx->resolve();
    next();
    return {};
});
```
```gdscript [GDScript — Godot]
engine.on_action(func(args):
    for call in args["context"].calls:
        match call.get("fn"):
            "set_switch": GameState.set_flag(call["args"]["flag"], call["args"]["value"])
            "add_item":   Inventory.add(call["args"]["item"], call["args"]["count"])
            "play_sound": AudioManager.play(call["args"]["id"])
    args["context"].resolve()
    args["next"].call()
    return Callable()
)
```
:::
