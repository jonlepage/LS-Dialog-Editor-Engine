::: code-group
```ts [TypeScript]
handle.onExit(({ scene }) => {
  const history = scene.getChoiceHistory();       // Map of blockId → [optionId, ...]
  const picks = scene.getChoice('CHOICE-001'); // string[] | undefined
});
```
```csharp [C#]
handle.OnExit(args => {
    var history = args.Scene.GetChoiceHistory();
    var picks = args.Scene.GetChoice("CHOICE-001"); // List<string>?
});
```
```cpp [C++]
handle->onExit([](const lsde::SceneLifecycleArgs& args) {
    auto history = args.scene->getChoiceHistory();
    auto picks = args.scene->getChoice("CHOICE-001"); // std::vector<std::string>*
});
```
```gdscript [GDScript]
handle.on_exit(func(args):
    var history = args["scene"].get_choice_history()
    var picks = args["scene"].get_choice("CHOICE-001") # Array or null
)
```
:::