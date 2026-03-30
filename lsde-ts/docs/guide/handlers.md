# Handlers

## Handlers

Handlers are the bridge between the engine and your game. They work like observers — you subscribe a function, and the engine calls it when the matching event occurs. This is how you trigger the right behaviors in your game engine: display text, play an animation, evaluate state, etc.

The engine exposes the following handlers:

| Handler | Level | Description |
|---------|-------|-------------|
| [`onDialog`](/api-ref/classes/DialogueEngine#ondialog) | global / scene | Dialog block — display text |
| [`onChoice`](/api-ref/classes/DialogueEngine#onchoice) | global / scene | Choice block — present choices |
| [`onCondition`](/api-ref/classes/DialogueEngine#oncondition) | global / scene | Condition block — evaluate and branch |
| [`onAction`](/api-ref/classes/DialogueEngine#onaction) | global / scene | Action block — trigger side effects |
| [`onResolveCharacter`](/api-ref/classes/DialogueEngine#onresolvecharacter) | global / scene | Resolve which character is speaking |
| [`onBeforeBlock`](/api-ref/classes/DialogueEngine#onbeforeblock) | global | Before every block (delay, entry animations…) |
| [`onValidateNextBlock`](/api-ref/classes/DialogueEngine#onvalidatenextblock) | global | Validate before progressing to a block |
| [`onInvalidateBlock`](/api-ref/classes/DialogueEngine#oninvalidateblock) | global | React when validation fails |
| [`onSceneEnter`](/api-ref/classes/DialogueEngine#onsceneenter) | global / scene | A scene starts |
| [`onSceneExit`](/api-ref/classes/DialogueEngine#onsceneexit) | global / scene | A scene ends |
| [`onBlock`](/api-ref/interfaces/SceneHandle#onblock) | scene | Override a specific block by UUID |
| [`setChoiceFilter`](/api-ref/classes/DialogueEngine#setchoicefilter) | global | Choice visibility evaluator |

The first 4 (`onDialog`, `onChoice`, `onCondition`, `onAction`) are **required** — the engine validates their presence when `start()` is called and throws a descriptive error if any are missing.

<!--@include: ../_shared/handler-basic.md-->

## Two-Tier Handler System

The engine resolves handlers in two tiers:

- **Global handlers** — registered on the engine, they define the default behavior for every scene. They are typically all you need.
- **Scene handlers** — registered on a specific [`SceneHandle`](/api-ref/interfaces/SceneHandle), they let you override or extend the default behavior when a scene requires a different rendering or control flow. This is rare, but available.

When a block is dispatched, the engine resolves the handler in this order:
1. `handle.onBlock(uuid)` — block-specific override
2. `handle.onDialog()` / `handle.onChoice()` / ... — scene-level type handler
3. `engine.onDialog()` / `engine.onChoice()` / ... — global handler

When both tiers are present, both run in sequence — scene first, then global — unless the scene handler calls `context.preventGlobalHandler()` to suppress the global pass.

<!--@include: ../_shared/handler-tier1.md-->

## Character Resolution

Character resolution is optional. By registering an `onResolveCharacter` callback, the engine invokes it before every block that has characters in its `metadata.characters`. The callback receives the list of characters assigned to the block and returns the one that should be active — or `undefined` if none is available. The resolved character is then accessible via `context.character` in all handlers.

This is the ideal integration point to query your game state: check if a character is present in the scene, alive, in camera range, etc. Returning `undefined` opens the door to several strategies: skip the block via [`skipIfMissingActor`](/api-ref/interfaces/NativeProperties#skipifmissingactor), cancel the scene via `handle.cancel()`, or handle the case directly in the handler.

<!--@include: ../_shared/handler-character.md-->

## Choice History

The engine tracks every choice the player makes during a scene. This history is used internally for `choice:` condition evaluation, and is also available to handler code:

<!--@include: ../_shared/handler-on-exit.md-->

## Block Override

A `SceneHandle` can also override a specific block by UUID:

<!--@include: ../_shared/handler-block-override.md-->

## Visual Reference

### Two-Tier Handler Dispatch

```mermaid
flowchart TD
    A[block dispatched] --> B{"onBlock(uuid)?\nblock-specific override"}
    B -- found --> Z[call handler]
    B -- not found --> C{"Tier 2 (scene)\nhandle.onDialog() etc."}
    C -- registered --> D{preventGlobalHandler?}
    C -- not registered --> E
    D -- yes --> Z
    D -- no --> E["Tier 1 (global)\nengine.onDialog() etc."]
    E --> Z
```
