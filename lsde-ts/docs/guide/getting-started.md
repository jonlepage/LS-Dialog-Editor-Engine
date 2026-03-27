# Getting Started

## Installation

::: code-group
```bash [TypeScript]
npm install @lsde/dialog-engine
```
```bash [C#]
dotnet add package LsdeDialogEngine
# Or add the source project directly to your solution
```
```bash [C++]
# Add lsde-cpp/ to your CMake project
add_subdirectory(lsde-cpp)
target_link_libraries(your_target PRIVATE lsde)
```
```bash [GDScript]
# Copy addons/lsde/ into your Godot project's addons/ folder
```
:::

## Minimal Usage

The engine is a graph traversal machine — it dispatches blocks to registered handlers, which give them meaning. Without handlers, the engine has no output.

::: code-group
```ts [TypeScript]
import { DialogueEngine, LsdeUtils } from '@lsde/dialog-engine';
import type { BlueprintExport } from '@lsde/dialog-engine';
import blueprintJson from './blueprint.json';

const data = blueprintJson as unknown as BlueprintExport;
const engine = new DialogueEngine();
const report = engine.init({ data });

if (report.errors.length > 0) {
  console.error('Invalid blueprint:', report.errors);
}

engine.setLocale('en');
engine.onResolveCharacter((characters) => characters[0]);

// 4 required handlers
engine.onDialog(({ block, context, next }) => {
  const text = LsdeUtils.getLocalizedText(block.dialogueText);
  console.log(`${context.character?.name ?? '???'}: ${text ?? '—'}`);
  next();
});

engine.onChoice(({ context, next }) => {
  const visible = context.choices.filter(c => c.visible !== false);
  context.selectChoice(visible[0].uuid);
  next();
});

engine.onCondition(({ scene, block, context, next }) => {
  const result = LsdeUtils.evaluateConditionChain(
    block.conditions ?? [],
    (cond) => LsdeUtils.isChoiceCondition(cond)
      ? scene.evaluateCondition(cond)
      : true, // your game-state logic here
  );
  context.resolve(result);
  next();
});

engine.onAction(({ block, context, next }) => {
  for (const action of block.actions ?? []) {
    console.log(`Action: ${action.actionId}`);
  }
  context.resolve();
  next();
});

// Run
const handle = engine.scene(data.scenes[0].uuid);
handle.start();
```
```csharp [C#]
using LsdeDialogEngine;

var blueprint = LoadBlueprint(); // your JSON deserialization
var engine = new DialogueEngine();
var report = engine.Init(new InitOptions { Data = blueprint });

if (report.Errors.Count > 0)
    throw new Exception("Invalid blueprint");

engine.SetLocale("en");
engine.OnResolveCharacter(chars => chars.Count > 0 ? chars[0] : null);

// 4 required handlers
engine.OnDialog(args => {
    var text = LsdeUtils.GetLocalizedText(args.Block.DialogueText);
    Console.WriteLine($"{args.Context.Character?.Name ?? "???"}: {text ?? "—"}");
    args.Next();
    return null;
});

engine.OnChoice(args => {
    var visible = args.Context.Choices
        .Where(c => c.Visible != false).ToList();
    args.Context.SelectChoice(visible[0].Uuid);
    args.Next();
    return null;
});

engine.OnCondition(args => {
    var result = LsdeUtils.EvaluateConditionChain(
        args.Block.Conditions ?? new(),
        cond => LsdeUtils.IsChoiceCondition(cond)
            ? args.Scene.EvaluateCondition(cond)
            : true
    );
    args.Context.Resolve(result);
    args.Next();
    return null;
});

engine.OnAction(args => {
    foreach (var action in args.Block.Actions ?? new())
        Console.WriteLine($"Action: {action.ActionId}");
    args.Context.Resolve();
    args.Next();
    return null;
});

// Run
var handle = engine.Scene(blueprint.Scenes[0].Uuid);
handle.Start();
```
```cpp [C++]
#include <lsde/engine.h>
#include <lsde/utils.h>

using namespace lsde;

auto blueprint = loadBlueprint(); // your JSON deserialization
DialogueEngine engine;
auto report = engine.init({blueprint});

engine.setLocale("en");
engine.onResolveCharacter([](const auto& chars) {
    return chars.empty() ? nullptr : &chars[0];
});

// 4 required handlers
engine.onDialog([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn {
    auto text = LsdeUtils::GetLocalizedText(block->dialogueText);
    auto* ch = ctx->character();
    std::cout << (ch ? ch->name : "???") << ": " << text.value_or("—") << "\n";
    next();
    return {};
});

engine.onChoice([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn {
    const auto& choices = ctx->choices();
    for (const auto& c : choices) {
        if (!c.visible.has_value() || c.visible.value()) {
            ctx->selectChoice(c.uuid);
            break;
        }
    }
    next();
    return {};
});

engine.onCondition([](auto* scene, auto* block, auto* ctx, auto next) -> CleanupFn {
    auto* cb = dynamic_cast<const ConditionBlock*>(block);
    auto result = LsdeUtils::EvaluateConditionChain(
        cb->conditions,
        [scene](const auto& cond) {
            return isChoiceCondition(cond) ? scene->evaluateCondition(cond) : true;
        });
    ctx->resolve(result);
    next();
    return {};
});

engine.onAction([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn {
    auto* ab = dynamic_cast<const ActionBlock*>(block);
    for (const auto& a : ab->actions)
        std::cout << "Action: " << a.actionId << "\n";
    ctx->resolve();
    next();
    return {};
});

// Run
auto handle = engine.scene(blueprint.scenes[0].uuid);
handle->start();
```
```gdscript [GDScript]
var blueprint = load_blueprint() # your JSON parsing
var engine = LsdeDialogueEngine.new()
var report = engine.init({"data": blueprint})

if report["errors"].size() > 0:
    push_error("Invalid blueprint")

engine.set_locale("en")
engine.on_resolve_character(func(chars):
    return chars[0] if chars.size() > 0 else null
)

# 4 required handlers
engine.on_dialog(func(args):
    var text = LsdeUtils.get_localized_text(args["block"].get("dialogueText"))
    var ch = args["context"].character
    print("%s: %s" % [ch.get("name", "???") if ch else "???", text if text else "—"])
    args["next"].call()
    return Callable()
)

engine.on_choice(func(args):
    var visible = []
    for c in args["context"].choices:
        if c.get("visible") != false:
            visible.append(c)
    args["context"].select_choice(visible[0]["uuid"])
    args["next"].call()
    return Callable()
)

engine.on_condition(func(args):
    var result = LsdeUtils.evaluate_condition_chain(
        args["block"].get("conditions", []),
        func(cond):
            if LsdeUtils.is_choice_condition(cond):
                return args["scene"].evaluate_condition(cond)
            return true
    )
    args["context"].resolve(result)
    args["next"].call()
    return Callable()
)

engine.on_action(func(args):
    for action in args["block"].get("actions", []):
        print("Action: %s" % action.get("actionId", ""))
    args["context"].resolve()
    args["next"].call()
    return Callable()
)

# Run
var handle = engine.scene(blueprint["scenes"][0]["uuid"])
handle.start()
```
:::

