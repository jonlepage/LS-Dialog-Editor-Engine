# What is LSDE?

**LSDE Dialog Engine** is the reference TypeScript runtime for executing dialogue blueprints created with the LS-Dialog editor.

## Architecture

The engine works as a **callback-driven graph dispatcher**:

1. **Blueprint** — A JSON file exported from the editor, containing scenes, blocks and connections.
2. **Engine** — Validates the blueprint, builds the internal graph and dispatches blocks to your handlers.
3. **Handlers** — Your functions that react to each block type (dialog, choice, condition, action).
4. **StateBridge** — The bridge between the engine and your game state.

```
Blueprint JSON → engine.init() → engine.scene(id).start()
                                        ↓
                              onDialog / onChoice / ...
                                        ↓
                                  next() → next block
```

## Design Principles

- **Zero-dependency** — No runtime dependencies.
- **Framework-agnostic** — Works with any game engine or UI framework.
- **Callback-driven** — No internal render loop. You call `next()` when you're ready.
- **Two-tier handlers** — Global (engine-level) and scene-level handlers with `preventGlobalHandler()`.
