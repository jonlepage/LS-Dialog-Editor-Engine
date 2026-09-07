# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LSDE Dialog Engine — multi-runtime, callback-driven dialogue graph dispatcher for
[LepaSoft Dialogue Editor](https://lepasoft.com). It loads blueprints (scenes, blocks, connections,
dictionaries, signatures) exported by LSDE and dispatches them to the game developer's callbacks.

TypeScript (`lsde-ts/`) is the **reference implementation** — its behavior is authoritative for any
ambiguity. Ports live in `lsde-csharp/` (Unity, .NET), `lsde-cpp/` (Unreal, custom engines) and
`lsde-gdscript/` (Godot 4). `lsde-rust/`, `lsde-lua/` and `lsde-python/` are placeholders.

## Sources of truth — read before touching anything

1. **`MIGRATION-V2.md`** — the live engineering plan and decision log for the in-flight LSDE v1 → v2
   format migration. One number = one open problem; the unnumbered sections carry the context and
   the journal. It records *why* decisions were made, which is what a compacted session loses.
   **Add to it, never rewrite it.**
2. **`lsde-ts/src/`** — the code is authoritative over any prose in this repo, including this file.
   Before quoting an API here or in an answer, grep it.
3. **`mock/blueprints/` and `mock/all/`** — the reference LSDE 2.0.3 export (Engine-Conformance-Scene).
   The single proof the v2 port is validated against. Never hand-craft a payload to match a theory.

There is no `PLAN.md` and no `AGENTS.md` — earlier revisions of this file referenced both.

### Migration status (important)

The engine code is still **v1**. The v2 format is specified and decided but not implemented.
The two formats share no fields — the decision is a clean break (engine 1.x reads format 1),
not a dual reader. Concretely, what still speaks v1 today:

- `port-resolver.ts` routes on `fromPortIndex`; v2 routes on **port names** (`out`, `default`,
  `then`, `catch`, `C1…`, `K1…`).
- `condition-evaluator.ts` implements the 2D `ExportCondition[][]` model plus the **dispatcher**
  mode; v2 replaces both with a flat list of cases carrying their own port, and drops the
  dispatcher entirely.
- `graph.ts` indexes blocks by a globally-unique UUID; v2 ids repeat across scenes and must be
  indexed by **(scene, id)**.
- `validator.ts` ignores `format` / `version`; v2 must reject a non-`lsde-blueprints` v1 payload
  outright rather than silently producing a scene that dies mid-flow.

Read the numbered problems in `MIGRATION-V2.md` before changing any of these four files.

## Commands

### TypeScript — reference implementation

```bash
cd lsde-ts
npm test                                  # vitest run — full suite
npm run test:watch
npx vitest run src/engine.test.ts         # a single file
npx vitest run -t "pattern"               # tests matching a name
npm run lint                              # tsc --noEmit (type-check only, no ESLint)
npm run build                             # tsc -p tsconfig.build.json → dist/
npm run playground                        # tsx src/playground.ts — interactive harness
```

Docs (VitePress + TypeDoc, 4 locales — en/ja/zh/fr):

```bash
cd lsde-ts
npm run docs:dev      # generate LLM guide + dev server
npm run docs          # typedoc → generate-llm-guide.js → vitepress build
```

### Other runtimes

```bash
cd lsde-csharp   && dotnet test           # xUnit; `make build` / `make test` also work
cd lsde-cpp      && npm run rebuild       # configure + build (MSVC 2022 CMake, wrapped in scripts/)
cd lsde-cpp      && npm run test          # ctest --test-dir build --output-on-failure
cd lsde-gdscript && npm run test          # Godot 4.6 headless, tests/test_runner.gd
```

`lsde-cpp/scripts/*.cmd` and `lsde-gdscript/scripts/godot.cmd` exist because CMake, CTest and Godot
are not on PATH — always go through the npm scripts rather than calling the tools directly.

Test counts drift; `MIGRATION-V2.md` holds the current ledger for all four runtimes. Do not copy a
count into prose without re-running the suite (the README numbers were all wrong once already).

## Architecture

The engine is a **pure graph dispatcher**: no rendering, no timers, no IO, no game loop. Flow only
advances when the developer calls `next()`, `resolve()` or `selectChoice()` from a callback. This
callback model is what makes the engine portable to languages without async/await.

### Module dependency order (mirror it in every port)

```
types → validator → graph → condition-evaluator → port-resolver
      → handler-registry → block-context → scene-handle → engine → index
```

| Module | Role |
|---|---|
| `engine.ts` | `DialogueEngine` facade. Tier 1 handlers, locale, scene factory. |
| `scene-handle.ts` | `SceneHandleImpl` — the traversal loop, Tier 2 overrides, `AsyncTrack`. The big one. |
| `port-resolver.ts` | **Critical**: must be byte-for-byte equivalent across runtimes. Pure function. |
| `handler-registry.ts` | Handler resolution priority. |
| `condition-evaluator.ts` | Left-to-right AND/OR chains, **no operator precedence**. |
| `graph.ts` | Block/connection indexing for O(1) lookup. |
| `validator.ts` | `init()` diagnostics → `DiagnosticReport`. |
| `block-context.ts` | Per-block-type context factories. |
| `lsde-utils.ts` | Public helpers (`LsdeUtils`): text resolution, type guards, condition helpers. |

### Handler resolution (three tiers, most specific first)

