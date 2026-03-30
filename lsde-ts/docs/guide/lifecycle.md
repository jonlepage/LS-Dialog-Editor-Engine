# Lifecycle & Validation

## Execution Order for Each Block

1. **Previous block cleanup** — The cleanup function returned by the *previous* block's handler runs at transition time (when `next()` is called)
2. `onValidateNextBlock` — Validation before execution
3. `onBeforeBlock` — Pre-processing (must call `resolve()` to continue)
4. Type handler (Tier 2 then Tier 1)

## Scene Events

<!--@include: ../_shared/lifecycle-scene-events.md-->

## onValidateNextBlock

Intercepts each block transition for validation. The handler receives the **resolved character** for both the upcoming block (`nextContext`) and the previously executed block (`fromContext`):

<!--@include: ../_shared/lifecycle-validate.md-->

### Character Gating

Use `nextContext.character` to control which blocks are allowed to execute based on game state:

<!--@include: ../_shared/lifecycle-validate-stunned.md-->

Use `fromContext.character` to validate transitions between characters (e.g. relationship checks, cooldowns). `fromContext` is `null` for the first block of a scene.

## onBeforeBlock

Called before each block. **Must call `resolve()`** to continue:

<!--@include: ../_shared/lifecycle-before-block.md-->

## Cleanup Functions

A handler can return a cleanup function, called when leaving the block:

<!--@include: ../_shared/lifecycle-cleanup.md-->

## Error Boundaries

Every handler call is wrapped in a try/catch. If a handler throws:

- The error is **silent** — it is not logged or re-thrown. If your scene ends unexpectedly, check your handlers.
- For the main track: the scene ends cleanly
- For async tracks: only the affected track is terminated — other tracks and the main flow continue

This is cross-language compatible (try/catch in TS, C#, C++, GDScript).

## cancel()

Calling `scene.cancel()` triggers this sequence:

1. All **async tracks** are cancelled
2. The **cleanup function** of the current block is executed
3. The `onSceneExit` handler is called
4. The scene is marked as finished

<!--@include: ../_shared/lifecycle-invalidate.md-->

## NativeProperties

Execution properties that control how a block is dispatched by the engine:

| Field | Type | Description |
|-------|------|-------------|
| `isAsync` | `boolean?` | Execute on a parallel async track |
| `delay` | `number?` | Delay before execution (consumed by `onBeforeBlock`) |
| `timeout` | `number?` | Execution timeout |
| `portPerCharacter` | `boolean?` | One output port per character in metadata |
| `skipIfMissingActor` | `boolean?` | Skip block if referenced actor is absent |
| `debug` | `boolean?` | Debug flag for editor use |
| `waitForBlocks` | `string[]?` | Block UUIDs that must be visited before this block can progress |
| `waitInput` | `boolean?` | Passive flag for explicit player input control |

## Visual Reference

### Block Execution Flow

```mermaid
flowchart TD
    A["next() called"] --> B["cleanup previous block"]
    B --> C[processBlock]
    C --> D{NOTE block?}
    D -- yes --> E[skip to next connection]
    D -- no --> F["onValidateNextBlock\n• nextContext.character\n• fromContext.character"]
    F --> G{valid?}
    G -- no --> H[onInvalidateBlock\nscene stops]
    G -- yes --> I["onBeforeBlock\nresolve()"]
    I --> J[type handler\nTier 2 then Tier 1]
    J --> K["next() → advance"]
```

### Character Gating Flow

```mermaid
flowchart TD
    A["block.metadata.characters\n= [Lia, Bob, Sam]"] --> B["onResolveCharacter\ngame returns: Lia"]
    B --> C["onValidateNextBlock\nnextContext.character = Lia\nfromContext.character = prev"]
    C --> D{valid?}
    D -- "Lia OK" --> E["execute block\ncontext.character = Lia"]
    D -- "Lia stunned" --> F["onInvalidateBlock\nscene.cancel()"]
    D -- "undefined\nno character in party" --> F
```
