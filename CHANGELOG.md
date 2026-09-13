# Changelog

## Unreleased

A scene can no longer be left open with nothing able to move it. Found while migrating a Unity
project to 2.0.0; every item below was reproduced before it was fixed, and holds in all four
runtimes as far as each language allows.

### Fixed

- **A fault closes the whole scene — whoever threw.** 2.0.0 closed the scene only when the type
  handler of the main flow threw. A throwing `onValidateNextBlock`, `onInvalidateBlock`,
  `onBeforeBlock`, `onResolveCondition`, `onResolveCharacter` or `onSceneEnter` — or any handler on
  an `isAsync` track, or on a track a join had just released — left the scene running with nothing
  able to advance it: no `onSceneExit`, and `isRunning()` answering true forever. Now the scene is
  closed (cleanups run, tracks cancelled, `onSceneExit` fired) and then the error reaches whoever
  called `start()`, `next()` or `resolve()`.
- **`onSceneExit` that throws no longer keeps the scene forever.** The engine was never told the
  scene had ended, and `engine.stop()` could not remove it. The engine is now always told; the error
  still reaches you.
- **The stack no longer grows with the graph.** Every block advanced synchronously added frames: a
  condition ↔ action loop overflowed after ~700 passes in TypeScript and killed the process in C#
  (a Unity crash) and C++. The walk is now a loop; 10,000 passes run at a constant depth.
- **A deadlock closes the scene.** A block waiting on a block no track can ever finish — one on a
  branch the flow did not take — held the scene open for good when it was the last track able to
  move. It now closes.
- **A cleanup that cancels its own scene** (or calls `engine.stop()`) no longer fires `onSceneExit`
  twice.

### Added

- **`onSceneExit` says why the scene ended**: `context.reason` is `completed`, `cancelled`,
  `invalidated`, `faulted` or `deadlocked`, and a deadlock also carries `context.waitingFor`, the
  blocks still awaited. `SceneEndReason` is exported (`LsdeTypes.SCENE_END_*` in GDScript).
- **C# and C++ refuse calls from another thread.** `next()`, `resolve()` and `cancel()` called from a
  thread other than the one that started the scene throw an exception naming both threads, and
  change nothing.

### Changed

- **A `resolve()` called inside `onBeforeBlock` takes effect when `onBeforeBlock` returns** — like
  `next()` inside a handler. Code written after `resolve()` now runs before the block is dispatched,
  not after it.
- **A scene parked on an unreachable `waitForBlocks` now ends** (`deadlocked`) instead of staying
  running.

## v2.0.0 (2026-09-10)

Engine 2.0 reads `lsde-blueprints` version 1 — the format LSDE 2.x exports. The two formats share
no field, so there is no dual reader and no fallback: a project still on LSDE 1.6 stays on engine
0.3.x. The engine version tracks the editor version on purpose, so the number in your package
manager matches the number on the writer's screen.

### Breaking — the payload

- **Ports are names, not positions.** A wire leaves a block by `out`, `default`, `then`, `catch`,
  an option id (`C1`…), a condition case (`K1`…), or an actor's card id. `fromPortIndex` is gone,
  and so is the connection table.
- **Wires live on the block.** `block.next` is the list of links leaving it, and a link only records
  where it goes. `engine.getSceneConnections( scene )` still reports them — flattened, with the
  source id put back on each wire. It reports the wires INSIDE one scene, which is all the format
  has ever carried; cross-scene links have never existed in any version.
- **A block is identified by (scene, id).** Ids repeat across scenes on purpose — `DIALOG-001`
  legitimately exists in several — so there is no global block index anywhere in the engine.
- **One `props` bag.** The ten native properties sit in `block.props` alongside the writer's own.
  `NATIVE_PROPERTY_IDS` is exported so you can tell them apart by lookup rather than by guessing.
- **A sixth block type: `router`.** It carries the SAME `cases` as a condition and reads them the
  opposite way — every case is evaluated, each true one launches its own port (`K1`…), and the flow
  then always continues: by `then` when they all held, by `catch` when any did not, and the
  continuation comes LAST so `then`/`catch` stay the main flow when the case routes are `isAsync`.
  No case at all leaves by `then`, the way `Promise.all([])` resolves. A router has **no type
  handler** and `start()` requires none; `handle.onBlock( id )` observes one through a router
  context that carries `cases` and no `resolve`.