::: tip Why are the 4 handlers required?
The engine is a pure graph traversal machine — it walks the nodes and calls handler code. Without handlers, blocks would be visited silently with no output. The `start()` validation catches this early so there is never a scene that runs but does nothing.
:::

## Blueprint Validation

`engine.init()` returns a diagnostic report containing:

| Field | Type | Description |
|-------|------|-------------|
| `errors` | `DiagnosticEntry[]` | Blocking errors — the engine does not initialize |
| `warnings` | `DiagnosticEntry[]` | Non-blocking warnings |
| `stats` | `DiagnosticStats` | Counts: scenes, blocks, connections |

The `check` option can also be provided to cross-validate against the host application's capabilities:

::: code-group
```ts [TypeScript]
engine.init({
  data,
  check: {
    signatures: ['set_flag', 'play_sound'],
    dictionaries: { items: ['sword', 'shield'] },
    characters: ['Alice', 'Bob'],
  },
});
```
```csharp [C#]
engine.Init(new InitOptions {
    Data = blueprint,
    Check = new CheckOptions {
        Signatures = new() { "set_flag", "play_sound" },
        Characters = new() { "Alice", "Bob" },
    },
});
```
```cpp [C++]
engine.init({blueprint, CheckOptions{
    {"set_flag", "play_sound"},  // signatures
    {},                           // dictionaries
    {"Alice", "Bob"},             // characters
}});
```
```gdscript [GDScript]
engine.init({
    "data": blueprint,
    "check": {
        "signatures": ["set_flag", "play_sound"],
        "characters": ["Alice", "Bob"],
    },
})
```
:::

## What's Next

- [Block Types](/guide/block-types) — Detailed reference for each block type and handler
- [Choice Visibility](/guide/choice-visibility) — Opt-in tagging and filtering
- [Handlers & Lifecycle](/guide/handlers) — Two-tier system, cleanup, async tracks
