# Handlers & Lifecycle

## Two-Tier Handler System

The engine uses a two-level handler system:

1. **Tier 1 — Global (engine-level)**: registered on `DialogueEngine` via `onDialog()`, `onChoice()`, etc.
2. **Tier 2 — Scene-level**: registered on a `SceneHandle` via `handle.onDialog()`, etc.

When a block is dispatched:
1. The scene handler (Tier 2) is called first, if it exists.
2. The global handler (Tier 1) is then called, **unless** the scene handler called `context.preventGlobalHandler()`.

```ts
// Tier 1 — global
engine.onDialog(({ block, context, next }) => {
  console.log('Global dialog handler');
  next();
});

// Tier 2 — scene-specific
const handle = engine.scene(sceneId);
handle.onDialog(({ block, context, next }) => {
  console.log('Scene-specific dialog handler');
  context.preventGlobalHandler(); // Skip the global handler
  next();
});
handle.start();
```

## Full Lifecycle

### Execution Order for Each Block

1. `onValidateNextBlock` — Validation before execution
2. **Previous block cleanup** — The cleanup function returned by the *previous* block's handler is executed here, when entering the new block
3. `onBeforeBlock` — Pre-processing (must call `resolve()` to continue)
4. Type handler (Tier 2 then Tier 1)

::: info Handler Priority
When a block is dispatched, the engine resolves the handler in this priority order:
1. `handle.onBlock(uuid)` — block-specific override by UUID
2. `handle.onDialog()` / `handle.onChoice()` / ... — type override for the scene
3. `engine.onDialog()` / `engine.onChoice()` / ... — global handler

If a scene handler (Tier 2) exists, the global handler (Tier 1) is also called **after**, unless `context.preventGlobalHandler()` was called.
:::

### Scene Events

```ts
engine.onSceneEnter(({ scene, context }) => {
  // Called when handle.start() is executed
});

engine.onSceneExit(({ scene, context }) => {
  // Called when the scene ends (naturally or via cancel)
});
```

## onValidateNextBlock

Intercepts each block transition for validation:

```ts
engine.onValidateNextBlock(({ nextBlock, fromBlock, port }) => {
  // Return { valid: false, reason: '...' } to block
  return { valid: true };
});

engine.onInvalidateBlock(({ scene, reason }) => {
  console.error('Invalid block:', reason);
  scene.cancel(); // Stop the scene
});
```

## onBeforeBlock

Called before each block. **Must call `resolve()`** to continue:

```ts
engine.onBeforeBlock(({ block, resolve }) => {
  const delay = block.nativeProperties?.delay;
  if (delay) {
    setTimeout(resolve, delay * 1000);
  } else {
    resolve();
  }
});
```

## Cleanup Functions

A handler can return a cleanup function, called when leaving the block:

```ts
engine.onDialog(({ block, next }) => {
  const element = showDialogUI(block);
  next();

  return () => {
    // Called when the next block takes over
    element.remove();
  };
});
```

## Block Override

A `SceneHandle` can also override a specific block by UUID:

```ts
const handle = engine.scene(sceneId);
handle.onBlock('block-uuid-123', ({ block, context, next }) => {
  // Handler specific to this block only
  next();
});
```

## Blocks Without Handlers

| Type | Behavior without handler |
|------|--------------------------|
| **DIALOG** | The block is visited then the engine silently advances to the next block. |
| **CHOICE** | The block is visited then the engine silently advances. No choice is selected — the flow may end. |
| **CONDITION** | The engine auto-evaluates via `StateBridge.evaluateCondition()` and follows the corresponding port. |
| **ACTION** | The engine auto-executes via `StateBridge.executeAction()` for each action in the block. |
| **NOTE** | Never executed — NOTE blocks are always skipped by the engine. |

## cancel()

Calling `scene.cancel()` triggers this sequence:

1. All **async tracks** are cancelled
2. The **cleanup function** of the current block is executed
3. The `onSceneExit` handler is called
4. The scene is marked as finished

```ts
engine.onInvalidateBlock(({ scene, reason }) => {
  console.error('Validation failed:', reason);
  scene.cancel(); // Cleanup + onSceneExit are called
});
```

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
