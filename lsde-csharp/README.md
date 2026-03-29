![LSDE Dialog Engine — C#](https://raw.githubusercontent.com/jonlepage/LS-Dialog-Editor-Engine/master/lsde-csharp/banner.png)

# LSDE Dialog Engine — C#

> C# runtime for Unity (2021+) and .NET Standard 2.1. Zero external dependencies.

Port of the TypeScript reference implementation. Validated against the same 42 cross-language JSON test specifications. The engine is a pure .NET Standard 2.1 library with no NuGet dependencies — drop it into Unity or any .NET project.

---

## Quick Start

### Unity

Copy the `src/LsdeDialogEngine/` folder into your Unity project's `Assets/Plugins/` directory. No package manager needed.

### .NET

```bash
cd lsde-csharp
dotnet build
```

### Usage

```csharp
using LsdeDialogEngine;

var engine = new DialogueEngine();
var report = engine.Init(new InitOptions { Data = blueprint });

engine.SetLocale("en");

// Character resolver (optional — default: first character in list)
engine.OnResolveCharacter(chars => chars.Count > 0 ? chars[0] : null);

// Choice visibility filter (optional — tags each choice with Visible)
engine.SetChoiceFilter(cond => GameState.Evaluate(cond));

// ─── 4 Required Handlers ────────────────────────────────────────

engine.OnDialog(args => {
    var text = LsdeUtils.GetLocalizedText(args.Block.DialogueText);
    var ch = args.Context.Character;
    Debug.Log($"{ch?.Name ?? "???"}: {text ?? "—"}");
    args.Next();
    return null; // or return a cleanup Action
});

engine.OnChoice(args => {
    var visible = args.Context.Choices
        .Where(c => c.Visible != false)
        .ToList();
    args.Context.SelectChoice(visible[0].Uuid);
    args.Next();
    return null;
});

engine.OnCondition(args => {
    var result = LsdeUtils.EvaluateConditionChain(
        args.Block.Conditions,
        cond => LsdeUtils.IsChoiceCondition(cond)
            ? args.Scene.EvaluateCondition(cond)
            : GameState.Evaluate(cond));
    args.Context.Resolve(result);
    args.Next();
    return null;
});

engine.OnAction(args => {
    foreach (var a in args.Block.Actions)
        Debug.Log($"Action: {a.ActionId}");
    args.Context.Resolve();
    args.Next();
    return null;
});

// ─── Run ─────────────────────────────────────────────────────────

var handle = engine.Scene("scene-uuid");
handle.Start();
```

### Unity Integration

In Unity, store the `next` callback and trigger it from your UI events:

```csharp
engine.OnDialog(args => {
    dialogueUI.SetText(args.Context.Character?.Name,
                       LsdeUtils.GetLocalizedText(args.Block.DialogueText));
    dialogueUI.Show();

    // Store next — triggered by UI button click
    _pendingNext = args.Next;

    return () => dialogueUI.Hide(); // cleanup
});

// Called from your UI button
public void OnContinueClicked() {
    _pendingNext?.Invoke();
    _pendingNext = null;
}
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Build the solution |
| `npm run test` | Run 42 cross-language tests (xUnit) |
| `npm run playground` | Run playground against a real blueprint |
| `npm run clean` | Clean build artifacts |

---

## Project Structure

```
src/LsdeDialogEngine/       # Engine library (netstandard2.1, zero dependencies)
├── Types.cs                 # All types, interfaces, delegates
├── DialogueEngine.cs        # Public facade
├── SceneHandle.cs           # Traversal loop + AsyncTrack
├── HandlerRegistry.cs       # Two-tier handler resolution
├── PortResolver.cs          # Output port routing
├── BlockContext.cs           # Context factories
├── ConditionEvaluator.cs    # AND/OR chain evaluation
├── Graph.cs                 # Scene + Blueprint indexing
├── Validator.cs             # Blueprint validation
└── Utils.cs                 # Type checks, helpers

tests/LsdeDialogEngine.Tests/  # xUnit test runner
samples/MiniRuntime/            # Console playground
```

---

## API Overview

### Engine Lifecycle

| Method | Description |
|--------|-------------|
| `engine.Init(options)` | Validate + build graph. Returns `DiagnosticReport`. |
| `engine.SetLocale(locale)` | Set active locale. |
| `engine.Scene(sceneId)` | Create scene handle. Call `handle.Start()` to begin. |
| `engine.Stop()` | Cancel all active scenes. |
| `engine.IsRunning()` | True if at least one scene is active. |
| `engine.GetActiveScenes()` | Get all running scene handles. |
| `engine.GetCurrentBlocks()` | Get current block of every active scene. |
| `engine.GetSceneConnections(sceneId)` | Get all connections for a scene. |

### Handler Registration (Tier 1 — Global)

All 4 type handlers are **required** — the engine will throw if a scene starts without them.

| Method | Description |
|--------|-------------|
| `engine.OnDialog(handler)` | Handle DIALOG blocks. |
| `engine.OnChoice(handler)` | Handle CHOICE blocks (choices tagged with `Visible` when `SetChoiceFilter` is set). |
| `engine.OnCondition(handler)` | Handle CONDITION blocks. Developer **must** call `context.Resolve(bool)`. |
| `engine.OnAction(handler)` | Handle ACTION blocks. Developer **must** call `context.Resolve()` or `context.Reject()`. |

### Optional Handlers

| Method | Description |
|--------|-------------|
| `engine.OnResolveCharacter(fn)` | Character resolver. Default: first character in the list. |
| `engine.SetChoiceFilter(fn)` | Install choice visibility evaluator (game-state conditions). |
| `engine.OnBeforeBlock(handler)` | Pre-execution gate. Must call `Resolve()` to continue. |
| `engine.OnValidateNextBlock(handler)` | Validate before entering a block. |
| `engine.OnInvalidateBlock(handler)` | Called when a block fails validation. |
| `engine.OnSceneEnter(handler)` | Called when any scene starts. |
| `engine.OnSceneExit(handler)` | Called when any scene ends. |

### Scene Handle (Tier 2 — Per-Scene)

| Method | Description |
|--------|-------------|
| `handle.Start()` | Begin traversal from the entry block. |
| `handle.Cancel()` | Stop the scene and all async tracks. |
| `handle.OnDialog(handler)` | Override global DIALOG handler for this scene. |
| `handle.OnChoice(handler)` | Override global CHOICE handler for this scene. |
| `handle.OnCondition(handler)` | Override global CONDITION handler for this scene. |
| `handle.OnAction(handler)` | Override global ACTION handler for this scene. |
| `handle.OnBlock(uuid, handler)` | Override handler for a specific block by UUID. |
| `handle.OnEnter(handler)` | Override global `OnSceneEnter` for this scene. |
| `handle.OnExit(handler)` | Override global `OnSceneExit` for this scene. |
| `handle.OnResolveCharacter(fn)` | Override character resolver for this scene. |
| `handle.GetCurrentBlock()` | Get the block currently being executed, or `null`. |
| `handle.GetVisitedBlocks()` | Set of visited block UUIDs. |
| `handle.GetChoiceHistory()` | Map of block UUID → selected choice UUIDs. |
| `handle.GetChoice(blockUuid)` | Get choice(s) selected at a specific block. |
| `handle.EvaluateCondition(cond)` | Evaluate a `choice:` condition against history. |
| `handle.IsRunning()` | Whether the scene is still active. |
| `handle.GetActiveTracks()` | Number of active async tracks. |
| `handle.GetTrackInfos()` | Snapshot of all track states. |

### Handler Pattern

Every handler receives a typed `args` object and may return a cleanup `Action`:

```csharp
engine.OnDialog(args => {
    // Display dialogue...
    args.Next(); // Advance to next block

    return () => {
        // Called when leaving this block (cleanup)
    };
});
```

### Utilities (`LsdeUtils`)

| Method | Description |
|--------|-------------|
| `LsdeUtils.Locale` | Current locale, synced by `engine.SetLocale()`. |
| `LsdeUtils.IsDialogBlock(block)` | Type guard: true if block is a `DialogBlock`. |
| `LsdeUtils.IsChoiceBlock(block)` | Type guard: true if block is a `ChoiceBlock`. |
| `LsdeUtils.IsConditionBlock(block)` | Type guard: true if block is a `ConditionBlock`. |
| `LsdeUtils.IsActionBlock(block)` | Type guard: true if block is an `ActionBlock`. |
| `LsdeUtils.IsNoteBlock(block)` | Type guard: true if block is a `NoteBlock`. |
| `LsdeUtils.GetBlockLabel(block)` | Block label, or first 8 chars of UUID as fallback. |
| `LsdeUtils.GetLocalizedText(dialogueText, locale?)` | Lookup localized text. Uses engine locale by default. |
| `LsdeUtils.IsChoiceCondition(condition)` | True if condition references a previous choice (`choice:<uuid>`). |
| `LsdeUtils.GetChoiceConditionBlockUuid(condition)` | Extract block UUID from a choice condition. |
| `LsdeUtils.EvaluateConditionChain(conditions, evaluator)` | Evaluate AND/OR condition chain. Empty = `true`. |
| `LsdeUtils.FilterVisibleChoices(choices, evaluator, scene?)` | Filter choices by visibility conditions. |

---

## Cross-Language Conformance

42 shared JSON tests across all runtimes: **42/42 passing**.

---

## License

Proprietary — distributed under the LSDE license.
