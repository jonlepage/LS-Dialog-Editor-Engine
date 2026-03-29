# Game Engine Integration

The LSDE engine is a pure graph traversal machine — it walks nodes and calls registered handlers. **The handlers are the bridge between the engine and the host application.** This page shows how to wire them into real game engines.

## The Pattern

Every integration follows the same 3-step dance:

1. **Initialize** — feed the engine the blueprint JSON
2. **Connect** — plug the 4 handlers into the game systems (UI, state, audio...)
3. **Start** — the engine calls the handlers, the host application takes it from there

The engine never touches the UI, game state, or audio. It only reports *what* happened. The reaction is up to the host application. Think of it as a director reading stage directions — the game is the cast, crew, and stage.

## Showing Dialogue

The simplest handler — display text and wait for the player to continue.

<!--@include: ../_shared/integration-dialog.md-->

::: tip next() is a remote control
Call `next()` instantly for rapid-fire dialogue, or store it and call later — after an animation, a timer, a player click... whatever fits the game. The engine waits patiently.
:::

## Presenting Choices

Spawn UI elements dynamically, let the player pick, and tell the engine what was selected.

<!--@include: ../_shared/integration-choice.md-->

## Evaluating Conditions

The game state, the rules. The engine just needs a `true` or `false`.

<!--@include: ../_shared/integration-condition.md-->

## Executing Actions

This is where the game comes alive — play sounds, give items, set flags, trigger cutscenes.

<!--@include: ../_shared/integration-action.md-->

## What Connects Where

| Handler | What the engine reports | What the host application does |
|---|---|---|
| `onDialog` | "Show this text from this character" | Display UI, play voice, wait for input |
| `onChoice` | "Here are the options (tagged visible/hidden)" | Spawn buttons, handle selection |
| `onCondition` | "Evaluate these conditions" | Check game state, return true/false |
| `onAction` | "Execute these effects" | Set flags, give items, play sounds |
| `onResolveCharacter` | "Which character is active?" | Party system, battle formation |
| `setChoiceFilter` | "Is this condition true for visibility?" | Check inventory, flags, quest state |
| `onValidateNextBlock` | "This block is next — is it allowed?" | Character gating, status checks, transition rules |
| `onBeforeBlock` | "Block is about to execute" | Handle delays, transitions, fade-ins |

## Pro Tips

- **`next()` is a remote control.** Call it instantly for rapid-fire dialogue, or hold it until an animation finishes. The engine waits — it has no concept of time.
- **Cleanup functions are free housekeeping.** Return one from any handler and the engine calls it when moving to the next block. Perfect for hiding UI, stopping audio, or freeing spawned nodes.
- **`onBeforeBlock` handles delays.** The engine does not enforce `delay` — the `onBeforeBlock` handler reads `nativeProperties.delay` and calls `resolve()` after a timer. Full control.
- **Async tracks are parallel storylines.** If a cutscene needs dialogue and camera movement at the same time, mark blocks as `isAsync` in the editor. Each track runs independently.
