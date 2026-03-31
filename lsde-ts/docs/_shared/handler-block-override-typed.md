::: code-group
```ts [TypeScript]
const handle = engine.scene(sceneId);
handle.onActionId('block-uuid-123', ({ block, context, next }) => {
  // block is ActionBlock — actions is directly accessible
  for (const action of block.actions ?? []) {
    executeAction(action);
  }
  // context is ActionContext — resolve/reject are available
  context.resolve();
  next();
});
```
```csharp [C#]
var handle = engine.Scene(sceneId);
handle.OnActionId("block-uuid-123", args => {
    // args.Block is ActionBlock — Actions is directly accessible
    foreach (var action in args.Block.Actions ?? [])
        ExecuteAction(action);
    // args.Context is IActionContext — Resolve/Reject are available
    args.Context.Resolve();
    args.Next();
});
```
```cpp [C++]
auto handle = engine.scene(sceneId);
handle->onActionId("block-uuid-123", [](auto* scene, const ActionBlock* block, IActionContext* ctx, auto next) -> CleanupFn {
    // block is const ActionBlock* — actions is directly accessible
    for (const auto& action : block->actions)
        executeAction(action);
    // ctx is IActionContext* — resolve/reject are available
    ctx->resolve();
    next();
    return {};
});
```
```gdscript [GDScript]
var handle = engine.scene(scene_id)
handle.on_action_id("block-uuid-123", func(args):
    # args["block"] contains actions directly
    for action in args["block"].get("actions", []):
        execute_action(action)
    # args["context"] has resolve/reject
    args["context"]["resolve"].call()
    args["next"].call()
    return Callable()
)
```
:::
