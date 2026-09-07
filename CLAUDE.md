# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LSDE Dialog Engine — multi-runtime, callback-driven dialogue graph dispatcher for
[LepaSoft Dialogue Editor](https://lepasoft.com). It loads blueprints (scenes, blocks, dictionaries,
functions, cards) exported by LSDE and dispatches them to the game developer's callbacks.

Engine **2.x** reads format `lsde-blueprints` version 1, written by LSDE 2.x. Engine 0.3.x reads the
old LSDE 1.6 format; there is no dual reader.

TypeScript (`lsde-ts/`) is the **reference implementation** — its behavior is authoritative for any
ambiguity. Ports live in `lsde-csharp/` (Unity, .NET), `lsde-cpp/` (Unreal, custom engines) and
`lsde-gdscript/` (Godot 4). `lsde-rust/`, `lsde-lua/` and `lsde-python/` are placeholders.

## Sources of truth — read before touching anything

1. **`MIGRATION-V2.md`** — the engineering plan and decision log of the LSDE v1 → v2 migration.
   One number = one problem, all eighteen now settled; the unnumbered sections carry the context and
   the journal. It records *why* decisions were made, which is what a compacted session loses, and
   it is where to look before re-opening any of them. **Add to it, never rewrite it.**
2. **`lsde-ts/src/`** — the code is authoritative over any prose in this repo, including this file.
   Before quoting an API here or in an answer, grep it.
3. **`mock/blueprints/` and `mock/all/`** — the reference LSDE 2.0.3 export (Engine-Conformance-Scene).
   The single proof the v2 port is validated against. Never hand-craft a payload to match a theory.

There is no `PLAN.md` and no `AGENTS.md` — earlier revisions of this file referenced both.

### Migration status (important)

**The migration is done.** All four runtimes read `lsde-blueprints` version 1 — the format LSDE
2.0.3 writes — and the engine is versioned **2.0.0** to match the editor a client has on screen.

The break was clean: the two formats share no field, so there is no dual reader and no v1 fallback.
A project still on LSDE 1.6 stays on engine 0.3.x.

What changed, and where the reasoning lives — `MIGRATION-V2.md` holds all of it, one numbered
problem at a time. The five that explain the rest:

- **Ports are names.** `out`, `default`, `then`, `catch`, `C1…` (an option id), `K1…` (a case),
  and a CARD ID for an actor port. `fromPortIndex` is gone; so is the connection table.
- **A block is (scene, id).** Ids repeat across scenes — `DIALOG-001` legitimately exists in two of
  them — so there is no global block index anywhere.
- **Wires live on the block.** `block.next` is a list of links; a link only knows where it goes.
- **The natives share one `props` bag** with the writer's own properties, and **`delay` /
  `timeout` are MILLISECONDS** (they were seconds in v1, and nothing reports the change).
- **The emotion belongs to the block**, not to each actor. `actors` is a cast of card ids.

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
      → handler-registry → block-context → track → scene-handle → engine → index
```

| Module | Role |
|---|---|
| `engine.ts` | `DialogueEngine` facade. Tier 1 handlers, locale, scene factory. |
| `track.ts` | **The traversal, written ONCE.** One `Track` walks the graph; the main flow is one of them, with id 0. It used to be written twice — here for the main flow, again in an `AsyncTrack` class — and the two drifted into two shipped bugs. |
| `scene-handle.ts` | `SceneHandleImpl` — the scene: public API, Tier 2 overrides, and everything its tracks SHARE (visited set, choice history, pending waits). It does not walk the graph. |
| `port-resolver.ts` | **Critical**: must be byte-for-byte equivalent across runtimes. Pure function. |
| `handler-registry.ts` | Handler resolution priority. |
| `condition-evaluator.ts` | Left-to-right AND/OR chains, **no operator precedence**. |
| `graph.ts` | Block indexing by (scene, id). No global block index — ids repeat across scenes. |
| `validator.ts` | `init()` diagnostics → `DiagnosticReport`. Reads `format`/`version` FIRST. |
| `block-context.ts` | Per-block-type contexts, and `resolveCards()` for `actors` / `emotion`. |
| `blueprint-types.ts` | **Generated by LSDE, copied verbatim.** The payload contract. Do not edit. |
| `lsde-utils.ts` | Public helpers (`LsdeUtils`): text, props, type guards, condition helpers. |

### Handler resolution (three tiers, most specific first)

```
handle.onBlock(id) / onDialogId(id) / onChoiceId(id) / …
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
5. `resolvePort()` picks the outgoing **links** by PORT NAME; the flow follows them.
6. A handler that throws no longer vanishes: the scene is closed down (cleanups run, tracks
   cancelled, `onSceneExit` fired) and **then** the error is re-thrown to whoever called `start()`
   or `next()`. v1 swallowed it silently while an exception from that same handler's cleanup
   reached the caller — one fault, two opposite behaviours.

### Async tracks — where NativeProperties stop being inert

The nine natives live in `block.props`, mixed in with the writer's own properties — ids cannot
collide, so `NATIVE_PROPERTY_IDS` is what tells them apart. The rule "natives are data, not
behavior" holds for `delay`, `timeout`, `waitInput`, `debug`, `portPerCharacter`,
`skipIfMissingActor` and `portPerCase` — the engine passes them through untouched. **It does not
hold for two of them**, and this is the part that surprises people:

- **`isAsync`** — in `Track.advanceToNextBlock`, the first non-async target continues THIS track;
  every other resolved link opens a parallel `Track`. A port with several non-async targets is a
  `MULTIPLE_NON_ASYNC_FORK` warning at init.
