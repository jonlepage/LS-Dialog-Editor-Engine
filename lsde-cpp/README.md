![LSDE Dialog Engine — C++](https://raw.githubusercontent.com/jonlepage/LS-Dialog-Editor-Engine/master/lsde-cpp/banner.png)

# LSDE Dialog Engine — C++

> C++17 runtime for Unreal Engine and custom engines. Zero external dependencies in the core library.

Port of the TypeScript reference implementation. Validated against the same 42 cross-language JSON test specifications. The engine core uses only the C++17 standard library — nlohmann/json is used exclusively in tests and the playground.

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

    // Choice visibility filter (optional — tags each choice with visible = true/false)
    engine.setChoiceFilter([](const ExportCondition& cond) -> bool {
        return true; // delegate to your game state
    });

    // ─── 4 Required Handlers ─────────────────────────────────────────
    engine.onDialog([](ISceneHandle*, const DialogBlock* block, IDialogContext* ctx,
                       std::function<void()> next) -> CleanupFn {
        auto* ch = ctx->character();
        auto text = LsdeUtils::GetLocalizedText(block->dialogueText);
        std::cout << (ch ? ch->name : "???") << ": " << text.value_or("—") << "\n";
        next();
        return {}; // or return a cleanup function
    });

    engine.onChoice([](ISceneHandle*, const ChoiceBlock* block, IChoiceContext* ctx,
                       std::function<void()> next) -> CleanupFn {
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

    engine.onCondition([](ISceneHandle* scene, const ConditionBlock* block, IConditionContext* ctx,
                          std::function<void()> next) -> CleanupFn {
        auto result = LsdeUtils::EvaluateConditionChain(
            block->conditions,
            [scene](const ExportCondition& cond) {
                return isChoiceCondition(cond) ? scene->evaluateCondition(cond) : true;
            });
        ctx->resolve(result);
        next();
        return {};
    });

    engine.onAction([](ISceneHandle*, const ActionBlock* block, IActionContext* ctx,
                       std::function<void()> next) -> CleanupFn {
        for (const auto& a : block->actions)
            std::cout << "Action: " << a.actionId << "\n";
        ctx->resolve();
        next();
        return {};
    });

    // ─── Run ─────────────────────────────────────────────────────────
    auto handle = engine.scene(blueprint.scenes[0].uuid);
    handle->start();
}
```

---

## Unreal Engine Integration

In Unreal, you store the `next` callback and trigger it from your UI delegates (e.g. UMG button clicks):

```cpp
// Store as member: std::function<void()> PendingNext;

engine.onDialog([this](auto*, auto* block, auto* ctx, auto next) -> lsde::CleanupFn {
    auto text = lsde::LsdeUtils::GetLocalizedText(block->dialogueText);
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
| `npm run build` | Build the project |
| `npm run test` | Run 42 cross-language tests (Google Test) |
| `npm run playground` | Run playground against a real blueprint |
| `npm run rebuild` | Configure + build |

---

## Project Structure

```
include/lsde/             # Public headers (zero external deps)
├── types.h                # All structs, enums, abstract classes
├── engine.h               # Public facade
├── scene_handle.h         # Traversal loop + AsyncTrack
├── handler_registry.h     # Two-tier handler resolution
├── port_resolver.h        # Output port routing
├── block_context.h        # Context factories
├── condition_evaluator.h  # AND/OR chain evaluation
├── graph.h                # Scene + Blueprint indexing
├── validator.h            # Blueprint validation
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
| `engine.scene(sceneId)` | Create scene handle (`unique_ptr`). Call `handle->start()`. |
| `engine.stop()` | Cancel all active scenes. |
| `engine.isRunning()` | True if at least one scene is active. |
| `engine.getActiveScenes()` | Get all currently active scene handles. |
| `engine.getCurrentBlocks()` | Get the current block of every active scene. |
| `engine.getSceneConnections(sceneId)` | Get all connections for a scene. |

### Handler Registration (Tier 1 — Global)

All 4 type handlers are **required** — the engine will throw if a scene starts without them.

| Method | Description |
|--------|-------------|
| `engine.onDialog(handler)` | Handle DIALOG blocks. |
| `engine.onChoice(handler)` | Handle CHOICE blocks (choices tagged with `visible` when `setChoiceFilter` is set). |
| `engine.onCondition(handler)` | Handle CONDITION blocks. Developer **must** call `ctx->resolve(bool)`. |
| `engine.onAction(handler)` | Handle ACTION blocks. Developer **must** call `ctx->resolve()` or `ctx->reject()`. |

### Optional Handlers

| Method | Description |
|--------|-------------|
| `engine.onResolveCharacter(fn)` | Character resolver. Default: first character in the list. |
| `engine.setChoiceFilter(fn)` | Install choice visibility evaluator (game-state conditions). |
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
| `handle->onBlock(uuid, handler)` | Override handler for a specific block by UUID. |
| `handle->onEnter(handler)` | Override global `onSceneEnter` for this scene. |
| `handle->onExit(handler)` | Override global `onSceneExit` for this scene. |
| `handle->onResolveCharacter(fn)` | Override character resolver for this scene. |
| `handle->getCurrentBlock()` | Get the block currently being executed, or `nullptr`. |
| `handle->getVisitedBlocks()` | Ordered list of visited block UUIDs. |
| `handle->getChoiceHistory()` | Map of block UUID → selected choice UUIDs. |
| `handle->getChoice(blockUuid)` | Get choice(s) selected at a specific block. |
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
| `LsdeUtils::GetBlockLabel(block)` | Block label, or first 8 chars of UUID as fallback. |
| `LsdeUtils::GetLocalizedText(dialogueText, locale?)` | Lookup localized text. Uses engine locale by default. |
| `LsdeUtils::IsChoiceCondition(condition)` | True if condition references a previous choice (`choice:<uuid>`). |
| `LsdeUtils::GetChoiceConditionBlockUuid(condition)` | Extract block UUID from a choice condition. |
| `LsdeUtils::EvaluateConditionChain(conditions, evaluator)` | Evaluate AND/OR condition chain. Empty = `true`. |
| `LsdeUtils::FilterVisibleChoices(choices, evaluator, scene?)` | Filter choices by visibility conditions. |

---

## Cross-Language Conformance

42 shared JSON tests across all runtimes: **40/42 passing** (2 order-dependent tests differ due to `unordered_set` iteration order).

---

## License

Proprietary — distributed under the LSDE license.