```
handle.onBlock(uuid) / onDialogId(uuid) / onChoiceId(uuid) / …
  ↓ unless context.preventGlobalHandler()
handle.onDialog / onChoice / onCondition / onAction        (Tier 2 — this scene)
  ↓ unless context.preventGlobalHandler()
engine.onDialog / onChoice / onCondition / onAction        (Tier 1 — global)
```

Without `preventGlobalHandler()`, both fire in sequence: scene first, then global.

### Traversal loop (per block)

1. NOTE blocks are stepped over (`skipNotes`) — designer-only, never dispatched. The walk keeps a
   `seen` set: a designer *can* wire a NOTE into a cycle, and following it recursively used to blow
   the stack (a `StackOverflowException` in C# killed the whole Unity process). A loop now ends the
   flow, like any other dead end.
2. `onValidateNextBlock` → `{ valid: false }` routes to `onInvalidateBlock`.
3. `onBeforeBlock` — fires for every block; the type handler waits for its `resolve()`. `resolve()`
   is guarded against being called twice, and a late `resolve()` cannot resurrect a finished scene.
4. Type handler runs; an optional returned cleanup function fires when the engine leaves the block.
5. `resolvePort()` picks the outgoing connections; the flow follows them.

### Async tracks — where NativeProperties stop being inert

The rule "NativeProperties are data, not behavior" holds for `delay`, `timeout`, `debug`,
`portPerCharacter` and `skipIfMissingActor` — the engine passes them through untouched. **It does
not hold for two of them**, and this is the part that surprises people:

- **`isAsync`** — in `advanceToNextBlock`, the first non-async target becomes the main track; every
  other resolved connection spawns an `AsyncTrack` running in parallel. A port with several
  non-async targets is a `MULTIPLE_NON_ASYNC_FORK` warning at init.
- **`waitForBlocks`** — a track holding a list of block UUIDs is parked in `pendingWaits` until all
  of them have been visited, then released.

`endScene()` cancels every live track. Tracks carry `id` / `parentTrackId` and cancel recursively;
`handle.getTrackInfos()` and `getActiveTracks()` expose them for debug and rendering.

### Conditions and choices

- `engine.onResolveCondition(fn)` is the **single** game-state evaluator, used for two things:
  tagging `RuntimeChoiceItem.visible` before `onChoice`, and pre-evaluating condition groups into
  `context.conditionGroups[i].result`. Filter choices with `visible !== false` — the engine hands
  you all of them, tagged, rather than a pre-filtered list.
- `choice:` conditions (has the player picked X before?) are resolved **internally** from the
  scene's choice history and never reach the callback. See `handle.getChoiceHistory()` /
  `getChoice(uuid)` / `evaluateCondition(cond)`.
- `setChoiceFilter()` is deprecated — use `onResolveCondition()`.
- `onCondition` is optional when a resolver is installed: the engine auto-routes from the
  pre-evaluated groups, and the handler becomes a logging/override hook.

### Two facts that have already cost time

- **`engine.getSceneConnections(sceneId)` returns the connections *inside* that scene**, not
  inter-scene links. Cross-scene connections have never existed in the format.
- **The engine reads structure, never the content of a text.** `{{@a1}}`, `{:a2}`,
  `{{#ui.hud.label}}` inside an exported string are the *client game's* markers, in the client's own
  keys. The engine hands the raw string over (`LsdeUtils.getLocalizedText` picks the locale, that's
  all) and never parses, validates or complains about it. Reporting one of these as an export defect
  cost a wasted fix in the editor once.

## Cross-language conformance tests

`tests/test-cases.json`, `test-init-validation.json` and `test-port-routing.json` are the shared
input → expected-output specs every runtime must pass. Blueprints are **embedded inline** in each
suite (there is no per-fixture file to load). Each runtime implements an equivalent runner; the
TypeScript one is `lsde-ts/src/cross-language-runner.test.ts`.

Any change to port resolution or condition evaluation goes: TS behavior + exhaustive TS tests first,
then the shared JSON spec, then the three ports.

## Conventions

- Strict TypeScript, no `any`; ESM; tabs, and the codebase spaces inside parens (`fn( arg )`) — match
  the surrounding style.
- C#: .NET Standard 2.1, PascalCase methods, no LINQ in hot paths. GDScript: snake_case, `class_name`,
  `Callable`. C++: C++17, `std::function`, nlohmann/json **in tests and playground only** — the core
  is stdlib-only.
- `blueprints/` and `mock/` are generated by LSDE export — never edit by hand. `blueprints/` also
  holds the generated type/enum files for all four languages.
- Commit prefix with a runtime tag: `[ts]`, `[csharp]`, `[cpp]`, `[gdscript]`, `[spec]`,
  `[blueprints]`, `[ci]`.
- After any API change, run the `sync-docs` skill — READMEs and the VitePress guides exist in four
  locales per runtime and go stale silently.
- Publishing (`npm run publish:patch|minor|major` from root or `lsde-ts/`) runs
  `lsde-ts/scripts/publish.sh`: it syncs versions across `package.json`, the three `.csproj` and
  `CMakeLists.txt`, prepends to `CHANGELOG.md`, runs tests, builds, **commits and tags**, then
  publishes to npm and NuGet (`publish.sh npm|nuget <bump>` restricts the target). It is a release
  action that writes to git history — never run it on your own initiative.
