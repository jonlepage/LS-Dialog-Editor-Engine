# Cross-language conformance specs

The contract every runtime must pass: the same input, the same expected output, in TypeScript, C#,
C++ and GDScript. A behaviour that only holds in one runtime is a divergence waiting to be found by
a player, and this is what catches it before they do.

## Files

| File | What it pins down |
|---|---|
| `test-cases.json` | Playing a scene: which blocks are dispatched, in what order, with what text |
| `test-port-routing.json` | Port resolution — the one algorithm that must be identical everywhere |
| `test-init-validation.json` | What `init()` accepts, what it refuses, and the diagnostic code it reports |
| `generate-specs.py` | **Writes the three files above.** Edit this, never the JSON. |

The blueprints are embedded inline in each suite: there is no fixture file to load, and each suite
carries a complete `lsde-blueprints` payload.

## Why they are generated

They used to be hand-written, and the four runtimes slowly drifted on what a payload looked like.
Generating them from one script means a change to the format is one edit, and the same bytes reach
all four runners.

```bash
python tests/generate-specs.py    # from the repo root
```

## What a runner does

1. Read the spec file
2. For each suite: `init()` the blueprint, assert the diagnostics match
3. Install `onResolveCondition` from the suite's `stateBridge` — the game's answers, keyed
   `<dict>.<entry>`. A test on the reserved `choice` dictionary never reaches it: the engine
   answers those from the history it kept during the scene
4. Register the four handlers; each consumes the next `step` when the block matches
5. `start()` the scene named by `sceneId` — a scene path, or the id that survives a rename
6. Assert every step was reached, the scene ended, and `expectedVisited` / `expectedCleanupCalls`
   hold

The TypeScript runner (`lsde-ts/src/cross-language-runner.test.ts`) is the reference the other
three are written against.
