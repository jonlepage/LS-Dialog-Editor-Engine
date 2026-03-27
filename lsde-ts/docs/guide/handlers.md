# Handlers & Lifecycle

## Required Handlers

The engine is a graph traversal machine — it walks nodes and dispatches them to handler code. The 4 content handlers are required because without them the engine has no output:

- `onDialog` — React to dialogue text
- `onChoice` — Present choices to the player
- `onCondition` — Evaluate conditions to branch the flow
- `onAction` — Execute game-side effects

When `handle.start()` is called, the engine validates that all 4 are registered (either at engine level or scene level). If any are missing, it throws a descriptive error listing the missing handlers.

::: code-group
```ts [TypeScript]
engine.onDialog(handler);
engine.onChoice(handler);
engine.onCondition(handler);
engine.onAction(handler);

const handle = engine.scene(sceneId);
handle.start(); // ✓ All 4 registered — scene starts
```
```csharp [C#]
engine.OnDialog(handler);
engine.OnChoice(handler);
engine.OnCondition(handler);
engine.OnAction(handler);

var handle = engine.Scene(sceneId);
handle.Start(); // ✓ All 4 registered — scene starts
```
```cpp [C++]
engine.onDialog(handler);
engine.onChoice(handler);
engine.onCondition(handler);
engine.onAction(handler);

auto handle = engine.scene(sceneId);
handle->start(); // ✓ All 4 registered — scene starts
```
```gdscript [GDScript]
engine.on_dialog(handler)
engine.on_choice(handler)
engine.on_condition(handler)
engine.on_action(handler)

var handle = engine.scene(scene_id)
handle.start() # ✓ All 4 registered — scene starts
```
:::

## Two-Tier Handler System

The engine uses a two-level handler system:

1. **Tier 1 — Global (engine-level)**: registered on `DialogueEngine` via `onDialog()`, `onChoice()`, etc.
2. **Tier 2 — Scene-level**: registered on a `SceneHandle` via `handle.onDialog()`, etc.

When a block is dispatched:
1. The scene handler (Tier 2) is called first, if it exists.
2. The global handler (Tier 1) is then called, **unless** the scene handler called `context.preventGlobalHandler()`.

::: code-group
```ts [TypeScript]
// Tier 1 — global
engine.onDialog(({ block, context, next }) => {
  console.log('Global dialog handler');
  next();
});

// Tier 2 — scene-specific
const handle = engine.scene(sceneId);
handle.onDialog(({ block, context, next }) => {
  console.log('Scene-specific dialog handler');
  context.preventGlobalHandler();
  next();
});
handle.start();
```
```csharp [C#]
// Tier 1 — global
engine.OnDialog(args => {
    Console.WriteLine("Global dialog handler");
    args.Next();
    return null;
});

// Tier 2 — scene-specific
var handle = engine.Scene(sceneId);
handle.OnDialog(args => {
    Console.WriteLine("Scene-specific dialog handler");
    args.Context.PreventGlobalHandler();
    args.Next();
    return null;
});
handle.Start();
```
```cpp [C++]
// Tier 1 — global
engine.onDialog([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn {
    std::cout << "Global dialog handler\n";
    next();
    return {};
});

// Tier 2 — scene-specific
auto handle = engine.scene(sceneId);
handle->onDialog([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn {
    std::cout << "Scene-specific dialog handler\n";
    ctx->preventGlobalHandler();
    next();
    return {};
});
handle->start();
```
```gdscript [GDScript]
# Tier 1 — global
engine.on_dialog(func(args):
    print("Global dialog handler")
    args["next"].call()
    return Callable()
)

# Tier 2 — scene-specific
var handle = engine.scene(scene_id)
handle.on_dialog(func(args):
    print("Scene-specific dialog handler")
    args["context"].prevent_global_handler()
    args["next"].call()
    return Callable()
)
handle.start()
```
:::

::: info Handler Priority
When a block is dispatched, the engine resolves the handler in this priority order:
1. `handle.onBlock(uuid)` — block-specific override by UUID
2. `handle.onDialog()` / `handle.onChoice()` / ... — type override for the scene
3. `engine.onDialog()` / `engine.onChoice()` / ... — global handler

