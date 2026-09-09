![LSDE Dialog Engine — C++](https://raw.githubusercontent.com/jonlepage/LS-Dialog-Editor-Engine/master/lsde-cpp/banner.png)

# LSDE Dialog Engine — C++

> C++17 runtime for Unreal Engine and custom engines. Zero external dependencies in the core library.

Port of the TypeScript reference implementation. Validated against the same cross-language JSON test specifications. The engine core uses only the C++17 standard library — nlohmann/json is used exclusively in tests and the playground.

---

## Quick Start

### Build

Requires CMake 3.14+ and a C++17 compiler (MSVC 2019+, GCC 9+, or Clang 10+).

```bash
cd lsde-cpp
cmake -B build
cmake --build build
```

### Integrate

Copy `include/lsde/` and `src/` into your project. Add the source files to your build system. No external dependencies.

Or as a git submodule with CMake:

```cmake
add_subdirectory(deps/lsde/lsde-cpp)
target_link_libraries(your_target PRIVATE lsde)
```

### Usage

```cpp
#include <lsde/engine.h>
#include <lsde/utils.h>

using namespace lsde;

int main() {
    // Load your blueprint (your JSON deserialization)
    BlueprintExport blueprint = loadBlueprint();

    // ─── Init ────────────────────────────────────────────────────────
    DialogueEngine engine;
    auto report = engine.init({blueprint});

    if (!report.errors.empty()) {
        for (const auto& e : report.errors)
            std::cerr << e.code << ": " << e.message << "\n";
        return 1;
    }

    engine.setLocale("en");

    // Character resolver (optional — default: first character in list)
    engine.onResolveCharacter([](const std::vector<BlockCharacter>& chars) -> const BlockCharacter* {
        return chars.empty() ? nullptr : &chars[0];
    });

    // Unified condition resolver — handles choice visibility + condition block pre-evaluation.
    // choice: conditions are handled internally by the engine via choice history.
    engine.onResolveCondition([](const ExportCondition& cond) -> bool {
        return true; // delegate to your game state
    });

    // ─── 4 Required Handlers ─────────────────────────────────────────
    engine.onDialog([](ISceneHandle*, const DialogBlock* block, IDialogContext* ctx,
                       std::function<void()> next) -> CleanupFn {
        auto* ch = ctx->character();
        auto text = LsdeUtils::GetLocalizedText(block->text);
        std::cout << (ch ? ch->name : "???") << ": " << text.value_or("—") << "\n";
        next();
        return {}; // or return a cleanup function
    });

    engine.onChoice([](ISceneHandle*, const ChoiceBlock* block, IChoiceContext* ctx,
                       std::function<void()> next) -> CleanupFn {
        const auto& choices = ctx->choices();
        for (const auto& c : choices) {
            if (!c.visible.has_value() || c.visible.value()) {
                // The option id IS its exit port (C1, C2…), so hand it straight back.
                ctx->selectChoice(c.id);
                break;
            }
        }
        next();
        return {};
    });

    // onCondition is OPTIONAL when onResolveCondition is installed: the engine already knows which
    // port the cases picked. Keep it to log what matched, or to override with a PORT NAME.
    engine.onCondition([](ISceneHandle*, const ConditionBlock* block, IConditionContext* ctx,
                          std::function<void()> next) -> CleanupFn {
        for (const auto& c : ctx->cases())
            if (c.result.value_or(false)) { std::cout << block->id << " -> " << c.port << "
"; break; }
        // ctx->resolve("K2");  // override, by port name
        next();
        return {};
    });

    engine.onAction([](ISceneHandle*, const ActionBlock* block, IActionContext* ctx,
                       std::function<void()> next) -> CleanupFn {
        for (const auto& call : ctx->calls())
            std::cout << "Call: " << call.fn << "
";
        ctx->resolve();   // or ctx->reject(err) to leave by `catch`
        next();
        return {};
    });

    // ─── Run ─────────────────────────────────────────────────────────
    // A path (`reactor_breach`) or the stable id (`sc_u0vqg2g8`) — the id survives a rename.
    auto handle = engine.scene(blueprint.scenes[0].scene);
    handle->start();
}
```

---

## Unreal Engine Integration

In Unreal, you store the `next` callback and trigger it from your UI delegates (e.g. UMG button clicks):

```cpp
// Store as member: std::function<void()> PendingNext;

engine.onDialog([this](auto*, auto* block, auto* ctx, auto next) -> lsde::CleanupFn {
    auto text = lsde::LsdeUtils::GetLocalizedText(block->text);
    auto* ch = ctx->character();

    DialogWidget->SetText(FString(ch ? ch->name.c_str() : ""),
                          FString(text.value_or("").c_str()));
    DialogWidget->SetVisibility(ESlateVisibility::Visible);

    // Store next — triggered by a UI button delegate
    PendingNext = std::move(next);

    return [this]() { DialogWidget->SetVisibility(ESlateVisibility::Collapsed); };
});
```

See the [Integration Guide](https://jonlepage.github.io/LS-Dialog-Editor-Engine/guide/integration.html) for complete Unreal examples (choice, condition, action handlers).

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run configure` | Run CMake configure (once) |
| `npm run build` | Build the project (Debug) |
| `npm run test` | Run the full suite (Google Test) |
| `npm run build:release` | Build Release — what a shipping game links against |
| `npm run test:release` | Run the full suite against the Release build |
| `npm run playground` | Run playground against a real blueprint |
| `npm run rebuild` | Configure + build |

The Visual Studio generator picks its configuration at BUILD time, so it reports
`CMAKE_BUILD_TYPE` as an unused variable at configure. The flag is kept because single-config
generators — the Makefile generator CI uses — do need it.

---

## Project Structure

```
include/lsde/             # Public headers (zero external deps)
├── types.h                # All structs, enums, abstract classes
├── engine.h               # Public facade
├── track.h                # THE traversal, written once. The main flow is a track, id 0
├── scene_handle.h         # The scene: public API, and what its tracks share
├── handler_registry.h     # Two-tier handler resolution
├── port_resolver.h        # Output port routing
├── block_context.h        # Context factories
├── condition_evaluator.h  # AND/OR chain evaluation
├── graph.h                # Scene + Blueprint indexing
├── validator.h            # Blueprint validation
├── json_loader.h          # Optional nlohmann/json loader — NOT part of the core
└── utils.h                # Type checks, helpers (header-only)

src/                       # Implementations
tests/                     # Google Test + nlohmann/json (FetchContent)
samples/playground/        # Console playground
```

---

## API Overview

### Engine Lifecycle

| Method | Description |
|--------|-------------|
| `engine.init(options)` | Validate + build graph. Returns `DiagnosticReport`. |
| `engine.setLocale(locale)` | Set active locale. Also syncs `LsdeUtils::locale`. |
| `engine.scene(sceneRef)` | Create scene handle (`unique_ptr`). Call `handle->start()`. |
| `engine.stop()` | Cancel all active scenes. |
| `engine.isRunning()` | True if at least one scene is active. |
| `engine.getActiveScenes()` | Get all currently active scene handles. |
| `engine.getCurrentBlocks()` | Get the current block of every active scene. |
| `engine.getSceneConnections(sceneRef)` | Every wire INSIDE a scene, flattened. Graph inspection; wires never cross a scene. |

### Handler Registration (Tier 1 — Global)

All 4 type handlers are **required** — the engine will throw if a scene starts without them.

| Method | Description |
|--------|-------------|
| `engine.onDialog(handler)` | Handle DIALOG blocks. |
| `engine.onChoice(handler)` | Handle CHOICE blocks (choices tagged with `visible` when `onResolveCondition` is set). |
| `engine.onCondition(handler)` | Handle CONDITION blocks. **Optional** when `onResolveCondition` is installed; `ctx->resolve(port)` takes a PORT NAME. |
| `engine.onAction(handler)` | Handle ACTION blocks. Developer **must** call `ctx->resolve()` or `ctx->reject()`. Leaves by `then` or `catch`. |

### Optional Handlers

| Method | Description |
|--------|-------------|
| `engine.onResolveCharacter(fn)` | Character resolver. Default: first character in the list. |
| `engine.onResolveCondition(fn)` | Unified condition resolver (choice visibility + condition pre-evaluation). |
| `engine.onBeforeBlock(handler)` | Pre-execution gate. Must call `resolve()` to continue. |
| `engine.onValidateNextBlock(handler)` | Validate before entering a block. |
| `engine.onInvalidateBlock(handler)` | Called when a block fails validation. |
| `engine.onSceneEnter(handler)` | Called when any scene starts. |
| `engine.onSceneExit(handler)` | Called when any scene ends. |

### Scene Handle (Tier 2 — Per-Scene)

| Method | Description |
|--------|-------------|
| `handle->start()` | Begin traversal from the entry block. |
| `handle->cancel()` | Stop the scene and all async tracks. |
| `handle->onDialog(handler)` | Override global DIALOG handler for this scene. |
| `handle->onChoice(handler)` | Override global CHOICE handler for this scene. |
| `handle->onCondition(handler)` | Override global CONDITION handler for this scene. |
| `handle->onAction(handler)` | Override global ACTION handler for this scene. |
| `handle->onBlock(id, handler)` | Override the handler for one block, by its id (`DIALOG-007`). |
| `handle->onDialogId(id, handler)` | Override one DIALOG block by id (type-safe). |
| `handle->onChoiceId(id, handler)` | Override one CHOICE block by id (type-safe). |
| `handle->onConditionId(id, handler)` | Override one CONDITION block by id (type-safe). |
| `handle->onActionId(id, handler)` | Override one ACTION block by id (type-safe). |
| `handle->onEnter(handler)` | Override global `onSceneEnter` for this scene. |
| `handle->onExit(handler)` | Override global `onSceneExit` for this scene. |
| `handle->onResolveCharacter(fn)` | Override character resolver for this scene. |
| `handle->getCurrentBlock()` | Get the block currently being executed, or `nullptr`. |
| `handle->getVisitedBlocks()` | Ordered list of visited block ids, for this scene. |
| `handle->getChoiceHistory()` | Map of CHOICE block id → the option ids the player picked. |
| `handle->getChoice(blockId)` | The option ids picked at one CHOICE block. |
| `handle->evaluateCondition(cond)` | Evaluate a `choice:` condition against history. |
| `handle->isRunning()` | Whether the scene is still active. |
| `handle->getActiveTracks()` | Number of active async tracks. |
| `handle->getTrackInfos()` | Snapshot of all track states. |

### Handler Signature

Every type handler receives `(ISceneHandle*, const TBlock*, TContext*, std::function<void()> next)` and returns `CleanupFn`:

```cpp
engine.onDialog([](ISceneHandle* scene, const DialogBlock* block,
                   IDialogContext* ctx, std::function<void()> next) -> CleanupFn {
    // Display dialogue...
    next(); // Advance to next block

    return []() {
        // Called when leaving this block (cleanup)
    };
});
```

### Ownership

- `DialogueEngine` must outlive all scene handles.
- `scene()` returns `std::unique_ptr<ISceneHandle>` — caller owns the handle.
- Handlers capture by value or ensure referenced objects outlive active scenes.

### Utilities (`LsdeUtils`)

| Method | Description |
|--------|-------------|
| `LsdeUtils::locale` | Current locale, synced by `engine.setLocale()`. |
| `LsdeUtils::IsDialogBlock(block)` | Type guard: true if block is a `DialogBlock`. |
| `LsdeUtils::IsChoiceBlock(block)` | Type guard: true if block is a `ChoiceBlock`. |
| `LsdeUtils::IsConditionBlock(block)` | Type guard: true if block is a `ConditionBlock`. |
| `LsdeUtils::IsActionBlock(block)` | Type guard: true if block is an `ActionBlock`. |
| `LsdeUtils::IsNoteBlock(block)` | Type guard: true if block is a `NoteBlock`. |
| `lsde::getBlockLabel(block)` | How to name a block on screen: `label`, else the designer `note`, else the id. |
| `LsdeUtils::GetLocalizedText(text, locale?)` | Pick a locale out of an inline `text` map. Uses the engine locale by default. |
| `LsdeUtils::GetTextFromTable(table, scene, blockId, optionId?)` | Read a line out of a loaded `localization/<locale>/__blueprints__.json` (separate-text mode). |
| `LsdeUtils::GetTextKey(block, optionId?)` | The i18n key of a block, or of one option of a choice. |
| `LsdeUtils::GetNativeProperties(block)` | The properties the ENGINE acts on, out of `props`. **`delay`/`timeout` are MILLISECONDS.** |
| `LsdeUtils::GetCustomProperties(block)` | The properties the DESIGNER declared, with the natives taken out. |
| `LsdeUtils::IsChoiceCondition(test)` | True if the test reads a past answer — `{ dict: "choice" }`. |
| `LsdeUtils::GetChoiceConditionBlockId(test)` | The CHOICE block a `choice:` test reads. |
| `LsdeUtils::EvaluateConditionChain(tests, evaluator)` | Evaluate an AND/OR chain, left to right, no precedence. Absent or empty = `true`. |
| `LsdeUtils::EvaluateConditionCases(cases, portPerCase, evaluator)` | The exit port of a condition block: `out`/`default`, or `K1`… with `portPerCase`. |
| `LsdeUtils::EvaluateEachCase(cases, evaluator)` | Each case on its own, in order — to show what matched without changing the routing. |
| `LsdeUtils::TagOptionVisibility(options, evaluator)` | Tag every option with whether its `when` holds, returning them ALL. |

---

## Cross-Language Conformance

59 shared cases, in 52 suites, run by all four runtimes: **59/59 passing**.

---

## License

Proprietary — distributed under the LSDE license.
