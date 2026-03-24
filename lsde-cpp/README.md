<!-- ![LSDE Dialog Engine — C++](banner.png) -->

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

### Usage

```cpp
#include <lsde/engine.h>

// Implement StateBridge
class MyBridge : public lsde::IStateBridge {
public:
    bool evaluateCondition(const lsde::ExportCondition& c) override { return true; }
    void executeAction(const lsde::ExportAction& a, const lsde::ActionSignature* sig) override {}
    lsde::PropertyValue resolveDictionary(const std::string& group, const std::string& key) override { return std::string{}; }
};

int main() {
    lsde::DialogueEngine engine;
    auto report = engine.init({blueprint});

    MyBridge bridge;
    engine.setLocale("en");
    engine.setStateBridge(&bridge);

    engine.onDialog([](lsde::ISceneHandle*, const lsde::BlueprintBlock* block,
                       lsde::IDialogContext* ctx, std::function<void()> next) -> lsde::CleanupFn {
        auto it = block->dialogueText.find("en");
        std::string text = it != block->dialogueText.end() ? it->second : "";
        std::cout << ctx->character()->name << ": " << text << "\n";
        next();
        return {}; // or return a cleanup function
    });

    auto handle = engine.scene("scene-uuid");
    handle->start();
}
```

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

| Method | Description |
|--------|-------------|
| `engine.init(options)` | Validate + build graph. Returns `DiagnosticReport`. |
| `engine.setLocale(locale)` | Set active locale. |
| `engine.setStateBridge(bridge)` | Connect to game state (`IStateBridge*`). |
| `engine.onDialog(handler)` | Register DIALOG handler. |
| `engine.onChoice(handler)` | Register CHOICE handler (visibility pre-filtered). |
| `engine.onCondition(handler)` | Register CONDITION handler. Auto-evals if absent. |
| `engine.onAction(handler)` | Register ACTION handler. Auto-executes if absent. |
| `engine.scene(sceneId)` | Create scene handle (`unique_ptr`). Call `handle->start()`. |

Handlers return `CleanupFn` (`std::function<void()>`) — a cleanup callback, or empty.

### Ownership

- `DialogueEngine` must outlive all scene handles.
- `IStateBridge` must outlive active scenes (non-owning pointer).
- `scene()` returns `std::unique_ptr<ISceneHandle>` — caller owns the handle.

---

## Cross-Language Conformance

42 shared JSON tests across all runtimes: **40/42 passing** (2 order-dependent tests differ due to `unordered_set` iteration order).

See [PLAN.md](../PLAN.md) for the complete specification.

---

## License

Proprietary — distributed under the LSDE license.
