![LSDE Dialog Engine — C#](https://raw.githubusercontent.com/jonlepage/LS-Dialog-Editor-Engine/master/lsde-csharp/banner.png)

# LSDE Dialog Engine — C#

> C# runtime for Unity (2021+) and .NET Standard 2.1. Zero external dependencies.

Port of the TypeScript reference implementation. Validated against the same cross-language JSON test specifications. The engine is a pure .NET Standard 2.1 library with no NuGet dependencies — drop it into Unity or any .NET project.

---

## Installation

```bash
# Core engine
dotnet add package LsdeDialogEngine

# JSON loader — choose ONE based on your platform:
dotnet add package LsdeDialogEngine.Newtonsoft        # Unity
dotnet add package LsdeDialogEngine.SystemTextJson    # .NET 5+ / Godot .NET
```

### Unity (alternative)

Copy the `Runtime/` folder into your Unity project's `Assets/Plugins/` directory. Install `com.unity.nuget.newtonsoft-json` via Unity Package Manager for JSON parsing.

## Quick Start

```csharp
using LsdeDialogEngine;
using LsdeDialogEngine.Json; // or LsdeDialogEngine.Newtonsoft for Unity

var blueprint = LsdeJson.Parse(File.ReadAllText("blueprint.json"));
var engine = new DialogueEngine();
var report = engine.Init(new InitOptions { Data = blueprint });

engine.SetLocale("en");

// Character resolver (optional — default: first character in list)
engine.OnResolveCharacter(chars => chars.Count > 0 ? chars[0] : null);

// The single game-state evaluator: it tags option visibility AND pre-evaluates condition cases.
// A test on the reserved `choice` dictionary never reaches it — the engine answers those from
// the choice history it kept during the scene.
engine.OnResolveCondition(test => GameState.Evaluate(test.Dict, test.Entry, test.Op, test.Value));

// ─── 4 Required Handlers ────────────────────────────────────────

engine.OnDialog(args => {
    // The engine hands the RAW string over and never looks inside it.
    var text = LsdeUtils.GetLocalizedText(args.Block.Text);
    var who = string.Join(" + ", args.Context.Actors.Select(a => a.Name));
    // The emotion belongs to the BLOCK, not to each actor.
    var tone = args.Context.Emotion?.Name;
    Debug.Log($"{who}{(tone != null ? $" ({tone})" : "")}: {text ?? "—"}");
    args.Next();
    return null; // or return a cleanup Action
});

engine.OnChoice(args => {
    // EVERY option is handed over, tagged — never a shortened list. Filter on `Visible != false`:
    // with no resolver installed `Visible` is null, meaning UNKNOWN, not hidden.
    var offered = args.Context.Options.Where(o => o.Visible != false).ToList();

    // The option id IS its exit port (C1, C2…), so hand it straight back.
    args.Context.SelectChoice(offered[0].Id);
    args.Next();
    return null;
});

// OnCondition is OPTIONAL when OnResolveCondition is installed: the engine already knows which
// port the cases picked. Keep it to log what matched, or to override with a PORT NAME.
engine.OnCondition(args => {
    var matched = args.Context.Cases.FirstOrDefault(c => c.Result == true);
    Debug.Log($"{args.Block.Id} → {matched?.Port ?? Ports.Default}");
    // args.Context.Resolve("K2");  // override, by port name
    args.Next();
    return null;
});

engine.OnAction(args => {
    foreach (var call in args.Context.Calls)
        Debug.Log($"Call: {call.Fn}");
    args.Context.Resolve();   // or args.Context.Reject(err) to leave by `catch`
    args.Next();
    return null;
});

// ─── Run ─────────────────────────────────────────────────────────

// A path (`reactor_breach`) or the stable id (`sc_u0vqg2g8`). Store the ID in a Unity asset or a
// save file — a path stops resolving the day someone renames the scene, with nothing to catch it.
var handle = engine.Scene("reactor_breach");
handle.Start();
```

### Unity Integration

In Unity, store the `next` callback and trigger it from your UI events:

```csharp
engine.OnDialog(args => {
    dialogueUI.SetText(args.Context.Character?.Name,
                       LsdeUtils.GetLocalizedText(args.Block.Text));
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
| `npm run test` | Run the full suite (xUnit) |
| `npm run playground` | Run playground against a real blueprint |
| `npm run clean` | Clean build artifacts |

---

## Project Structure

```
Runtime/                     # The Unity package. Engine library, netstandard2.1, zero dependencies
├── Types.cs                  # All types, interfaces, delegates
├── DialogueEngine.cs         # Public facade
├── Track.cs                  # THE traversal, written once. The main flow is a track, id 0
├── SceneHandle.cs            # The scene: public API, and what its tracks share
├── HandlerRegistry.cs        # Two-tier handler resolution
├── PortResolver.cs           # Output port routing
├── BlockContext.cs           # Context factories
├── ConditionEvaluator.cs     # AND/OR chain evaluation
├── Graph.cs                  # Scene + Blueprint indexing
├── Validator.cs              # Blueprint validation
├── LsdeUtils.cs              # Type checks, helpers
└── Newtonsoft/               # Optional loader companion package

src~/LsdeDialogEngine.SystemTextJson/  # Optional loader companion package
tests~/                                # xUnit test runners
samples~/MiniRuntime/                  # Console playground

A `~` suffix is how a folder is kept OUT of a Unity package: everything but Runtime/ is source
and tooling that a game must never import. Build output goes to build~/ for the same reason.
```

---

## API Overview

### Engine Lifecycle

| Method | Description |
|--------|-------------|
| `engine.Init(options)` | Validate + build graph. Returns `DiagnosticReport`. |
| `engine.SetLocale(locale)` | Set active locale. |
| `engine.Scene(sceneRef)` | Create scene handle. Call `handle.Start()` to begin. |
| `engine.Stop()` | Cancel all active scenes. |
| `engine.IsRunning()` | True if at least one scene is active. |
| `engine.GetActiveScenes()` | Get all running scene handles. |
| `engine.GetCurrentBlocks()` | Get current block of every active scene. |
| `engine.GetSceneConnections(sceneRef)` | Every wire INSIDE a scene, flattened. Graph inspection; wires never cross a scene. |

### Handler Registration (Tier 1 — Global)

All 4 type handlers are **required** — the engine will throw if a scene starts without them.

| Method | Description |
|--------|-------------|
| `engine.OnDialog(handler)` | Handle DIALOG blocks. |
| `engine.OnChoice(handler)` | Handle CHOICE blocks (choices tagged with `Visible` when `OnResolveCondition` is set). |
| `engine.OnCondition(handler)` | Handle CONDITION blocks. **Optional** when `OnResolveCondition` is installed. |
| `engine.OnAction(handler)` | Handle ACTION blocks. Developer **must** call `context.Resolve()` or `context.Reject()`. |

A ROUTER block has **no handler** and needs none: the engine evaluates every case, launches the port of each true one and continues by `then` (all held) or `catch` (one did not) on its own. To observe one, use `handle.OnBlock(id)` — its `IRouterContext` carries the pre-evaluated `Cases` and no `Resolve()`.

### Optional Handlers

| Method | Description |
|--------|-------------|
| `engine.OnResolveCharacter(fn)` | Character resolver. Default: first character in the list. |
| `engine.OnResolveCondition(fn)` | Unified condition resolver (choice visibility + condition pre-evaluation). |
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
| `handle.OnBlock(id, handler)` | Override the handler for one block, by its id (`DIALOG-007`). |
| `handle.OnDialogId(id, handler)` | Override one DIALOG block by id (type-safe). |
| `handle.OnChoiceId(id, handler)` | Override one CHOICE block by id (type-safe). |
| `handle.OnConditionId(id, handler)` | Override one CONDITION block by id (type-safe). |
| `handle.OnActionId(id, handler)` | Override one ACTION block by id (type-safe). |
| `handle.OnEnter(handler)` | Override global `OnSceneEnter` for this scene. |
| `handle.OnExit(handler)` | Override global `OnSceneExit` for this scene. |
| `handle.OnResolveCharacter(fn)` | Override character resolver for this scene. |
| `handle.GetCurrentBlock()` | Get the block currently being executed, or `null`. |
| `handle.GetVisitedBlocks()` | Set of visited block ids, for this scene. |
| `handle.GetChoiceHistory()` | Map of CHOICE block id → the option ids the player picked. |
| `handle.GetChoice(blockId)` | The option ids picked at one CHOICE block. |
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
| `LsdeUtils.IsRouterBlock(block)` | Type guard: true if block is a ROUTER block. |
| `LsdeUtils.IsActionBlock(block)` | Type guard: true if block is an `ActionBlock`. |
| `LsdeUtils.IsNoteBlock(block)` | Type guard: true if block is a `NoteBlock`. |
| `LsdeUtils.GetBlockLabel(block)` | How to name a block on screen: `Label`, else the designer `Note`, else the id. |
| `LsdeUtils.GetLocalizedText(text, locale?)` | Pick a locale out of an inline `Text` map. Uses the engine locale by default. |
| `LsdeUtils.GetTextFromTable(table, scene, blockId, optionId?)` | Read a line out of a loaded `localization/<locale>/__blueprints__.json` (separate-text mode). |
| `LsdeUtils.GetTextKey(block, optionId?)` | The i18n key of a block, or of one option of a choice. |
| `LsdeUtils.GetNativeProperties(block)` | The properties the ENGINE acts on, out of `Props`. **`Delay`/`Timeout` are MILLISECONDS.** |
| `LsdeUtils.GetCustomProperties(block)` | The properties the DESIGNER declared, with the natives taken out. |
| `LsdeUtils.IsChoiceCondition(test)` | True if the test reads a past answer — `{ dict: "choice" }`. |
| `LsdeUtils.GetChoiceConditionBlockId(test)` | The CHOICE block a `choice:` test reads. |
| `LsdeUtils.EvaluateConditionChain(tests, evaluator)` | Evaluate an AND/OR chain, left to right, no precedence. Absent or empty = `true`. |
| `LsdeUtils.EvaluateConditionCases(cases, portPerCase, evaluator)` | The exit port of a condition block: `out`/`default`, or `K1`… with `PortPerCase`. |
| `LsdeUtils.EvaluateEachCase(cases, evaluator)` | Each case on its own, in order — to show what matched without changing the routing. |
| `LsdeUtils.PickRouterPorts(cases, results)` | The exits of a ROUTER from results already computed: every true case's port, then `then` or `catch` LAST. |
| `LsdeUtils.TagOptionVisibility(options, evaluator)` | Tag every option with whether its `When` holds, returning them ALL. |

---

## Cross-Language Conformance

81 shared cases, in 72 suites, run by all four runtimes: **81/81 passing**.

---

## License

Proprietary — distributed under the LSDE license.
