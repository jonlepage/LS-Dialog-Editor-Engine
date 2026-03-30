# Async Tracks

When a block has `nativeProperties.isAsync = true`, the engine creates a **parallel track** that runs independently of the main flow.

## How Tracks are Created

During port resolution, if multiple outgoing connections exist:
- The **first non-async connection** becomes the continuation of the current flow
- The **other connections** (to blocks with `isAsync`) become new parallel tracks

This applies to both the main track **and** async tracks — an async track can spawn sub-tracks from its own outgoing async connections, creating a hierarchy of parallel execution.

## Track Lifecycle

- `onBeforeBlock` is called for **all blocks** (main and async tracks)
- Async tracks separate outgoing connections into main vs async, just like the main track
- Tracks are automatically cancelled when the scene ends or `cancel()` is called
- When a track finishes naturally (no more connections), its sub-tracks **continue to live** independently
- When a track is explicitly cancelled (`cancel()`), the cancellation **cascades** to all child tracks

## waitForBlocks — Track Synchronization

Use `nativeProperties.waitForBlocks` to synchronize parallel tracks. It accepts an array of block UUIDs that must be visited before the block can proceed:

- **On the start block**: The entire track waits before even beginning execution. `onBeforeBlock` is not called until all required blocks are visited.
- **On any other block**: When the handler calls `next()`, the advance is deferred until the condition is met.

The full execution sequence with `delay` and `waitForBlocks`:

```
spawn → waitForBlocks gate → onBeforeBlock (delay) → handler → next()
```

## waitInput — Player Input Flag

`nativeProperties.waitInput` is a **passive flag** — the engine exposes it but does not interpret it. Your game handler reads it to decide whether to wait for explicit player input (e.g., a second controller, a custom event, or an NPC auto-selection).

## TrackInfo API — Observability

Use `scene.getTrackInfos()` to inspect running async tracks. Returns a read-only snapshot of each track's state:

```ts
const tracks = scene.getTrackInfos();
for (const track of tracks) {
  console.log(`Track ${track.id} (parent: ${track.parentTrackId}) at block ${track.currentBlockUuid}`);
}
```

Each `TrackInfo` contains: `id`, `parentTrackId`, `startBlockUuid`, `currentBlockUuid`, `running`. Use this for debug overlays, play-mode renderers, or validation.

## What Works in Async Tracks (and What Doesn't)

Async tracks are great for things that happen *alongside* the main conversation — ambient effects, parallel animations, companion reactions. But they have limits.

**DO — parallel content:**
| Use case | Why it works |
|---|---|
| NPC ambient dialogue ("barks") | Dialog blocks on an async track — NPCs comment, react, or banter while the main conversation continues |
| Character reactions synced to events | Use `waitForBlocks` to trigger a reaction when a specific block is reached |
| Play ambient sounds or music | Action block, no player interaction needed |
| Trigger camera movements | Action block, runs in parallel |
| Delayed effects | Combine `waitForBlocks` + `delay` for precise timing |

**DON'T — player interaction or game logic branching:**
| Use case | Why it breaks |
|---|---|
| CHOICE block in async track | The player is already interacting with the main track — who answers the async choice? |
| Critical game state changes | If the async track is cancelled (scene ends), the action never executes |

::: warning Choices in async tracks
A CHOICE block in an async track implies the player should make a selection while already engaged with the main dialogue. The only valid scenario is an AI-driven "choice" (e.g., a companion NPC auto-selects based on personality). If an async track hits a CHOICE block without a scene-level handler that auto-selects, the flow will stall or end silently.
:::

## Multiple Scenes in Parallel

The engine supports running multiple scenes simultaneously. Each `SceneHandle` has its own state, visited blocks, and async tracks. Global handlers (Tier 1) are shared — use the `scene` argument to know which scene is calling:

<!--@include: ../_shared/async-dialog-track.md-->

::: tip Routing by scene
For many concurrent scenes, consider registering scene-level (Tier 2) handlers on each handle instead of routing in the global handler. Cleaner separation, no `if/else` chains.
:::

## Visual Reference

```mermaid
flowchart LR
    A["[A]"] --> B["[B]"]
    B --> C["[C]"]
    A -- async --> D["[D]"]
    D --> E["[E]"]
    D -- async --> F["[F]"]

    style A fill:#4a9,stroke:#333
    style B fill:#4a9,stroke:#333
    style C fill:#4a9,stroke:#333
    style D fill:#69b,stroke:#333
    style E fill:#69b,stroke:#333
    style F fill:#c7a,stroke:#333
```

- Main track: A &rarr; B &rarr; C
- Track 1 (parallel): D &rarr; E
- Track 2 (sub-track of D): F
- Scene cancel &rarr; all tracks cancelled
- Track D ends naturally &rarr; F continues
