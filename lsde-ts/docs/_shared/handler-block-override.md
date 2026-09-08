::: code-group
```ts [TypeScript]
const handle = engine.scene(sceneId);
handle.onBlock('DIALOG-001', ({ block, context, next }) => {
  next();
});
```
```csharp [C#]
var handle = engine.Scene(sceneId);
handle.OnBlock("DIALOG-001", args => {
    args.Next();
    return null;
});
```
```cpp [C++]
auto handle = engine.scene(sceneId);
handle->onBlock("DIALOG-001", [](auto*, auto*, auto*, auto next) -> CleanupFn {
    next();
    return {};
});
```
```gdscript [GDScript]
var handle = engine.scene(scene_id)
handle.on_block("DIALOG-001", func(args):
    args["next"].call()
    return Callable()
)
```
:::