- **`inPortPerCharacter`, the mirror of `portPerCharacter`.** A link's `toPort` carries a CARD ID,
  and the target block is assigned to that one actor on that pass — which is what lets several
  wires reach one block and each stand for a different speaker. The engine still ASKS:
  `onResolveCharacter` is handed that single actor instead of the whole cast. Entering through
  `in` names nobody and the callback gets the cast, as everywhere else.
- **The emotion belongs to the block**, not to each actor. `actors` is a cast of card ids.
- **`delay` and `timeout` are MILLISECONDS.** They were seconds in v1, and nothing in a payload
  reports the change — a v1 timer copied across will run a thousand times too short.

### Breaking — the API

- **Condition blocks have exactly two modes.** Without `portPerCase`, every case must hold → `out`,
  otherwise `default`. With `portPerCase: true`, the first case that holds takes its own port
  (`K1`…), otherwise `default`. The third mode — the dispatcher, which fired every matching case at
  once — is removed from the condition block: what replaced it is the ROUTER, a block type of its
  own. `context.resolve()` takes a PORT NAME.
- **`setChoiceFilter()` and `filterVisibleChoices()` are removed**, not deprecated.
  `engine.onResolveCondition()` is the single game-state evaluator: the engine tags every option
  with `visible` and hands you ALL of them. Filter on `visible !== false` — an option whose test
  could not be answered stays `undefined`, which means unknown, not hidden.
- A condition test on the reserved `choice` dictionary is answered internally from the scene's own
  history and never reaches your evaluator. See `getChoiceHistory()`, `getChoice( id )` and
  `evaluateCondition( test )`.
- `onCondition` is optional once a resolver is installed — the engine already knows the exit port,
  and the handler becomes a logging or override hook.
- **`TrackInfo.startBlockUuid` and `currentBlockUuid` are now `startBlockId` and `currentBlockId`**,
  and every `blockUuid` parameter is `blockId`. The v2 payload has no uuids.
- `reject( error )` takes an optional argument in all four runtimes. The engine ignores it: it
  routes to the `catch` port and carries no reason.
- `engine.scene()` accepts a path or the stable scene id (`sc_u0vqg2g8`). Store the id wherever a
  scene is referenced from outside the payload — a serialized path stops resolving silently the day
  someone renames the scene, with no compiler to catch it.

### Breaking — behaviour

- **`waitForBlocks` holds the block before it is dispatched**, on every track, the main flow
  included. In v1 it meant two different things depending on where the block sat, and it was
  silently inert on the main flow. Your handler is not called until every listed block has been
  visited, so the game never learns the block exists before its turn.
- **A handler that throws no longer vanishes.** The scene is closed down — cleanups run, tracks are
  cancelled, `onSceneExit` fires — and the error is then re-thrown to whoever called `start()` or
  `next()`. v1 swallowed it while letting an exception from that same handler's cleanup through:
  one fault, two opposite behaviours.
- **`onValidateNextBlock` returning `{ valid: false }` ends the track** it was entering, after
  `onInvalidateBlock` has fired. It used to leave that track alive with nothing able to restart it —
  the main flow held the scene open forever, a parallel branch became a ghost `getActiveTracks()`
  counted for the rest of the session.

### Fixes