- **`waitForBlocks`** — the join half of that fork. The engine holds the block **before
  dispatching it**: no handler is called, so the game never learns the block exists until every
  listed id has been visited. Same rule on EVERY track, the main flow included — it used to be
  read only by parallel tracks, which made the property silently inert on the main flow, and it
  used to mean "hold the exit" rather than "hold the block" when it sat anywhere but a track's
  first block. One rule now, in `track.ts`.

Closing the scene (`handle.cancel()`, or the main track running out of graph) cancels every live
track. Tracks carry `id` / `parentTrackId` and cancel recursively; `handle.getTrackInfos()` and
`getActiveTracks()` expose the PARALLEL ones for debug and rendering — the main track, id 0, is not
one of them.

### Conditions and choices

- `engine.onResolveCondition(fn)` is the **single** game-state evaluator, used for two things:
  tagging `RuntimeChoiceItem.visible` before `onChoice`, and pre-evaluating the cases into
  `context.cases[i].result`. Filter options with `visible !== false` — the engine hands you all of
  them, tagged, rather than a pre-filtered list.
- **Two evaluators inside, not one.** Routing has to pick a branch, so an unanswerable test becomes
  false. An option has no such obligation: saying `false` about a question nobody could answer
  would HIDE an answer, so `visible` stays `undefined` — *unknown*, not *hidden*. This one cost a
  bug that the tests caught, not the reading.
- A test on the reserved **`choice`** dictionary (`{ dict: "choice", entry: "CHOICE-001",
  value: "C1" }`) is answered **internally** from the scene's choice history and never reaches the
  callback. See `handle.getChoiceHistory()` / `getChoice(id)` / `evaluateCondition(test)`.
- **Two condition modes, and only two.** `portPerCase` absent: every case must hold → `out`, else
  `default`. `portPerCase: true`: the first case that holds takes its own port (`K1`…), else
  `default`. A case with no `when` is always true. The **dispatcher is gone**.
- `onCondition` is optional when a resolver is installed: the engine already knows the exit port,
  and the handler becomes a logging/override hook. `context.resolve()` takes a PORT NAME.
- `setChoiceFilter()` and `filterVisibleChoices()` are **removed**, not deprecated.

### Two facts that have already cost time

- **`engine.getSceneConnections(sceneRef)` returns the wires *inside* that scene**, not inter-scene
  links. Cross-scene connections have never existed in the format, in any version. The method is
  graph inspection: it flattens every `block.next` and puts the source id back on each wire.
- **`engine.scene()` takes a path OR the stable id.** `reactor_breach` is what a writer reads;
  `sc_u0vqg2g8` is what survives a rename. Store the id wherever a scene is referenced from outside
  the payload — a Unity asset, a save file — because a serialized path stops resolving silently the
  day someone renames the scene, with no compiler to catch it.
- **The engine reads structure, never the content of a text.** `{{@a1}}`, `{:a2}`,
  `{{#ui.hud.label}}` inside an exported string are the *client game's* markers, in the client's own
  keys. The engine hands the raw string over (`LsdeUtils.getLocalizedText` picks the locale, that's
  all) and never parses, validates or complains about it. Reporting one of these as an export defect
  cost a wasted fix in the editor once.

## Cross-language conformance tests

`tests/test-cases.json`, `test-init-validation.json` and `test-port-routing.json` are the shared
input → expected-output specs every runtime must pass. They are **generated by
`tests/generate-specs.py`** — never edited by hand, so the four runtimes cannot drift on the shape
of a payload. Blueprints are embedded inline in each suite. Each runtime implements an equivalent
runner; the
TypeScript one is `lsde-ts/src/cross-language-runner.test.ts`.

Any change to port resolution or condition evaluation goes: TS behavior + exhaustive TS tests first,
then the shared JSON spec, then the three ports.

## Conventions

- Strict TypeScript, no `any`; ESM; tabs, and the codebase spaces inside parens (`fn( arg )`) — match
  the surrounding style.
- C#: .NET Standard 2.1, PascalCase methods, no LINQ in hot paths. GDScript: snake_case, `class_name`,
  `Callable`. C++: C++17, `std::function`, nlohmann/json **in tests and playground only** — the core
  is stdlib-only.
- `mock/` is generated by LSDE export — never edit by hand. It holds the reference v2 payload and
  the generated type files for all four languages; `lsde-ts/src/blueprint-types.ts` is a verbatim
  copy of the TypeScript one. `blueprints/` is the **old v1** export, still read by nothing but a
  historical reference.
- `tests/*.json` is generated by `tests/generate-specs.py`. Edit the script, not the JSON.
- Commit prefix with a runtime tag: `[ts]`, `[csharp]`, `[cpp]`, `[gdscript]`, `[spec]`,
  `[blueprints]`, `[ci]`.
- After any API change, run the `sync-docs` skill — READMEs and the VitePress guides exist in four
  locales per runtime and go stale silently.
- Publishing (`npm run publish:patch|minor|major` from root or `lsde-ts/`) runs
  `lsde-ts/scripts/publish.sh`: it syncs versions across `package.json`, the three `.csproj` and
  `CMakeLists.txt`, prepends to `CHANGELOG.md`, runs tests, builds, **commits and tags**, then
  publishes to npm and NuGet (`publish.sh npm|nuget <bump>` restricts the target). It is a release
  action that writes to git history — never run it on your own initiative.