If a scene handler (Tier 2) exists, the global handler (Tier 1) is also called **after**, unless `context.preventGlobalHandler()` was called.
:::

## Character Resolution

The engine resolves a character for every block that has `metadata.characters`. The default returns the first character in the list.

::: code-group
```ts [TypeScript]
// Engine-level — applies to all scenes
engine.onResolveCharacter((characters) => {
  return party.getActiveLeader(characters);
});

// Scene-level override
const handle = engine.scene(sceneId);
handle.onResolveCharacter((characters) => {
  return battle.getActiveUnit(characters);
});
```
```csharp [C#]
engine.OnResolveCharacter(chars => party.GetActiveLeader(chars));

var handle = engine.Scene(sceneId);
handle.OnResolveCharacter(chars => battle.GetActiveUnit(chars));
```
```cpp [C++]
engine.onResolveCharacter([](const auto& chars) {
    return party.getActiveLeader(chars);
});

auto handle = engine.scene(sceneId);
handle->onResolveCharacter([](const auto& chars) {
    return battle.getActiveUnit(chars);
});
```
```gdscript [GDScript]
engine.on_resolve_character(func(chars):
    return party.get_active_leader(chars)
)

var handle = engine.scene(scene_id)
handle.on_resolve_character(func(chars):
    return battle.get_active_unit(chars)
)
```
:::

The resolved character is available as `context.character` in all handlers.

## Choice History

The engine tracks every choice the player makes during a scene. This history is used internally for `choice:` condition evaluation, and is also available to handler code:

::: code-group
```ts [TypeScript]
handle.onExit(({ scene }) => {
  const history = scene.getChoiceHistory();       // Map of blockUuid → [choiceUuid, ...]
  const picks = scene.getChoice('block-uuid-123'); // string[] | undefined
});
```
```csharp [C#]
handle.OnExit(args => {
    var history = args.Scene.GetChoiceHistory();
    var picks = args.Scene.GetChoice("block-uuid-123"); // List<string>?
});
```
```cpp [C++]
handle->onExit([](auto* scene, auto*) {
    auto history = scene->getChoiceHistory();
    auto picks = scene->getChoice("block-uuid-123"); // std::vector<std::string>*
});
```
```gdscript [GDScript]
handle.on_exit(func(args):
    var history = args["scene"].get_choice_history()
    var picks = args["scene"].get_choice("block-uuid-123") # Array or null
)
```
:::

## Full Lifecycle

### Execution Order for Each Block

1. `onValidateNextBlock` — Validation before execution
2. **Previous block cleanup** — The cleanup function returned by the *previous* block's handler
3. `onBeforeBlock` — Pre-processing (must call `resolve()` to continue)
4. Type handler (Tier 2 then Tier 1)

### Scene Events

::: code-group
```ts [TypeScript]
engine.onSceneEnter(({ scene, context }) => {
  // Called when handle.start() is executed
});

engine.onSceneExit(({ scene, context }) => {
  // Called when the scene ends (naturally or via cancel)
});
```
```csharp [C#]
engine.OnSceneEnter(args => {
    // Called when handle.Start() is executed
});

engine.OnSceneExit(args => {
    // Called when the scene ends (naturally or via cancel)
});
```
```cpp [C++]
engine.onSceneEnter([](auto* scene, auto*) {
    // Called when handle->start() is executed
});

engine.onSceneExit([](auto* scene, auto*) {
    // Called when the scene ends (naturally or via cancel)
});
```
```gdscript [GDScript]
engine.on_scene_enter(func(args):
    pass # Called when handle.start() is executed
)

engine.on_scene_exit(func(args):
    pass # Called when the scene ends (naturally or via cancel)
)
```
:::

## onValidateNextBlock

Intercepts each block transition for validation:

::: code-group
```ts [TypeScript]
engine.onValidateNextBlock(({ nextBlock, fromBlock, port }) => {
  return { valid: true };
});

engine.onInvalidateBlock(({ scene, reason }) => {
  console.error('Invalid block:', reason);
  scene.cancel();
});
```
```csharp [C#]
engine.OnValidateNextBlock(args => {
    return new ValidationResult { Valid = true };
});

engine.OnInvalidateBlock(args => {
    Console.Error.WriteLine($"Invalid block: {args.Reason}");
    args.Scene.Cancel();
});
```
```cpp [C++]
engine.onValidateNextBlock([](const auto& args) {
    return ValidationResult{true};
});

engine.onInvalidateBlock([](auto* scene, const auto& reason) {
    std::cerr << "Invalid block: " << reason << "\n";
    scene->cancel();
});
```
```gdscript [GDScript]
engine.on_validate_next_block(func(args):
    return {"valid": true}
)

engine.on_invalidate_block(func(args):
    printerr("Invalid block: %s" % args["reason"])
    args["scene"].cancel()
)
```
:::

## onBeforeBlock

Called before each block. **Must call `resolve()`** to continue:

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
        Task.Delay((int)(delay.Value * 1000)).ContinueWith(_ => args.Resolve());
    else
        args.Resolve();
    return null;
});
```
```cpp [C++]
engine.onBeforeBlock([](auto* block, auto resolve) {
    auto delay = block->nativeProperties ? block->nativeProperties->delay : std::nullopt;
    if (delay.has_value()) {
        scheduleTimer(delay.value() * 1000, [resolve]() { resolve(); });
    } else {
        resolve();
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

## Cleanup Functions

A handler can return a cleanup function, called when leaving the block:

::: code-group
```ts [TypeScript]
engine.onDialog(({ block, next }) => {
  const element = showDialogUI(block);
  next();

  return () => {
    element.remove(); // Called when the next block takes over
  };
});
```
```csharp [C#]
engine.OnDialog(args => {
    var element = ShowDialogUI(args.Block);
    args.Next();

    return () => element.SetActive(false);
});
```
```cpp [C++]
engine.onDialog([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn {
    auto* element = showDialogUI(block);
    next();

    return [element]() { element->remove(); };
});
```
```gdscript [GDScript]
engine.on_dialog(func(args):
    var element = show_dialog_ui(args["block"])
    args["next"].call()

    return func(): element.queue_free()
)
```
:::

## Block Override

A `SceneHandle` can also override a specific block by UUID:

::: code-group
```ts [TypeScript]
const handle = engine.scene(sceneId);
handle.onBlock('block-uuid-123', ({ block, context, next }) => {
  next();
});
```
```csharp [C#]
var handle = engine.Scene(sceneId);
handle.OnBlock("block-uuid-123", args => {
    args.Next();
    return null;
});
```
```cpp [C++]
auto handle = engine.scene(sceneId);
handle->onBlock("block-uuid-123", [](auto*, auto*, auto*, auto next) -> CleanupFn {
    next();
    return {};
});
```
```gdscript [GDScript]
var handle = engine.scene(scene_id)
handle.on_block("block-uuid-123", func(args):
    args["next"].call()
    return Callable()
)
```
:::

## Error Boundaries

Every handler call is wrapped in a try/catch. If a handler throws:

- The error does not corrupt engine state
- For the main track: the scene ends cleanly
- For async tracks: only the affected track is terminated — other tracks and the main flow continue

This is cross-language compatible (try/catch in TS, C#, C++, GDScript).

## cancel()

Calling `scene.cancel()` triggers this sequence:

1. All **async tracks** are cancelled
2. The **cleanup function** of the current block is executed
3. The `onSceneExit` handler is called
4. The scene is marked as finished

::: code-group
```ts [TypeScript]
engine.onInvalidateBlock(({ scene, reason }) => {
  console.error('Validation failed:', reason);
  scene.cancel();
});
```
```csharp [C#]
engine.OnInvalidateBlock(args => {
    Console.Error.WriteLine($"Validation failed: {args.Reason}");
    args.Scene.Cancel();
});
```
```cpp [C++]
engine.onInvalidateBlock([](auto* scene, const auto& reason) {
    std::cerr << "Validation failed: " << reason << "\n";
    scene->cancel();
});
```
```gdscript [GDScript]
engine.on_invalidate_block(func(args):
    printerr("Validation failed: %s" % args["reason"])
    args["scene"].cancel()
)
```
:::

## Async Tracks

When a block has `nativeProperties.isAsync = true`, the engine creates a **parallel track** that runs independently of the main flow.

### How Tracks are Created

During port resolution, if multiple outgoing connections exist:
- The **first non-async connection** becomes the continuation of the main flow
- The **other connections** (to blocks with `isAsync`) become parallel tracks

### Differences from the Main Flow

- `onBeforeBlock` is **skipped** on async tracks — the type handler is called directly
- Each async track follows only **one connection** (no multi-path branching)
- Tracks are automatically cancelled when the scene ends

### followNarrative

When `followNarrative = true` on an async block:
- The async track **waits** for the main flow to advance
- If `next()` has already been called in the handler, the pending advance executes
- If `next()` has **not** been called, the block is **force-advanced** (skipped)

### What Works in Async Tracks (and What Doesn't)

Async tracks are great for things that happen *alongside* the main conversation — ambient effects, parallel animations, companion reactions. But they have limits.

**DO — fire-and-forget side effects:**
| Use case | Why it works |
|---|---|
| NPC ambient dialogue ("barks") | Dialog blocks on an async track — NPCs comment, react, or banter while the main conversation continues. Great for making the world feel alive. |
| NPC companion reactions | A party member reacts to what the player just said — async dialog synced with followNarrative |
| Play ambient sounds or music | Action block, no player interaction needed |
| Trigger camera movements | Action block, runs in parallel |
| Parallel animations | followNarrative syncs to main track pacing |

**DON'T — player interaction or game logic branching:**
| Use case | Why it breaks |
|---|---|
| CHOICE block in async track | The player is already interacting with the main track — who answers the async choice? |
| CONDITION block in followNarrative | If force-advanced, the condition resolves with `null` → port resolver returns nothing → track silently ends |
| Critical game state changes | If the async track is cancelled (scene ends), the action never executes |

::: warning Choices in async tracks
A CHOICE block in an async track implies the player should make a selection while already engaged with the main dialogue. The only valid scenario is an AI-driven "choice" (e.g., a companion NPC auto-selects based on personality). If an async track hits a CHOICE block without a scene-level handler that auto-selects, the flow will stall or end silently.
:::

### Multiple Scenes in Parallel

The engine supports running multiple scenes simultaneously. Each `SceneHandle` has its own state, visited blocks, and async tracks. Global handlers (Tier 1) are shared — use the `scene` argument to know which scene is calling:

::: code-group
```ts [TypeScript]
engine.onDialog(({ scene, block, context, next }) => {
  if (scene === mainDialogue) showMainUI(block);
  else if (scene === tutorialOverlay) showTutorialBubble(block);
  next();
});

const mainDialogue = engine.scene('main-quest');
const tutorialOverlay = engine.scene('tutorial-hints');
mainDialogue.start();
tutorialOverlay.start();
```
```csharp [C#]
engine.OnDialog(args => {
    if (args.Scene == mainDialogue) ShowMainUI(args.Block);
    else if (args.Scene == tutorialOverlay) ShowTutorialBubble(args.Block);
    args.Next();
    return null;
});

var mainDialogue = engine.Scene("main-quest");
var tutorialOverlay = engine.Scene("tutorial-hints");
mainDialogue.Start();
tutorialOverlay.Start();
```
```cpp [C++]
engine.onDialog([&](auto* scene, auto* block, auto*, auto next) -> CleanupFn {
    if (scene == mainDialogue) showMainUI(block);
    else if (scene == tutorialOverlay) showTutorialBubble(block);
    next();
    return {};
});

auto mainDialogue = engine.scene("main-quest");
auto tutorialOverlay = engine.scene("tutorial-hints");
mainDialogue->start();
tutorialOverlay->start();
```
```gdscript [GDScript]
engine.on_dialog(func(args):
    if args["scene"] == main_dialogue: show_main_ui(args["block"])
    elif args["scene"] == tutorial_overlay: show_tutorial_bubble(args["block"])
    args["next"].call()
    return Callable()
)

var main_dialogue = engine.scene("main-quest")
var tutorial_overlay = engine.scene("tutorial-hints")
main_dialogue.start()
tutorial_overlay.start()
```
:::

::: tip Routing by scene
For many concurrent scenes, consider registering scene-level (Tier 2) handlers on each handle instead of routing in the global handler. Cleaner separation, no `if/else` chains.
:::
