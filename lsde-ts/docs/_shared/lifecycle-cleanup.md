::: code-group
```ts [TypeScript]
engine.onDialog(({ block, next }) => {
  const element = showDialogUI(block);

  // next() is called later — by player input, timer, etc.

  return () => {
    element.remove(); // called when the engine moves to the next block
  };
});
```
```csharp [C#]
engine.OnDialog(args => {
    var element = ShowDialogUI(args.Block);

    // next() is called later — by player input, timer, etc.

    return () => element.SetActive(false);
});
```
```cpp [C++]
engine.onDialog([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn {
    auto* element = showDialogUI(block);

    // next() is called later — by player input, timer, etc.

    return [element]() { element->remove(); };
});
```
```gdscript [GDScript]
engine.on_dialog(func(args):
    var element = show_dialog_ui(args["block"])

    # next is called later — by player input, timer, etc.

    return func(): element.queue_free()
)
```
:::