- A NOTE block wired into a loop no longer overflows the stack — the traversal walks past NOTE
  blocks iteratively and ends the flow when it comes back to one it already stepped over. In C# this
  took the whole Unity process down (TS, C#, C++, GDScript)
- `onBeforeBlock`'s `resolve()` is single-shot, like `next()` — a delay timer that fires twice no
  longer dispatches the same block twice (TS, C#, C++, GDScript)
- A `resolve()` kept in a closure and fired after the scene ended no longer restarts traversal on a
  dead scene, re-dispatching blocks and firing `onSceneExit` a second time (TS, C#, C++, GDScript)
- **C++**: a `next()` or a `resolve()` kept for a later frame — the normal way to drive this engine —
  read a dead stack frame. In practice the dialogue froze with no message. The same fault reached
  `context.nativeProperties`, precisely what a game reads to arm a `delay` timer. Both now hold what
  they capture
- **C++**: destroying a scene handle while it was still running left its tracks pointing at freed
  memory; the handle now shuts itself down
- A cleanup returned by a handler that had just closed the flow itself — `scene.cancel()`,
  `engine.stop()` — was filed for an exit that had already happened and never ran, leaving a panel
  open or a voice line playing for the rest of the process (TS, C#, C++, GDScript)
- When one cleanup threw during teardown, the tracks and scenes queued behind it were skipped
  instead of being cancelled. A teardown now always finishes, and the first fault is re-thrown once
  nothing is left to close (TS, C#)
- `engine.stop()` closes every scene the engine opened, including a scene opened twice
- **Godot**: every runtime guard was an `assert()`, which Godot strips from a release export. A
  published game started a scene with no handler installed and walked the whole graph showing
  nothing, without a single error. The guards are `push_error()` and now survive the export

### Other

- The four runtimes run the same 52 shared conformance cases in CI, one job each, on every push —
  this did not exist before and its absence is what let a README announce a failing C++ suite for
  months
- `waitForBlocks` is the only native carrying a list, and its parsing was untested in every runtime.
  All four now pin it against the reference LSDE 2.0.3 export, C# on both its JSON paths
- The documentation site builds again — 38 dead links to removed v1 types — and three shared
  snippets that declared code which does not compile were rewritten
- The guides no longer describe a dispatcher mode, `resolve( true / false )` with ports 0 and 1, a
  `choiceFilter` that no longer exists, or a block field table in which no field is real. French and
  English are current; the Japanese and Chinese prose is pending translation
- README test counts and the Unity package manifest version were stale
- The four runtimes build with **zero warnings**. C# shipped 43 public members with no XML
  documentation, so Unity and Visual Studio showed no tooltip for them; the C++ public header
  poured 160 MSVC C4250 warnings into the build of every game that included it
- `ConditionEvaluator` is exported: the callback type of `LsdeUtils.evaluateConditionCases` and
  `evaluateEachCase` had no name a TypeScript game could write down
- The Unity package no longer imports NuGet restore artifacts: build output was redirected out
  of `Runtime/` by properties an SDK-style project reads too late to matter
- The four READMEs described an architecture that no longer exists — `scene-handle` as the
  traversal loop plus an `AsyncTrack` class, both gone since the walk was written once in
  `track` — and the guide's execution diagram named `processBlock`, an internal removed with
  them. The C# README also named paths from before the Unity layout
- C++ Release is reachable and verified: `npm run build:release` / `test:release`. Only Debug
  had ever been built
- The French `lifecycle` guide described the behaviour v2 reversed — "the error is silent, it
  is neither logged nor re-thrown" — and was two sections behind the English rewrite. It is
  realigned section by section. `delay` and `timeout` are now stated as MILLISECONDS in that
  page's table too, English included
- **The guides are v2 in all four languages.** The pass started from French and propagated.
  Four shared snippets — the ones every locale includes — still declared the v1 payload: the
  export root (`exportDate`, `primaryLanguage`, `signatures`), `check.signatures` /
  `check.characters` instead of `functions` / `cards`, and the ACTION example reading
  `block.actions[].actionId` with positional `params` when the payload carries `context.calls`
  with an `fn` and `args` BY NAME
- `choice-visibility` documented `filterVisibleChoices` — removed in v2 — in three of its four
  tabs, with a third `scene` argument that never existed, `block.choices` for `block.options`,
  and `cond.key`/`cond.operator` for `dict`/`entry`/`op`/`value`. The type is
  `RuntimeChoiceItem`, not `RuntimeOption`
- `integration` still said `context.resolve(true)` routes to port 0 — v1, in every language
- A function parameter's type value is `dictionaryKey`, not `dictionary`
- A structural comparison of the four locales — headings, shared includes, code fences, table
  rows, links, every inline identifier — caught what a section count could not: a struck-out
  row in the Japanese and Chinese handler tables deprecating `onResolveCondition` in favour of
  itself, pointing at the removed `setChoiceFilter`; block overrides described as keyed by
  UUID; `waitForBlocks` still carrying its v1 meaning in those two languages; and the fact
  that an option's id IS its exit port, which only the French said

## v0.3.0 (2026-04-01)

### Features
- Add switch/dispatcher evaluation modes for condition blocks with 2D condition groups
- Implement unified condition resolver (`onResolveCondition`) for choice visibility and condition pre-evaluation
- Make `onCondition` handler optional when `onResolveCondition` is installed
- Add `RuntimeConditionGroup` with `portIndex` and `result` for pre-evaluated condition groups
- Add `enableDispatcher` native property for async multi-branch condition routing
- Add `evaluateConditionGroups()` utility across all runtimes (TS, C#, C++, GDScript)
- Port resolver supports `bool | int | int[]` condition results across all runtimes
- Add JSON loaders for LSDE blueprints using Newtonsoft.Json and System.Text.Json

### Fixes
- Fix character cache bug: async tracks consumed main track's pre-resolved character (all runtimes)

### Other
- Migrate documentation from `setChoiceFilter` to `onResolveCondition` across all locales (EN, FR, JA, ZH)
- Add integration and unit tests for onResolveCondition and condition evaluator
- Align playgrounds across TS, C#, C++ with identical output
- Deprecate `setChoiceFilter` (kept as alias for backward compatibility)



## v0.2.0 (2026-03-30)

### Features
- Add type-safe block overrides for dialog, choice, condition, and action handlers
- Add no-cleanup handler overloads for DIALOG, CHOICE, CONDITION, and ACTION
- Add playground for testing engine API with real blueprints
- Enhance block validation with character context
- Add waitForBlocks handling in AsyncTrack and improve block execution flow
- Enhance async track handling with waitForBlocks and track info API
- Update LsdeUtils imports to use new '@lsde/dialog-engine' path in documentation
- Externalize install instructions into shared documentation file
- Enhance integration and handler documentation for C++, C#, GDScript and TypeScript engines
- Add logo and HeroCode component with code snippets for multiple languages
- Update documentation for block lifecycle and choice visibility

### Fixes
- Fix SceneHandle path reference in block types documentation

### Other
- Update documentation for lifecycle, async tracks, and choice visibility
- Refactor integration documentation for LSDE engine
- Refactor block handlers to use unified action execution and condition evaluation methods across TypeScript, C#, C++, and GDScript
- Refactor documentation and code structure for Blueprint system
- Add Japanese and Chinese documentation for async tracks and lifecycle
- Update blueprint schema and types to include new properties for block execution control



## v0.1.1 (2026-03-27)

### Features
- Add publish script and update package management for npm and NuGet
- Add comprehensive Chinese documentation for LSDE Dialog Engine
- Add script to generate plain text LLM guide and API reference
- Enhance choice visibility handling and metadata structure
- Enhance localization support and refactor state bridge integration
- Enhance choice context and history tracking
- Add GitHub Actions workflow for documentation deployment
- Add link to full documentation in README
- Update runtime descriptions in README files with automation and native integration details
- Implement validation and diagnostic report for LSDE Dialog Engine
- Implement C# port of LSDE Dialog Engine utilities and validation
- Add 'NOTE' block type and enhance interface documentation
- Restructure documentation and enhance content
- Implement async track handling and validation for multiple non-async targets
- Add playground for testing IntelliSense and API usage

### Fixes
- Update banner image URLs to use raw GitHub links and correct French translations
- Add exports and engines fields to package.json, include LICENSE
- Update source links in runtime documentation
- Update contact information in license and README
- Translate all VitePress pages to English, fix GitHub link, add sharp corners CSS
- Set VitePress base path for GitHub Pages

### Other
- Refactor code structure for improved readability and maintainability
- Enhance documentation and integration for LSDE engine
- Refactor LSDE Dialog Engine: enhance scene handling, remove StateBridge, improve utility functions
- Refactor dialogue engine to enhance condition evaluation and handler registration
- Refactor block context handling to resolve characters through StateBridge
- Add README and banner image for LSDE Dialog Engine TypeScript implementation
- Add LSDE Dialog Engine core classes and playground example
- Add comprehensive tests for DialogueEngine functionality
- Update character port handling to use index instead of name
- Repository initialization with project structure
