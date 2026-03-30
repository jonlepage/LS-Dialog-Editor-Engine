# Game Engine Integration

LSDE is engine-agnostic — no dependency on any game engine, UI framework, or audio system. It walks a graph and calls your handlers. This page shows how to wire it into the most common game engines.

For detailed handler implementation, see [Block Types](./block-types) and [Handlers](./handlers).

## Full Integration

The following example shows one way to integrate LSDE into each engine. It covers the 4 required handlers — dialog, choice, condition, action — in a single class, as a starting point.

Every game has its own needs. Adapt the structure, the layout, and the UI to your project.

<!--@include: ../_shared/integration-complete.md-->

## The 4 Handlers

Each handler receives the block data and a `next()` callback. The developer processes the data in their engine, then calls `next()` when the block is done. The timing of that call belongs entirely to the game.

- **Dialog** — text, character, native properties. Display the dialogue in your UI, wait for player input or a delay, then call `next()`. Return a cleanup function to hide the UI when the engine moves to the next block.

- **Choice** — list of choices tagged `visible` when a `choiceFilter` is configured. Create the corresponding UI elements — buttons, list, radial menu. On player selection, `selectChoice(uuid)` tells the engine which branch to follow, then `next()` advances the flow.

- **Condition** — conditions defined in the block. Evaluate them with your game logic — check a flag, a quest, an inventory. `context.resolve(true)` sends the flow to port 0, `context.resolve(false)` to port 1.

- **Action** — actions defined in the block. Execute them in your engine — play a sound, give an item, trigger a cinematic. `context.resolve()` confirms success, `context.reject(err)` signals failure.

## Tips

- **`next()` is the remote control.** Call it instantly for rapid-fire dialogue, or hold it until an animation finishes. The engine waits — it has no concept of time.
- **Cleanup functions clean up after you.** Return a function from any handler — the engine calls it when moving to the next block. Perfect for hiding UI, stopping audio, or freeing nodes.
- **`onBeforeBlock` handles delays.** The engine does not enforce `nativeProperties.delay` — `onBeforeBlock` reads it and calls `resolve()` after a timer. Full control.
- **Async tracks are parallel flows.** When a cutscene needs dialogue and camera movement at the same time, blocks marked `isAsync` in the editor run on independent tracks.
