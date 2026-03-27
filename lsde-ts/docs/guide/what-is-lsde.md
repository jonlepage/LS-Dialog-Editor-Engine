# What is LSDEDE?

**LSDE** (LS Dialog Editor) is a free tool for game and software developers that combines visual dialogue graph editing, AI-powered translation, voice generation, i18n code integration, and project diagnostics. It exports dialogue graphs as JSON blueprints containing scenes, blocks, connections, dictionaries, and action signatures. More info: [lepasoft.com/en/software/ls-dialog-editor](https://lepasoft.com/en/software/ls-dialog-editor).

**LSDEDE** (LSDE Dialog Engine) is the multi-runtime engine that loads and executes these blueprints. It is available in multiple languages for native integration into any game engine or framework.

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
2. **Engine** — Validates the blueprint, builds the internal graph and dispatches blocks to registered handlers.
3. **Handlers** — Functions that react to each block type (dialog, choice, condition, action).
4. **Host Application** — Conditions, actions, and character resolution are implemented by handler callbacks.

```
  Blueprint (JSON)
        │
        ▼
     Engine ◄── next() ──┐
        │                 │
     dispatch             │
        │                 │
        ▼                 │
     Handlers ────────────┘
```

## Design Principles

- **Zero-dependency** — No runtime dependencies in any language.
- **Framework-agnostic** — Works with any game engine or UI framework.
- **Callback-driven** — No internal render loop. The host application calls `next()` when ready.
- **Two-tier handlers** — Global (engine-level) and scene-level handlers with `preventGlobalHandler()`.
- **Cross-language conformance** — All runtimes produce identical output for the same blueprint.
