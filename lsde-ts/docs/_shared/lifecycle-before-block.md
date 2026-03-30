::: code-group
```ts [TypeScript]
engine.onBeforeBlock(({ block, resolve }) => {
  const delay = block.nativeProperties?.delay;
  if (delay) {
    setTimeout(resolve, delay * 1000);
  } else {
    resolve();
  }
});
```
```csharp [C#]
engine.OnBeforeBlock(args => {
    var delay = args.Block.NativeProperties?.Delay;
    if (delay.HasValue)
    {
        // use your engine's delay system (coroutine, DOTween, Invoke, etc.)
        DelayThenCall((float)delay.Value, args.Resolve);
    }
    else
    {
        args.Resolve();
    }
});
```
```cpp [C++]
engine.onBeforeBlock([](const auto& args) {
    auto delay = args.block->nativeProperties
        ? args.block->nativeProperties->delay : std::nullopt;
    if (delay.has_value()) {
        // use your engine's timer system (FTimerManager, SDL_AddTimer, etc.)
        scheduleDelay(delay.value(), [&args]() { args.resolve(); });
    } else {
        args.resolve();
    }
});
```
```gdscript [GDScript]
engine.on_before_block(func(args):
    var delay = args["block"].get("nativeProperties", {}).get("delay", 0)
    if delay > 0:
        await get_tree().create_timer(delay).timeout
    args["resolve"].call()
)
```
:::
