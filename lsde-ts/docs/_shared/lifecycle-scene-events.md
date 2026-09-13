::: code-group
```ts [TypeScript]
engine.onSceneEnter(({ scene, context }) => {
  // Called when handle.start() is executed
});

engine.onSceneExit(({ scene, context }) => {
  // Called when the scene ends. context.reason says why:
  // 'completed' | 'cancelled' | 'invalidated' | 'faulted' | 'deadlocked'
  // scene.getSceneId() says WHICH scene — a global handler needs it when several play.
  if (context.reason === 'faulted') {
    console.error(`Scene ${scene.getSceneId()} failed`, context.error);
  }
  if (context.reason === 'deadlocked') {
    console.warn('Scene stuck waiting for', context.waitingFor);
  }
});
```
```csharp [C#]
engine.OnSceneEnter(args => {
    // Called when handle.Start() is executed
});

engine.OnSceneExit(args => {
    // Called when the scene ends. args.Context.Reason says why (SceneEndReason.*)
    // args.Scene.GetSceneId() says WHICH scene — a global handler needs it when several play.
    if (args.Context.Reason == SceneEndReason.Faulted)
        Debug.LogException(args.Context.Error);
    if (args.Context.Reason == SceneEndReason.Deadlocked)
        Debug.LogWarning($"{args.Scene.GetSceneId()} stuck waiting for {string.Join(", ", args.Context.WaitingFor)}");
});
```
```cpp [C++]
engine.onSceneEnter([](const lsde::SceneLifecycleArgs& args) {
    // Called when handle->start() is executed
});

engine.onSceneExit([](const lsde::SceneLifecycleArgs& args) {
    // Called when the scene ends. args.context.reason says why (lsde::SceneEndReason::*)
    // args.scene->getSceneId() says WHICH scene — a global handler needs it when several play.
    if (args.context.reason == lsde::SceneEndReason::Faulted) {
        // args.context.error holds the exception: std::rethrow_exception it to read it
    }
    if (args.context.reason == lsde::SceneEndReason::Deadlocked) {
        // args.context.waitingFor names the blocks the scene was stuck on
    }
});
```
```gdscript [GDScript]
engine.on_scene_enter(func(args):
    pass # Called when handle.start() is executed
)

engine.on_scene_exit(func(args):
    # Called when the scene ends. args["context"]["reason"] says why (LsdeTypes.SCENE_END_*)
    # args["scene"].get_scene_id() says WHICH scene — a global handler needs it when several play.
    if args["context"]["reason"] == LsdeTypes.SCENE_END_DEADLOCKED:
        push_warning("%s stuck waiting for %s" % [args["scene"].get_scene_id(), str(args["context"]["waitingFor"])])
)
```
:::
