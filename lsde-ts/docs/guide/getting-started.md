# Getting Started

## Installation

<!--@include: ../_shared/install-tabs.md-->

## Minimal Usage

The engine is a graph traversal machine — it dispatches blocks to registered handlers, which give them meaning. Without handlers, the engine has no output.

::: tip Format-agnostic
The engine consumes a `BlueprintExport` object, not a file. You can load your blueprint from JSON, XML, or YAML using any parser suited to your platform. See [Parsing & Import](./parsing) for recommendations.
:::

<!--@include: ../_shared/getting-started-usage.md-->

## Blueprint Validation

`engine.init()` returns a [diagnostic report](/api-ref/interfaces/DiagnosticReport) with errors, warnings, and stats. The `check` option cross-validates against the host application's capabilities:

<!--@include: ../_shared/getting-started-validation.md-->

### The twenty-five diagnostics

**Errors — the payload is refused and nothing plays.** `errors` is non-empty and `engine.scene()` has nothing to hand you.

| Code | What happened |
|---|---|
| `MISSING_DATA` | No `data` was passed to `init()` |
| `MISMATCHED_EXPORTS` | Several files merged that come from different exports — `project` or `exportedAt` disagree. Pass the files of ONE export |
| `WRONG_NAMING_CONVENTION` | Exported in `snake_case` or `PascalCase`; the engine reads camelCase. Project settings › Exporters › Naming convention |
| `INVALID_FORMAT` | `format` is not `lsde-blueprints`. It is also what C# and C++ report for the case above: they validate a typed object, so the original key names are already gone |
| `UNSUPPORTED_FORMAT_VERSION` | `version` is not `1`. A project still on LSDE 1.6 belongs on engine 0.3.x — there is no dual reader |
| `NO_SCENES` | The payload carries no scene |
| `DUPLICATE_SCENE` | Two scenes share a path or a stable id |
| `MISSING_SCENE_PATH` | A scene has no path |
| `DUPLICATE_BLOCK_ID` | Two blocks of the SAME scene share an id. Across scenes it is legal and expected — a block is (scene, id) |
| `INVALID_START_BLOCK` | The scene names a start block that is not one of its blocks |
| `BROKEN_LINK` | A wire points at a block that is not in the scene. The traversal would simply have nowhere to go |

**Warnings — it plays, and something will quietly not work.** Read them; none of them is noise.

| Code | What it costs you |
|---|---|
| `NO_START_BLOCK` | The scene has no start block, so `start()` has nowhere to begin |
| `UNKNOWN_WAIT_BLOCK` | A `waitForBlocks` id is not a block of the scene, so that track parks **for good**. The check cannot go further: an id that does exist may still never be played |
| `EMPTY_FUNCTION` | An action has a call with no function picked. The game is handed a call it cannot run |
| `UNDECLARED_FUNCTION` | An action calls a function the export does not declare — a v1 id left behind in the project, say. It used to load silently and fail in game |
| `UNDECLARED_ARGUMENT` | A call passes an argument the function does not declare |
| `UNDECLARED_DICTIONARY_KEY` | A `dictionaryKey` argument is not an entry of the dictionary its parameter names |
| `UNDECLARED_DICTIONARY` | A condition tests a dictionary the export does not declare |
| `UNDECLARED_ENTRY` | A condition tests an entry its dictionary does not declare |
| `UNKNOWN_CHOICE_BLOCK` | A test on the reserved `choice` dictionary names a block that is not a CHOICE of this scene |
| `UNKNOWN_CHOICE_OPTION` | A test on the reserved `choice` dictionary names an option that CHOICE does not have |
| `UNKNOWN_FUNCTION` | An action calls a function id your `check.functions` does not list |
| `UNKNOWN_DICTIONARY` | A condition tests a dictionary id your `check.dictionaries` does not list |
| `UNKNOWN_DICTIONARY_ENTRY` | The dictionary is known, the entry key is not |
| `UNKNOWN_CARD` | A block cites an actor card NAME your `check.cards` does not list |

The last four only appear when you pass `check` — without it the engine has nothing to compare against.
The eight above them are always on: they compare what the blocks USE with what the export itself
DECLARES, so no `check` is needed.

A diagnostic found in a scene carries `sceneId` — the stable id (`sc_…`), what `handle.getSceneId()`
answers — and `scenePath`, plus `blockId` when it points at a block.


