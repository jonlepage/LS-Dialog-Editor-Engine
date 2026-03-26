# What is LSDEDE?

**LSDE** (LepaSoft Dialogue Editor) is the visual editor for designing interactive dialogue systems. It exports dialogue graphs as JSON blueprints containing scenes, blocks, connections, dictionaries, and action signatures.

**LSDEDE** (LSDE Dialog Engine) is the multi-runtime engine that loads and executes these blueprints. It is available in multiple languages so you can integrate it natively into your game engine or framework of choice.

## Available Runtimes

| Runtime | Language | Target | Source |
|---------|----------|--------|--------|
| **TypeScript** | TypeScript / JavaScript | Reference implementation | [lsde-ts](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-ts) |
| **C#** | C# (.NET Standard 2.1) | Unity, Godot Mono, .NET | [lsde-csharp](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-csharp) |
| **C++** | C++17 | Unreal Engine, custom engines | [lsde-cpp](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-cpp) |
| **GDScript** | GDScript | Godot 4 | [lsde-gdscript](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-gdscript) |

All runtimes share the same blueprint format and pass a common cross-language test suite (42 test cases).

## Architecture

Every runtime follows the same **callback-driven graph dispatcher** pattern:

1. **Blueprint** — A JSON file exported from LSDE, containing scenes, blocks and connections.
2. **Engine** — Validates the blueprint, builds the internal graph and dispatches blocks to your handlers.
3. **Handlers** — Your functions that react to each block type (dialog, choice, condition, action).
4. **Your Game** — Conditions, actions, and character resolution are handled by your handler callbacks.

```
Blueprint JSON → engine.init() → engine.scene(id).start()
                                        ↓
                              onDialog / onChoice / ...
                                        ↓
                                  next() → next block
```

## Design Principles

- **Zero-dependency** — No runtime dependencies in any language.
- **Framework-agnostic** — Works with any game engine or UI framework.
- **Callback-driven** — No internal render loop. You call `next()` when you're ready.
- **Two-tier handlers** — Global (engine-level) and scene-level handlers with `preventGlobalHandler()`.
- **Cross-language conformance** — All runtimes produce identical output for the same blueprint.
